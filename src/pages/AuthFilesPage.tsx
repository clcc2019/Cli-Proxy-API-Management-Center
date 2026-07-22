import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useInterval } from '@/hooks/useInterval';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useDebounce, useDelayedBoolean, useEventCallback, useReducedMotion } from '@/hooks';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconRefreshCw, IconTrash2, IconUpload } from '@/components/ui/icons';
import { copyToClipboard } from '@/utils/clipboard';
import { scheduleIdleTask } from '@/utils/scheduleIdleTask';
import { normalizeAuthIndex, type KeyUsageBucket } from '@/utils/usage';
import {
  normalizePlanType,
  resolveAuthProvider,
  resolveCodexPlanType,
  resolveCodexSubscriptionActiveUntil,
} from '@/utils/quota';
import {
  authFilesApi,
  getAuthFilesListOptionsKey,
  getAuthFilesTypeCountsKey,
  type AuthFilesListOptions,
} from '@/services/api';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  QUOTA_PROVIDER_TYPES,
  clampCardPageSize,
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
  normalizeProviderKey,
  parsePriorityValue,
  resolveAuthFileUsageStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { FilterTagsRail } from '@/features/authFiles/components/FilterTagsRail';
import { SearchToolbar } from '@/features/authFiles/components/SearchToolbar';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { extractAuthFileAccessToken } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import {
  EMPTY_AUTH_FILE_STATUS_BAR_DATA,
  useAuthFilesStatusBarCache,
} from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  hasPremiumAuthFilePlan,
  type AuthFilePlanSources,
} from '@/features/authFiles/planMetadata';
import {
  refreshAuthFileQuotasInParallel,
  type AuthFileQuotaRefreshTarget,
} from '@/features/authFiles/quotaRefresh';
import {
  isAuthFilesSortMode,
  readAuthFilesUiState,
  writeAuthFilesUiState,
  type AuthFilesSortMode,
  type AuthFilesUiState,
} from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type {
  AuthFileItem,
  ClaudeQuotaState,
  CodexAuthMode,
  CodexQuotaState,
} from '@/types';
import styles from './AuthFilesPage.module.scss';

const AuthFileModelsModal = lazy(() =>
  import('@/features/authFiles/components/AuthFileModelsModal').then((module) => ({
    default: module.AuthFileModelsModal,
  }))
);
const AuthFilesPrefixProxyEditorModal = lazy(() =>
  import('@/features/authFiles/components/AuthFilesPrefixProxyEditorModal').then((module) => ({
    default: module.AuthFilesPrefixProxyEditorModal,
  }))
);
const OAuthExcludedCard = lazy(() =>
  import('@/features/authFiles/components/OAuthExcludedCard').then((module) => ({
    default: module.OAuthExcludedCard,
  }))
);
const OAuthModelAliasCard = lazy(() =>
  import('@/features/authFiles/components/OAuthModelAliasCard').then((module) => ({
    default: module.OAuthModelAliasCard,
  }))
);

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_PRESETS = [4, 8, 12, 16, 20, 24];
const AUTH_FILE_SKELETON_MAX = 12;
const LIST_PROGRESS_HIDE_DELAY_MS = 200;

const getAuthFileCardEnterStyle = (index: number): CSSProperties =>
  ({
    '--auth-file-card-enter-delay': `${Math.min(index, 7) * 12}ms`,
  }) as CSSProperties;

const EMPTY_AUTH_FILE_USAGE_STATS: KeyUsageBucket = {
  success: 0,
  failure: 0,
  totalTokens: 0,
  totalCost: 0,
  pricedRequests: 0,
};
const EMPTY_AUTH_FILE_TYPE_COUNTS: Record<string, number> = { all: 0 };
const EMPTY_AUTH_FILE_MAP = new Map<string, AuthFileItem>();
const EMPTY_AUTH_FILE_ITEMS: AuthFileItem[] = [];
const EMPTY_AUTH_FILE_NAMES: string[] = [];
const EMPTY_AUTH_FILE_PROVIDER_TYPES: string[] = [];
const ALL_AUTH_FILE_TYPES = ['all'];
const QUOTA_REFRESH_SPINNER_STYLE = { width: 15, height: 15 } as const;
const EMPTY_CLAUDE_QUOTA: Record<string, ClaudeQuotaState> = {};
const EMPTY_CODEX_QUOTA: Record<string, CodexQuotaState> = {};
let previousFileUsageStatsByName: Map<string, KeyUsageBucket> | null = null;

const keyUsageBucketMapsEqual = (
  left: Map<string, KeyUsageBucket>,
  right: Map<string, KeyUsageBucket>
): boolean => {
  if (left.size !== right.size) return false;

  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }

  return true;
};

const reuseFileUsageStatsByName = (
  map: Map<string, KeyUsageBucket>
): Map<string, KeyUsageBucket> => {
  if (previousFileUsageStatsByName && keyUsageBucketMapsEqual(map, previousFileUsageStatsByName)) {
    return previousFileUsageStatsByName;
  }

  previousFileUsageStatsByName = map;
  return map;
};

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

const buildProviderTypesKey = (typeCounts: Record<string, number> | undefined): string =>
  typeCounts
    ? Object.keys(typeCounts)
        .filter((type) => type !== 'all')
        .join('\n')
    : '';

const filterSelectableAuthFiles = (files: AuthFileItem[]): AuthFileItem[] => {
  const selectable = files.filter((file) => !isRuntimeOnlyAuthFile(file));
  return selectable.length > 0 ? selectable : EMPTY_AUTH_FILE_ITEMS;
};

