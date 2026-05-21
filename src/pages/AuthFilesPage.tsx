import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { animate } from 'motion/mini';
import type { AnimationPlaybackControlsWithThen } from 'motion-dom';
import { useInterval } from '@/hooks/useInterval';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useEventCallback } from '@/hooks';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import { EmptyState } from '@/components/ui/EmptyState';
import { copyToClipboard } from '@/utils/clipboard';
import {
  normalizePlanType,
  resolveAuthProvider,
  resolveCodexPlanType,
  resolveCodexSubscriptionActiveUntil,
} from '@/utils/quota';
import { authFilesApi, type AuthFilesListOptions } from '@/services/api';
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
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import { AuthFileCard } from '@/features/authFiles/components/AuthFileCard';
import { AuthFileModelsModal } from '@/features/authFiles/components/AuthFileModelsModal';
import { AuthFilesPrefixProxyEditorModal } from '@/features/authFiles/components/AuthFilesPrefixProxyEditorModal';
import { FilterTagsRail } from '@/features/authFiles/components/FilterTagsRail';
import { SearchToolbar } from '@/features/authFiles/components/SearchToolbar';
import { OAuthExcludedCard } from '@/features/authFiles/components/OAuthExcludedCard';
import { OAuthModelAliasCard } from '@/features/authFiles/components/OAuthModelAliasCard';
import {
  refreshAuthFileQuota,
  type AuthFileQuotaRefreshResult,
} from '@/features/authFiles/quotaRefresh';
import { useAuthFilesData } from '@/features/authFiles/hooks/useAuthFilesData';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { useAuthFilesOauth } from '@/features/authFiles/hooks/useAuthFilesOauth';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { extractAuthFileAccessToken } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { useAuthFilesStats } from '@/features/authFiles/hooks/useAuthFilesStats';
import { useAuthFilesStatusBarCache } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  hasPremiumAuthFilePlan,
  type AuthFilePlanSources,
} from '@/features/authFiles/planMetadata';
import {
  isAuthFilesSortMode,
  readAuthFilesUiState,
  readPersistedAuthFilesCompactMode,
  writeAuthFilesUiState,
  writePersistedAuthFilesCompactMode,
  type AuthFilesSortMode,
} from '@/features/authFiles/uiState';
import { useAuthStore, useNotificationStore, useQuotaStore, useThemeStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import styles from './AuthFilesPage.module.scss';

const easePower3Out = (progress: number) => 1 - (1 - progress) ** 4;
const easePower2In = (progress: number) => progress ** 3;
const BATCH_BAR_BASE_TRANSFORM = 'translateX(-50%)';
const BATCH_BAR_HIDDEN_TRANSFORM = 'translateX(-50%) translateY(56px)';
const DEFAULT_REGULAR_PAGE_SIZE = 9;
const DEFAULT_COMPACT_PAGE_SIZE = 12;
const PAGE_SIZE_PRESETS = [3, 6, 9, 12, 15, 18];

const scheduleAuthFilesDeferredTask = (callback: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 400);
  return () => window.clearTimeout(timeoutId);
};

const escapeWildcardSearchSegment = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildWildcardSearch = (value: string): RegExp | null => {
  if (!value.includes('*')) return null;
  const pattern = value.split('*').map(escapeWildcardSearchSegment).join('.*');
  return new RegExp(pattern, 'i');
};

const compareAuthFilesByName = (left: AuthFileItem, right: AuthFileItem): number =>
  left.name.localeCompare(right.name);

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

const resolveQuotaRefreshTarget = (
  file: AuthFileItem
): { file: AuthFileItem; quotaType: QuotaProviderType } | null => {
  if (isRuntimeOnlyAuthFile(file) || file.disabled) return null;

  const quotaType = normalizeProviderKey(resolveAuthProvider(file)) as QuotaProviderType;
  if (!QUOTA_PROVIDER_TYPES.has(quotaType)) return null;

  return { file, quotaType };
};

const resolveQuotaRefreshTargets = (files: AuthFileItem[]) =>
  files.reduce<Array<{ file: AuthFileItem; quotaType: QuotaProviderType }>>((items, file) => {
    const target = resolveQuotaRefreshTarget(file);
    if (target) items.push(target);
    return items;
  }, []);

