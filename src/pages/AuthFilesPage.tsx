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
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useDebounce, useDelayedBoolean, useEventCallback, useReducedMotion } from '@/hooks';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/Button';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconCheck, IconTrash2, IconUpload } from '@/components/ui/icons';
import { copyToClipboard } from '@/utils/clipboard';
import { REFRESH_FEEDBACK_MS } from '@/utils/refreshFeedback';
import { isQuotaProviderType, type QuotaProviderType } from '@/utils/quota';
import { scheduleIdleTask } from '@/utils/scheduleIdleTask';
import { normalizeAuthIndex, type KeyUsageBucket } from '@/utils/usage';
import {
  authFilesApi,
  getAuthFilesListOptionsKey,
  getAuthFilesTypeCountsKey,
  type AuthFilesListOptions,
} from '@/services/api';
import {
  MAX_CARD_PAGE_SIZE,
  MIN_CARD_PAGE_SIZE,
  clampCardPageSize,
  getTypeLabel,
  hasAuthFileStatusMessage,
  normalizeProviderKey,
  resolveAuthFileUsageStats,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFilesRefreshButton } from '@/features/authFiles/components/AuthFilesRefreshButton';
import { FilterTagsRail } from '@/features/authFiles/components/FilterTagsRail';
import { AuthFilesSkeletonGrid } from '@/features/authFiles/components/AuthFilesSkeletonGrid';
import { SearchToolbar } from '@/features/authFiles/components/SearchToolbar';
import {
  useAuthFilesData,
  type AuthFilesListMeta,
} from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { extractAuthFileAccessToken } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesQuotaRefreshBatch } from '@/features/authFiles/hooks/useAuthFilesQuotaRefreshBatch';
import {
  useAuthFilesStats,
  useAuthFilesStatusDetails,
} from '@/features/authFiles/hooks/useAuthFilesStats';
import {
  EMPTY_AUTH_FILE_STATUS_BAR_DATA,
  useAuthFilesStatusBarCache,
} from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  hasPremiumAuthFilePlan,
  type AuthFilePlanSources,
} from '@/features/authFiles/planMetadata';
import { authFileIncludesRecentRequestSummary } from '@/features/authFiles/stats';
import {
  ALL_AUTH_FILE_TYPES,
  EMPTY_AUTH_FILE_ITEMS,
  EMPTY_AUTH_FILE_MAP,
  EMPTY_AUTH_FILE_NAMES,
  EMPTY_AUTH_FILE_PROVIDER_TYPES,
  EMPTY_AUTH_FILE_QUOTA_REFRESH_TARGETS,
  EMPTY_AUTH_FILE_TYPE_COUNTS,
  EMPTY_AUTH_FILE_USAGE_STATS,
  EMPTY_AUTH_FILE_USAGE_STATS_MAP,
  EMPTY_CLAUDE_QUOTA,
  EMPTY_CODEX_QUOTA,
  EMPTY_SORT_SNAPSHOT,
  FILE_USAGE_BUCKET_CACHE,
  areAuthFileTypeCountsEqual,
  buildProviderTypesKey,
  buildWildcardSearch,
  compareAuthFiles,
  countAuthFilesByType,
  filterSelectableAuthFiles,
  getAuthFileSortSnapshot,
  resolveQuotaRefreshTargets,
  type AuthFileSortSnapshot,
} from '@/features/authFiles/authFilesPageUtils';
import {
  isAuthFilesSortMode,
  readAuthFilesUiState,
  writeAuthFilesUiState,
  type AuthFilesSortMode,
  type AuthFilesUiState,
} from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem, ResolvedTheme } from '@/types';
import refreshStyles from './AuthFilesPageRefresh.module.scss';

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
const OAuthModelRulesCard = lazy(() =>
  import('@/features/authFiles/components/OAuthModelRulesCard').then((module) => ({
    default: module.OAuthModelRulesCard,
  }))
);
const OAuthModelRulesEditorModal = lazy(() =>
  import('@/pages/AuthFilesOAuthModelRulesPage').then((module) => ({
    default: module.OAuthModelRulesEditorModal,
  }))
);

const DEFAULT_PAGE_SIZE = 12;
const PAGE_SIZE_PRESETS = [4, 8, 12, 16, 20, 24];
const LIST_PROGRESS_HIDE_DELAY_MS = 200;
const AUTH_FILE_GRID_MOTION_DURATION_MS = 180;
const AUTH_FILE_GRID_MOTION_SNAPSHOT_TTL_MS = 1_500;
const MAX_AUTH_FILE_GRID_MOTION_CARDS = 12;

const EMPTY_AUTH_FILE_CARD_NODES: ReactNode[] = [];