function AuthFilesSkeletonGrid({
  count,
  quotaManaged,
  loadingLabel,
}: {
  count: number;
  quotaManaged: boolean;
  loadingLabel: string;
}) {
  const items = useMemo(
    () => Array.from({ length: Math.min(Math.max(count, 3), AUTH_FILE_SKELETON_MAX) }),
    [count]
  );

  return (
    <>
      <span className={styles.visuallyHidden} role="status" aria-busy="true">
        {loadingLabel}
      </span>
      <div
        className={`${styles.fileGrid} ${quotaManaged ? styles.fileGridQuotaManaged : ''} ${styles.skeletonGrid}`}
        aria-hidden="true"
      >
        {items.map((_, index) => (
          <div
            key={index}
            className={styles.fileCardSkeleton}
            style={getAuthFileCardEnterStyle(index)}
          >
            <div className={styles.skeletonHeader}>
              <span className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
              <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
              <span className={`${styles.skeletonBlock} ${styles.skeletonBadge}`} />
            </div>
            <div className={styles.skeletonMeta}>
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
            </div>
            <div className={styles.skeletonStats}>
              {Array.from({ length: 4 }).map((__, statIndex) => (
                <span key={statIndex} className={styles.skeletonBlock} />
              ))}
            </div>
            <div className={styles.skeletonActions}>
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const compareAuthFilesByName = (left: AuthFileItem, right: AuthFileItem): number =>
  left.name.localeCompare(right.name);

const EMPTY_SORT_SNAPSHOT: Record<string, AuthFileSortSnapshot> = {};
const EMPTY_QUOTA_REFRESH_TARGETS: AuthFileQuotaRefreshTarget[] = [];

const resolveQuotaRefreshTarget = (file: AuthFileItem): AuthFileQuotaRefreshTarget | null => {
  if (isRuntimeOnlyAuthFile(file) || file.disabled) return null;

  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;

  return { file, quotaType: provider as QuotaProviderType };
};

const resolveQuotaRefreshTargets = (files: AuthFileItem[]): AuthFileQuotaRefreshTarget[] => {
  const targets = files.reduce<AuthFileQuotaRefreshTarget[]>((items, file) => {
    const target = resolveQuotaRefreshTarget(file);
    if (target) items.push(target);
    return items;
  }, []);
  return targets.length > 0 ? targets : EMPTY_QUOTA_REFRESH_TARGETS;
};

const countAuthFilesByType = (files: AuthFileItem[]): Record<string, number> => {
  const counts: Record<string, number> = { all: files.length };
  files.forEach((file) => {
    if (!file.type) return;
    counts[file.type] = (counts[file.type] || 0) + 1;
  });
  return counts;
};

const areAuthFileTypeCountsEqual = (
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

type AuthFileSortSnapshot = {
  disabled: boolean;
  provider: string;
  priority: number;
  subscriptionExpiryMs: number | null;
  subscriptionSortRank: number;
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

const getAuthFileSortSnapshot = (
  file: AuthFileItem,
  planSources?: AuthFilePlanSources
): AuthFileSortSnapshot => {
  const planType = normalizePlanType(
    planSources?.codexQuota[file.name]?.planType ?? resolveCodexPlanType(file)
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

  return {
    disabled: file.disabled === true,
    provider: normalizeProviderKey(String(file.provider ?? file.type ?? 'unknown')),
    priority: parsePriorityValue(file.priority ?? file['priority']) ?? 0,
    subscriptionExpiryMs,
    subscriptionSortRank,
  };
};

const compareAuthFiles = (
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

  const priorityCompare = rightSnapshot.priority - leftSnapshot.priority;
  if (priorityCompare !== 0) return priorityCompare;
  return compareAuthFilesByName(left, right);
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const prefersReducedMotion = useReducedMotion();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [disabledOnly, setDisabledOnly] = useState(false);
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const [accessTokenCopying, setAccessTokenCopying] = useState<Record<string, boolean>>({});
  const [authModeUpdating, setAuthModeUpdating] = useState<Record<string, boolean>>({});
  const [priorityUpdating, setPriorityUpdating] = useState<Record<string, boolean>>({});
  const [pageQuotaRefreshing, setPageQuotaRefreshing] = useState(false);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [belowFoldCardsReady, setBelowFoldCardsReady] = useState(false);
  const [scopedTypeCounts, setScopedTypeCounts] = useState<{
    key: string;
    counts: Record<string, number>;
  } | null>(null);
  const [displayFilterRefreshVersion, setDisplayFilterRefreshVersion] = useState(0);
  const [displayFilterSnapshot, setDisplayFilterSnapshot] = useState<{
    key: string;
    names: string[];
    sortSnapshot: Record<string, AuthFileSortSnapshot>;
  } | null>(null);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<Animation | null>(null);
  const previousSelectionActiveRef = useRef(false);
  const selectionCountRef = useRef(0);
  const previousListBusyRef = useRef(false);
  const pageQuotaRefreshInFlightRef = useRef(false);
  const pageMountedRef = useRef(true);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = search.trim();
  const deferredNormalizedSearch = deferredSearch.trim();
  const debouncedSearch = useDebounce(normalizedSearch, 280);
  const serverPaginationEnabled = true;
  const serverSearchPending = serverPaginationEnabled && normalizedSearch !== debouncedSearch;
  const serverListPage = serverPaginationEnabled ? page : undefined;
  const serverListPageSize = serverPaginationEnabled ? pageSize : undefined;
  const serverListSearch = serverPaginationEnabled ? debouncedSearch : undefined;
  const serverListType = serverPaginationEnabled && filter !== 'all' ? String(filter) : undefined;
  const serverListSort = serverPaginationEnabled ? sortMode : undefined;
  const serverListProblemOnly = serverPaginationEnabled ? problemOnly : undefined;
  const serverListDisabledOnly = serverPaginationEnabled ? disabledOnly : undefined;
  const serverListPremiumOnly = serverPaginationEnabled ? premiumOnly : undefined;
  const authFilesUiState = useMemo<AuthFilesUiState>(
    () => ({
      filter,
      problemOnly,
      disabledOnly,
      premiumOnly,
      search,
      page,
      pageSize,
      sortMode,
    }),
    [disabledOnly, filter, page, pageSize, premiumOnly, problemOnly, search, sortMode]
  );
  const debouncedAuthFilesUiState = useDebounce<AuthFilesUiState | null>(
    uiStateHydrated ? authFilesUiState : null,
    300
  );
  const authFilesListOptions = useMemo<AuthFilesListOptions>(() => {
    if (!serverPaginationEnabled) {
      return { codexSubscription: 'cache', summary: true };
    }
    return {
      codexSubscription: 'cache',
      summary: true,
      page: serverListPage,
      pageSize: serverListPageSize,
      search: serverListSearch,
      type: serverListType,
      sort: serverListSort,
      problemOnly: serverListProblemOnly,
      disabledOnly: serverListDisabledOnly,
      premiumOnly: serverListPremiumOnly,
    };
  }, [
    serverListDisabledOnly,
    serverListPage,
    serverListPageSize,
    serverListPremiumOnly,
    serverListProblemOnly,
    serverListSearch,
    serverListSort,
    serverListType,
    serverPaginationEnabled,
  ]);
  const authFilesListOptionsKey = useMemo(
    () => getAuthFilesListOptionsKey(authFilesListOptions),
    [authFilesListOptions]
  );

  const { keyUsageStats, usageDetails, loadKeyStats, refreshKeyStats, refreshStatusDetails } =
    useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    refreshing,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    batchStatusUpdating,
    listMeta,
    fileInputRef,
    loadFiles,
    refreshFilesFromServer,
    handleUploadClick,
    handleFileChange,
    handleDelete,
    handleDeleteAll,
    handleDownload,
    handleStatusToggle,
    applyLocalFilePatch,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchDelete,
    applyLocalFileUpdates,
  } = useAuthFilesData({ refreshKeyStats, listOptions: authFilesListOptions });

  const statusBarCache = useAuthFilesStatusBarCache(files, usageDetails);
  const providerTypesFromListMetaKey = useMemo(
    () => buildProviderTypesKey(listMeta.typeCounts),
    [listMeta.typeCounts]
  );
  const providerTypesFromListMeta = useMemo(
    () =>
      providerTypesFromListMetaKey
        ? providerTypesFromListMetaKey.split('\n')
        : EMPTY_AUTH_FILE_PROVIDER_TYPES,
    [providerTypesFromListMetaKey]
  );
  const oauthViewMode = belowFoldCardsReady ? viewMode : 'list';

  const {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  } = useAuthFilesOauth({
    viewMode: oauthViewMode,
    files,
    providerTypes: providerTypesFromListMeta,
  });

  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels();

  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls: connectionStatus !== 'connected',
    applyLocalFilePatch,
    refreshAuthFilesFromServer: refreshFilesFromServer,
  });

  const disableControls = connectionStatus !== 'connected';
  const needsPlanSources =
    premiumOnly || (!listMeta.paginated && sortMode === 'subscription_expiry');
  const selectClaudeQuotaForPlanSources = useCallback(
    (state: ReturnType<typeof useQuotaStore.getState>) =>
      needsPlanSources ? state.claudeQuota : EMPTY_CLAUDE_QUOTA,
    [needsPlanSources]
  );
  const selectCodexQuotaForPlanSources = useCallback(
    (state: ReturnType<typeof useQuotaStore.getState>) =>
      needsPlanSources ? state.codexQuota : EMPTY_CODEX_QUOTA,
    [needsPlanSources]
  );
  const claudeQuota = useQuotaStore(selectClaudeQuotaForPlanSources);
  const codexQuota = useQuotaStore(selectCodexQuotaForPlanSources);
  const normalizedFilter = normalizeProviderKey(String(filter));
  const quotaFilterType: QuotaProviderType | null = QUOTA_PROVIDER_TYPES.has(
    normalizedFilter as QuotaProviderType
  )
    ? (normalizedFilter as QuotaProviderType)
    : null;
  const planSources = useMemo<AuthFilePlanSources>(
    () => ({
      claudeQuota,
      codexQuota,
    }),
    [claudeQuota, codexQuota]
  );

  useEffect(() => {
    const persisted = readAuthFilesUiState();
    if (persisted) {
      if (typeof persisted.filter === 'string' && persisted.filter.trim()) {
        setFilter(persisted.filter);
      }
      if (typeof persisted.problemOnly === 'boolean') {
        setProblemOnly(persisted.problemOnly);
      }
      if (typeof persisted.disabledOnly === 'boolean') {
        setDisabledOnly(persisted.disabledOnly);
      }
      if (typeof persisted.premiumOnly === 'boolean') {
        setPremiumOnly(persisted.premiumOnly);
      }
      if (typeof persisted.search === 'string') {
        setSearch(persisted.search);
      }
      if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
        setPage(Math.max(1, Math.round(persisted.page)));
      }
      if (typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)) {
        setPageSize(clampCardPageSize(persisted.pageSize));
      }
      if (isAuthFilesSortMode(persisted.sortMode)) {
        setSortMode(persisted.sortMode);
      }
    }

    setUiStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!debouncedAuthFilesUiState) return;
    writeAuthFilesUiState(debouncedAuthFilesUiState);
  }, [debouncedAuthFilesUiState]);

  const displayOptionsActive = problemOnly || disabledOnly || premiumOnly;
  const listUpdating = refreshing || serverSearchPending;

  useEffect(() => {
    const listBusy = loading || refreshing;
    if (displayOptionsActive && !listMeta.paginated && previousListBusyRef.current && !listBusy) {
      setDisplayFilterRefreshVersion((version) => version + 1);
    }
    previousListBusyRef.current = listBusy;
  }, [displayOptionsActive, listMeta.paginated, loading, refreshing]);

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
    },
    [sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await loadFiles({ codexSubscription: 'cache' });
    scheduleIdleTask(
      () => {
        if (!pageMountedRef.current) return;
        void Promise.allSettled([refreshKeyStats(), loadExcluded(), loadModelAlias()]);
      },
      { fallbackDelayMs: 400 }
    );
  }, [loadFiles, refreshKeyStats, loadExcluded, loadModelAlias]);

  const handleToggleProblemOnly = useCallback(() => {
    setProblemOnly((prev) => !prev);
    setPage(1);
  }, []);
  const handleToggleDisabledOnly = useCallback(() => {
    setDisabledOnly((prev) => !prev);
    setPage(1);
  }, []);
  const handleTogglePremiumOnly = useCallback(() => {
    setPremiumOnly((prev) => !prev);
    setPage(1);
  }, []);
  const handleSearchValue = useCallback(
    (value: string) => {
      if (value === search) return;
      setSearch(value);
      setPage(1);
    },
    [search]
  );
  const handleClearFilters = useCallback(() => {
    if (
      filter === 'all' &&
      !problemOnly &&
      !disabledOnly &&
      !premiumOnly &&
      search === '' &&
      page === 1
    ) {
      return;
    }
    setFilter('all');
    setProblemOnly(false);
    setDisabledOnly(false);
    setPremiumOnly(false);
    setSearch('');
    setPage(1);
  }, [disabledOnly, filter, page, premiumOnly, problemOnly, search]);
  const handleFilterTagSelect = useCallback(
    (value: string) => {
      if (value === filter) return;
      setFilter(value);
      setPage(1);
    },
    [filter]
  );
  const handlePageSizeCommit = useCallback(
    (next: number) => {
      const clamped = clampCardPageSize(next);
      if (clamped === pageSize) return;
      setPageSize(clamped);
      setPage(1);
    },
    [pageSize]
  );

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCurrentLayer || !uiStateHydrated || serverSearchPending) return;
    if (
      listMeta.dataKey === authFilesListOptionsKey ||
      listMeta.resolvedDataKey === authFilesListOptionsKey
    ) {
      return;
    }
    void loadFiles();
  }, [
    authFilesListOptionsKey,
    isCurrentLayer,
    listMeta.dataKey,
    listMeta.resolvedDataKey,
    loadFiles,
    serverSearchPending,
    uiStateHydrated,
  ]);

  useEffect(() => {
    if (!isCurrentLayer || !uiStateHydrated || belowFoldCardsReady) return undefined;

    return scheduleIdleTask(
      () => {
        if (!pageMountedRef.current) return;
        setBelowFoldCardsReady(true);
      },
      { fallbackDelayMs: 900 }
    );
  }, [belowFoldCardsReady, isCurrentLayer, uiStateHydrated]);

  useEffect(() => {
    if (!isCurrentLayer || !uiStateHydrated) return undefined;

    return scheduleIdleTask(
      () => {
        void Promise.allSettled([loadKeyStats(), loadExcluded(), loadModelAlias()]);
      },
      { fallbackDelayMs: 400 }
    );
  }, [isCurrentLayer, loadExcluded, loadKeyStats, loadModelAlias, uiStateHydrated]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  useVisibleInterval(
    () => {
      void refreshStatusDetails().catch(() => {});
    },
    isCurrentLayer ? 60_000 : null
  );

  const hasListMetaTypeCounts = Boolean(listMeta.typeCounts);
  const existingTypesFromListMeta = useMemo(() => {
    if (!hasListMetaTypeCounts) return null;
    return providerTypesFromListMeta.length > 0
      ? ['all', ...providerTypesFromListMeta]
      : ALL_AUTH_FILE_TYPES;
  }, [hasListMetaTypeCounts, providerTypesFromListMeta]);

  const existingTypes = useMemo(() => {
    if (existingTypesFromListMeta) return existingTypesFromListMeta;
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [existingTypesFromListMeta, files]);

  const sortSnapshotByName = useMemo(() => {
    // 服务端分页时排序由后端完成，本地不调用 compareAuthFiles，跳过全量 snapshot 计算。
    if (listMeta.paginated) return EMPTY_SORT_SNAPSHOT;
    const snapshot: Record<string, AuthFileSortSnapshot> = {};
    files.forEach((file) => {
      snapshot[file.name] = getAuthFileSortSnapshot(file, planSources);
    });
    return snapshot;
  }, [files, planSources, listMeta.paginated]);

  const matchesSupplementalDisplayFilters = useCallback(
    (file: (typeof files)[number]) => {
      if (disabledOnly && file.disabled !== true) {
        return false;
      }
      // 服务端 premium_only 结果可能落后于认证文件最新状态，本地再兜底过滤一次。
      if (premiumOnly && !hasPremiumAuthFilePlan(file, planSources)) {
        return false;
      }
      return true;
    },
    [disabledOnly, planSources, premiumOnly]
  );
  const matchesDisplayFilters = useCallback(
    (file: (typeof files)[number]) => {
      if (problemOnly && !hasAuthFileStatusMessage(file)) {
        return false;
      }
      if (!matchesSupplementalDisplayFilters(file)) {
        return false;
      }
      return true;
    },
    [matchesSupplementalDisplayFilters, problemOnly]
  );
  const serverPaginated = listMeta.paginated;
  const serverPageResultSettled = serverPaginated && !refreshing && !serverSearchPending;
  const shouldApplyLocalDisplayFilters =
    displayOptionsActive && (!serverPageResultSettled || premiumOnly);
  const currentFilesMatchingDisplayFilters = useMemo(
    () => (shouldApplyLocalDisplayFilters ? files.filter(matchesDisplayFilters) : files),
    [files, matchesDisplayFilters, shouldApplyLocalDisplayFilters]
  );
  const currentDisplayFilterNames = useMemo(
    () =>
      displayOptionsActive && !serverPaginated
        ? currentFilesMatchingDisplayFilters.map((file) => file.name)
        : EMPTY_AUTH_FILE_NAMES,
    [currentFilesMatchingDisplayFilters, displayOptionsActive, serverPaginated]
  );
  const currentDisplayFilterSortSnapshot = useMemo(() => {
    if (!displayOptionsActive || serverPaginated) return EMPTY_SORT_SNAPSHOT;
    return Object.fromEntries(
      currentFilesMatchingDisplayFilters.map((file) => [
        file.name,
        sortSnapshotByName[file.name] ?? getAuthFileSortSnapshot(file, planSources),
      ])
    );
  }, [
    currentFilesMatchingDisplayFilters,
    displayOptionsActive,
    planSources,
    serverPaginated,
    sortSnapshotByName,
  ]);
  const currentDisplayFilterNamesRef = useRef<string[]>([]);
  const currentDisplayFilterSortSnapshotRef = useRef<Record<string, AuthFileSortSnapshot>>({});
  currentDisplayFilterNamesRef.current = currentDisplayFilterNames;
  currentDisplayFilterSortSnapshotRef.current = currentDisplayFilterSortSnapshot;
  const shouldSnapshotDisplayFilters = displayOptionsActive && !serverPaginated;
  const fileByName = useMemo(
    () =>
      shouldSnapshotDisplayFilters
        ? new Map(files.map((file) => [file.name, file]))
        : EMPTY_AUTH_FILE_MAP,
    [files, shouldSnapshotDisplayFilters]
  );
  const displayFilterSnapshotKey = shouldSnapshotDisplayFilters
    ? [
        problemOnly ? 'problem' : 'normal',
        disabledOnly ? 'disabled' : 'any-status',
        premiumOnly ? 'premium' : 'any-plan',
        displayFilterRefreshVersion,
      ].join('|')
    : null;

  useEffect(() => {
    if (!displayFilterSnapshotKey) {
      setDisplayFilterSnapshot(null);
      return;
    }

    setDisplayFilterSnapshot({
      key: displayFilterSnapshotKey,
      names: currentDisplayFilterNamesRef.current,
      sortSnapshot: currentDisplayFilterSortSnapshotRef.current,
    });
  }, [displayFilterSnapshotKey]);

  const filesMatchingDisplayFilters = useMemo(() => {
    if (!displayFilterSnapshotKey || displayFilterSnapshot?.key !== displayFilterSnapshotKey) {
      return currentFilesMatchingDisplayFilters;
    }

    return displayFilterSnapshot.names
      .map((name) => fileByName.get(name))
      .filter((file): file is AuthFileItem => Boolean(file));
  }, [
    currentFilesMatchingDisplayFilters,
    displayFilterSnapshot,
    displayFilterSnapshotKey,
    fileByName,
  ]);

  const sortOptions = useMemo(
    () => [
      { value: 'default', label: t('auth_files.sort_default') },
      { value: 'az', label: t('auth_files.sort_az') },
      { value: 'priority', label: t('auth_files.sort_priority') },
      { value: 'subscription_expiry', label: t('auth_files.sort_subscription_expiry') },
    ],
    [t]
  );

  const displaySearch = serverPaginationEnabled ? debouncedSearch : deferredNormalizedSearch;
  const wildcardSearch = useMemo(() => buildWildcardSearch(displaySearch), [displaySearch]);
  const scopedTypeCountsKey = useMemo(() => {
    if (!serverPaginationEnabled || !isCurrentLayer || !uiStateHydrated) return null;
    if (!displayOptionsActive && displaySearch.length === 0) return null;

    return getAuthFilesTypeCountsKey({
      search: displaySearch,
      problemOnly,
      disabledOnly,
      premiumOnly,
    });
  }, [
    disabledOnly,
    displayOptionsActive,
    displaySearch,
    isCurrentLayer,
    premiumOnly,
    problemOnly,
    serverPaginationEnabled,
    uiStateHydrated,
  ]);

  useEffect(() => {
    if (!scopedTypeCountsKey) {
      setScopedTypeCounts(null);
      return undefined;
    }
    if (listUpdating) return undefined;
    if (listMeta.typeCountsKey === scopedTypeCountsKey && listMeta.typeCounts) {
      setScopedTypeCounts(null);
      return undefined;
    }

    const abortController = new AbortController();
    const requestKey = scopedTypeCountsKey;

    void authFilesApi
      .list(
        {
          codexSubscription: 'cache',
          summary: true,
          page: 1,
          pageSize: 1,
          search: displaySearch,
          problemOnly,
          disabledOnly,
          premiumOnly,
        },
        { signal: abortController.signal }
      )
      .then((data) => {
        if (abortController.signal.aborted) return;
        // 优先用后端返回的 type_counts（summary 模式已包含），避免遍历完整 files 列表。
        const counts = data?.type_counts ?? countAuthFilesByType(data?.files ?? []);
        setScopedTypeCounts((current) => {
          if (current?.key === requestKey && areAuthFileTypeCountsEqual(current.counts, counts)) {
            return current;
          }
          return {
            key: requestKey,
            counts,
          };
        });
      })
      .catch(() => {
        if (abortController.signal.aborted) return;
        setScopedTypeCounts((current) => (current?.key === requestKey ? null : current));
      });

    return () => abortController.abort();
  }, [
    disabledOnly,
    displaySearch,
    listMeta.typeCounts,
    listMeta.typeCountsKey,
    listUpdating,
    premiumOnly,
    problemOnly,
    scopedTypeCountsKey,
  ]);

  const currentScopedServerTypeCounts =
    scopedTypeCountsKey && listMeta.typeCountsKey === scopedTypeCountsKey
      ? listMeta.typeCounts
      : undefined;
  const currentScopedFallbackTypeCounts =
    scopedTypeCountsKey && scopedTypeCounts?.key === scopedTypeCountsKey
      ? scopedTypeCounts.counts
      : undefined;
  const needsLocalTypeCounts = scopedTypeCountsKey
    ? !currentScopedServerTypeCounts && !currentScopedFallbackTypeCounts
    : !listMeta.typeCounts;
  const localTypeCounts = useMemo(
    () =>
      needsLocalTypeCounts
        ? countAuthFilesByType(filesMatchingDisplayFilters)
        : EMPTY_AUTH_FILE_TYPE_COUNTS,
    [filesMatchingDisplayFilters, needsLocalTypeCounts]
  );
  const typeCounts = scopedTypeCountsKey
    ? (currentScopedServerTypeCounts ?? currentScopedFallbackTypeCounts ?? localTypeCounts)
    : (listMeta.typeCounts ?? localTypeCounts);

  const filtered = useMemo(() => {
    if (serverPageResultSettled) return filesMatchingDisplayFilters;

    const normalizedTerm = displaySearch.toLowerCase();

    return filesMatchingDisplayFilters.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const matchSearch =
        !displaySearch ||
        [item.name, item.type, item.provider].some((value) => {
          const content = (value || '').toString();
          return wildcardSearch
            ? wildcardSearch.test(content)
            : content.toLowerCase().includes(normalizedTerm);
        });
      return matchType && matchSearch;
    });
  }, [displaySearch, filesMatchingDisplayFilters, filter, serverPageResultSettled, wildcardSearch]);

  const sorted = useMemo(() => {
    if (serverPaginated) return filtered;
    const copy = [...filtered];

    const activeSortSnapshot =
      displayFilterSnapshotKey && displayFilterSnapshot?.key === displayFilterSnapshotKey
        ? displayFilterSnapshot.sortSnapshot
        : sortSnapshotByName;
    copy.sort((a, b) => compareAuthFiles(a, b, sortMode, activeSortSnapshot, planSources));
    return copy;
  }, [
    displayFilterSnapshot,
    displayFilterSnapshotKey,
    filtered,
    planSources,
    serverPaginated,
    sortMode,
    sortSnapshotByName,
  ]);

  const listTotal = serverPaginated ? listMeta.total : sorted.length;
  const filterTagTypeCounts = useMemo(() => {
    if (!scopedTypeCountsKey) return typeCounts;
    if (typeCounts[filter] === listTotal) return typeCounts;

    const counts = { ...typeCounts };
    counts[filter] = listTotal;
    return counts;
  }, [filter, listTotal, scopedTypeCountsKey, typeCounts]);
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = useMemo(
    () => (serverPaginated ? sorted : sorted.slice(start, start + pageSize)),
    [pageSize, serverPaginated, sorted, start]
  );
  const showInitialLoading = loading && pageItems.length === 0;
  const showListProgress = listUpdating && pageItems.length > 0;

  // 一次性按文件名预计算 usage buckets。
  // 仅当 keyUsageStats / pageItems 任一变化时重算，
  // 卡片接收到的 bucket 引用稳定 → React.memo 命中，统计未变时不会触发整页卡片重渲染。
  const fileUsageStatsByName = useMemo(() => {
    const map = new Map<string, KeyUsageBucket>();
    pageItems.forEach((file) => {
      map.set(file.name, resolveAuthFileUsageStats(file, keyUsageStats));
    });

    return reuseFileUsageStatsByName(map);
  }, [pageItems, keyUsageStats]);
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);
  const selectablePageItems = useMemo(() => filterSelectableAuthFiles(pageItems), [pageItems]);
  const pageQuotaRefreshItems = useMemo(() => resolveQuotaRefreshTargets(pageItems), [pageItems]);
  const selectableFilteredItems = useMemo(() => filterSelectableAuthFiles(sorted), [sorted]);
  const selectedNames = useMemo(
    () => (selectedFiles.size > 0 ? Array.from(selectedFiles) : EMPTY_AUTH_FILE_NAMES),
    [selectedFiles]
  );
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const batchStatusButtonsDisabled =
    disableControls ||
    listUpdating ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;
  const pageQuotaRefreshDisabled =
    disableControls || loading || listUpdating || pageQuotaRefreshing || pageItems.length === 0;
  const showListProgressVisual = useDelayedBoolean(showListProgress, LIST_PROGRESS_HIDE_DELAY_MS);
  const hasActiveFilters =
    filter !== 'all' || normalizedSearch.length > 0 || problemOnly || disabledOnly || premiumOnly;

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied ? t('notification.link_copied') : t('notification.copy_failed'),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const handleCopyAccessToken = useEventCallback(async (file: AuthFileItem) => {
    const fileName = file.name;
    if (accessTokenCopying[fileName]) return;

    setAccessTokenCopying((prev) => (prev[fileName] ? prev : { ...prev, [fileName]: true }));
    try {
      const json = await authFilesApi.downloadJsonObject(fileName);
      if (!pageMountedRef.current) return;
      const accessToken = extractAuthFileAccessToken(json);
      if (!accessToken) {
        showNotification(t('auth_files.access_token_empty'), 'warning');
        return;
      }
      await copyTextWithNotification(accessToken);
    } catch (error) {
      if (!pageMountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      showNotification(`${t('notification.copy_failed')}: ${errorMessage}`, 'error');
    } finally {
      if (pageMountedRef.current) {
        setAccessTokenCopying((prev) => {
          if (!prev[fileName]) return prev;
          const next = { ...prev };
          delete next[fileName];
          return next;
        });
      }
    }
  });

  const handleCodexAuthModeChange = useEventCallback(
    async (file: AuthFileItem, mode: CodexAuthMode) => {
      const fileName = file.name;
      if (disableControls || authModeUpdating[fileName]) return;

      setAuthModeUpdating((prev) => (prev[fileName] ? prev : { ...prev, [fileName]: true }));
      try {
        const response = await authFilesApi.setCodexAuthMode(fileName, mode);
        if (!pageMountedRef.current) return;
        applyLocalFilePatch(fileName, {
          ...response.file,
          auth_mode: response.file?.auth_mode ?? response.mode ?? mode,
        });
        const messageKey =
          mode === 'access_token'
            ? 'auth_files.auth_mode_access_token_success'
            : response.created
              ? 'auth_files.auth_mode_agent_identity_created_success'
              : 'auth_files.auth_mode_agent_identity_success';
        showNotification(t(messageKey, { name: fileName }), 'success');

        // The patch response is authoritative. Refresh in the background and
        // cancel any list request that started before the mode change, so an
        // older snapshot cannot immediately overwrite the new badge/button.
        void refreshFilesFromServer(true);
      } catch (error) {
        if (!pageMountedRef.current) return;
        const errorMessage = error instanceof Error ? error.message : String(error);
        showNotification(`${t('auth_files.auth_mode_update_failed')}: ${errorMessage}`, 'error');
      } finally {
        if (pageMountedRef.current) {
          setAuthModeUpdating((prev) => {
            if (!prev[fileName]) return prev;
            const next = { ...prev };
            delete next[fileName];
            return next;
          });
        }
      }
    }
  );

  const handlePriorityChange = useEventCallback(async (file: AuthFileItem, priority: number) => {
    const fileName = file.name;
    if (disableControls || priorityUpdating[fileName]) return;

    setPriorityUpdating((prev) => (prev[fileName] ? prev : { ...prev, [fileName]: true }));
    try {
      const response = await authFilesApi.patchFields({ name: fileName, priority });
      if (!pageMountedRef.current) return;
      applyLocalFilePatch(fileName, {
        ...response.file,
        priority: response.file?.priority ?? priority,
      });
      await refreshFilesFromServer();
      if (!pageMountedRef.current) return;
      showNotification(t('auth_files.priority_update_success', { priority }), 'success');
    } catch (error) {
      if (!pageMountedRef.current) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
    } finally {
      if (pageMountedRef.current) {
        setPriorityUpdating((prev) => {
          if (!prev[fileName]) return prev;
          const next = { ...prev };
          delete next[fileName];
          return next;
        });
      }
    }
  });

  const handleAuthFileUpdated = useCallback(
    (updated: AuthFileItem) => {
      applyLocalFileUpdates([updated]);
      void refreshFilesFromServer();
    },
    [applyLocalFileUpdates, refreshFilesFromServer]
  );

  const handlePageRefreshQuota = useCallback(async () => {
    if (
      disableControls ||
      loading ||
      listUpdating ||
      pageQuotaRefreshInFlightRef.current ||
      pageItems.length === 0
    ) {
      return;
    }

    if (pageQuotaRefreshItems.length === 0) {
      showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      return;
    }

    pageQuotaRefreshInFlightRef.current = true;
    setPageQuotaRefreshing(true);
    try {
      const skippedBeforeRefresh = Math.max(0, pageItems.length - pageQuotaRefreshItems.length);
      const result = await refreshAuthFileQuotasInParallel({
        targets: pageQuotaRefreshItems,
        disableControls,
        t,
        initialSkipped: skippedBeforeRefresh,
        shouldContinue: () => pageMountedRef.current,
      });
      if (!pageMountedRef.current) return;
      if (result.authFiles.length > 0) {
        applyLocalFileUpdates(result.authFiles);
        await refreshFilesFromServer();
      }
      if (!pageMountedRef.current) return;

      if (result.success === 0 && result.failed === 0) {
        showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      } else if (result.failed === 0 && result.skipped === 0) {
        showNotification(
          t('auth_files.batch_quota_refresh_success', { count: result.success }),
          'success'
        );
      } else {
        showNotification(t('auth_files.batch_quota_refresh_partial', result), 'warning');
      }
    } finally {
      pageQuotaRefreshInFlightRef.current = false;
      if (pageMountedRef.current) {
        setPageQuotaRefreshing(false);
      }
    }
  }, [
    applyLocalFileUpdates,
    disableControls,
    listUpdating,
    loading,
    pageItems.length,
    pageQuotaRefreshItems,
    refreshFilesFromServer,
    showNotification,
    t,
  ]);

  const handlePageRefreshQuotaClick = useCallback(() => {
    void handlePageRefreshQuota();
  }, [handlePageRefreshQuota]);

  const openExcludedEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-excluded${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const handleAddExcluded = useCallback(() => {
    openExcludedEditor();
  }, [openExcludedEditor]);

  const openModelAliasEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      const params = new URLSearchParams();
      if (providerValue) {
        params.set('provider', providerValue);
      }
      const nextSearch = params.toString();
      navigate(`/auth-files/oauth-model-alias${nextSearch ? `?${nextSearch}` : ''}`, {
        state: { fromAuthFiles: true },
      });
    },
    [filter, navigate]
  );

  const handleAddModelAlias = useCallback(() => {
    openModelAliasEditor();
  }, [openModelAliasEditor]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) {
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      return;
    }

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const height = actionsEl.getBoundingClientRect().height;
        document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
      });
    };

    // 初始同步一次避免首帧抖动；后续用 rAF 节流避免布局抖动
    const height = actionsEl.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--auth-files-action-bar-height', `${height}px`);
    window.addEventListener('resize', scheduleUpdate);

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    ro?.observe(actionsEl);

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      ro?.disconnect();
      window.removeEventListener('resize', scheduleUpdate);
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    };
  }, [batchActionBarVisible]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const selectionActive = selectionCount > 0;
    const previousSelectionActive = previousSelectionActiveRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    if (selectionActive === previousSelectionActive) return;

    batchActionAnimationRef.current?.cancel();
    batchActionAnimationRef.current = null;
    previousSelectionActiveRef.current = selectionActive;

    const applyPresentation = (translateY: number, opacity: number) => {
      actionsEl.style.transform = `translate3d(-50%, ${translateY}px, 0)`;
      actionsEl.style.opacity = String(opacity);
      actionsEl.style.visibility = opacity === 0 ? 'hidden' : 'visible';
    };

    if (prefersReducedMotion || typeof actionsEl.animate !== 'function') {
      applyPresentation(0, selectionActive ? 1 : 0);
      if (!selectionActive) {
        setBatchActionBarVisible(false);
      }
      return;
    }

    actionsEl.style.visibility = 'visible';
    actionsEl.style.willChange = 'transform, opacity';
    const animation = actionsEl.animate(
      selectionActive
        ? [
            { transform: 'translate3d(-50%, 10px, 0)', opacity: 0 },
            { transform: 'translate3d(-50%, 0, 0)', opacity: 1 },
          ]
        : [
            { transform: 'translate3d(-50%, 0, 0)', opacity: 1 },
            { transform: 'translate3d(-50%, 8px, 0)', opacity: 0 },
          ],
      {
        duration: selectionActive ? 170 : 150,
        easing: selectionActive ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'cubic-bezier(0.4, 0, 1, 1)',
        fill: 'both',
      }
    );
    batchActionAnimationRef.current = animation;

    void animation.finished
      .then(() => {
        if (batchActionAnimationRef.current !== animation) return;
        batchActionAnimationRef.current = null;
        applyPresentation(0, selectionActive ? 1 : 0);
        actionsEl.style.removeProperty('will-change');
        animation.cancel();
        if (!selectionActive && selectionCountRef.current === 0) {
          setBatchActionBarVisible(false);
        }
      })
      .catch(() => {
        // A newer selection state cancels the previous animation.
      });
  }, [batchActionBarVisible, prefersReducedMotion, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.cancel();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const showTitleCountBadge =
    listTotal > 0 || displayOptionsActive || filter !== 'all' || displaySearch.length > 0;

  const titleNode = useMemo(
    () => (
      <h2 className={styles.titleWrapper}>
        <span>{t('auth_files.title_section')}</span>
        {showTitleCountBadge && <span className={styles.countBadge}>{listTotal}</span>}
      </h2>
    ),
    [listTotal, showTitleCountBadge, t]
  );

  const deleteAllButtonLabel = useMemo(
    () =>
      problemOnly
        ? filter === 'all'
          ? t('auth_files.delete_problem_button')
          : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
        : filter === 'all'
          ? t('auth_files.delete_all_button')
          : `${t('common.delete')} ${getTypeLabel(t, filter)}`,
    [filter, problemOnly, t]
  );

  const handleDeleteAllClick = useCallback(() => {
    handleDeleteAll({
      filter,
      problemOnly,
      matchDisplayFilter:
        disabledOnly || premiumOnly ? matchesSupplementalDisplayFilters : undefined,
      onResetFilterToAll: () => setFilter('all'),
      onResetProblemOnly: () => setProblemOnly(false),
    });
  }, [
    disabledOnly,
    filter,
    handleDeleteAll,
    matchesSupplementalDisplayFilters,
    premiumOnly,
    problemOnly,
  ]);

  const handlePreviousPage = useCallback(() => {
    setPage((prev) => Math.max(1, Math.min(prev, currentPage) - 1));
  }, [currentPage]);

  const handleNextPage = useCallback(() => {
    setPage((prev) => Math.min(totalPages, Math.max(prev, currentPage) + 1));
  }, [currentPage, totalPages]);

  const handleSelectPageItems = useCallback(() => {
    selectAllVisible(pageItems);
  }, [pageItems, selectAllVisible]);

  const handleSelectFilteredItems = useCallback(() => {
    selectAllVisible(sorted);
  }, [selectAllVisible, sorted]);

  const handleInvertPageItems = useCallback(() => {
    invertVisibleSelection(pageItems);
  }, [invertVisibleSelection, pageItems]);

  const handleBatchDownload = useCallback(() => {
    void batchDownload(selectedNames);
  }, [batchDownload, selectedNames]);

  const handleBatchEnable = useCallback(() => {
    void batchSetStatus(selectedNames, true);
  }, [batchSetStatus, selectedNames]);

  const handleBatchDisable = useCallback(() => {
    void batchSetStatus(selectedNames, false);
  }, [batchSetStatus, selectedNames]);

  const handleBatchDelete = useCallback(() => {
    batchDelete(selectedNames);
  }, [batchDelete, selectedNames]);

  const authFileCardNodes = useMemo(
    () =>
      pageItems.map((file, index) => {
        const authIndexKey = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
        const statusData =
          (authIndexKey ? statusBarCache.get(authIndexKey) : undefined) ??
          statusBarCache.get(file.name) ??
          EMPTY_AUTH_FILE_STATUS_BAR_DATA;
        const fileUsageStats = fileUsageStatsByName.get(file.name) ?? EMPTY_AUTH_FILE_USAGE_STATS;

        return (
          <AuthFileCard
            key={file.name}
            file={file}
            selected={selectedFiles.has(file.name)}
            resolvedTheme={resolvedTheme}
            disableControls={disableControls || listUpdating}
            deleting={deleting === file.name}
            statusUpdating={statusUpdating[file.name] === true}
            accessTokenCopying={accessTokenCopying[file.name] === true}
            authModeUpdating={authModeUpdating[file.name] === true}
            priorityUpdating={priorityUpdating[file.name] === true}
            quotaFilterType={quotaFilterType}
            fileUsageStats={fileUsageStats}
            statusData={statusData}
            enterDelayMs={Math.min(index, 7) * 12}
            onShowModels={showModels}
            onCopyName={copyTextWithNotification}
            onDownload={handleDownload}
            onCopyAccessToken={handleCopyAccessToken}
            onAuthModeChange={handleCodexAuthModeChange}
            onPriorityChange={handlePriorityChange}
            onOpenPrefixProxyEditor={openPrefixProxyEditor}
            onAuthFileUpdated={handleAuthFileUpdated}
            onDelete={handleDelete}
            onToggleStatus={handleStatusToggle}
            onToggleSelect={toggleSelect}
          />
        );
      }),
    [
      accessTokenCopying,
      authModeUpdating,
      copyTextWithNotification,
      deleting,
      disableControls,
      fileUsageStatsByName,
      handleAuthFileUpdated,
      handleCopyAccessToken,
      handleCodexAuthModeChange,
      handleDelete,
      handleDownload,
      handlePriorityChange,
      handleStatusToggle,
      listUpdating,
      openPrefixProxyEditor,
      pageItems,
      priorityUpdating,
      quotaFilterType,
      resolvedTheme,
      selectedFiles,
      showModels,
      statusBarCache,
      statusUpdating,
      toggleSelect,
    ]
  );

  return (
    <div className={styles.container}>
      <section className={styles.authFilesSection}>
        <header className={styles.authFilesHeader}>
          {titleNode}
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              size="sm"
              className={`${styles.headerActionButton} ${styles.headerActionMain}`}
              onClick={handleHeaderRefresh}
              disabled={loading || refreshing}
              loading={refreshing}
            >
              <IconRefreshCw className={styles.headerActionIcon} size={15} />
              <span className={styles.headerActionText}>{t('common.refresh')}</span>
            </Button>
            <Button
              size="sm"
              className={`${styles.headerActionButton} ${styles.headerActionMain} ${styles.headerActionUpload}`}
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              <IconUpload className={styles.headerActionIcon} size={15} />
              <span className={styles.headerActionText}>{t('auth_files.upload_button')}</span>
            </Button>
            <Button
              variant="danger"
              size="sm"
              className={`${styles.headerActionButton} ${styles.headerActionDanger}`}
              onClick={handleDeleteAllClick}
              disabled={disableControls || loading || refreshing || deletingAll}
              loading={deletingAll}
            >
              <IconTrash2 className={styles.headerActionIcon} size={15} />
              <span className={styles.headerActionText}>{deleteAllButtonLabel}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              aria-label={t('auth_files.upload_button')}
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </header>

        {error && (
          <div className={styles.errorBox} role="alert">
            {error}
          </div>
        )}

        <div className={styles.filterSection}>
          <div className={styles.filterToolbarRow}>
            <FilterTagsRail
              types={existingTypes}
              activeFilter={filter}
              typeCounts={filterTagTypeCounts}
              resolvedTheme={resolvedTheme}
              onSelect={handleFilterTagSelect}
            />

            <div className={styles.filterControlsPanel}>
              <SearchToolbar
                search={search}
                onSearchChange={handleSearchValue}
                searchPlaceholder={t('auth_files.search_placeholder')}
                sortValue={sortMode}
                sortOptions={sortOptions}
                onSortChange={handleSortModeChange}
                sortLabel={t('auth_files.sort_label')}
                pageSize={pageSize}
                pageSizePresets={PAGE_SIZE_PRESETS}
                pageSizeMin={MIN_CARD_PAGE_SIZE}
                pageSizeMax={MAX_CARD_PAGE_SIZE}
                onPageSizeChange={handlePageSizeCommit}
                pageSizeLabel={t('auth_files.page_size_label')}
              />

              <div className={styles.filterChipRow}>
                <span className={styles.filterChipRowLabel}>
                  {t('auth_files.display_options_label')}
                </span>
                <div className={styles.filterChipGroup} role="group">
                  <button
                    type="button"
                    className={`${styles.filterChip} ${problemOnly ? styles.filterChipActive : ''}`}
                    onClick={handleToggleProblemOnly}
                    aria-pressed={problemOnly}
                  >
                    {t('auth_files.problem_filter_only')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${disabledOnly ? styles.filterChipActive : ''}`}
                    onClick={handleToggleDisabledOnly}
                    aria-pressed={disabledOnly}
                  >
                    {t('auth_files.disabled_filter_only')}
                  </button>
                  <button
                    type="button"
                    className={`${styles.filterChip} ${premiumOnly ? styles.filterChipActive : ''}`}
                    onClick={handleTogglePremiumOnly}
                    aria-pressed={premiumOnly}
                  >
                    {t('auth_files.premium_filter_only')}
                  </button>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className={styles.filterResetButton}
                    onClick={handleClearFilters}
                  >
                    {t('auth_files.clear_filters')}
                  </button>
                )}
              </div>

              <Button
                variant="secondary"
                size="sm"
                className={`${styles.pageQuotaRefreshButton} ${pageQuotaRefreshing ? styles.quotaRefreshButtonSpinning : ''}`}
                onClick={handlePageRefreshQuotaClick}
                disabled={pageQuotaRefreshDisabled}
                aria-busy={pageQuotaRefreshing}
                aria-label={t('auth_files.refresh_page_quota_aria')}
                title={t('auth_files.refresh_page_quota_aria')}
              >
                <span className={styles.quotaRefreshIcon}>
                  <span
                    className={`${styles.quotaButtonSpinner} ${pageQuotaRefreshing ? styles.quotaButtonSpinnerSpinning : ''}`}
                    style={QUOTA_REFRESH_SPINNER_STYLE}
                    aria-hidden="true"
                  />
                </span>
              </Button>
            </div>
          </div>

          <div className={styles.filterContent}>
            <div
              className={`${styles.listSurface} ${showListProgressVisual ? styles.listSurfaceRefreshing : ''}`}
              aria-busy={showInitialLoading || showListProgress}
            >
              <div
                className={`${styles.listProgressBar} ${showListProgress ? styles.listProgressBarActive : ''}`}
                aria-hidden="true"
              />
              {showInitialLoading ? (
                <AuthFilesSkeletonGrid
                  count={pageSize}
                  quotaManaged={Boolean(quotaFilterType)}
                  loadingLabel={t('common.loading')}
                />
              ) : pageItems.length === 0 ? (
                <EmptyState
                  title={t('auth_files.search_empty_title')}
                  description={t('auth_files.search_empty_desc')}
                />
              ) : (
                <div
                  className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''}`}
                >
                  {authFileCardNodes}
                </div>
              )}
            </div>

            {!showInitialLoading && listTotal > pageSize && (
              <div className={styles.pagination}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={currentPage <= 1}
                >
                  {t('auth_files.pagination_prev')}
                </Button>
                <div className={styles.pageInfo}>
                  {t('auth_files.pagination_info', {
                    current: currentPage,
                    total: totalPages,
                    count: listTotal,
                  })}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {belowFoldCardsReady && (
        <Suspense fallback={null}>
          <div className={styles.belowFoldCard}>
            <OAuthExcludedCard
              disableControls={disableControls}
              excludedError={excludedError}
              excluded={excluded}
              onAdd={handleAddExcluded}
              onEdit={openExcludedEditor}
              onDelete={deleteExcluded}
            />
          </div>

          <div className={styles.belowFoldCard}>
            <OAuthModelAliasCard
              disableControls={disableControls}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onAdd={handleAddModelAlias}
              onEditProvider={openModelAliasEditor}
              onDeleteProvider={deleteModelAlias}
              modelAliasError={modelAliasError}
              modelAlias={modelAlias}
              allProviderModels={allProviderModels}
              onUpdate={handleMappingUpdate}
              onDeleteLink={handleDeleteLink}
              onToggleFork={handleToggleFork}
              onRenameAlias={handleRenameAlias}
              onDeleteAlias={handleDeleteAlias}
            />
          </div>
        </Suspense>
      )}

      {modelsModalOpen && (
        <Suspense fallback={null}>
          <AuthFileModelsModal
            open
            fileName={modelsFileName}
            fileType={modelsFileType}
            loading={modelsLoading}
            error={modelsError}
            models={modelsList}
            excluded={excluded}
            onClose={closeModelsModal}
            onCopyText={copyTextWithNotification}
          />
        </Suspense>
      )}

      {prefixProxyEditor && (
        <Suspense fallback={null}>
          <AuthFilesPrefixProxyEditorModal
            disableControls={disableControls}
            editor={prefixProxyEditor}
            updatedText={prefixProxyUpdatedText}
            dirty={prefixProxyDirty}
            onClose={closePrefixProxyEditor}
            onCopyText={copyTextWithNotification}
            onSave={handlePrefixProxySave}
            onChange={handlePrefixProxyChange}
          />
        </Suspense>
      )}

      {batchActionBarVisible && typeof document !== 'undefined'
        ? createPortal(
            <div className={styles.batchActionContainer} ref={floatingBatchActionsRef}>
              <div className={styles.batchActionBar}>
                <div className={styles.batchActionLeft}>
                  <span className={styles.batchSelectionText}>
                    {t('auth_files.batch_selected', { count: selectionCount })}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectPageItems}
                    disabled={listUpdating || selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_page')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectFilteredItems}
                    disabled={listUpdating || selectableFilteredItems.length === 0}
                  >
                    {t('auth_files.batch_select_filtered')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleInvertPageItems}
                    disabled={listUpdating || selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_invert_page')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    {t('auth_files.batch_deselect')}
                  </Button>
                </div>
                <div className={styles.batchActionRight}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBatchDownload}
                    disabled={disableControls || listUpdating || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBatchEnable}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleBatchDisable}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleBatchDelete}
                    disabled={disableControls || listUpdating || selectedNames.length === 0}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
