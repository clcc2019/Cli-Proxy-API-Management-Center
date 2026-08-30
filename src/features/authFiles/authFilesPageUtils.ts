import type { KeyUsageBucket } from '@/utils/usage';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaProviderType,
  normalizePlanType,
  resolveCodexPlanType,
  resolveCodexSubscriptionActiveUntil,
} from '@/utils/quota';
import {
  normalizeProviderKey,
  parsePriorityValue,
  type AuthFileUsageBucketCache,
} from '@/features/authFiles/constants';
import type { AuthFilePlanFilter, AuthFilePlanSources } from '@/features/authFiles/planMetadata';
import type { AuthFileQuotaRefreshTarget } from '@/features/authFiles/quotaRefresh';
import type { AuthFileItem, ClaudeQuotaState, CodexQuotaState, KimiQuotaState } from '@/types';

export const AUTH_FILES_SORT_MODES = [
  'default',
  'az',
  'priority',
  'subscription_expiry',
  'quota_reset',
] as const;

export type AuthFilesSortMode = (typeof AUTH_FILES_SORT_MODES)[number];

export type AuthFilesUiState = {
  filter?: string;
  problemOnly?: boolean;
  disabledOnly?: boolean;
  planFilter?: AuthFilePlanFilter;
  premiumOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
  sortMode?: AuthFilesSortMode;
};

const AUTH_FILES_UI_STATE_KEY = 'authFilesPage.uiState';
const AUTH_FILES_SORT_MODE_SET = new Set<AuthFilesSortMode>(AUTH_FILES_SORT_MODES);

export const isAuthFilesSortMode = (value: unknown): value is AuthFilesSortMode =>
  typeof value === 'string' && AUTH_FILES_SORT_MODE_SET.has(value as AuthFilesSortMode);

const readAuthFilesUiStateFromStorage = (
  storage: Pick<Storage, 'getItem'> | null | undefined
): AuthFilesUiState | null => {
  if (!storage) return null;
  const raw = storage.getItem(AUTH_FILES_UI_STATE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as AuthFilesUiState;
  return parsed && typeof parsed === 'object' ? parsed : null;
};

export const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === 'undefined') return null;
  try {
    return (
      readAuthFilesUiStateFromStorage(window.localStorage) ??
      readAuthFilesUiStateFromStorage(window.sessionStorage)
    );
  } catch {
    return null;
  }
};

export const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private/sandboxed contexts.
  }
  try {
    window.sessionStorage.removeItem(AUTH_FILES_UI_STATE_KEY);
  } catch {
    // Keep the in-memory page state when storage cleanup is unavailable.
  }
};

export const EMPTY_AUTH_FILE_USAGE_STATS: KeyUsageBucket = {
  success: 0,
  failure: 0,
  totalTokens: 0,
  totalCost: 0,
  pricedRequests: 0,
};
export const EMPTY_AUTH_FILE_TYPE_COUNTS: Record<string, number> = { all: 0 };
export const EMPTY_AUTH_FILE_MAP = new Map<string, AuthFileItem>();
export const EMPTY_AUTH_FILE_USAGE_STATS_MAP = new Map<string, KeyUsageBucket>();
export const EMPTY_AUTH_FILE_ITEMS: AuthFileItem[] = [];
export const EMPTY_AUTH_FILE_QUOTA_REFRESH_TARGETS: AuthFileQuotaRefreshTarget[] = [];
export const EMPTY_AUTH_FILE_NAMES: string[] = [];
export const EMPTY_AUTH_FILE_PROVIDER_TYPES: string[] = [];
export const ALL_AUTH_FILE_TYPES = ['all'];
export const EMPTY_CLAUDE_QUOTA: Record<string, ClaudeQuotaState> = {};
export const EMPTY_CODEX_QUOTA: Record<string, CodexQuotaState> = {};
export const EMPTY_KIMI_QUOTA: Record<string, KimiQuotaState> = {};

/**
 * Keep usage bucket references stable so memoized auth cards can skip renders
 * when a list refresh returns the same usage values. The file object is the key
 * instead of its name, so overlapping page-transition layers cannot overwrite
 * one another's cached result and collected file objects are released naturally.
 */