export function AuthFilesPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const resolvedTheme: ResolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | string>('all');
  const [problemOnly, setProblemOnly] = useState(false);
  const [disabledOnly, setDisabledOnly] = useState(false);
  const [premiumOnly, setPremiumOnly] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSizeByMode, setPageSizeByMode] = useState({
    regular: DEFAULT_REGULAR_PAGE_SIZE,
    compact: DEFAULT_COMPACT_PAGE_SIZE,
  });
  const [viewMode, setViewMode] = useState<'diagram' | 'list'>('list');
  const [sortMode, setSortMode] = useState<AuthFilesSortMode>('default');
  const [batchActionBarVisible, setBatchActionBarVisible] = useState(false);
  const [batchQuotaRefreshing, setBatchQuotaRefreshing] = useState(false);
  const [pageQuotaRefreshing, setPageQuotaRefreshing] = useState(false);
  const [accessTokenCopying, setAccessTokenCopying] = useState<Record<string, boolean>>({});
  const [priorityUpdating, setPriorityUpdating] = useState<Record<string, boolean>>({});
  const [uiStateHydrated, setUiStateHydrated] = useState(false);
  const [displayFilterRefreshVersion, setDisplayFilterRefreshVersion] = useState(0);
  const [displayFilterSnapshot, setDisplayFilterSnapshot] = useState<{
    key: string;
    names: string[];
    sortSnapshot: Record<string, AuthFileSortSnapshot>;
  } | null>(null);
  const floatingBatchActionsRef = useRef<HTMLDivElement>(null);
  const batchActionAnimationRef = useRef<AnimationPlaybackControlsWithThen | null>(null);
  const previousSelectionCountRef = useRef(0);
  const selectionCountRef = useRef(0);
  const previousLoadingRef = useRef(false);
  const pageSize = compactMode ? pageSizeByMode.compact : pageSizeByMode.regular;
  const normalizedSearch = search.trim();
  const serverPaginationEnabled = !premiumOnly;
  const serverListPage = serverPaginationEnabled ? page : undefined;
  const serverListPageSize = serverPaginationEnabled ? pageSize : undefined;
  const serverListSearch = serverPaginationEnabled ? normalizedSearch : undefined;
  const serverListType = serverPaginationEnabled && filter !== 'all' ? String(filter) : undefined;
  const serverListSort = serverPaginationEnabled ? sortMode : undefined;
  const serverListProblemOnly = serverPaginationEnabled ? problemOnly : undefined;
  const serverListDisabledOnly = serverPaginationEnabled ? disabledOnly : undefined;
  const authFilesListOptions = useMemo<AuthFilesListOptions>(() => {
    if (!serverPaginationEnabled) {
      return { codexSubscription: 'cache' };
    }
    return {
      codexSubscription: 'cache',
      page: serverListPage,
      pageSize: serverListPageSize,
      search: serverListSearch,
      type: serverListType,
      sort: serverListSort,
      problemOnly: serverListProblemOnly,
      disabledOnly: serverListDisabledOnly,
    };
  }, [
    serverListDisabledOnly,
    serverListPage,
    serverListPageSize,
    serverListProblemOnly,
    serverListSearch,
    serverListSort,
    serverListType,
    serverPaginationEnabled,
  ]);

  const { keyStats, keyUsageStats, usageDetails, loadKeyStats, refreshKeyStats } =
    useAuthFilesStats();
  const {
    files,
    selectedFiles,
    selectionCount,
    loading,
    error,
    uploading,
    deleting,
    deletingAll,
    statusUpdating,
    batchStatusUpdating,
    listMeta,
    fileInputRef,
    loadFiles,
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
  const providerTypesFromListMeta = useMemo(
    () => Object.keys(listMeta.typeCounts ?? {}).filter((type) => type !== 'all'),
    [listMeta.typeCounts]
  );

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
  } = useAuthFilesOauth({ viewMode, files, providerTypes: providerTypesFromListMeta });

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
  });

  const disableControls = connectionStatus !== 'connected';
  const claudeQuota = useQuotaStore((state) => state.claudeQuota);
  const codexQuota = useQuotaStore((state) => state.codexQuota);
  const geminiCliQuota = useQuotaStore((state) => state.geminiCliQuota);
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
      geminiCliQuota,
    }),
    [claudeQuota, codexQuota, geminiCliQuota]
  );

  useEffect(() => {
    const persistedCompactMode = readPersistedAuthFilesCompactMode();
    if (typeof persistedCompactMode === 'boolean') {
      setCompactMode(persistedCompactMode);
    }

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
      if (typeof persistedCompactMode !== 'boolean' && typeof persisted.compactMode === 'boolean') {
        setCompactMode(persisted.compactMode);
      }
      if (typeof persisted.search === 'string') {
        setSearch(persisted.search);
      }
      if (typeof persisted.page === 'number' && Number.isFinite(persisted.page)) {
        setPage(Math.max(1, Math.round(persisted.page)));
      }
      const legacyPageSize =
        typeof persisted.pageSize === 'number' && Number.isFinite(persisted.pageSize)
          ? clampCardPageSize(persisted.pageSize)
          : null;
      const regularPageSize =
        typeof persisted.regularPageSize === 'number' && Number.isFinite(persisted.regularPageSize)
          ? clampCardPageSize(persisted.regularPageSize)
          : (legacyPageSize ?? DEFAULT_REGULAR_PAGE_SIZE);
      const compactPageSize =
        typeof persisted.compactPageSize === 'number' && Number.isFinite(persisted.compactPageSize)
          ? clampCardPageSize(persisted.compactPageSize)
          : (legacyPageSize ?? DEFAULT_COMPACT_PAGE_SIZE);
      setPageSizeByMode({
        regular: regularPageSize,
        compact: compactPageSize,
      });
      if (isAuthFilesSortMode(persisted.sortMode)) {
        setSortMode(persisted.sortMode);
      }
    }

    setUiStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!uiStateHydrated) return;

    // 搜索/翻页等连续操作会频繁改变依赖；用 debounce 聚合 300ms 内的变化，减少 localStorage 同步开销。
    const timeoutId = window.setTimeout(() => {
      writeAuthFilesUiState({
        filter,
        problemOnly,
        disabledOnly,
        premiumOnly,
        compactMode,
        search,
        page,
        pageSize,
        regularPageSize: pageSizeByMode.regular,
        compactPageSize: pageSizeByMode.compact,
        sortMode,
      });
      writePersistedAuthFilesCompactMode(compactMode);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    compactMode,
    disabledOnly,
    filter,
    page,
    pageSize,
    pageSizeByMode,
    premiumOnly,
    problemOnly,
    search,
    sortMode,
    uiStateHydrated,
  ]);

  useEffect(() => {
    if (previousLoadingRef.current && !loading) {
      setDisplayFilterRefreshVersion((version) => version + 1);
    }
    previousLoadingRef.current = loading;
  }, [loading]);

  const setCurrentModePageSize = useCallback(
    (next: number) => {
      setPageSizeByMode((current) =>
        compactMode ? { ...current, compact: next } : { ...current, regular: next }
      );
    },
    [compactMode]
  );

  const handleSortModeChange = useCallback(
    (value: string) => {
      if (!isAuthFilesSortMode(value) || value === sortMode) return;
      setSortMode(value);
      setPage(1);
    },
    [sortMode]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([
      loadFiles({ codexSubscription: 'refresh' }),
      refreshKeyStats(),
      loadExcluded(),
      loadModelAlias(),
    ]);
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
  const handleToggleCompactMode = useCallback(() => {
    setCompactMode((prev) => !prev);
  }, []);
  const handleSearchValue = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);
  const handleFilterTagSelect = useCallback((value: string) => {
    setFilter(value);
    setPage(1);
  }, []);
  const handlePageSizeCommit = useCallback(
    (next: number) => {
      const clamped = clampCardPageSize(next);
      setCurrentModePageSize(clamped);
      setPage(1);
    },
    [setCurrentModePageSize]
  );

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    if (!isCurrentLayer) return;

    let cancelled = false;
    let cancelDeferred: (() => void) | null = null;

    const loadInitialData = async () => {
      await loadFiles();
      if (cancelled) return;

      cancelDeferred = scheduleAuthFilesDeferredTask(() => {
        void Promise.allSettled([loadKeyStats(), loadExcluded(), loadModelAlias()]);
      });
    };

    void loadInitialData();

    return () => {
      cancelled = true;
      cancelDeferred?.();
    };
  }, [isCurrentLayer, loadFiles, loadKeyStats, loadExcluded, loadModelAlias]);

  useInterval(
    () => {
      void refreshKeyStats().catch(() => {});
    },
    isCurrentLayer ? 240_000 : null
  );

  const existingTypes = useMemo(() => {
    const types = new Set<string>(['all']);
    if (listMeta.typeCounts) {
      Object.keys(listMeta.typeCounts).forEach((type) => {
        if (type !== 'all') types.add(type);
      });
      return Array.from(types);
    }
    files.forEach((file) => {
      if (file.type) {
        types.add(file.type);
      }
    });
    return Array.from(types);
  }, [files, listMeta.typeCounts]);

  const sortSnapshotByName = useMemo(() => {
    const snapshot: Record<string, AuthFileSortSnapshot> = {};
    files.forEach((file) => {
      snapshot[file.name] = getAuthFileSortSnapshot(file, planSources);
    });
    return snapshot;
  }, [files, planSources]);

  const displayOptionsActive = problemOnly || disabledOnly || premiumOnly;

  const matchesSupplementalDisplayFilters = useCallback(
    (file: (typeof files)[number]) => {
      if (disabledOnly && file.disabled !== true) {
        return false;
      }
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
  const currentFilesMatchingDisplayFilters = useMemo(
    () => (displayOptionsActive ? files.filter(matchesDisplayFilters) : files),
    [displayOptionsActive, files, matchesDisplayFilters]
  );
  const currentDisplayFilterNames = useMemo(
    () => currentFilesMatchingDisplayFilters.map((file) => file.name),
    [currentFilesMatchingDisplayFilters]
  );
  const currentDisplayFilterSortSnapshot = useMemo(() => {
    if (!displayOptionsActive) return {};
    return Object.fromEntries(
      currentFilesMatchingDisplayFilters.map((file) => [
        file.name,
        sortSnapshotByName[file.name] ?? getAuthFileSortSnapshot(file, planSources),
      ])
    );
  }, [currentFilesMatchingDisplayFilters, displayOptionsActive, planSources, sortSnapshotByName]);
  const currentDisplayFilterNamesRef = useRef<string[]>([]);
  const currentDisplayFilterSortSnapshotRef = useRef<Record<string, AuthFileSortSnapshot>>({});
  currentDisplayFilterNamesRef.current = currentDisplayFilterNames;
  currentDisplayFilterSortSnapshotRef.current = currentDisplayFilterSortSnapshot;
  const fileByName = useMemo(() => new Map(files.map((file) => [file.name, file])), [files]);
  const displayFilterSnapshotKey = displayOptionsActive
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

  const localTypeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filesMatchingDisplayFilters.length };
    filesMatchingDisplayFilters.forEach((file) => {
      if (!file.type) return;
      counts[file.type] = (counts[file.type] || 0) + 1;
    });
    return counts;
  }, [filesMatchingDisplayFilters]);
  const typeCounts = listMeta.typeCounts ?? localTypeCounts;

  const wildcardSearch = useMemo(() => buildWildcardSearch(normalizedSearch), [normalizedSearch]);

  const filtered = useMemo(() => {
    const normalizedTerm = normalizedSearch.toLowerCase();

    return filesMatchingDisplayFilters.filter((item) => {
      const matchType = filter === 'all' || item.type === filter;
      const matchSearch =
        !normalizedSearch ||
        [item.name, item.type, item.provider].some((value) => {
          const content = (value || '').toString();
          return wildcardSearch
            ? wildcardSearch.test(content)
            : content.toLowerCase().includes(normalizedTerm);
        });
      return matchType && matchSearch;
    });
  }, [filesMatchingDisplayFilters, filter, normalizedSearch, wildcardSearch]);

  const sorted = useMemo(() => {
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
    sortMode,
    sortSnapshotByName,
  ]);

  const serverPaginated = listMeta.paginated;
  const listTotal = serverPaginated ? listMeta.total : sorted.length;
  const totalPages = Math.max(1, Math.ceil(listTotal / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const pageItems = serverPaginated ? sorted : sorted.slice(start, start + pageSize);
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);
  const selectablePageItems = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems]
  );
  const selectableFilteredItems = useMemo(
    () => sorted.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [sorted]
  );
  const pageQuotaRefreshItems = useMemo(() => resolveQuotaRefreshTargets(pageItems), [pageItems]);
  const selectedNames = useMemo(() => Array.from(selectedFiles), [selectedFiles]);
  const selectedHasStatusUpdating = useMemo(
    () => selectedNames.some((name) => statusUpdating[name] === true),
    [selectedNames, statusUpdating]
  );
  const selectedQuotaRefreshItems = useMemo(() => {
    const selected = new Set(selectedNames);

    return files.reduce<Array<{ file: AuthFileItem; quotaType: QuotaProviderType }>>(
      (items, file) => {
        if (!selected.has(file.name)) return items;
        const target = resolveQuotaRefreshTarget(file);
        if (target) items.push(target);
        return items;
      },
      []
    );
  }, [files, selectedNames]);
  const batchStatusButtonsDisabled =
    disableControls ||
    selectedNames.length === 0 ||
    batchStatusUpdating ||
    selectedHasStatusUpdating;
  const batchQuotaRefreshDisabled =
    disableControls || batchQuotaRefreshing || pageQuotaRefreshing || selectedNames.length === 0;
  const pageQuotaRefreshDisabled =
    disableControls ||
    loading ||
    batchQuotaRefreshing ||
    pageQuotaRefreshing ||
    pageItems.length === 0;

  const handleBatchRefreshQuota = useCallback(async () => {
    if (
      disableControls ||
      batchQuotaRefreshing ||
      pageQuotaRefreshing ||
      selectedNames.length === 0
    ) {
      return;
    }

    if (selectedQuotaRefreshItems.length === 0) {
      showNotification(t('auth_files.batch_quota_refresh_none'), 'info');
      return;
    }

    setBatchQuotaRefreshing(true);

    try {
      const skippedBeforeRefresh = Math.max(
        0,
        selectedNames.length - selectedQuotaRefreshItems.length
      );
      const results: AuthFileQuotaRefreshResult[] = await Promise.all(
        selectedQuotaRefreshItems.map(
          async ({ file, quotaType }): Promise<AuthFileQuotaRefreshResult> => {
            try {
              return await refreshAuthFileQuota({
                file,
                quotaType,
                disableControls,
                t,
              });
            } catch (err: unknown) {
              return {
                status: 'error',
                fileName: file.name,
                message: err instanceof Error ? err.message : t('common.unknown_error'),
              };
            }
          }
        )
      );
      const authFileUpdates = results.flatMap((result) =>
        result.status === 'success' && result.authFile ? [result.authFile] : []
      );
      applyLocalFileUpdates(authFileUpdates);
      const resultCounts = results.reduce(
        (counts, result) => {
          if (result.status === 'success') {
            counts.success += 1;
          } else if (result.status === 'error') {
            counts.failed += 1;
          } else {
            counts.skipped += 1;
          }
          return counts;
        },
        { success: 0, failed: 0, skipped: skippedBeforeRefresh }
      );

      if (resultCounts.success === 0 && resultCounts.failed === 0) {
        showNotification(t('auth_files.batch_quota_refresh_none'), 'info');
      } else if (resultCounts.failed === 0 && resultCounts.skipped === 0) {
        showNotification(
          t('auth_files.batch_quota_refresh_success', { count: resultCounts.success }),
          'success'
        );
      } else {
        showNotification(t('auth_files.batch_quota_refresh_partial', resultCounts), 'warning');
      }
    } finally {
      setBatchQuotaRefreshing(false);
    }
  }, [
    batchQuotaRefreshing,
    disableControls,
    pageQuotaRefreshing,
    applyLocalFileUpdates,
    selectedNames.length,
    selectedQuotaRefreshItems,
    showNotification,
    t,
  ]);

  const handlePageRefreshQuota = useCallback(async () => {
    if (
      disableControls ||
      loading ||
      batchQuotaRefreshing ||
      pageQuotaRefreshing ||
      pageItems.length === 0
    ) {
      return;
    }

    if (pageQuotaRefreshItems.length === 0) {
      showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      return;
    }

    setPageQuotaRefreshing(true);

    try {
      const skippedBeforeRefresh = Math.max(0, pageItems.length - pageQuotaRefreshItems.length);
      const results: AuthFileQuotaRefreshResult[] = await Promise.all(
        pageQuotaRefreshItems.map(
          async ({ file, quotaType }): Promise<AuthFileQuotaRefreshResult> => {
            try {
              return await refreshAuthFileQuota({
                file,
                quotaType,
                disableControls,
                t,
              });
            } catch (err: unknown) {
              return {
                status: 'error',
                fileName: file.name,
                message: err instanceof Error ? err.message : t('common.unknown_error'),
              };
            }
          }
        )
      );
      const authFileUpdates = results.flatMap((result) =>
        result.status === 'success' && result.authFile ? [result.authFile] : []
      );
      applyLocalFileUpdates(authFileUpdates);
      const resultCounts = results.reduce(
        (counts, result) => {
          if (result.status === 'success') {
            counts.success += 1;
          } else if (result.status === 'error') {
            counts.failed += 1;
          } else {
            counts.skipped += 1;
          }
          return counts;
        },
        { success: 0, failed: 0, skipped: skippedBeforeRefresh }
      );

      if (resultCounts.success === 0 && resultCounts.failed === 0) {
        showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      } else if (resultCounts.failed === 0 && resultCounts.skipped === 0) {
        showNotification(
          t('auth_files.batch_quota_refresh_success', { count: resultCounts.success }),
          'success'
        );
      } else {
        showNotification(t('auth_files.batch_quota_refresh_partial', resultCounts), 'warning');
      }
    } finally {
      setPageQuotaRefreshing(false);
    }
  }, [
    batchQuotaRefreshing,
    disableControls,
    loading,
    pageItems.length,
    applyLocalFileUpdates,
    pageQuotaRefreshItems,
    pageQuotaRefreshing,
    showNotification,
    t,
  ]);

  const copyTextWithNotification = useCallback(
    async (text: string) => {
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('notification.link_copied', { defaultValue: 'Copied to clipboard' })
          : t('notification.copy_failed', { defaultValue: 'Copy failed' }),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const handleCopyAccessToken = useEventCallback(async (file: AuthFileItem) => {
    const fileName = file.name;
    if (accessTokenCopying[fileName]) return;

    setAccessTokenCopying((prev) => ({ ...prev, [fileName]: true }));
    try {
      const json = await authFilesApi.downloadJsonObject(fileName);
      const accessToken = extractAuthFileAccessToken(json);
      if (!accessToken) {
        showNotification(t('auth_files.access_token_empty'), 'warning');
        return;
      }
      await copyTextWithNotification(accessToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showNotification(`${t('notification.copy_failed')}: ${errorMessage}`, 'error');
    } finally {
      setAccessTokenCopying((prev) => {
        const next = { ...prev };
        delete next[fileName];
        return next;
      });
    }
  });

  const handlePriorityChange = useEventCallback(async (file: AuthFileItem, priority: number) => {
    const fileName = file.name;
    if (disableControls || priorityUpdating[fileName]) return;

    setPriorityUpdating((prev) => ({ ...prev, [fileName]: true }));
    try {
      const response = await authFilesApi.patchFields({ name: fileName, priority });
      applyLocalFilePatch(fileName, {
        ...response.file,
        priority: response.file?.priority ?? priority,
      });
      showNotification(t('auth_files.priority_update_success', { priority }), 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
    } finally {
      setPriorityUpdating((prev) => {
        const next = { ...prev };
        delete next[fileName];
        return next;
      });
    }
  });

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
  }, [batchActionBarVisible, selectionCount]);

  useEffect(() => {
    selectionCountRef.current = selectionCount;
    if (selectionCount > 0) {
      setBatchActionBarVisible(true);
    }
  }, [selectionCount]);

  useLayoutEffect(() => {
    if (!batchActionBarVisible) return;
    const currentCount = selectionCount;
    const previousCount = previousSelectionCountRef.current;
    const actionsEl = floatingBatchActionsRef.current;
    if (!actionsEl) return;

    batchActionAnimationRef.current?.stop();
    batchActionAnimationRef.current = null;

    if (currentCount > 0 && previousCount === 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_HIDDEN_TRANSFORM, BATCH_BAR_BASE_TRANSFORM],
          opacity: [0, 1],
        },
        {
          duration: 0.28,
          ease: easePower3Out,
          onComplete: () => {
            actionsEl.style.transform = BATCH_BAR_BASE_TRANSFORM;
            actionsEl.style.opacity = '1';
          },
        }
      );
    } else if (currentCount === 0 && previousCount > 0) {
      batchActionAnimationRef.current = animate(
        actionsEl,
        {
          transform: [BATCH_BAR_BASE_TRANSFORM, BATCH_BAR_HIDDEN_TRANSFORM],
          opacity: [1, 0],
        },
        {
          duration: 0.22,
          ease: easePower2In,
          onComplete: () => {
            if (selectionCountRef.current === 0) {
              setBatchActionBarVisible(false);
            }
          },
        }
      );
    }

    previousSelectionCountRef.current = currentCount;
  }, [batchActionBarVisible, selectionCount]);

  useEffect(
    () => () => {
      batchActionAnimationRef.current?.stop();
      batchActionAnimationRef.current = null;
    },
    []
  );

  const titleNode = (
    <div className={styles.titleWrapper}>
      <span>{t('auth_files.title_section')}</span>
      {files.length > 0 && <span className={styles.countBadge}>{files.length}</span>}
    </div>
  );

  const deleteAllButtonLabel = problemOnly
    ? filter === 'all'
      ? t('auth_files.delete_problem_button')
      : t('auth_files.delete_problem_button_with_type', { type: getTypeLabel(t, filter) })
    : filter === 'all'
      ? t('auth_files.delete_all_button')
      : `${t('common.delete')} ${getTypeLabel(t, filter)}`;

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('auth_files.title')}</h1>
        <p className={styles.description}>{t('auth_files.description')}</p>
      </div>

      <Card
        title={titleNode}
        extra={
          <div className={styles.headerActions}>
            <Button variant="secondary" size="sm" onClick={handleHeaderRefresh} disabled={loading}>
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={handleUploadClick}
              disabled={disableControls || uploading}
              loading={uploading}
            >
              {t('auth_files.upload_button')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                handleDeleteAll({
                  filter,
                  problemOnly,
                  matchDisplayFilter:
                    disabledOnly || premiumOnly ? matchesSupplementalDisplayFilters : undefined,
                  onResetFilterToAll: () => setFilter('all'),
                  onResetProblemOnly: () => setProblemOnly(false),
                })
              }
              disabled={disableControls || loading || deletingAll}
              loading={deletingAll}
            >
              {deleteAllButtonLabel}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        }
      >
        {error && <div className={styles.errorBox}>{error}</div>}

        <div className={styles.filterSection}>
          <FilterTagsRail
            types={existingTypes}
            activeFilter={filter}
            typeCounts={typeCounts}
            resolvedTheme={resolvedTheme}
            onSelect={handleFilterTagSelect}
          />

          <div className={styles.filterContent}>
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

              <Button
                variant="secondary"
                size="sm"
                className={styles.pageQuotaRefreshButton}
                onClick={() => void handlePageRefreshQuota()}
                disabled={pageQuotaRefreshDisabled}
                aria-busy={pageQuotaRefreshing}
                aria-label={t('auth_files.refresh_page_quota_aria')}
                title={t('auth_files.refresh_page_quota_aria')}
              >
                <IconRefreshCw
                  className={[
                    styles.batchQuotaRefreshIcon,
                    pageQuotaRefreshing ? styles.quotaRefreshIconSvgSpinning : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  size={15}
                />
              </Button>

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
                  <button
                    type="button"
                    className={`${styles.filterChip} ${compactMode ? styles.filterChipActive : ''}`}
                    onClick={handleToggleCompactMode}
                    aria-pressed={compactMode}
                  >
                    {t('auth_files.compact_mode_label')}
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className={styles.hint}>{t('common.loading')}</div>
            ) : pageItems.length === 0 ? (
              <EmptyState
                title={t('auth_files.search_empty_title')}
                description={t('auth_files.search_empty_desc')}
              />
            ) : (
              <div
                className={`${styles.fileGrid} ${quotaFilterType ? styles.fileGridQuotaManaged : ''} ${compactMode ? styles.fileGridCompact : ''}`}
              >
                {pageItems.map((file) => (
                  <AuthFileCard
                    key={file.name}
                    file={file}
                    compact={compactMode}
                    selected={selectedFiles.has(file.name)}
                    resolvedTheme={resolvedTheme}
                    disableControls={disableControls}
                    deleting={deleting === file.name}
                    statusUpdating={statusUpdating[file.name] === true}
                    accessTokenCopying={accessTokenCopying[file.name] === true}
                    priorityUpdating={priorityUpdating[file.name] === true}
                    quotaFilterType={quotaFilterType}
                    keyStats={keyStats}
                    keyUsageStats={keyUsageStats}
                    statusBarCache={statusBarCache}
                    onShowModels={showModels}
                    onCopyName={copyTextWithNotification}
                    onDownload={handleDownload}
                    onCopyAccessToken={handleCopyAccessToken}
                    onPriorityChange={handlePriorityChange}
                    onOpenPrefixProxyEditor={openPrefixProxyEditor}
                    onAuthFileUpdated={(updated) => applyLocalFileUpdates([updated])}
                    onDelete={handleDelete}
                    onToggleStatus={handleStatusToggle}
                    onToggleSelect={toggleSelect}
                  />
                ))}
              </div>
            )}

            {!loading && listTotal > pageSize && (
              <div className={styles.pagination}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
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
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                >
                  {t('auth_files.pagination_next')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <OAuthExcludedCard
        disableControls={disableControls}
        excludedError={excludedError}
        excluded={excluded}
        onAdd={() => openExcludedEditor()}
        onEdit={openExcludedEditor}
        onDelete={deleteExcluded}
      />

      <OAuthModelAliasCard
        disableControls={disableControls}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAdd={() => openModelAliasEditor()}
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

      <AuthFileModelsModal
        open={modelsModalOpen}
        fileName={modelsFileName}
        fileType={modelsFileType}
        loading={modelsLoading}
        error={modelsError}
        models={modelsList}
        excluded={excluded}
        onClose={closeModelsModal}
        onCopyText={copyTextWithNotification}
      />

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
                    onClick={() => selectAllVisible(pageItems)}
                    disabled={selectablePageItems.length === 0}
                  >
                    {t('auth_files.batch_select_page')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => selectAllVisible(sorted)}
                    disabled={selectableFilteredItems.length === 0}
                  >
                    {t('auth_files.batch_select_filtered')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => invertVisibleSelection(pageItems)}
                    disabled={selectablePageItems.length === 0}
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
                    onClick={() => void batchDownload(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
                  >
                    {t('auth_files.batch_download')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleBatchRefreshQuota()}
                    disabled={batchQuotaRefreshDisabled}
                    aria-busy={batchQuotaRefreshing}
                  >
                    <span className={styles.batchQuotaRefreshContent}>
                      <IconRefreshCw
                        className={[
                          styles.batchQuotaRefreshIcon,
                          batchQuotaRefreshing ? styles.quotaRefreshIconSvgSpinning : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        size={14}
                      />
                      <span>{t('auth_files.batch_refresh_quota')}</span>
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, true)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_enable')}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => batchSetStatus(selectedNames, false)}
                    disabled={batchStatusButtonsDisabled}
                  >
                    {t('auth_files.batch_disable')}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => batchDelete(selectedNames)}
                    disabled={disableControls || selectedNames.length === 0}
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
