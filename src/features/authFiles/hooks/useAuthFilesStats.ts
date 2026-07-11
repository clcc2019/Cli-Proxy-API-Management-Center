import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { USAGE_STATS_STALE_TIME_MS, useAuthStore, useUsageStatsStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import type {
  UsageAggregateCredentialStat,
  UsageAggregateSnapshot,
  UsageAggregateWindow,
} from '@/types/usageAggregate';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStats,
  type KeyUsageBucket,
  type KeyUsageStats,
  type UsageDetail,
} from '@/utils/usage';

const EMPTY_KEY_USAGE_STATS: KeyUsageStats = { bySource: {}, byAuthIndex: {} };

export type UseAuthFilesStatsResult = {
  keyStats: KeyStats;
  keyUsageStats: KeyUsageStats;
  usageDetails: UsageDetail[];
  loadKeyStats: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

const createEmptyKeyUsageStats = (): KeyUsageStats => EMPTY_KEY_USAGE_STATS;

type AuthFileUsageCacheEntry = {
  scopeKey: string;
  stats: KeyUsageStats;
  fetchedAt: number;
};

type AuthFileUsageState = {
  scopeKey: string;
  stats: KeyUsageStats;
};

let authFileUsageRequestToken = 0;
let inFlightAuthFileUsageRequest: {
  id: number;
  scopeKey: string;
  promise: Promise<AuthFileUsageCacheEntry>;
} | null = null;

const authFileUsageCache = new Map<string, AuthFileUsageCacheEntry>();

const getUsageScopeKey = () => {
  const { apiBase = '', managementKey = '' } = useAuthStore.getState();
  return `${apiBase}::${managementKey}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asAggregateSnapshot = (value: unknown): UsageAggregateSnapshot | null => {
  const payload = isRecord(value) && isRecord(value.usage) ? value.usage : value;
  return isRecord(payload) ? (payload as UsageAggregateSnapshot) : null;
};

const readFiniteNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const areUsageBucketsEqual = (left: KeyUsageBucket, right: KeyUsageBucket): boolean =>
  left.success === right.success &&
  left.failure === right.failure &&
  left.totalTokens === right.totalTokens &&
  left.totalCost === right.totalCost &&
  left.pricedRequests === right.pricedRequests;

const reuseUsageBucketRecordReferences = (
  previous: Record<string, KeyUsageBucket>,
  next: Record<string, KeyUsageBucket>
): Record<string, KeyUsageBucket> => {
  if (previous === next) return previous;

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (nextKeys.length === 0) return next;

  let changed = previousKeys.length !== nextKeys.length;
  const reused: Record<string, KeyUsageBucket> = {};

  nextKeys.forEach((key) => {
    const previousBucket = previous[key];
    const nextBucket = next[key];
    if (previousBucket && areUsageBucketsEqual(previousBucket, nextBucket)) {
      reused[key] = previousBucket;
      return;
    }
    changed = true;
    reused[key] = nextBucket;
  });

  return changed ? reused : previous;
};

const reuseKeyUsageStatsReferences = (
  previous: KeyUsageStats | undefined,
  next: KeyUsageStats
): KeyUsageStats => {
  if (!previous) return next;

  const bySource = reuseUsageBucketRecordReferences(previous.bySource, next.bySource);
  const byAuthIndex = reuseUsageBucketRecordReferences(previous.byAuthIndex, next.byAuthIndex);

  return bySource === previous.bySource && byAuthIndex === previous.byAuthIndex
    ? previous
    : { bySource, byAuthIndex };
};

const ensureUsageBucket = (stats: Record<string, KeyUsageBucket>, key: string) => {
  if (!stats[key]) {
    stats[key] = {
      success: 0,
      failure: 0,
      totalTokens: 0,
      totalCost: 0,
      pricedRequests: 0,
    };
  }
  return stats[key];
};

const applyCredentialStat = (bucket: KeyUsageBucket, credential: UsageAggregateCredentialStat) => {
  bucket.success += readFiniteNumber(credential.success_count);
  bucket.failure += readFiniteNumber(credential.failure_count);
  bucket.totalTokens += readFiniteNumber(credential.total_tokens);
};

const computeAuthFileUsageStatsFromAggregate = (
  window: UsageAggregateWindow | null | undefined
): KeyUsageStats => {
  if (!window?.credentials?.length) {
    return createEmptyKeyUsageStats();
  }

  const bySource: Record<string, KeyUsageBucket> = {};
  const byAuthIndex: Record<string, KeyUsageBucket> = {};

  window.credentials.forEach((credential) => {
    const source = normalizeUsageSourceId(credential.source);
    const authIndexKey = normalizeAuthIndex(credential.auth_index);

    if (source) {
      applyCredentialStat(ensureUsageBucket(bySource, source), credential);
    }
    if (authIndexKey) {
      applyCredentialStat(ensureUsageBucket(byAuthIndex, authIndexKey), credential);
    }
  });

  return { bySource, byAuthIndex };
};

const loadAuthFileUsageStats = async (
  force: boolean,
  scopeKey = getUsageScopeKey()
): Promise<AuthFileUsageCacheEntry> => {
  const cached = authFileUsageCache.get(scopeKey);

  if (!force && cached && Date.now() - cached.fetchedAt < USAGE_STATS_STALE_TIME_MS) {
    return cached;
  }

  if (!force && inFlightAuthFileUsageRequest?.scopeKey === scopeKey) {
    return inFlightAuthFileUsageRequest.promise;
  }

  if (inFlightAuthFileUsageRequest && inFlightAuthFileUsageRequest.scopeKey !== scopeKey) {
    authFileUsageRequestToken += 1;
    inFlightAuthFileUsageRequest = null;
  }

  const requestId = (authFileUsageRequestToken += 1);
  const requestPromise = (async (): Promise<AuthFileUsageCacheEntry> => {
    const response = await usageApi.getUsageAggregated();
    const snapshot = asAggregateSnapshot(response);
    const rawStats = computeAuthFileUsageStatsFromAggregate(snapshot?.windows?.all);
    const entry: AuthFileUsageCacheEntry = {
      scopeKey,
      stats: reuseKeyUsageStatsReferences(cached?.stats, rawStats),
      fetchedAt: Date.now(),
    };
    authFileUsageCache.set(scopeKey, entry);
    return entry;
  })();

  inFlightAuthFileUsageRequest = { id: requestId, scopeKey, promise: requestPromise };

  try {
    return await requestPromise;
  } finally {
    if (inFlightAuthFileUsageRequest?.id === requestId) {
      inFlightAuthFileUsageRequest = null;
    }
  }
};

export function useAuthFilesStats(): UseAuthFilesStatsResult {
  const apiBase = useAuthStore((state) => state.apiBase);
  const managementKey = useAuthStore((state) => state.managementKey);
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const scopeKey = useMemo(
    () => `${apiBase ?? ''}::${managementKey ?? ''}`,
    [apiBase, managementKey]
  );
  const mountedRef = useRef(true);
  const [keyUsageState, setKeyUsageState] = useState<AuthFileUsageState>(() => {
    const initialScopeKey = getUsageScopeKey();
    const cached = authFileUsageCache.get(initialScopeKey);
    return {
      scopeKey: initialScopeKey,
      stats: cached?.stats ?? createEmptyKeyUsageStats(),
    };
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const keyUsageStats = useMemo(() => {
    if (keyUsageState.scopeKey === scopeKey) {
      return keyUsageState.stats;
    }
    const cached = authFileUsageCache.get(scopeKey);
    return cached?.stats ?? createEmptyKeyUsageStats();
  }, [keyUsageState, scopeKey]);

  const applyAuthFileUsageStats = useCallback(
    async (force = false) => {
      const entry = await loadAuthFileUsageStats(force, scopeKey);
      if (entry.scopeKey !== getUsageScopeKey()) {
        return;
      }
      if (!mountedRef.current) return;
      setKeyUsageState((prev) =>
        prev.scopeKey === entry.scopeKey && prev.stats === entry.stats
          ? prev
          : { scopeKey: entry.scopeKey, stats: entry.stats }
      );
    },
    [scopeKey]
  );

  const loadKeyStats = useCallback(async () => {
    await Promise.all([
      loadUsageStats({ summaryOnly: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS }),
      applyAuthFileUsageStats(false),
    ]);
  }, [applyAuthFileUsageStats, loadUsageStats]);

  const refreshKeyStats = useCallback(async () => {
    await Promise.all([
      loadUsageStats({ force: true, summaryOnly: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS }),
      applyAuthFileUsageStats(true),
    ]);
  }, [applyAuthFileUsageStats, loadUsageStats]);

  return { keyStats, keyUsageStats, usageDetails, loadKeyStats, refreshKeyStats };
}
