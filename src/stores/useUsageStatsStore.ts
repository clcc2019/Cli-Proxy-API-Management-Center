import { create } from 'zustand';
import { normalizeUsageDetailsRecentLimit, usageApi } from '@/services/api/usage';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  collectUsageDetails,
  computeKeyStats,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import i18n from '@/i18n';
import { getErrorMessageOr } from '@/utils/error';

export const USAGE_STATS_STALE_TIME_MS = 240_000;

export type LoadUsageStatsOptions = {
  force?: boolean;
  staleTimeMs?: number;
  summaryOnly?: boolean;
  detailsLimit?: number;
  compactDetails?: boolean;
  includeAggregated?: boolean;
};

type UsageStatsSnapshot = Record<string, unknown>;

const AGGREGATED_USAGE_FIELD = '__aggregatedSnapshot';

const attachAggregatedUsage = (
  usage: UsageStatsSnapshot | null,
  aggregated: Record<string, unknown> | null
): UsageStatsSnapshot | null => {
  if (!usage) {
    return null;
  }
  if (!aggregated) {
    return usage;
  }
  return {
    ...usage,
    [AGGREGATED_USAGE_FIELD]: aggregated,
  };
};

type UsageStatsState = {
  usage: UsageStatsSnapshot | null;
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  usageMode: 'summary' | 'details';
  usageDetailsLimit: number | null;
  usageDetailsCompact: boolean;
  usageHasAggregated: boolean;
  loading: boolean;
  error: string | null;
  lastRefreshedAt: number | null;
  scopeKey: string;
  loadUsageStats: (options?: LoadUsageStatsOptions) => Promise<void>;
  clearUsageStats: () => void;
};

const createEmptyKeyStats = (): KeyStats => ({ bySource: {}, byAuthIndex: {} });

let usageRequestToken = 0;
type UsageRequestProfile = {
  mode: 'summary' | 'details';
  detailsLimit: number | null;
  compactDetails: boolean;
  includeAggregated: boolean;
};

let inFlightUsageRequest: {
  id: number;
  scopeKey: string;
  profile: UsageRequestProfile;
  promise: Promise<void>;
} | null = null;

// 复用共享实现（额外支持解包 `{ message }` 形状的错误体），
// 取不到时回落到本地化文案。
const getErrorMessage = (error: unknown) =>
  getErrorMessageOr(error, i18n.t('usage_stats.loading_error'));

const normalizeDetailsLimit = (value: unknown): number | null => {
  return normalizeUsageDetailsRecentLimit(value) ?? null;
};

const canSatisfyUsageRequest = (existing: UsageRequestProfile, request: UsageRequestProfile) => {
  if (request.includeAggregated && !existing.includeAggregated) return false;
  if (request.mode === 'summary') return true;
  if (existing.mode !== 'details') return false;
  if (!request.compactDetails && existing.compactDetails) return false;
  if (existing.detailsLimit === null) return true;
  return request.detailsLimit !== null && existing.detailsLimit >= request.detailsLimit;
};