export const FILE_USAGE_BUCKET_CACHE: AuthFileUsageBucketCache = new WeakMap();

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

export const buildProviderTypesKey = (typeCounts: Record<string, number> | undefined): string =>
  typeCounts
    ? Object.keys(typeCounts)
        .filter((type) => type !== 'all')
        .join('\n')
    : '';

export const filterSelectableAuthFiles = (files: AuthFileItem[]): AuthFileItem[] => {
  const selectable = files.filter((file) => !isRuntimeOnlyAuthFile(file));
  return selectable.length > 0 ? selectable : EMPTY_AUTH_FILE_ITEMS;
};

const compareAuthFilesByName = (left: AuthFileItem, right: AuthFileItem): number =>
  left.name.localeCompare(right.name);

const hasRefreshToken = (file: AuthFileItem): boolean => {
  const flag: unknown = file.has_refresh_token ?? file.hasRefreshToken;
  if (flag === true || flag === 1 || flag === '1' || flag === 'true') return true;
  if (typeof file.refresh_token === 'string' && file.refresh_token.trim()) return true;
  if (typeof file.refreshToken === 'string' && file.refreshToken.trim()) return true;
  return false;
};

export type AuthFileSortSnapshot = {
  disabled: boolean;
  hasRefreshToken: boolean;
  provider: string;
  priority: number;
  subscriptionExpiryMs: number | null;
  subscriptionSortRank: number;
  quotaResetMs: number | null;
};

export const EMPTY_SORT_SNAPSHOT: Record<string, AuthFileSortSnapshot> = {};

const AUTH_FILE_SORT_SNAPSHOT_CACHE = new WeakMap<
  AuthFileItem,
  {
    claudeQuota?: ClaudeQuotaState;
    codexQuota?: CodexQuotaState;
    kimiQuota?: KimiQuotaState;
    snapshot: AuthFileSortSnapshot;
  }
>();

const resolveQuotaRefreshTarget = (file: AuthFileItem): AuthFileQuotaRefreshTarget | null => {
  if (isRuntimeOnlyAuthFile(file) || file.disabled) return null;

  const quotaType = resolveQuotaProviderType(file);
  if (!quotaType) return null;

  return { file, quotaType };
};

export const resolveQuotaRefreshTargets = (files: AuthFileItem[]): AuthFileQuotaRefreshTarget[] => {
  const targets = files.reduce<AuthFileQuotaRefreshTarget[]>((items, file) => {
    const target = resolveQuotaRefreshTarget(file);
    if (target) items.push(target);
    return items;
  }, []);
  return targets.length > 0 ? targets : EMPTY_AUTH_FILE_QUOTA_REFRESH_TARGETS;
};

export const countAuthFilesByType = (files: AuthFileItem[]): Record<string, number> => {
  const counts: Record<string, number> = { all: files.length };
  files.forEach((file) => {
    if (!file.type) return;
    counts[file.type] = (counts[file.type] || 0) + 1;
  });
  return counts;
};