export function AuthFilesPage() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const resolvedTheme: ResolvedTheme = useThemeStore((state) =>
    isCurrentLayer ? state.resolvedTheme : 'light'
  );
  const prefersReducedMotion = useReducedMotion();
  const [persistedUiState] = useState<AuthFilesUiState | null>(() => readAuthFilesUiState());
  const [filter, setFilter] = useState<'all' | string>(() => {
    const value = persistedUiState?.filter;
    return typeof value === 'string' && value.trim() ? value : 'all';
  });
  const [problemOnly, setProblemOnly] = useState(() => persistedUiState?.problemOnly === true);
  const [disabledOnly, setDisabledOnly] = useState(() => persistedUiState?.disabledOnly === true);
  const [premiumOnly, setPremiumOnly] = useState(() => persistedUiState?.premiumOnly === true);
  const [premiumServerFilterSupported, setPremiumServerFilterSupported] = useState<boolean | null>(
    null
  );
  const [search, setSearch] = useState(() =>
    typeof persistedUiState?.search === 'string' ? persistedUiState.search : ''
  );
  const [page, setPage] = useState(() => {
    const value = persistedUiState?.page;
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
  });
  const [pageSize, setPageSize] = useState(() => {
    const value = persistedUiState?.pageSize;
    return typeof value === 'number' && Number.isFinite(value)
      ? clampCardPageSize(value)
      : DEFAULT_PAGE_SIZE;
  });
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>(() => {
    const value = persistedUiState?.sortMode;
    return isAuthFilesSortMode(value) ? value : 'default';
  });
  const [accessTokenCopying, setAccessTokenCopying] = useState<Record<string, boolean>>({});
  const [priorityUpdating, setPriorityUpdating] = useState<Record<string, boolean>>({});
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [belowFoldCardsReady, setBelowFoldCardsReady] = useState(false);
  const [modelRulesEditor, setModelRulesEditor] = useState({ open: false, provider: '' });
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
  const authFileGridRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<Animation | null>(null);
  const authFileGridMotionSnapshotRef = useRef<Map<string, DOMRect> | null>(null);
  const authFileGridMotionAnimationsRef = useRef<Animation[]>([]);
  const authFileGridMotionSnapshotTimeoutRef = useRef<number | null>(null);
  const previousSelectionActiveRef = useRef(false);
  const selectionCountRef = useRef(0);
  const previousListBusyRef = useRef(false);
  const manualRefreshInFlightRef = useRef(false);
  const pageMountedRef = useRef(true);
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = search.trim();
  const deferredNormalizedSearch = deferredSearch.trim();
  const debouncedSearch = useDebounce(normalizedSearch, 280);
  // Newer servers classify subscriptions from their cache and acknowledge the
  // filter in the response. Until that capability is confirmed, request one
  // paginated probe; an older server then falls back to the established local
  // full-list path without ever filtering a partial server page client-side.
  const requestServerPremiumFilter = premiumOnly && premiumServerFilterSupported !== false;
  const serverPaginationEnabled = !premiumOnly || requestServerPremiumFilter;
  const serverSearchPending = serverPaginationEnabled && normalizedSearch !== debouncedSearch;
  const serverListPage = serverPaginationEnabled ? page : undefined;
  const serverListPageSize = serverPaginationEnabled ? pageSize : undefined;
  const serverListSearch = serverPaginationEnabled ? debouncedSearch : undefined;
  const serverListType = serverPaginationEnabled && filter !== 'all' ? String(filter) : undefined;
  const serverListSort = serverPaginationEnabled ? sortMode : undefined;
  const serverListProblemOnly = serverPaginationEnabled ? problemOnly : undefined;
  const serverListDisabledOnly = serverPaginationEnabled ? disabledOnly : undefined;
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
  const debouncedAuthFilesUiState = useDebounce(authFilesUiState, 300);
  const authFilesListOptions = useMemo<AuthFilesListOptions>(() => {
    if (!serverPaginationEnabled) {
      // Keep premiumOnly out of this request. The backend only has the auth-file
      // snapshot, while the Plus/Pro badge also incorporates the latest quota
      // data stored on the client.
      return { codexSubscription: 'cache', summary: true, includeRecentRequests: false };
    }
    return {
      codexSubscription: 'cache',
      summary: true,
      includeRecentRequests: false,
      pageRecentRequests: true,
      page: serverListPage,
      pageSize: serverListPageSize,
      search: serverListSearch,
      type: serverListType,
      sort: serverListSort,
      problemOnly: serverListProblemOnly,
      disabledOnly: serverListDisabledOnly,
      premiumOnly: requestServerPremiumFilter || undefined,
    };
  }, [
    serverListDisabledOnly,
    serverListPage,
    serverListPageSize,
    serverListProblemOnly,
    serverListSearch,
    serverListSort,
    serverListType,
    requestServerPremiumFilter,
    serverPaginationEnabled,
  ]);
  const authFilesListOptionsKey = useMemo(
    () => getAuthFilesListOptionsKey(authFilesListOptions),
    [authFilesListOptions]
  );
  const handleListMetaResolved = useCallback((meta: AuthFilesListMeta) => {
    if (!meta.paginated || meta.pageSize <= 0) return;

    const resolvedTotalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
    setPage((current) => (current > resolvedTotalPages ? resolvedTotalPages : current));
  }, []);

  const { keyUsageStats, loadKeyStats, refreshKeyStats } = useAuthFilesStats(isCurrentLayer);
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
  } = useAuthFilesData({
    refreshKeyStats,
    listOptions: authFilesListOptions,
    onListMetaResolved: handleListMetaResolved,
  });

  const authFilesIncludeRecentRequestSummary = useMemo(
    () =>
      isCurrentLayer &&
      files.length > 0 &&
      files.every((file) => authFileIncludesRecentRequestSummary(file)),
    [files, isCurrentLayer]
  );
  const { usageDetails, loadStatusDetails, refreshStatusDetails } = useAuthFilesStatusDetails(
    isCurrentLayer && !authFilesIncludeRecentRequestSummary
  );

  useEffect(() => {
    if (!premiumOnly) return undefined;
    if (!requestServerPremiumFilter) return;
    if (
      listMeta.dataKey !== authFilesListOptionsKey &&
      listMeta.resolvedDataKey !== authFilesListOptionsKey
    ) {
      return;
    }

    const supported = listMeta.premiumOnlyApplied === true;
    const taskId = window.setTimeout(() => {
      setPremiumServerFilterSupported((current) => (current === supported ? current : supported));
    }, 0);

    return () => window.clearTimeout(taskId);
  }, [
    authFilesListOptionsKey,
    listMeta.dataKey,
    listMeta.premiumOnlyApplied,
    listMeta.resolvedDataKey,
    premiumOnly,
    requestServerPremiumFilter,
  ]);

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
  const { excluded, excludedError, modelAlias, modelAliasError, loadExcluded, loadModelAlias } =
    useAuthFilesOauth();

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
  const premiumFilterServerSide = premiumOnly && premiumServerFilterSupported === true;
  const needsPlanSources =
    isCurrentLayer &&
    !premiumFilterServerSide &&
    (premiumOnly || (!listMeta.paginated && sortMode === 'subscription_expiry'));
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
  const quotaFilterType: QuotaProviderType | null = isQuotaProviderType(normalizedFilter)
    ? normalizedFilter
    : null;
  const planSources = useMemo<AuthFilePlanSources>(
    () => ({
      claudeQuota,
      codexQuota,
    }),
    [claudeQuota, codexQuota]
  );

  useEffect(() => {
    if (!debouncedAuthFilesUiState) return;
    writeAuthFilesUiState(debouncedAuthFilesUiState);
  }, [debouncedAuthFilesUiState]);

  const displayOptionsActive = problemOnly || disabledOnly || premiumOnly;
  const listUpdating = refreshing || serverSearchPending;

  const captureAuthFileGridLayout = useCallback(() => {
    if (!isCurrentLayer) return;
    if (typeof window === 'undefined') return;

    if (authFileGridMotionSnapshotTimeoutRef.current !== null) {
      window.clearTimeout(authFileGridMotionSnapshotTimeoutRef.current);
      authFileGridMotionSnapshotTimeoutRef.current = null;
    }

    const grid = authFileGridRef.current;
    if (prefersReducedMotion || !grid) {
      authFileGridMotionSnapshotRef.current = null;
      return;
    }

    const snapshot = new Map<string, DOMRect>();
    grid.querySelectorAll<HTMLElement>('[data-auth-file-name]').forEach((card) => {
      const name = card.dataset.authFileName;
      if (name) snapshot.set(name, card.getBoundingClientRect());
    });

    if (snapshot.size === 0) {
      authFileGridMotionSnapshotRef.current = null;
      return;
    }

    authFileGridMotionSnapshotRef.current = snapshot;
    // A slow or failed request should not let an old layout influence a later update.
    authFileGridMotionSnapshotTimeoutRef.current = window.setTimeout(() => {
      authFileGridMotionSnapshotRef.current = null;
      authFileGridMotionSnapshotTimeoutRef.current = null;
    }, AUTH_FILE_GRID_MOTION_SNAPSHOT_TTL_MS);
  }, [isCurrentLayer, prefersReducedMotion]);

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
      captureAuthFileGridLayout();
      setSortMode(value);
      setPage(1);
    },
    [captureAuthFileGridLayout, sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    if (manualRefreshInFlightRef.current) return;

    manualRefreshInFlightRef.current = true;
    setManualRefreshPending(true);
    const feedbackDelay = new Promise<void>((resolve) =>
      window.setTimeout(resolve, REFRESH_FEEDBACK_MS)
    );
    try {
      // The file list is the primary refresh result. Credential totals and the
      // legacy status fallback update in the background after cards are current.
      await refreshFilesFromServer(true);
    } finally {
      await feedbackDelay;
      manualRefreshInFlightRef.current = false;
      if (pageMountedRef.current) {
        setManualRefreshPending(false);
        void Promise.allSettled([refreshKeyStats(), refreshStatusDetails()]);
      }
    }
  }, [refreshFilesFromServer, refreshKeyStats, refreshStatusDetails]);

  const handleToggleProblemOnly = useCallback(() => {
    captureAuthFileGridLayout();
    setProblemOnly((prev) => !prev);
    setPage(1);
  }, [captureAuthFileGridLayout]);
  const handleToggleDisabledOnly = useCallback(() => {
    captureAuthFileGridLayout();
    setDisabledOnly((prev) => !prev);
    setPage(1);
  }, [captureAuthFileGridLayout]);
  const handleTogglePremiumOnly = useCallback(() => {
    captureAuthFileGridLayout();
    const nextPremiumOnly = !premiumOnly;
    setPremiumOnly(nextPremiumOnly);
    if (!nextPremiumOnly) {
      setPremiumServerFilterSupported(null);
    }
    setPage(1);
  }, [captureAuthFileGridLayout, premiumOnly]);
  const handleSearchValue = useCallback(
    (value: string) => {
      if (value === search) return;
      // Search results are debounced below. During one continuous typing burst,
      // keep a single FLIP snapshot instead of forcing a full-card layout read
      // for every keystroke.
      if (normalizedSearch === debouncedSearch) {
        captureAuthFileGridLayout();
      }
      setSearch(value);
      setPage(1);
    },
    [captureAuthFileGridLayout, debouncedSearch, normalizedSearch, search]
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
    captureAuthFileGridLayout();
    setFilter('all');
    setProblemOnly(false);
    setDisabledOnly(false);
    setPremiumOnly(false);
    if (premiumOnly) {
      setPremiumServerFilterSupported(null);
    }
    setSearch('');
    setPage(1);
  }, [captureAuthFileGridLayout, disabledOnly, filter, page, premiumOnly, problemOnly, search]);
  const handleFilterTagSelect = useCallback(
    (value: string) => {
      if (value === filter) return;
      captureAuthFileGridLayout();
      setFilter(value);
      setPage(1);
    },
    [captureAuthFileGridLayout, filter]
  );
  const handlePageSizeCommit = useCallback(
    (next: number) => {
      const clamped = clampCardPageSize(next);
      if (clamped === pageSize) return;
      captureAuthFileGridLayout();
      setPageSize(clamped);
      setPage(1);
    },
    [captureAuthFileGridLayout, pageSize]
  );

  useHeaderRefresh(handleHeaderRefresh, isCurrentLayer);

  useEffect(() => {
    pageMountedRef.current = true;
    return () => {
      pageMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isCurrentLayer || serverSearchPending) return;
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
  ]);

  useEffect(() => {
    if (!isCurrentLayer || belowFoldCardsReady) return undefined;

    return scheduleIdleTask(
      () => {
        if (!pageMountedRef.current) return;
        setBelowFoldCardsReady(true);
      },
      { fallbackDelayMs: 900 }
    );
  }, [belowFoldCardsReady, isCurrentLayer]);

  useEffect(() => {
    if (!isCurrentLayer) return;

    // 用量统计会直接影响首屏卡片；OAuth 规则只服务于下方延后挂载的区域，
    // 不要让它们占用首屏请求和响应后的渲染预算。
    void loadKeyStats().catch(() => {});
  }, [isCurrentLayer, loadKeyStats]);

  useEffect(() => {
    if (!isCurrentLayer || !belowFoldCardsReady) return;

    void Promise.allSettled([loadExcluded(), loadModelAlias()]);
  }, [belowFoldCardsReady, isCurrentLayer, loadExcluded, loadModelAlias]);

  useEffect(() => {
    if (
      !isCurrentLayer ||
      loading ||
      refreshing ||
      serverSearchPending ||
      files.length === 0 ||
      authFilesIncludeRecentRequestSummary
    ) {
      return undefined;
    }

    // Status details enrich the cards but are not needed to make the first
    // interaction usable. Let the initial list, quota stats, and paint settle
    // before requesting the compatibility payload for older servers.
    return scheduleIdleTask(
      () => {
        void loadStatusDetails().catch(() => {});
      },
      { delayMs: 120, fallbackDelayMs: 700, timeoutMs: 1_500 }
    );
  }, [
    authFilesIncludeRecentRequestSummary,
    files.length,
    isCurrentLayer,
    loadStatusDetails,
    loading,
    refreshing,
    serverSearchPending,
  ]);

  // 改用 useVisibleInterval：标签页隐藏时不必继续拉取用量聚合
  useVisibleInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null,
    { minRefreshGapMs: 120_000 }
  );

  useVisibleInterval(
    () => {
      if (authFilesIncludeRecentRequestSummary) {
        void refreshFilesFromServer().catch(() => {});
        return;
      }
      void refreshStatusDetails().catch(() => {});
    },
    isCurrentLayer && files.length > 0 ? 60_000 : null,
    { minRefreshGapMs: 30_000 }
  );

  const hasListMetaTypeCounts = Boolean(listMeta.typeCounts);
  const existingTypesFromListMeta = useMemo(() => {
    if (!hasListMetaTypeCounts) return null;
    return providerTypesFromListMeta.length > 0
      ? ['all', ...providerTypesFromListMeta]
      : ALL_AUTH_FILE_TYPES;
  }, [hasListMetaTypeCounts, providerTypesFromListMeta]);

  const existingTypes = useMemo(() => {
    if (!isCurrentLayer) return existingTypesFromListMeta ?? ALL_AUTH_FILE_TYPES;
    if (existingTypesFromListMeta) return existingTypesFromListMeta;
    const types = new Set<string>(['all']);
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [existingTypesFromListMeta, files, isCurrentLayer]);

  // A previous server-page response can remain in state for one render while the
  // full Plus/Pro collection is loading. It must not control the visible count,
  // sorting, or slicing in client-pagination mode.
  const serverPaginated = serverPaginationEnabled && listMeta.paginated;
  const sortSnapshotByName = useMemo(() => {
    // 服务端分页时排序由后端完成，本地不调用 compareAuthFiles，跳过全量 snapshot 计算。
    if (!isCurrentLayer || serverPaginated) return EMPTY_SORT_SNAPSHOT;
    const snapshot: Record<string, AuthFileSortSnapshot> = {};
    files.forEach((file) => {
      snapshot[file.name] = getAuthFileSortSnapshot(file, planSources);
    });
    return snapshot;
  }, [files, isCurrentLayer, planSources, serverPaginated]);

  const matchesSupplementalDisplayFilters = useCallback(
    (file: (typeof files)[number]) => {
      if (disabledOnly && file.disabled !== true) {
        return false;
      }
      // Older servers do not expose cached plan filtering. Only that compatibility
      // path needs the complete client-side plan check.
      if (premiumOnly && !premiumFilterServerSide && !hasPremiumAuthFilePlan(file, planSources)) {
        return false;
      }
      return true;
    },
    [disabledOnly, planSources, premiumFilterServerSide, premiumOnly]
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
  const serverPageResultSettled = serverPaginated && !refreshing && !serverSearchPending;
  const shouldApplyLocalDisplayFilters =
    displayOptionsActive && (!serverPageResultSettled || (premiumOnly && !premiumFilterServerSide));
  const currentFilesMatchingDisplayFilters = useMemo(
    () =>
      !isCurrentLayer
        ? EMPTY_AUTH_FILE_ITEMS
        : shouldApplyLocalDisplayFilters
          ? files.filter(matchesDisplayFilters)
          : files,
    [files, isCurrentLayer, matchesDisplayFilters, shouldApplyLocalDisplayFilters]
  );
  const currentDisplayFilterNames = useMemo(
    () =>
      isCurrentLayer && displayOptionsActive && !serverPaginated && !premiumOnly
        ? currentFilesMatchingDisplayFilters.map((file) => file.name)
        : EMPTY_AUTH_FILE_NAMES,
    [
      currentFilesMatchingDisplayFilters,
      displayOptionsActive,
      isCurrentLayer,
      premiumOnly,
      serverPaginated,
    ]
  );
  const currentDisplayFilterSortSnapshot = useMemo(() => {
    if (!isCurrentLayer || !displayOptionsActive || serverPaginated || premiumOnly) {
      return EMPTY_SORT_SNAPSHOT;
    }
    return Object.fromEntries(
      currentFilesMatchingDisplayFilters.map((file) => [
        file.name,
        sortSnapshotByName[file.name] ?? getAuthFileSortSnapshot(file, planSources),
      ])
    );
  }, [
    currentFilesMatchingDisplayFilters,
    displayOptionsActive,
    isCurrentLayer,
    planSources,
    premiumOnly,
    serverPaginated,
    sortSnapshotByName,
  ]);
  // Plan membership is derived from live quota data. Retaining a name snapshot
  // here would keep files in (or out of) the Plus/Pro view after a quota refresh.
  const shouldSnapshotDisplayFilters =
    isCurrentLayer && displayOptionsActive && !serverPaginated && !premiumOnly;
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

  // Capture the first stable result for each filter generation without a
  // render-phase state update. The render-local value keeps the grid stable
  // immediately; the effect persists it for subsequent renders.
  const displayFilterSnapshotForRender = useMemo(() => {
    if (!displayFilterSnapshotKey) return null;
    if (displayFilterSnapshot?.key === displayFilterSnapshotKey) return displayFilterSnapshot;
    return {
      key: displayFilterSnapshotKey,
      names: currentDisplayFilterNames,
      sortSnapshot: currentDisplayFilterSortSnapshot,
    };
  }, [
    currentDisplayFilterNames,
    currentDisplayFilterSortSnapshot,
    displayFilterSnapshot,
    displayFilterSnapshotKey,
  ]);

  useEffect(() => {
    setDisplayFilterSnapshot((current) => {
      if (current?.key === displayFilterSnapshotForRender?.key) return current;
      return displayFilterSnapshotForRender;
    });
  }, [displayFilterSnapshotForRender]);

  const filesMatchingDisplayFilters = useMemo(() => {
    if (!displayFilterSnapshotForRender) {
      return currentFilesMatchingDisplayFilters;
    }

    return displayFilterSnapshotForRender.names
      .map((name) => fileByName.get(name))
      .filter((file): file is AuthFileItem => Boolean(file));
  }, [currentFilesMatchingDisplayFilters, displayFilterSnapshotForRender, fileByName]);

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
  const normalizedDisplaySearch = displaySearch.toLowerCase();
  const wildcardSearch = useMemo(() => buildWildcardSearch(displaySearch), [displaySearch]);
  const matchesDisplaySearch = useCallback(
    (item: AuthFileItem) => {
      if (!displaySearch) return true;
      return [item.name, item.type, item.provider].some((value) => {
        const content = (value || '').toString();
        return wildcardSearch
          ? wildcardSearch.test(content)
          : content.toLowerCase().includes(normalizedDisplaySearch);
      });
    },
    [displaySearch, normalizedDisplaySearch, wildcardSearch]
  );
  const scopedTypeCountsKey = useMemo(() => {
    if (!serverPaginationEnabled || !isCurrentLayer) return null;
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
  ]);

  useEffect(() => {
    if (!scopedTypeCountsKey) {
      return undefined;
    }
    // The main list request already carries type_counts. Wait for its first
    // response before opening the compatibility request, otherwise restoring a
    // saved search launches two full management-list scans in the same frame.
    if (loading || listUpdating) return undefined;
    if (listMeta.typeCountsKey === scopedTypeCountsKey && listMeta.typeCounts) {
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
          includeRecentRequests: false,
          typeCountsOnly: true,
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
    loading,
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
      isCurrentLayer && needsLocalTypeCounts
        ? countAuthFilesByType(filesMatchingDisplayFilters)
        : EMPTY_AUTH_FILE_TYPE_COUNTS,
    [filesMatchingDisplayFilters, isCurrentLayer, needsLocalTypeCounts]
  );
  const premiumTypeCounts = useMemo(
    () =>
      isCurrentLayer && premiumOnly && !premiumFilterServerSide
        ? countAuthFilesByType(filesMatchingDisplayFilters.filter(matchesDisplaySearch))
        : EMPTY_AUTH_FILE_TYPE_COUNTS,
    [
      filesMatchingDisplayFilters,
      isCurrentLayer,
      matchesDisplaySearch,
      premiumFilterServerSide,
      premiumOnly,
    ]
  );
  const typeCounts =
    premiumOnly && !premiumFilterServerSide
      ? premiumTypeCounts
      : scopedTypeCountsKey
        ? (currentScopedServerTypeCounts ?? currentScopedFallbackTypeCounts ?? localTypeCounts)
        : (listMeta.typeCounts ?? localTypeCounts);

  const filtered = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTH_FILE_ITEMS;
    if (serverPageResultSettled) return filesMatchingDisplayFilters;
    return filesMatchingDisplayFilters.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      return matchType && matchesDisplaySearch(item);
    });
  }, [
    filesMatchingDisplayFilters,
    filter,
    isCurrentLayer,
    matchesDisplaySearch,
    serverPageResultSettled,
  ]);

  const sorted = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTH_FILE_ITEMS;
    if (serverPaginated) return filtered;
    const copy = [...filtered];

    const activeSortSnapshot = displayFilterSnapshotForRender?.sortSnapshot ?? sortSnapshotByName;
    copy.sort((a, b) => compareAuthFiles(a, b, sortMode, activeSortSnapshot, planSources));
    return copy;
  }, [
    displayFilterSnapshotForRender,
    filtered,
    isCurrentLayer,
    planSources,
    serverPaginated,
    sortMode,
    sortSnapshotByName,
  ]);

  const listTotal = isCurrentLayer ? (serverPaginated ? listMeta.total : sorted.length) : 0;
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
    () =>
      isCurrentLayer
        ? serverPaginated
          ? sorted
          : sorted.slice(start, start + pageSize)
        : EMPTY_AUTH_FILE_ITEMS,
    [isCurrentLayer, pageSize, serverPaginated, sorted, start]
  );
  const showInitialLoading = isCurrentLayer && loading && pageItems.length === 0;
  const showListProgress = isCurrentLayer && listUpdating && pageItems.length > 0;

  // 状态条只会出现在当前页的卡片中。旧服务端的完整列表可能很大，
  // 将 pageItems 传入可以避免为不可见文件建立 usage-details 索引和状态条数据。
  const statusBarCache = useAuthFilesStatusBarCache(pageItems, usageDetails, isCurrentLayer);

  useLayoutEffect(() => {
    const cancelGridMotion = () => {
      authFileGridMotionSnapshotRef.current = null;
      if (authFileGridMotionSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(authFileGridMotionSnapshotTimeoutRef.current);
        authFileGridMotionSnapshotTimeoutRef.current = null;
      }
      authFileGridMotionAnimationsRef.current.forEach((animation) => animation.cancel());
      authFileGridMotionAnimationsRef.current = [];
      // A cancelled Web Animation does not run the normal `finished` cleanup.
      // Remove compositor hints eagerly so rapid filter changes cannot leave
      // stale cards promoted to their own layers.
      authFileGridRef.current
        ?.querySelectorAll<HTMLElement>('[data-auth-file-name]')
        .forEach((card) => card.style.removeProperty('will-change'));
    };

    if (!isCurrentLayer) {
      cancelGridMotion();
      return;
    }

    const snapshot = authFileGridMotionSnapshotRef.current;
    const grid = authFileGridRef.current;
    if (!snapshot || !grid) return;

    if (prefersReducedMotion) {
      cancelGridMotion();
      return;
    }

    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-auth-file-name]'));
    const cardNames = new Set(
      cards.map((card) => card.dataset.authFileName).filter((name): name is string => Boolean(name))
    );
    const listMembershipChanged =
      cardNames.size !== snapshot.size || Array.from(cardNames).some((name) => !snapshot.has(name));
    const moves = cards
      .flatMap((card) => {
        const name = card.dataset.authFileName;
        const previousRect = name ? snapshot.get(name) : undefined;
        if (!previousRect) return [];

        const nextRect = card.getBoundingClientRect();
        const isVisible = nextRect.bottom > 0 && nextRect.top < window.innerHeight;
        if (!isVisible) return [];
        const translateX = previousRect.left - nextRect.left;
        const translateY = previousRect.top - nextRect.top;
        return Math.abs(translateX) > 0.5 || Math.abs(translateY) > 0.5
          ? [[card, translateX, translateY] as const]
          : [];
      })
      .slice(0, MAX_AUTH_FILE_GRID_MOTION_CARDS);

    // The first render after a server-side filter change can still contain the old
    // page. Retain the snapshot in that case so the eventual response can animate.
    if (moves.length === 0 && !listMembershipChanged) return;

    cancelGridMotion();

    const animations = moves.map(([card, translateX, translateY]) => {
      card.style.willChange = 'transform';
      return card.animate(
        [
          { transform: `translate3d(${translateX}px, ${translateY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: AUTH_FILE_GRID_MOTION_DURATION_MS,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both',
        }
      );
    });
    authFileGridMotionAnimationsRef.current = animations;

    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (authFileGridMotionAnimationsRef.current !== animations) return;
      animations.forEach((animation) => animation.cancel());
      cards.forEach((card) => card.style.removeProperty('will-change'));
      authFileGridMotionAnimationsRef.current = [];
    });
  }, [isCurrentLayer, pageItems, prefersReducedMotion]);

  // 一次性按文件名预计算 usage buckets。
  // 仅当 keyUsageStats / pageItems 任一变化时重算，
  // 卡片接收到的 bucket 引用稳定 → React.memo 命中，统计未变时不会触发整页卡片重渲染。
  const fileUsageStatsByName = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTH_FILE_USAGE_STATS_MAP;

    const map = new Map<string, KeyUsageBucket>();
    pageItems.forEach((file) => {
      map.set(file.name, resolveAuthFileUsageStats(file, keyUsageStats, FILE_USAGE_BUCKET_CACHE));
    });

    return map;
  }, [isCurrentLayer, keyUsageStats, pageItems]);
  const selectablePageItems = useMemo(
    () => (isCurrentLayer ? filterSelectableAuthFiles(pageItems) : EMPTY_AUTH_FILE_ITEMS),
    [isCurrentLayer, pageItems]
  );
  const pageQuotaRefreshItems = useMemo(
    () =>
      isCurrentLayer
        ? resolveQuotaRefreshTargets(pageItems)
        : EMPTY_AUTH_FILE_QUOTA_REFRESH_TARGETS,
    [isCurrentLayer, pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => (isCurrentLayer ? filterSelectableAuthFiles(sorted) : EMPTY_AUTH_FILE_ITEMS),
    [isCurrentLayer, sorted]
  );
  const selectedNames = useMemo(
    () =>
      isCurrentLayer && selectedFiles.size > 0 ? Array.from(selectedFiles) : EMPTY_AUTH_FILE_NAMES,
    [isCurrentLayer, selectedFiles]
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
  const {
    refresh: handlePageRefreshQuota,
    refreshing: pageQuotaRefreshing,
    disabled: pageQuotaRefreshDisabled,
    label: pageQuotaRefreshLabel,
  } = useAuthFilesQuotaRefreshBatch({
    disabled: disableControls || loading || listUpdating,
    visibleCount: pageItems.length,
    targets: pageQuotaRefreshItems,
    onAuthFilesUpdated: applyLocalFileUpdates,
  });
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
    },
    [applyLocalFileUpdates]
  );

  const openModelRulesEditor = useCallback(
    (provider?: string) => {
      const providerValue = (provider || (filter !== 'all' ? String(filter) : '')).trim();
      setModelRulesEditor({ open: true, provider: providerValue });
    },
    [filter]
  );

  const closeModelRulesEditor = useCallback(() => {
    setModelRulesEditor((current) => ({ ...current, open: false }));
  }, []);

  const refreshModelRules = useCallback(async () => {
    await Promise.all([loadExcluded(), loadModelAlias()]);
  }, [loadExcluded, loadModelAlias]);

  const selectionActive = isCurrentLayer && selectionCount > 0;

  useLayoutEffect(() => {
    if (!isCurrentLayer || !selectionActive || typeof window === 'undefined') return;

    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

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
  }, [isCurrentLayer, selectionActive]);

  useLayoutEffect(() => {
    selectionCountRef.current = selectionCount;
    if (!isCurrentLayer) {
      batchActionAnimationRef.current?.cancel();
      batchActionAnimationRef.current = null;
      return;
    }

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
      actionsEl.style.pointerEvents = opacity === 0 ? 'none' : 'auto';
    };

    if (prefersReducedMotion || typeof actionsEl.animate !== 'function') {
      applyPresentation(selectionActive ? 0 : 8, selectionActive ? 1 : 0);
      if (!selectionActive) {
        document.documentElement.style.removeProperty('--auth-files-action-bar-height');
      }
      return;
    }

    actionsEl.style.visibility = 'visible';
    actionsEl.style.pointerEvents = selectionActive ? 'auto' : 'none';
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
        applyPresentation(selectionActive ? 0 : 8, selectionActive ? 1 : 0);
        actionsEl.style.removeProperty('will-change');
        animation.cancel();
        if (!selectionActive && selectionCountRef.current === 0) {
          document.documentElement.style.removeProperty('--auth-files-action-bar-height');
        }
      })
      .catch(() => {
        // A newer selection state cancels the previous animation.
      });
  }, [isCurrentLayer, prefersReducedMotion, selectionActive, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.cancel();
      batchActionAnimationRef.current = null;
      authFileGridMotionAnimationsRef.current.forEach((animation) => animation.cancel());
      authFileGridMotionAnimationsRef.current = [];
      if (authFileGridMotionSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(authFileGridMotionSnapshotTimeoutRef.current);
        authFileGridMotionSnapshotTimeoutRef.current = null;
      }
      document.documentElement.style.removeProperty('--auth-files-action-bar-height');
    },
    []
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
    captureAuthFileGridLayout();
    setPage((prev) => Math.max(1, Math.min(prev, currentPage) - 1));
  }, [captureAuthFileGridLayout, currentPage]);

  const handleNextPage = useCallback(() => {
    captureAuthFileGridLayout();
    setPage((prev) => Math.min(totalPages, Math.max(prev, currentPage) + 1));
  }, [captureAuthFileGridLayout, currentPage, totalPages]);

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

  const authFileCardNodes = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTH_FILE_CARD_NODES;
    return pageItems.map((file) => {
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
          // 只传连接状态这一真正的“单卡片”维度。列表刷新中的禁用改由
          // .fileGrid 上的 inert 统一处理：listUpdating 每次搜索都会翻转两次，
          // 若混进 props 会让整页卡片的 memo 全部失效、连带重算 20 个状态块。
          disableControls={disableControls}
          deleting={deleting === file.name}
          statusUpdating={statusUpdating[file.name] === true}
          accessTokenCopying={accessTokenCopying[file.name] === true}
          priorityUpdating={priorityUpdating[file.name] === true}
          quotaFilterType={quotaFilterType}
          fileUsageStats={fileUsageStats}
          statusData={statusData}
          onShowModels={showModels}
          onCopyName={copyTextWithNotification}
          onDownload={handleDownload}
          onCopyAccessToken={handleCopyAccessToken}
          onPriorityChange={handlePriorityChange}
          onOpenPrefixProxyEditor={openPrefixProxyEditor}
          onAuthFileUpdated={handleAuthFileUpdated}
          onDelete={handleDelete}
          onToggleStatus={handleStatusToggle}
          onToggleSelect={toggleSelect}
        />
      );
    });
  }, [
    accessTokenCopying,
    copyTextWithNotification,
    deleting,
    disableControls,
    fileUsageStatsByName,
    handleAuthFileUpdated,
    handleCopyAccessToken,
    handleDelete,
    handleDownload,
    handlePriorityChange,
    isCurrentLayer,
    handleStatusToggle,
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
  ]);

  return (
    <div className={refreshStyles.page}>
      <section className={refreshStyles.authFilesSection}>
        <ManagementPageHeader
          className={refreshStyles.pageHeader}
          title={t('auth_files.title_section')}
          description={t('auth_files.description')}
          count={listTotal}
          countAriaLabel={`${t('auth_files.summary_visible')}: ${listTotal}`}
          actions={
            <div className={refreshStyles.headerActions}>
              <AuthFilesRefreshButton
                variant="secondary"
                size="sm"
                className={refreshStyles.headerAction}
                onClick={handleHeaderRefresh}
                disabled={loading || refreshing}
                refreshing={manualRefreshPending}
                label={t('common.refresh')}
                iconSize={15}
                iconClassName={refreshStyles.headerActionIcon}
              >
                <span className={refreshStyles.headerActionText}>{t('common.refresh')}</span>
              </AuthFilesRefreshButton>
              <Button
                size="sm"
                className={`${refreshStyles.headerAction} ${refreshStyles.uploadAction}`}
                onClick={handleUploadClick}
                disabled={disableControls || uploading}
                loading={uploading}
              >
                <IconUpload className={refreshStyles.headerActionIcon} size={15} />
                <span className={refreshStyles.headerActionText}>
                  {t('auth_files.upload_button')}
                </span>
              </Button>
              <Button
                variant="danger"
                size="sm"
                className={`${refreshStyles.headerAction} ${refreshStyles.dangerAction}`}
                onClick={handleDeleteAllClick}
                disabled={disableControls || loading || refreshing || deletingAll}
                loading={deletingAll}
              >
                <IconTrash2 className={refreshStyles.headerActionIcon} size={15} />
                <span className={refreshStyles.headerActionText}>{deleteAllButtonLabel}</span>
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
          }
        />

        {error && (
          <div className={refreshStyles.errorPanel} role="alert">
            {error}
          </div>
        )}

        <div className={refreshStyles.workbench}>
          <div className={refreshStyles.filterToolbar}>
            <FilterTagsRail
              types={existingTypes}
              activeFilter={filter}
              typeCounts={filterTagTypeCounts}
              resolvedTheme={resolvedTheme}
              onSelect={handleFilterTagSelect}
            />

            <div className={refreshStyles.controlRail}>
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

              <div className={refreshStyles.displayOptions}>
                <span className={refreshStyles.displayOptionsLabel}>
                  {t('auth_files.display_options_label')}
                </span>
                <div
                  className={refreshStyles.displayOptionGroup}
                  role="group"
                  aria-label={t('auth_files.display_options_label')}
                >
                  <button
                    type="button"
                    className={refreshStyles.displayOption}
                    onClick={handleToggleProblemOnly}
                    aria-pressed={problemOnly}
                  >
                    <span className={refreshStyles.displayOptionMarker} aria-hidden="true">
                      <IconCheck size={11} />
                    </span>
                    <span>{t('auth_files.problem_filter_only')}</span>
                  </button>
                  <button
                    type="button"
                    className={refreshStyles.displayOption}
                    onClick={handleToggleDisabledOnly}
                    aria-pressed={disabledOnly}
                  >
                    <span className={refreshStyles.displayOptionMarker} aria-hidden="true">
                      <IconCheck size={11} />
                    </span>
                    <span>{t('auth_files.disabled_filter_only')}</span>
                  </button>
                  <button
                    type="button"
                    className={refreshStyles.displayOption}
                    onClick={handleTogglePremiumOnly}
                    aria-pressed={premiumOnly}
                  >
                    <span className={refreshStyles.displayOptionMarker} aria-hidden="true">
                      <IconCheck size={11} />
                    </span>
                    <span>{t('auth_files.premium_filter_only')}</span>
                  </button>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    className={refreshStyles.resetFilters}
                    onClick={handleClearFilters}
                  >
                    {t('auth_files.clear_filters')}
                  </button>
                )}
              </div>

              <AuthFilesRefreshButton
                variant="secondary"
                size="sm"
                className={refreshStyles.quotaRefreshButton}
                onClick={handlePageRefreshQuota}
                disabled={pageQuotaRefreshDisabled}
                refreshing={pageQuotaRefreshing}
                label={pageQuotaRefreshLabel}
                title={t('auth_files.refresh_page_quota_aria')}
                iconSize={16}
              />
            </div>
          </div>
        </div>

        <div
          className={`${refreshStyles.contentRegion} ${showListProgressVisual ? refreshStyles.contentUpdating : ''}`}
          aria-busy={showInitialLoading || showListProgress || pageQuotaRefreshing}
        >
          {showInitialLoading ? (
            <AuthFilesSkeletonGrid
              count={pageSize}
              quotaManaged={Boolean(quotaFilterType)}
              loadingLabel={t('common.loading')}
            />
          ) : pageItems.length === 0 ? (
            // 区分「筛选无结果」与「一个文件都没有」：此前两种情况都显示
            // 搜索无结果的文案，在全新实例上会误导用户以为是筛选没选对。
            hasActiveFilters ? (
              <EmptyState
                title={t('auth_files.search_empty_title')}
                description={t('auth_files.search_empty_desc')}
                action={
                  <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                    {t('auth_files.clear_filters')}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={t('auth_files.empty_title')}
                description={t('auth_files.empty_desc')}
                action={
                  <Button
                    size="sm"
                    onClick={handleUploadClick}
                    disabled={disableControls || uploading}
                    loading={uploading}
                  >
                    {t('auth_files.upload_button')}
                  </Button>
                }
              />
            )
          ) : (
            <div
              className={`${refreshStyles.cardGrid} ${quotaFilterType ? refreshStyles.cardGridQuotaManaged : ''}`}
              ref={authFileGridRef}
              // 列表刷新期间整体屏蔽交互（含键盘焦点），等价于此前逐张卡片
              // 传 disableControls，但不会触碰任何卡片的 props。
              inert={listUpdating}
            >
              {authFileCardNodes}
            </div>
          )}

          {!showInitialLoading && listTotal > pageSize && (
            <nav className={refreshStyles.pagination} aria-label={t('auth_files.pagination_aria')}>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePreviousPage}
                disabled={currentPage <= 1}
              >
                {t('auth_files.pagination_prev')}
              </Button>
              {/* 翻页后焦点常留在已禁用的按钮上，靠 live region 播报当前页 */}
              <div className={refreshStyles.pageInfo} role="status" aria-live="polite">
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
            </nav>
          )}
        </div>

        {belowFoldCardsReady && (
          <Suspense fallback={null}>
            <section
              className={refreshStyles.supportingPanel}
              aria-label={t('oauth_model_rules.title')}
            >
              <OAuthModelRulesCard
                disableControls={disableControls}
                excludedError={excludedError}
                modelAliasError={modelAliasError}
                excluded={excluded}
                modelAlias={modelAlias}
                onManage={openModelRulesEditor}
              />
            </section>
          </Suspense>
        )}
      </section>

      {modelRulesEditor.open && (
        <Suspense fallback={null}>
          <OAuthModelRulesEditorModal
            key={modelRulesEditor.provider || 'new-provider'}
            open
            initialProvider={modelRulesEditor.provider}
            onClose={closeModelRulesEditor}
            onSaved={refreshModelRules}
          />
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

      {typeof document !== 'undefined'
        ? createPortal(
            <div
              className={refreshStyles.batchContainer}
              ref={floatingBatchActionsRef}
              aria-hidden={!selectionActive}
              inert={!selectionActive}
              // 该栏 portal 到 body，脱离了页面语义结构；补 region + 标签，
              // 读屏器才能把它作为一块可导航的区域列出。
              role="region"
              aria-label={t('auth_files.batch_actions_aria')}
            >
              <div className={refreshStyles.batchBar}>
                <div className={refreshStyles.batchGroup}>
                  {/* 选中数量会随勾选变化，用 live region 播报，否则读屏用户无从感知 */}
                  <span className={refreshStyles.batchSelection} role="status" aria-live="polite">
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
                <div className={`${refreshStyles.batchGroup} ${refreshStyles.batchCommandGroup}`}>
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
