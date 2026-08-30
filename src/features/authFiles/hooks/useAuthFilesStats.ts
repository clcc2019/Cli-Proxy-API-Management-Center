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
  type KeyUsageBucket,
  type KeyUsageStats,
  type UsageDetail,
} from '@/utils/usage';

const EMPTY_KEY_USAGE_STATS: KeyUsageStats = { bySource: {}, byAuthIndex: {} };
const EMPTY_AUTH_FILE_USAGE_DETAILS: UsageDetail[] = [];
const AUTH_FILE_STATUS_DETAILS_LIMIT = 1000;

export type UseAuthFilesStatsResult = {
  keyUsageStats: KeyUsageStats;
  loadKeyStats: () => Promise<void>;
  refreshKeyStats: () => Promise<void>;
};

export type UseAuthFilesStatusDetailsResult = {
  usageDetails: UsageDetail[];
  loadStatusDetails: () => Promise<void>;
  refreshStatusDetails: () => Promise<void>;
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

  // `force` bypasses the time-based cache, but it should still coalesce with a
  // request that is already fetching the same scope. This prevents the page
  // refresh action and the visible interval from duplicating the heavy aggregate.
  if (inFlightAuthFileUsageRequest?.scopeKey === scopeKey) {
    return inFlightAuthFileUsageRequest.promise;
  }

  if (inFlightAuthFileUsageRequest && inFlightAuthFileUsageRequest.scopeKey !== scopeKey) {
    authFileUsageRequestToken += 1;
    inFlightAuthFileUsageRequest = null;
  }

  const requestId = (authFileUsageRequestToken += 1);
  const requestPromise = (async (): Promise<AuthFileUsageCacheEntry> => {
    const response = await usageApi.getAuthFileCredentialUsage();
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

export function useAuthFilesStats(enabled = true): UseAuthFilesStatsResult {
  const apiBase = useAuthStore((state) => (enabled ? state.apiBase : ''));
  const managementKey = useAuthStore((state) => (enabled ? state.managementKey : ''));
  const scopeKey = useMemo(
    () => `${apiBase ?? ''}::${managementKey ?? ''}`,
    [apiBase, managementKey]
  );
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
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

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const keyUsageStats = useMemo(() => {
    if (!enabled) return createEmptyKeyUsageStats();
    if (keyUsageState.scopeKey === scopeKey) {
      return keyUsageState.stats;
    }
    const cached = authFileUsageCache.get(scopeKey);
    return cached?.stats ?? createEmptyKeyUsageStats();
  }, [enabled, keyUsageState, scopeKey]);

  const applyAuthFileUsageStats = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const entry = await loadAuthFileUsageStats(force, scopeKey);
      if (entry.scopeKey !== getUsageScopeKey()) {
        return;
      }
      if (!mountedRef.current || !enabledRef.current) return;
      setKeyUsageState((prev) =>
        prev.scopeKey === entry.scopeKey && prev.stats === entry.stats
          ? prev
          : { scopeKey: entry.scopeKey, stats: entry.stats }
      );
    },
    [enabled, scopeKey]
  );

  const loadKeyStats = useCallback(async () => {
    await applyAuthFileUsageStats(false);
  }, [applyAuthFileUsageStats]);

  // 只刷新 auth-file 维度的用量聚合。
  const refreshKeyStats = useCallback(async () => {
    await applyAuthFileUsageStats(true);
  }, [applyAuthFileUsageStats]);

  return {
    keyUsageStats,
    loadKeyStats,
    refreshKeyStats,
  };
}

/**
 * 旧服务端兼容层。enabled=false 时 selector 始终返回同一个空数组，因此即使 Usage
 * 页面更新全局明细，已支持 recent_requests 摘要的认证文件页面也不会被连带重渲染。
 */
export function useAuthFilesStatusDetails(enabled: boolean): UseAuthFilesStatusDetailsResult {
  const selectUsageDetails = useCallback(
    (state: ReturnType<typeof useUsageStatsStore.getState>) =>
      enabled ? state.usageDetails : EMPTY_AUTH_FILE_USAGE_DETAILS,
    [enabled]
  );
  const usageDetails = useUsageStatsStore(selectUsageDetails);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const loadStatusDetails = useCallback(async () => {
    if (!enabled) return;
    await loadUsageStats({
      detailsLimit: AUTH_FILE_STATUS_DETAILS_LIMIT,
      compactDetails: true,
      includeAggregated: false,
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
    });
  }, [enabled, loadUsageStats]);

  const refreshStatusDetails = useCallback(async () => {
    if (!enabled) return;
    await loadUsageStats({
      force: true,
      detailsLimit: AUTH_FILE_STATUS_DETAILS_LIMIT,
      compactDetails: true,
      includeAggregated: false,
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
    });
  }, [enabled, loadUsageStats]);

  return { usageDetails, loadStatusDetails, refreshStatusDetails };
}