export const areAuthFileTypeCountsEqual = (
  left: Record<string, number> | null | undefined,
  right: Record<string, number> | null | undefined
) => {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

const normalizeSubscriptionExpiryMs = (value: unknown): number | null => {
  const normalizeTimestamp = (timestamp: number): number | null => {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  };

  if (typeof value === 'number') {
    return normalizeTimestamp(value);
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return normalizeTimestamp(numeric);
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : normalizeTimestamp(parsed);
};

export const getAuthFileSortSnapshot = (
  file: AuthFileItem,
  planSources?: AuthFilePlanSources
): AuthFileSortSnapshot => {
  const claudeQuota = planSources?.claudeQuota[file.name];
  const codexQuota = planSources?.codexQuota[file.name];
  const kimiQuota = planSources?.kimiQuota?.[file.name];
  const cached = AUTH_FILE_SORT_SNAPSHOT_CACHE.get(file);
  if (
    cached &&
    cached.claudeQuota === claudeQuota &&
    cached.codexQuota === codexQuota &&
    cached.kimiQuota === kimiQuota
  ) {
    return cached.snapshot;
  }

  const planType = normalizePlanType(
    codexQuota?.planType ?? resolveCodexPlanType(file)
  );
  const subscriptionExpiryMs = normalizeSubscriptionExpiryMs(
    resolveCodexSubscriptionActiveUntil(file)
  );
  const isFreePlan = planType === 'free';
  const hasKnownPlan = Boolean(planType);
  const subscriptionSortRank =
    isFreePlan || (!hasKnownPlan && subscriptionExpiryMs === null)
      ? 2
      : subscriptionExpiryMs === null
        ? 1
        : 0;
  const quotaResetTimes = [
    ...(claudeQuota?.windows ?? []),
    ...(codexQuota?.windows ?? []),
    ...(kimiQuota?.rows ?? []),
  ].flatMap((item) =>
    typeof item.resetAt === 'number' && Number.isFinite(item.resetAt) ? [item.resetAt] : []
  );

  const snapshot = {
    disabled: file.disabled === true,
    hasRefreshToken: hasRefreshToken(file),
    provider: normalizeProviderKey(String(file.provider ?? file.type ?? 'unknown')),
    priority: parsePriorityValue(file.priority ?? file['priority']) ?? 0,
    subscriptionExpiryMs,
    subscriptionSortRank,
    quotaResetMs: quotaResetTimes.length > 0 ? Math.min(...quotaResetTimes) : null,
  };
  AUTH_FILE_SORT_SNAPSHOT_CACHE.set(file, {
    claudeQuota,
    codexQuota,
    kimiQuota,
    snapshot,
  });
  return snapshot;
};

export const compareAuthFiles = (
  left: AuthFileItem,
  right: AuthFileItem,
  sortMode: AuthFilesSortMode,
  sortSnapshot?: Record<string, AuthFileSortSnapshot>,
  planSources?: AuthFilePlanSources
) => {
  const leftSnapshot = sortSnapshot?.[left.name] ?? getAuthFileSortSnapshot(left, planSources);
  const rightSnapshot = sortSnapshot?.[right.name] ?? getAuthFileSortSnapshot(right, planSources);

  if (leftSnapshot.disabled !== rightSnapshot.disabled) {
    return leftSnapshot.disabled ? 1 : -1;
  }

  const refreshTokenCompare = Number(rightSnapshot.hasRefreshToken) - Number(leftSnapshot.hasRefreshToken);
  if (refreshTokenCompare !== 0) return refreshTokenCompare;

  if (sortMode === 'default') {
    const providerCompare = leftSnapshot.provider.localeCompare(rightSnapshot.provider);
    if (providerCompare !== 0) return providerCompare;
    return compareAuthFilesByName(left, right);
  }

  if (sortMode === 'az') {
    return compareAuthFilesByName(left, right);
  }

  if (sortMode === 'subscription_expiry') {
    const rankCompare = leftSnapshot.subscriptionSortRank - rightSnapshot.subscriptionSortRank;
    if (rankCompare !== 0) return rankCompare;

    if (leftSnapshot.subscriptionSortRank === 0 && rightSnapshot.subscriptionSortRank === 0) {
      const leftExpiry = leftSnapshot.subscriptionExpiryMs ?? Number.POSITIVE_INFINITY;
      const rightExpiry = rightSnapshot.subscriptionExpiryMs ?? Number.POSITIVE_INFINITY;
      const expiryCompare = leftExpiry - rightExpiry;
      if (expiryCompare !== 0) return expiryCompare;
    }

    const providerCompare = leftSnapshot.provider.localeCompare(rightSnapshot.provider);
    if (providerCompare !== 0) return providerCompare;
    return compareAuthFilesByName(left, right);
  }

  if (sortMode === 'quota_reset') {
    const leftReset = leftSnapshot.quotaResetMs ?? Number.POSITIVE_INFINITY;
    const rightReset = rightSnapshot.quotaResetMs ?? Number.POSITIVE_INFINITY;
    if (leftReset !== rightReset) return leftReset - rightReset;
    return compareAuthFilesByName(left, right);
  }

  const priorityCompare = rightSnapshot.priority - leftSnapshot.priority;
  if (priorityCompare !== 0) return priorityCompare;
  return compareAuthFilesByName(left, right);
};
