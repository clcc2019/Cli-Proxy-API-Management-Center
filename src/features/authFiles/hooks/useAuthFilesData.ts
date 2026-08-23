import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  authFilesApi,
  getAuthFilesListOptionsKey,
  getAuthFilesTypeCountsKey,
  normalizeAuthFileDeleteAliases,
  type AuthFilesListOptions,
} from '@/services/api';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { formatFileSize } from '@/utils/format';
import { getPathBasename } from '@/utils/path';
import { AUTH_FILES_REFRESH_EVENT, MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import { isRuntimeOnlyAuthFile } from '@/utils/quota';
import { createTrailingSingleFlight } from '@/utils/trailingSingleFlight';
import { readAuthFileNumericCount } from '@/features/authFiles/stats';

const normalizeDeleteAuthIndex = (value: unknown): string | number | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
};

const normalizeDeleteText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
};

const getAuthFileDeleteIdentifiers = (file: AuthFileItem): string[] => {
  const path = normalizeDeleteText(file.path);
  const candidates = [
    file.name,
    file.id,
    file['file_name'],
    file.fileName,
    file['auth_index'],
    file.authIndex,
    path,
    path ? getPathBasename(path) : null,
  ];
  return normalizeAuthFileDeleteAliases(candidates);
};

const authFileMatchesDeletedIdentifiers = (file: AuthFileItem, deletedSet: Set<string>): boolean =>
  getAuthFileDeleteIdentifiers(file).some((identifier) => deletedSet.has(identifier));

const getAuthFileDeleteTarget = (file: AuthFileItem) => ({
  name: file.name,
  id: normalizeDeleteText(file.id),
  path: normalizeDeleteText(file.path),
  fileName: normalizeDeleteText(file['file_name'] ?? file.fileName),
  authIndex: normalizeDeleteAuthIndex(file['auth_index'] ?? file.authIndex),
});

type DeleteAllOptions = {
  filtered: boolean;
  confirmMessage: string;
  listOptions: AuthFilesListOptions;
  matchesFile: (file: AuthFileItem) => boolean;
};

export type AuthFilesListMeta = {
  total: number;
  page: number;
  pageSize: number;
  paginated: boolean;
  hasMore: boolean;
  typeCounts?: Record<string, number>;
  /** Whether this response was filtered by the server's cached premium-plan snapshot. */
  premiumOnlyApplied?: boolean;
  pageRecentRequestsApplied?: boolean;
  dataKey?: string;
  resolvedDataKey?: string;
  typeCountsKey?: string;
};

const areRecentRequestBucketsEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;

  return left.every((entry, index) => {
    const other = right[index];
    if (!entry || typeof entry !== 'object' || !other || typeof other !== 'object') {
      return entry === other;
    }

    const bucket = entry as Record<string, unknown>;
    const otherBucket = other as Record<string, unknown>;
    return (
      readAuthFileNumericCount(bucket.success) === readAuthFileNumericCount(otherBucket.success) &&
      readAuthFileNumericCount(bucket.failed ?? bucket.failure) ===
        readAuthFileNumericCount(otherBucket.failed ?? otherBucket.failure) &&
      bucket.time === otherBucket.time
    );
  });
};

const areAuthFileFieldValuesEqual = (key: string, left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (key === 'recent_requests' || key === 'recentRequests') {
    return areRecentRequestBucketsEqual(left, right);
  }
  return false;
};

const areRecordValuesShallowEqual = (
  left: Record<string, unknown> | undefined,
  right: Record<string, unknown> | undefined
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => areAuthFileFieldValuesEqual(key, left[key], right[key]));
};

const areAuthFileItemsShallowEqual = (left: AuthFileItem, right: AuthFileItem): boolean =>
  areRecordValuesShallowEqual(left as Record<string, unknown>, right as Record<string, unknown>);