export const useUsageStatsStore = create<UsageStatsState>((set, get) => ({
  usage: null,
  keyStats: createEmptyKeyStats(),
  usageDetails: [],
  usageMode: 'summary',
  usageDetailsLimit: null,
  usageDetailsCompact: false,
  usageHasAggregated: false,
  loading: false,
  error: null,
  lastRefreshedAt: null,
  scopeKey: '',

  loadUsageStats: async (options = {}) => {
    const force = options.force === true;
    const staleTimeMs = options.staleTimeMs ?? USAGE_STATS_STALE_TIME_MS;
    const requestMode = options.summaryOnly === true ? 'summary' : 'details';
    const requestDetailsLimit =
      requestMode === 'details' ? normalizeDetailsLimit(options.detailsLimit) : null;
    const requestProfile: UsageRequestProfile = {
      mode: requestMode,
      detailsLimit: requestDetailsLimit,
      compactDetails:
        requestMode === 'details' &&
        requestDetailsLimit !== null &&
        options.compactDetails === true,
      includeAggregated: options.includeAggregated !== false,
    };
    const { apiBase = '', managementKey = '' } = useAuthStore.getState();
    const scopeKey = `${apiBase}::${managementKey}`;
    const state = get();
    const scopeChanged = state.scopeKey !== scopeKey;

    // 先复用同源 in-flight 请求，避免多个页面同时发起重复 usage/details。
    if (
      inFlightUsageRequest &&
      inFlightUsageRequest.scopeKey === scopeKey &&
      canSatisfyUsageRequest(inFlightUsageRequest.profile, requestProfile)
    ) {
      await inFlightUsageRequest.promise;
      return;
    }

    // 连接目标变化时，旧请求结果必须失效。
    if (inFlightUsageRequest && inFlightUsageRequest.scopeKey !== scopeKey) {
      usageRequestToken += 1;
      inFlightUsageRequest = null;
    }

    const fresh =
      !scopeChanged &&
      canSatisfyUsageRequest(
        {
          mode: state.usageMode,
          detailsLimit: state.usageDetailsLimit,
          compactDetails: state.usageDetailsCompact,
          includeAggregated: state.usageHasAggregated,
        },
        requestProfile
      ) &&
      state.lastRefreshedAt !== null &&
      Date.now() - state.lastRefreshedAt < staleTimeMs;

    if (!force && fresh) {
      return;
    }

    if (scopeChanged) {
      set({
        usage: null,
        keyStats: createEmptyKeyStats(),
        usageDetails: [],
        usageMode: 'summary',
        usageDetailsLimit: null,
        usageDetailsCompact: false,
        usageHasAggregated: false,
        error: null,
        lastRefreshedAt: null,
        scopeKey,
      });
    }

    const requestId = (usageRequestToken += 1);
    set({ loading: true, error: null, scopeKey });

    const requestPromise = (async () => {
      try {
        const [usageResponse, aggregatedResponse] = await Promise.all([
          requestProfile.mode === 'summary'
            ? usageApi.getUsage()
            : usageApi.getUsageDetails(
                requestProfile.detailsLimit === null
                  ? undefined
                  : {
                      recent: requestProfile.detailsLimit,
                      compact: requestProfile.compactDetails,
                    }
              ),
          requestProfile.includeAggregated
            ? usageApi.getAggregatedUsage().catch(() => null)
            : Promise.resolve(null),
        ]);
        const rawUsage = usageResponse?.usage ?? usageResponse;
        const rawAggregated = aggregatedResponse?.usage ?? aggregatedResponse;
        const aggregated =
          rawAggregated && typeof rawAggregated === 'object'
            ? (rawAggregated as Record<string, unknown>)
            : null;
        const usage =
          rawUsage && typeof rawUsage === 'object'
            ? attachAggregatedUsage(rawUsage as UsageStatsSnapshot, aggregated)
            : null;

        if (requestId !== usageRequestToken) return;

        const usageDetails = requestProfile.mode === 'summary' ? [] : collectUsageDetails(usage);
        set({
          usage,
          keyStats: computeKeyStats(usage),
          usageDetails,
          usageMode: requestProfile.mode,
          usageDetailsLimit: requestProfile.mode === 'details' ? requestProfile.detailsLimit : null,
          usageDetailsCompact: requestProfile.compactDetails,
          usageHasAggregated: aggregated !== null,
          loading: false,
          error: null,
          lastRefreshedAt: Date.now(),
          scopeKey,
        });
      } catch (error: unknown) {
        if (requestId !== usageRequestToken) return;
        const message = getErrorMessage(error);
        set({
          loading: false,
          error: message,
          scopeKey,
        });
        throw new Error(message);
      } finally {
        if (inFlightUsageRequest?.id === requestId) {
          inFlightUsageRequest = null;
        }
      }
    })();

    inFlightUsageRequest = {
      id: requestId,
      scopeKey,
      profile: requestProfile,
      promise: requestPromise,
    };
    await requestPromise;
  },

  clearUsageStats: () => {
    usageRequestToken += 1;
    inFlightUsageRequest = null;
    set({
      usage: null,
      keyStats: createEmptyKeyStats(),
      usageDetails: [],
      usageMode: 'summary',
      usageDetailsLimit: null,
      usageDetailsCompact: false,
      usageHasAggregated: false,
      loading: false,
      error: null,
      lastRefreshedAt: null,
      scopeKey: '',
    });
  },
}));
