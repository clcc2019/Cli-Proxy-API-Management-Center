import { useCallback, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { apiClient } from '@/services/api/client';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { downloadBlob } from '@/utils/download';
import {
  getTypeLabel,
  hasAuthFileStatusMessage,
  isRuntimeOnlyAuthFile,
} from '@/features/authFiles/constants';

const normalizeDeleteAuthIndex = (value: unknown): string | number | null => {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
};

const normalizeDeleteText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
};

const basenameFromPath = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
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
    path ? basenameFromPath(path) : null,
  ];
  const seen = new Set<string>();
  return candidates.reduce<string[]>((result, value) => {
    const normalized = String(value ?? '').trim();
    if (!normalized || seen.has(normalized)) return result;
    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
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
  filter: string;
  problemOnly: boolean;
  matchDisplayFilter?: (file: AuthFileItem) => boolean;
  onResetFilterToAll: () => void;
  onResetProblemOnly: () => void;
};

export type UseAuthFilesDataResult = {
  files: AuthFileItem[];
  selectedFiles: Set<string>;
  selectionCount: number;
  loading: boolean;
  error: string;
  uploading: boolean;
  deleting: string | null;
  deletingAll: boolean;
  statusUpdating: Record<string, boolean>;
  batchStatusUpdating: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  loadFiles: () => Promise<void>;
  handleUploadClick: () => void;
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleDelete: (name: string) => void;
  handleDeleteAll: (options: DeleteAllOptions) => void;
  handleDownload: (name: string) => Promise<void>;
  handleStatusToggle: (item: AuthFileItem, enabled: boolean) => Promise<void>;
  applyLocalFilePatch: (name: string, patch: Partial<AuthFileItem>) => void;
  toggleSelect: (name: string) => void;
  selectAllVisible: (visibleFiles: AuthFileItem[]) => void;
  invertVisibleSelection: (visibleFiles: AuthFileItem[]) => void;
  deselectAll: () => void;
  batchDownload: (names: string[]) => Promise<void>;
  batchSetStatus: (names: string[], enabled: boolean) => Promise<void>;
  batchDelete: (names: string[]) => void;
};

export type UseAuthFilesDataOptions = {
  refreshKeyStats: () => Promise<void>;
};

export function useAuthFilesData(options: UseAuthFilesDataOptions): UseAuthFilesDataResult {
  const { refreshKeyStats } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [batchStatusUpdating, setBatchStatusUpdating] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchStatusPendingRef = useRef(false);
  const loadFilesInFlightRef = useRef<Promise<void> | null>(null);
  const selectionCount = selectedFiles.size;
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
      const next = new Set(prev);
      nextSelected.forEach((name) => next.add(name));
      return next;
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

  const deselectAll = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  const applyDeletedFiles = useCallback(
    (names: string[]) => {
      const deletedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (deletedNames.length === 0) return;

      const deletedSet = new Set(deletedNames);
      const removedSelectionNames = new Set(
        files
          .filter((file) => authFileMatchesDeletedIdentifiers(file, deletedSet))
          .map((file) => file.name)
      );
      setFiles((prev) =>
        prev.filter((file) => !authFileMatchesDeletedIdentifiers(file, deletedSet))
      );
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
    [files]
  );

  const applyLocalFilePatch = useCallback((name: string, patch: Partial<AuthFileItem>) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setFiles((prev) =>
      prev.map((file) =>
        file.name === trimmedName
          ? {
              ...file,
              ...patch,
            }
          : file
      )
    );
  }, []);

  useEffect(() => {
    if (selectedFiles.size === 0) return;
    const existingNames = new Set(files.map((file) => file.name));
    setSelectedFiles((prev) => {
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
  }, [files, selectedFiles.size]);

  const loadFiles = useCallback(async () => {
    if (loadFilesInFlightRef.current) {
      await loadFilesInFlightRef.current;
      return;
    }

    const request = (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await authFilesApi.list({ codexSubscription: 'cache' });
        setFiles(data?.files || []);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    })();

    loadFilesInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (loadFilesInFlightRef.current === request) {
        loadFilesInFlightRef.current = null;
      }
    }
  }, [t]);

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
        const successCount = result.uploaded;

        if (successCount > 0) {
          const suffix = validFiles.length > 1 ? ` (${successCount}/${validFiles.length})` : '';
          showNotification(
            `${t('auth_files.upload_success')}${suffix}`,
            result.failed.length ? 'warning' : 'success'
          );
          await loadFiles();
          await refreshKeyStats();
        }

        if (result.failed.length > 0) {
          const details = result.failed.map((item) => `${item.name}: ${item.error}`).join('; ');
          showNotification(`${t('notification.upload_failed')}: ${details}`, 'error');
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      } finally {
        setUploading(false);
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
          const file = files.find((item) => item.name === name);
          const result = await authFilesApi.deleteFiles([
            file ? getAuthFileDeleteTarget(file) : name,
          ]);
          showNotification(t('auth_files.delete_success'), 'success');
          applyDeletedFiles(result.files.length > 0 ? result.files : [name]);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        } finally {
          setDeleting(null);
        }
      };

      void runDelete();
    },
    [applyDeletedFiles, files, showNotification, t]
  );

  const handleDeleteAll = useCallback(
    (deleteAllOptions: DeleteAllOptions) => {
      const { filter, problemOnly, onResetFilterToAll, onResetProblemOnly } = deleteAllOptions;
      const matchDisplayFilter = deleteAllOptions.matchDisplayFilter;
      const isFiltered = filter !== 'all';
      const isProblemOnly = problemOnly === true;
      const hasScopedDisplayFilter = typeof matchDisplayFilter === 'function';
      const typeLabel = isFiltered ? getTypeLabel(t, filter) : t('auth_files.filter_all');
      const runDeleteAll = async () => {
        setDeletingAll(true);
        try {
          if (!isFiltered && !isProblemOnly && !hasScopedDisplayFilter) {
            await authFilesApi.deleteAll();
            showNotification(t('auth_files.delete_all_success'), 'success');
            setFiles((prev) => prev.filter((file) => isRuntimeOnlyAuthFile(file)));
            deselectAll();
          } else {
            const filesToDelete = files.filter((file) => {
              if (isRuntimeOnlyAuthFile(file)) return false;
              if (isFiltered && file.type !== filter) return false;
              if (isProblemOnly && !hasAuthFileStatusMessage(file)) return false;
              if (matchDisplayFilter && !matchDisplayFilter(file)) return false;
              return true;
            });

            if (filesToDelete.length === 0) {
              const emptyMessage = isProblemOnly
                ? isFiltered
                  ? t('auth_files.delete_problem_filtered_none', { type: typeLabel })
                  : t('auth_files.delete_problem_none')
                : t('auth_files.delete_filtered_none', { type: typeLabel });
              showNotification(emptyMessage, 'info');
              setDeletingAll(false);
              return;
            }

            const result = await authFilesApi.deleteFiles(
              filesToDelete.map(getAuthFileDeleteTarget)
            );
            const success = result.deleted;
            const failed = result.failed.length;

            applyDeletedFiles(result.files);

            if (failed === 0 && isProblemOnly) {
              showNotification(
                isFiltered
                  ? t('auth_files.delete_problem_filtered_success', {
                      count: success,
                      type: typeLabel,
                    })
                  : t('auth_files.delete_problem_success', { count: success }),
                'success'
              );
            } else if (failed === 0) {
              showNotification(
                t('auth_files.delete_filtered_success', { count: success, type: typeLabel }),
                'success'
              );
            } else if (isProblemOnly) {
              showNotification(
                isFiltered
                  ? t('auth_files.delete_problem_filtered_partial', {
                      success,
                      failed,
                      type: typeLabel,
                    })
                  : t('auth_files.delete_problem_partial', { success, failed }),
                'warning'
              );
            } else {
              showNotification(
                t('auth_files.delete_filtered_partial', { success, failed, type: typeLabel }),
                'warning'
              );
            }

            if (isFiltered) {
              onResetFilterToAll();
            }
            if (isProblemOnly) {
              onResetProblemOnly();
            }
          }
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        } finally {
          setDeletingAll(false);
        }
      };

      void runDeleteAll();
    },
    [applyDeletedFiles, deselectAll, files, showNotification, t]
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

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) => prev.map((f) => (f.name === name ? { ...f, disabled: nextDisabled } : f)));

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: res.disabled } : f))
        );
        showNotification(
          enabled
            ? t('auth_files.status_enabled_success', { name })
            : t('auth_files.status_disabled_success', { name }),
          'success'
        );
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        setFiles((prev) =>
          prev.map((f) => (f.name === name ? { ...f, disabled: previousDisabled } : f))
        );
        showNotification(`${t('notification.update_failed')}: ${errorMessage}`, 'error');
      } finally {
        setStatusUpdating((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [showNotification, t]
  );

  const batchSetStatus = useCallback(
    async (names: string[], enabled: boolean) => {
      if (batchStatusPendingRef.current) return;

      const uniqueNames = Array.from(new Set(names));
      if (uniqueNames.length === 0) return;
      if (uniqueNames.some((name) => statusUpdating[name] === true)) return;

      const originalDisabled = new Map(
        files
          .filter((file) => uniqueNames.includes(file.name))
          .map((file) => [file.name, file.disabled === true])
      );
      const targetNames = new Set(originalDisabled.keys());
      const targetNameList = Array.from(targetNames);
      if (targetNameList.length === 0) return;

      const nextDisabled = !enabled;

      batchStatusPendingRef.current = true;
      setBatchStatusUpdating(true);
      setStatusUpdating((prev) => {
        const next = { ...prev };
        targetNameList.forEach((name) => {
          next[name] = true;
        });
        return next;
      });
      setFiles((prev) =>
        prev.map((file) =>
          targetNames.has(file.name) ? { ...file, disabled: nextDisabled } : file
        )
      );

      try {
        const results = await Promise.allSettled(
          targetNameList.map((name) => authFilesApi.setStatus(name, nextDisabled))
        );

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

        setFiles((prev) =>
          prev.map((file) => {
            if (failedNames.has(file.name)) {
              return { ...file, disabled: originalDisabled.get(file.name) === true };
            }
            if (confirmedDisabled.has(file.name)) {
              return { ...file, disabled: confirmedDisabled.get(file.name) };
            }
            return file;
          })
        );

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

        deselectAll();
      } finally {
        batchStatusPendingRef.current = false;
        setBatchStatusUpdating(false);
        setStatusUpdating((prev) => {
          const next = { ...prev };
          targetNameList.forEach((name) => {
            delete next[name];
          });
          return next;
        });
      }
    },
    [deselectAll, files, showNotification, statusUpdating, t]
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
          const blob = new Blob([response.data]);
          downloadBlob({ filename: name, blob });
          successCount++;
        } catch {
          failCount++;
        }
      }

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
          const fileByName = new Map(files.map((file) => [file.name, file]));
          const result = await authFilesApi.deleteFiles(
            uniqueNames.map((name) => {
              const file = fileByName.get(name);
              return file ? getAuthFileDeleteTarget(file) : name;
            })
          );
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
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('notification.delete_failed')}: ${errorMessage}`, 'error');
        }
      };

      void runBatchDelete();
    },
    [applyDeletedFiles, files, showNotification, t]
  );

  return {
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
  };
}