const reuseAuthFileItemReferences = (
  previousFiles: AuthFileItem[],
  nextFiles: AuthFileItem[]
): AuthFileItem[] => {
  if (previousFiles.length === 0 || nextFiles.length === 0) return nextFiles;

  if (
    previousFiles.length === nextFiles.length &&
    nextFiles.every(
      (file, index) =>
        previousFiles[index]?.name === file.name &&
        areAuthFileItemsShallowEqual(previousFiles[index], file)
    )
  ) {
    return previousFiles;
  }

  const previousByName = new Map(previousFiles.map((file) => [file.name, file]));
  let changedReference = previousFiles.length !== nextFiles.length;
  const reusedFiles = nextFiles.map((file, index) => {
    const previous = previousByName.get(file.name);
    const nextFile = previous && areAuthFileItemsShallowEqual(previous, file) ? previous : file;
    if (nextFile !== previousFiles[index]) changedReference = true;
    return nextFile;
  });

  return changedReference ? reusedFiles : previousFiles;
};

const areAuthFilesListMetaEqual = (left: AuthFilesListMeta, right: AuthFilesListMeta): boolean =>
  left.total === right.total &&
  left.page === right.page &&
  left.pageSize === right.pageSize &&
  left.paginated === right.paginated &&
  left.hasMore === right.hasMore &&
  left.premiumOnlyApplied === right.premiumOnlyApplied &&
  left.pageRecentRequestsApplied === right.pageRecentRequestsApplied &&
  left.dataKey === right.dataKey &&
  left.resolvedDataKey === right.resolvedDataKey &&
  left.typeCountsKey === right.typeCountsKey &&
  areRecordValuesShallowEqual(left.typeCounts, right.typeCounts);

const DEFAULT_AUTH_FILES_LIST_OPTIONS: AuthFilesListOptions = {
  codexSubscription: 'cache',
  summary: true,
};

type LoadFilesBehaviorOptions = {
  silent?: boolean;
  /** Cancel a same-query request that may contain an older server snapshot. */
  force?: boolean;
};

const isCanceledRequestError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const record = err as { code?: unknown; name?: unknown; message?: unknown };
  return (
    record.code === 'ERR_CANCELED' ||
    record.name === 'CanceledError' ||
    record.name === 'AbortError' ||
    record.message === 'canceled'
  );
};

const isUnsupportedPremiumFilterError = (err: unknown): boolean => {
  if (!err || typeof err !== 'object') return false;
  const response = (err as { response?: { status?: unknown } }).response;
  const status = response?.status;
  return status === 400 || status === 404 || status === 405 || status === 422 || status === 501;
};

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  refreshing: boolean;
  error: string;
  uploading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  statusUpdating: Record<string, boolean>;
  batchStatusUpdating: boolean;
  listMeta: AuthFilesListMeta;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: (overrideOptions?: Partial<AuthFilesListOptions>) => Promise<void>;
  refreshFilesFromServer: (force?: boolean) => Promise<void>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  applyLocalFilePatch: (name: string, patch: Partial<AuthFileItem>) => void;
  applyLocalFileUpdates: (updates: AuthFileItem[]) => void;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  invertVisibleSelection: (visibleFiles: AuthFileItem[]) => void;
  retainVisibleSelection: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  batchDownload: (names: string[]) => Promise<void>;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
};

export type UseAuthFilesDataOptions = {
  refreshKeyStats: () => Promise<void>;
  listOptions?: AuthFilesListOptions;
  onListMetaResolved?: (meta: AuthFilesListMeta) => void;
  restoreFocusAfterDelete?: () => void;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const {
    refreshKeyStats,
    listOptions = DEFAULT_AUTH_FILES_LIST_OPTIONS,
    onListMetaResolved,
    restoreFocusAfterDelete,
  } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [listMeta, setListMeta] = useState<AuthFilesListMeta>({
    total: 0,
    page: 1,
    pageSize: 0,
    paginated: false,
    hasMore: false,
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStatusPendingRef = useRef(false);
  const filesRef = useRef<AuthFileItem[]>([]);
  const statusUpdatingRef = useRef<Record<string, boolean>>({});
  const visibleFileCountRef = useRef(0);
  const mountedRef = useRef(true);
  const loadFilesRequestsRef = useRef(createTrailingSingleFlight<string, void>());
  const loadFilesAbortRef = useRef<AbortController | null>(null);
  const loadFilesSeqRef = useRef(0);
  const selectionCount = selectedFiles.size;
  const listOptionsKey = useMemo(() => getAuthFilesListOptionsKey(listOptions), [listOptions]);
  const listUsesServerPagination = Boolean(listOptions.pageSize);

  const applyFilesState = useCallback((action: SetStateAction<AuthFileItem[]>) => {
    const previousFiles = filesRef.current;
    const nextFiles = typeof action === 'function' ? action(previousFiles) : action;
    filesRef.current = nextFiles;
    visibleFileCountRef.current = nextFiles.length;
    setFiles(nextFiles);

    setSelectedFiles((prev) => {
      if (prev.size === 0) return prev;
      const existingNames = new Set(nextFiles.map((file) => file.name));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (existingNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    statusUpdatingRef.current = statusUpdating;
  }, [statusUpdating]);

  const toggleSelect = useCallback((name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback((visibleFiles: AuthFileItem[]) => {
    const nextSelected = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    if (nextSelected.length === 0) return;
    setSelectedFiles((prev) => {
      let changed = false;
      const next = new Set(prev);
      nextSelected.forEach((name) => {
        if (next.has(name)) return;
        next.add(name);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  const invertVisibleSelection = useCallback((visibleFiles: AuthFileItem[]) => {
    const visibleNames = visibleFiles
      .filter((file) => !isRuntimeOnlyAuthFile(file))
      .map((file) => file.name);
    if (visibleNames.length === 0) return;

    setSelectedFiles((prev) => {
      const next = new Set(prev);
      visibleNames.forEach((name) => {
        if (next.has(name)) {
          next.delete(name);
        } else {
          next.add(name);
        }
      });
      return next;
    });
  }, []);

  const retainVisibleSelection = useCallback((visibleFiles: AuthFileItem[]) => {
    const visibleNames = new Set(
      visibleFiles.filter((file) => !isRuntimeOnlyAuthFile(file)).map((file) => file.name)
    );
    setSelectedFiles((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(Array.from(prev).filter((name) => visibleNames.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedFiles((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const updateListMetaAfterDeletedFiles = useCallback((deletedFiles: AuthFileItem[]) => {
    if (deletedFiles.length === 0) return;

    setListMeta((prev) => {
      const nextTypeCounts = prev.typeCounts ? { ...prev.typeCounts } : undefined;

      if (nextTypeCounts) {
        const decrementTypeCount = (key: string, count = 1) => {
          const current = nextTypeCounts[key];
          if (typeof current !== 'number') return;
          nextTypeCounts[key] = Math.max(0, current - count);
        };

        decrementTypeCount('all', deletedFiles.length);
        deletedFiles.forEach((file) => {
          if (file.type) decrementTypeCount(file.type);
        });
      }

      const nextTotal = Math.max(0, prev.total - deletedFiles.length);
      return {
        ...prev,
        total: nextTotal,
        hasMore:
          prev.paginated && prev.pageSize > 0 ? nextTotal > prev.page * prev.pageSize : false,
        typeCounts: nextTypeCounts,
      };
    });
  }, []);

  const applyDeletedFiles = useCallback(
    (names: string[]) => {
      const deletedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (deletedNames.length === 0) return;

      const deletedSet = new Set(deletedNames);
      const currentFiles = filesRef.current;
      const removedFiles: AuthFileItem[] = [];
      const retainedFiles: AuthFileItem[] = [];
      currentFiles.forEach((file) => {
        if (authFileMatchesDeletedIdentifiers(file, deletedSet)) {
          removedFiles.push(file);
        } else {
          retainedFiles.push(file);
        }
      });
      const removedSelectionNames = new Set(removedFiles.map((file) => file.name));
      if (removedFiles.length > 0) {
        applyFilesState((prev) => {
          if (prev === currentFiles) return retainedFiles;
          return prev.filter((file) => !authFileMatchesDeletedIdentifiers(file, deletedSet));
        });
        updateListMetaAfterDeletedFiles(removedFiles);
      }
      setSelectedFiles((prev) => {
        if (prev.size === 0) return prev;
        let changed = false;
        const next = new Set<string>();
        prev.forEach((name) => {
          if (deletedSet.has(name) || removedSelectionNames.has(name)) {
            changed = true;
          } else {
            next.add(name);
          }
        });
        return changed ? next : prev;
      });
    },
    [applyFilesState, updateListMetaAfterDeletedFiles]
  );

  const applyLocalFileUpdates = useCallback(
    (updates: AuthFileItem[]) => {
      if (updates.length === 0) return;
      const updatesByName = updates.reduce<Map<string, AuthFileItem>>((map, file) => {
        const name = String(file.name ?? '').trim();
        if (name) map.set(name, file);
        return map;
      }, new Map());
      if (updatesByName.size === 0) return;
      applyFilesState((prev) => {
        let changed = false;
        const next = prev.map((file) => {
          const updated = updatesByName.get(file.name);
          if (!updated) return file;
          const hasChanges = Object.entries(updated).some(([key, value]) => {
            if (key === 'name') return false;
            return (file as Record<string, unknown>)[key] !== value;
          });
          if (hasChanges) changed = true;
          return hasChanges ? { ...file, ...updated, name: file.name } : file;
        });
        return changed ? next : prev;
      });
    },
    [applyFilesState]
  );

  const applyLocalFilePatch = useCallback(
    (name: string, patch: Partial<AuthFileItem>) => {
      const trimmedName = name.trim();
      if (!trimmedName) return;
      applyLocalFileUpdates([{ ...patch, name: trimmedName } as AuthFileItem]);
    },
    [applyLocalFileUpdates]
  );

  const patchLocalFileStatus = useCallback(
    (item: AuthFileItem, disabled: boolean) => {
      const name = item.name;
      applyFilesState((prev) => {
        let found = false;
        let changed = false;
        const next = prev.map((file) => {
          if (file.name !== name) return file;
          found = true;
          if (file.disabled === disabled) return file;
          changed = true;
          return { ...file, disabled };
        });

        if (!found) return [{ ...item, disabled }, ...prev];
        return changed ? next : prev;
      });
    },
    [applyFilesState]
  );

  const loadFiles = useCallback(
    async (
      overrideOptions?: Partial<AuthFilesListOptions>,
      behaviorOptions?: LoadFilesBehaviorOptions
    ) => {
      const silent = behaviorOptions?.silent === true;
      const force = behaviorOptions?.force === true;
      const showFullLoading = !silent && visibleFileCountRef.current === 0;
      const showRefreshing = !silent && !showFullLoading;
      const effectiveListOptions = overrideOptions
        ? { ...listOptions, ...overrideOptions }
        : listOptions;
      const effectiveListOptionsKey = overrideOptions
        ? getAuthFilesListOptionsKey(effectiveListOptions)
        : listOptionsKey;

      await loadFilesRequestsRef.current.run(
        effectiveListOptionsKey,
        async () => {
          loadFilesAbortRef.current?.abort();
          const abortController = new AbortController();
          loadFilesAbortRef.current = abortController;

          const requestSeq = loadFilesSeqRef.current + 1;
          loadFilesSeqRef.current = requestSeq;

          if (!silent) {
            setLoading(showFullLoading);
            setRefreshing(showRefreshing);
            setError('');
          }
          try {
            const data = await authFilesApi.list(effectiveListOptions, {
              signal: abortController.signal,
            });
            if (!mountedRef.current || loadFilesSeqRef.current !== requestSeq) return;

            const nextFiles = reuseAuthFileItemReferences(filesRef.current, data?.files || []);
            const nextPage =
              typeof data?.page === 'number' && Number.isFinite(data.page)
                ? data.page
                : (effectiveListOptions.page ?? 1);
            const nextPageSize =
              typeof data?.page_size === 'number' && Number.isFinite(data.page_size)
                ? data.page_size
                : (effectiveListOptions.pageSize ?? nextFiles.length);
            const resolvedDataKey = effectiveListOptions.pageSize
              ? getAuthFilesListOptionsKey({
                  ...effectiveListOptions,
                  page: nextPage,
                  pageSize: nextPageSize,
                })
              : effectiveListOptionsKey;

            applyFilesState(nextFiles);
            setError('');
            const nextListMeta: AuthFilesListMeta = {
              total: typeof data?.total === 'number' ? data.total : nextFiles.length,
              page: Math.max(1, Math.round(nextPage)),
              pageSize: Math.max(0, Math.round(nextPageSize)),
              paginated: Boolean(effectiveListOptions.pageSize),
              hasMore: data?.has_more === true,
              typeCounts: data?.type_counts,
              premiumOnlyApplied:
                effectiveListOptions.premiumOnly === true
                  ? data?.premium_only_applied === true
                  : undefined,
              pageRecentRequestsApplied:
                effectiveListOptions.pageRecentRequests === true
                  ? data?.page_recent_requests_applied === true
                  : undefined,
              dataKey: effectiveListOptionsKey,
              resolvedDataKey,
              typeCountsKey: getAuthFilesTypeCountsKey(effectiveListOptions),
            };
            onListMetaResolved?.(nextListMeta);
            setListMeta((prev) =>
              areAuthFilesListMetaEqual(prev, nextListMeta) ? prev : nextListMeta
            );
          } catch (err: unknown) {
            if (!mountedRef.current || loadFilesSeqRef.current !== requestSeq) return;
            if (isCanceledRequestError(err)) return;
            // Servers that reject an unknown query parameter take the same graceful
            // path as servers that omit `premium_only_applied` from a successful
            // response. AuthFilesPage will immediately request its compatible
            // unpaginated view after it observes this capability marker.
            if (effectiveListOptions.premiumOnly && isUnsupportedPremiumFilterError(err)) {
              const unsupportedPremiumListMeta: AuthFilesListMeta = {
                total: 0,
                page: Math.max(1, Math.round(effectiveListOptions.page ?? 1)),
                pageSize: Math.max(0, Math.round(effectiveListOptions.pageSize ?? 0)),
                paginated: Boolean(effectiveListOptions.pageSize),
                hasMore: false,
                premiumOnlyApplied: false,
                dataKey: effectiveListOptionsKey,
                resolvedDataKey: effectiveListOptionsKey,
                typeCountsKey: getAuthFilesTypeCountsKey(effectiveListOptions),
              };
              onListMetaResolved?.(unsupportedPremiumListMeta);
              setListMeta((prev) =>
                areAuthFilesListMetaEqual(prev, unsupportedPremiumListMeta)
                  ? prev
                  : unsupportedPremiumListMeta
              );
              return;
            }
            if (silent) return;
            const errorMessage =
              err instanceof Error ? err.message : t('notification.refresh_failed');
            setError(errorMessage);
          } finally {
            if (mountedRef.current && loadFilesSeqRef.current === requestSeq) {
              setLoading(false);
              setRefreshing(false);
            }
            if (loadFilesAbortRef.current === abortController) {
              loadFilesAbortRef.current = null;
            }
          }
        },
        force ? 'refresh-after-current' : 'reuse'
      );
    },
    [applyFilesState, listOptions, listOptionsKey, onListMetaResolved, t]
  );

  useEffect(() => {
    const loadFilesRequests = loadFilesRequestsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadFilesSeqRef.current += 1;
      loadFilesAbortRef.current?.abort();
      loadFilesRequests.clear();
    };
  }, []);

  const refreshFilesAfterLocalMutation = useCallback(() => {
    if (!listUsesServerPagination) return;
    void loadFiles(undefined, { silent: true });
  }, [listUsesServerPagination, loadFiles]);

  const refreshFilesFromServer = useCallback(
    (force = false) => loadFiles(undefined, { silent: true, force }),
    [loadFiles]
  );

  // OAuth 登录成功后由 useOAuthFlow 广播。页面切换时本页面可能仍被
  // page-transition 的 stacked-keep 层保留挂载，此时返回不会重新拉取列表，
  // 所以需要这个显式信号，否则刚认证成功的凭据不会出现。
  useEffect(() => {
    const handleExternalRefresh = () => {
      void refreshFilesFromServer(true);
    };

    window.addEventListener(AUTH_FILES_REFRESH_EVENT, handleExternalRefresh);
    return () => window.removeEventListener(AUTH_FILES_REFRESH_EVENT, handleExternalRefresh);
  }, [refreshFilesFromServer]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const fileList = event.target.files;
      if (!fileList || fileList.length === 0) return;

      const filesToUpload = Array.from(fileList);
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];
      const oversizedFiles: string[] = [];

      filesToUpload.forEach((file) => {
        if (!file.name.endsWith('.json')) {
          invalidFiles.push(file.name);
          return;
        }
        if (file.size > MAX_AUTH_FILE_SIZE) {
          oversizedFiles.push(file.name);
          return;
        }
        validFiles.push(file);
      });

      if (invalidFiles.length > 0) {
        showNotification(t('auth_files.upload_error_json'), 'error');
      }
      if (oversizedFiles.length > 0) {
        showNotification(
          t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) }),
          'error'
        );
      }

      if (validFiles.length === 0) {
        event.target.value = '';
        return;
      }

      setUploading(true);
      try {
        const result = await authFilesApi.uploadFiles(validFiles);
        if (!mountedRef.current) return;
        const successCount = result.uploaded;

        if (successCount > 0) {
          const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
          showNotification(
            `${t('auth_files.upload_success')}${suffix}`,
            result.failed.length ? 'warning' : 'success'
          );
          await loadFiles();
          if (!mountedRef.current) return;
          await refreshKeyStats();
        }

        if (!mountedRef.current) return;
        if (result.failed.length > 0) {
          const details = result.failed.map((item) => `${item.name}: ${item.error}`).join('; ');
          showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
        }
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      } finally {
        if (mountedRef.current) {
          setUploading(false);
        }
        event.target.value = '';
      }
    },
    [loadFiles, refreshKeyStats, showNotification, t]
  );

  const handleDelete = useCallback(
    (name: string) => {
      const runDelete = async () => {
        setDeleting(name);
        try {
          const file = filesRef.current.find((item) => item.name === name);
          const result = await authFilesApi.deleteFiles([
            file ? getAuthFileDeleteTarget(file) : name,
          ]);
          if (!mountedRef.current) return;
          if (result.deleted === 0 || result.failed.length > 0) {
            const details = result.failed[0]?.error;
            showNotification(
              details
                ? `${t('notification.delete_failed')}: ${details}`
                : t('notification.delete_failed'),
              'error'
            );
            return;
          }
          showNotification(t('auth_files.delete_success'), 'success');
          applyDeletedFiles(result.files.length > 0 ? result.files : [name]);
          refreshFilesAfterLocalMutation();
        } catch (err: unknown) {
          if (!mountedRef.current) return;
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        } finally {
          if (mountedRef.current) {
            setDeleting(null);
          }
        }
      };

      showConfirmation({
        title: t('auth_files.delete_button'),
        message: t('auth_files.delete_confirm', { name }),
        confirmText: t('common.delete'),
        variant: 'danger',
        onConfirm: runDelete,
        restoreFocus: restoreFocusAfterDelete,
      });
    },
    [
      applyDeletedFiles,
      refreshFilesAfterLocalMutation,
      restoreFocusAfterDelete,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const {
        filtered,
        confirmMessage,
        listOptions: deleteListOptions,
        matchesFile,
      } = deleteAllOptions;
      const runDeleteAll = async () => {
        setDeletingAll(true);
        try {
          if (!filtered) {
            await authFilesApi.deleteAll();
            showNotification(t('auth_files.delete_all_success'), 'success');
            applyFilesState((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
            deselectAll();
          } else {
            const data = await authFilesApi.list({
              ...deleteListOptions,
              page: undefined,
              pageSize: undefined,
              pageRecentRequests: false,
              includeRecentRequests: false,
              typeCountsOnly: false,
            });
            const filesToDelete = (data.files ?? []).filter(
              (file) => !isRuntimeOnlyAuthFile(file) && matchesFile(file)
            );

            if (filesToDelete.length === 0) {
              showNotification(t('auth_files.delete_filtered_none'), 'info');
              return;
            }

            const result = await authFilesApi.deleteFiles(
              filesToDelete.map(getAuthFileDeleteTarget)
            );
            if (!mountedRef.current) return;
            const success = result.deleted;
            const failed = result.failed.length;

            applyDeletedFiles(result.files);

            if (failed === 0) {
              showNotification(
                t('auth_files.delete_filtered_success', { count: success }),
                'success'
              );
            } else {
              showNotification(
                t('auth_files.delete_filtered_partial', { success, failed }),
                'warning'
              );
            }
          }
          refreshFilesAfterLocalMutation();
        } catch (err: unknown) {
          if (!mountedRef.current) return;
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        } finally {
          if (mountedRef.current) {
            setDeletingAll(false);
          }
        }
      };

      showConfirmation({
        title: filtered
          ? t('auth_files.delete_filtered_button')
          : t('auth_files.delete_all_button'),
        message: confirmMessage,
        confirmText: t('common.delete'),
        variant: 'danger',
        onConfirm: runDeleteAll,
        restoreFocus: restoreFocusAfterDelete,
      });
    },
    [
      applyDeletedFiles,
      applyFilesState,
      deselectAll,
      refreshFilesAfterLocalMutation,
      restoreFocusAfterDelete,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  const handleDownload = useCallback(
    async (name: string) => {
      try {
        const response = await apiClient.getRaw(
          `/auth-files/download?name=${encodeURIComponent(name)}`,
          { responseType: 'blob' }
        );
        const blob = new Blob([response.data]);
        downloadBlob({ filename: name, blob });
        showNotification(t('auth_files.download_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [showNotification, t]
  );

  const handleStatusToggle = useCallback(
    async (item: AuthFileItem, enabled: boolean) => {
      const name = item.name;
      const nextDisabled = !enabled;
      const previousDisabled = item.disabled === true;
      if (statusUpdatingRef.current[name] === true || previousDisabled === nextDisabled) return;

      setStatusUpdating((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
      patchLocalFileStatus(item, nextDisabled);

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        if (!mountedRef.current) return;
        patchLocalFileStatus(item, res.disabled);
        await refreshFilesFromServer();
        if (!mountedRef.current) return;
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const errorMessage = err instanceof Error ? err.message : '';
        patchLocalFileStatus(item, previousDisabled);
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        if (mountedRef.current) {
          setStatusUpdating((prev) => {
            if (!prev[name]) return prev;
            const next = { ...prev };
            delete next[name];
            return next;
          });
        }
      }
    },
    [patchLocalFileStatus, refreshFilesFromServer, showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      if (batchStatusPendingRef.current) return;

      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (uniqueNames.some((name) => statusUpdatingRef.current[name] === true)) return;
      const uniqueNameSet = new Set(uniqueNames);

      const nextDisabled = !enabled;
      const originalDisabled = new Map(
        filesRef.current
          .filter((file) => uniqueNameSet.has(file.name))
          .filter((file) => (file.disabled === true) !== nextDisabled)
          .map((file) => [file.name, file.disabled === true])
      );
      const targetNames = new Set(originalDisabled.keys());
      const targetNameList = Array.from(targetNames);
      if (targetNameList.length === 0) return;

      batchStatusPendingRef.current = true;
      setBatchStatusUpdating((prev) => (prev ? prev : true));
      setStatusUpdating((prev) => {
        let changed = false;
        const next = { ...prev };
        targetNameList.forEach((name) => {
          if (next[name] === true) return;
          next[name] = true;
          changed = true;
        });
        return changed ? next : prev;
      });
      applyFilesState((prev) => {
        let changed = false;
        const next = prev.map((file) => {
          if (!targetNames.has(file.name) || file.disabled === nextDisabled) return file;
          changed = true;
          return { ...file, disabled: nextDisabled };
        });
        return changed ? next : prev;
      });

      try {
        const results = await Promise.allSettled(
          targetNameList.map((name) => authFilesApi.setStatus(name, nextDisabled))
        );
        if (!mountedRef.current) return;

        let successCount = 0;
        let failCount = 0;
        const failedNames = new Set<string>();
        const confirmedDisabled = new Map<string, boolean>();

        results.forEach((result, index) => {
          const name = targetNameList[index];
          if (result.status === 'fulfilled') {
            successCount++;
            confirmedDisabled.set(name, result.value.disabled);
          } else {
            failCount++;
            failedNames.add(name);
          }
        });

        applyFilesState((prev) => {
          let changed = false;
          const next = prev.map((file) => {
            if (failedNames.has(file.name)) {
              const disabled = originalDisabled.get(file.name) === true;
              if (file.disabled === disabled) return file;
              changed = true;
              return { ...file, disabled };
            }
            if (confirmedDisabled.has(file.name)) {
              const disabled = confirmedDisabled.get(file.name) === true;
              if (file.disabled === disabled) return file;
              changed = true;
              return { ...file, disabled };
            }
            return file;
          });
          return changed ? next : prev;
        });

        if (failCount === 0) {
          showNotification(
            t('auth_files.batch_status_success', { count: successCount }),
            'success'
          );
        } else {
          showNotification(
            t('auth_files.batch_status_partial', { success: successCount, failed: failCount }),
            'warning'
          );
        }

        setSelectedFiles(failCount > 0 ? failedNames : new Set());
        await refreshFilesFromServer();
      } finally {
        batchStatusPendingRef.current = false;
        if (mountedRef.current) {
          setBatchStatusUpdating(false);
          setStatusUpdating((prev) => {
            let changed = false;
            const next = { ...prev };
            targetNameList.forEach((name) => {
              if (!next[name]) return;
              delete next[name];
              changed = true;
            });
            return changed ? next : prev;
          });
        }
      }
    },
    [applyFilesState, refreshFilesFromServer, showNotification, t]
  );

  const batchDownload = useCallback(
    async (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      let successCount = 0;
      let failCount = 0;

      for (const name of uniqueNames) {
        try {
          const response = await apiClient.getRaw(
            `/auth-files/download?name=${encodeURIComponent(name)}`,
            { responseType: 'blob' }
          );
          if (!mountedRef.current) return;
          const blob = new Blob([response.data]);
          downloadBlob({ filename: name, blob });
          successCount++;
        } catch {
          failCount++;
        }
      }

      if (!mountedRef.current) return;
      if (failCount === 0) {
        showNotification(
          t('auth_files.batch_download_success', { count: successCount }),
          'success'
        );
      } else {
        showNotification(
          t('auth_files.batch_download_partial', { success: successCount, failed: failCount }),
          'warning'
        );
      }
    },
    [showNotification, t]
  );

  const batchDelete = useCallback(
    (names: string[]) => {
      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;

      const runBatchDelete = async () => {
        try {
          const fileByName = new Map(filesRef.current.map((file) => [file.name, file]));
          const result = await authFilesApi.deleteFiles(
            uniqueNames.map((name) => {
              const file = fileByName.get(name);
              return file ? getAuthFileDeleteTarget(file) : name;
            })
          );
          if (!mountedRef.current) return;
          applyDeletedFiles(result.files);

          if (result.failed.length === 0) {
            showNotification(
              `${t('auth_files.delete_all_success')} (${result.deleted})`,
              'success'
            );
          } else {
            showNotification(
              t('auth_files.delete_filtered_partial', {
                success: result.deleted,
                failed: result.failed.length,
                type: t('auth_files.filter_all'),
              }),
              'warning'
            );
          }
          refreshFilesAfterLocalMutation();
        } catch (err: unknown) {
          if (!mountedRef.current) return;
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        }
      };

      showConfirmation({
        title: t('auth_files.batch_delete_title'),
        message: t('auth_files.batch_delete_confirm', { count: uniqueNames.length }),
        confirmText: t('common.delete'),
        variant: 'danger',
        onConfirm: runBatchDelete,
        restoreFocus: restoreFocusAfterDelete,
      });
    },
    [
      applyDeletedFiles,
      refreshFilesAfterLocalMutation,
      restoreFocusAfterDelete,
      showConfirmation,
      showNotification,
      t,
    ]
  );

  return {
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
    applyLocalFileUpdates,
    toggleSelect,
    selectAllVisible,
    invertVisibleSelection,
    retainVisibleSelection,
    deselectAll,
    batchDownload,
    batchSetStatus,
    batchDelete,
  };
}
