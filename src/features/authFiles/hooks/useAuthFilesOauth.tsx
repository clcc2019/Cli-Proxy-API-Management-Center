import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, OAuthModelAliasEntry, OAuthReasoningEffort } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { normalizeProviderKey } from '@/features/authFiles/constants';

type UnsupportedError = 'unsupported' | null;
type ViewMode = 'diagram' | 'list';
const EMPTY_PROVIDER_LIST: string[] = [];

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const areRecordKeysEqual = <T,>(left: Record<string, T>, right: Record<string, T>): boolean => {
  if (left === right) return true;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right);
};

const areExcludedRecordsEqual = (
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean => {
  if (!areRecordKeysEqual(left, right)) return false;
  return Object.keys(left).every((key) => areStringArraysEqual(left[key] ?? [], right[key] ?? []));
};

const areReasoningEffortsEqual = (
  left?: OAuthReasoningEffort,
  right?: OAuthReasoningEffort
): boolean => {
  if (left === right) return true;
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left?.[key] === right?.[key])
  );
};

const areModelAliasEntriesEqual = (
  left: OAuthModelAliasEntry[],
  right: OAuthModelAliasEntry[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      entry.name === other?.name &&
      entry.alias === other.alias &&
      entry.fork === other.fork &&
      areReasoningEffortsEqual(entry.reasoningEffort, other.reasoningEffort)
    );
  });
};

const areModelAliasRecordsEqual = (
  left: Record<string, OAuthModelAliasEntry[]>,
  right: Record<string, OAuthModelAliasEntry[]>
): boolean => {
  if (!areRecordKeysEqual(left, right)) return false;
  return Object.keys(left).every((key) =>
    areModelAliasEntriesEqual(left[key] ?? [], right[key] ?? [])
  );
};

const areAuthFileModelItemsEqual = (
  left: AuthFileModelItem[],
  right: AuthFileModelItem[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other?.id &&
      item.display_name === other.display_name &&
      item.type === other.type &&
      item.owned_by === other.owned_by
    );
  });
};

const areProviderModelsEqual = (
  left: Record<string, AuthFileModelItem[]>,
  right: Record<string, AuthFileModelItem[]>
): boolean => {
  if (!areRecordKeysEqual(left, right)) return false;
  return Object.keys(left).every((key) =>
    areAuthFileModelItemsEqual(left[key] ?? [], right[key] ?? [])
  );
};

export type UseAuthFilesOauthResult = {
  excluded: Record<string, string[]>;
  excludedError: UnsupportedError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  modelAliasError: UnsupportedError;
  allProviderModels: Record<string, AuthFileModelItem[]>;
  providerList: string[];
  loadExcluded: () => Promise<void>;
  loadModelAlias: () => Promise<void>;
  deleteExcluded: (provider: string) => void;
  deleteModelAlias: (provider: string) => void;
  handleMappingUpdate: (provider: string, sourceModel: string, newAlias: string) => Promise<void>;
  handleDeleteLink: (provider: string, sourceModel: string, alias: string) => void;
  handleToggleFork: (
    provider: string,
    sourceModel: string,
    alias: string,
    fork: boolean
  ) => Promise<void>;
  handleRenameAlias: (oldAlias: string, newAlias: string) => Promise<void>;
  handleDeleteAlias: (aliasName: string) => void;
};

export type UseAuthFilesOauthOptions = {
  viewMode: ViewMode;
  files: AuthFileItem[];
  providerTypes?: string[];
};

export function useAuthFilesOauth(options: UseAuthFilesOauthOptions): UseAuthFilesOauthResult {
  const { viewMode, files, providerTypes = [] } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<UnsupportedError>(null);
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [modelAliasError, setModelAliasError] = useState<UnsupportedError>(null);
  const [allProviderModels, setAllProviderModels] = useState<Record<string, AuthFileModelItem[]>>(
    {}
  );

  const excludedUnsupportedRef = useRef(false);
  const mappingsUnsupportedRef = useRef(false);
  const mountedRef = useRef(true);
  const excludedLoadSeqRef = useRef(0);
  const modelAliasLoadSeqRef = useRef(0);
  const providerListRef = useRef<string[]>(EMPTY_PROVIDER_LIST);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      excludedLoadSeqRef.current += 1;
      modelAliasLoadSeqRef.current += 1;
    };
  }, []);

  const shouldReadFilesForProviderList = viewMode === 'diagram' && providerTypes.length === 0;
  const fileProviderTypes = useMemo(() => {
    if (!shouldReadFilesForProviderList) return EMPTY_PROVIDER_LIST;

    const providers = new Set<string>();
    files.forEach((file) => {
      if (typeof file.type === 'string') {
        const key = file.type.trim().toLowerCase();
        if (key) providers.add(key);
      }
      if (typeof file.provider === 'string') {
        const key = file.provider.trim().toLowerCase();
        if (key) providers.add(key);
      }
    });
    return Array.from(providers);
  }, [files, shouldReadFilesForProviderList]);

  const computedProviderList = useMemo(() => {
    if (viewMode !== 'diagram') return EMPTY_PROVIDER_LIST;

    const providers = new Set<string>();

    Object.keys(modelAlias).forEach((provider) => {
      const key = provider.trim().toLowerCase();
      if (key) providers.add(key);
    });

    providerTypes.forEach((provider) => {
      const key = provider.trim().toLowerCase();
      if (key && key !== 'all') providers.add(key);
    });

    fileProviderTypes.forEach((provider) => {
      if (provider) providers.add(provider);
    });
    return Array.from(providers).sort();
  }, [fileProviderTypes, modelAlias, providerTypes, viewMode]);
  const providerList = areStringArraysEqual(providerListRef.current, computedProviderList)
    ? providerListRef.current
    : computedProviderList;
  providerListRef.current = providerList;

  useEffect(() => {
    if (viewMode !== 'diagram') return;

    let cancelled = false;

    const loadAllModels = async () => {
      if (providerList.length === 0) {
        if (!cancelled) {
          setAllProviderModels((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        }
        return;
      }

      const results = await Promise.all(
        providerList.map(async (provider) => {
          try {
            const models = await authFilesApi.getModelDefinitions(provider);
            return { provider, models };
          } catch {
            return { provider, models: [] as AuthFileModelItem[] };
          }
        })
      );

      if (cancelled) return;

      const nextModels: Record<string, AuthFileModelItem[]> = {};
      results.forEach(({ provider, models }) => {
        if (models.length > 0) {
          nextModels[provider] = models;
        }
      });

      setAllProviderModels((prev) =>
        areProviderModelsEqual(prev, nextModels) ? prev : nextModels
      );
    };

    void loadAllModels();

    return () => {
      cancelled = true;
    };
  }, [providerList, viewMode]);

  const loadExcluded = useCallback(async () => {
    const requestSeq = excludedLoadSeqRef.current + 1;
    excludedLoadSeqRef.current = requestSeq;
    try {
      const res = await authFilesApi.getOauthExcludedModels();
      if (!mountedRef.current || excludedLoadSeqRef.current !== requestSeq) return;
      excludedUnsupportedRef.current = false;
      const nextExcluded = res || {};
      setExcluded((prev) => (areExcludedRecordsEqual(prev, nextExcluded) ? prev : nextExcluded));
      setExcludedError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || excludedLoadSeqRef.current !== requestSeq) return;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setExcluded((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setExcludedError('unsupported');
        if (!excludedUnsupportedRef.current) {
          excludedUnsupportedRef.current = true;
          showNotification(t('oauth_excluded.upgrade_required'), 'warning');
        }
        return;
      }
      // 静默失败
    }
  }, [showNotification, t]);

  const loadModelAlias = useCallback(async () => {
    const requestSeq = modelAliasLoadSeqRef.current + 1;
    modelAliasLoadSeqRef.current = requestSeq;
    try {
      const res = await authFilesApi.getOauthModelAlias();
      if (!mountedRef.current || modelAliasLoadSeqRef.current !== requestSeq) return;
      mappingsUnsupportedRef.current = false;
      const nextModelAlias = res || {};
      setModelAlias((prev) =>
        areModelAliasRecordsEqual(prev, nextModelAlias) ? prev : nextModelAlias
      );
      setModelAliasError(null);
    } catch (err: unknown) {
      if (!mountedRef.current || modelAliasLoadSeqRef.current !== requestSeq) return;
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status?: unknown }).status
          : undefined;

      if (status === 404) {
        setModelAlias((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        setModelAliasError('unsupported');
        if (!mappingsUnsupportedRef.current) {
          mappingsUnsupportedRef.current = true;
          showNotification(t('oauth_model_alias.upgrade_required'), 'warning');
        }
        return;
      }
      // 静默失败
    }
  }, [showNotification, t]);

  const deleteExcluded = useCallback(
    (provider: string) => {
      const runDeleteExcluded = async () => {
        const providerKey = normalizeProviderKey(provider);
        if (!providerKey) {
          showNotification(t('oauth_excluded.provider_required'), 'error');
          return;
        }
        try {
          await authFilesApi.deleteOauthExcludedEntry(providerKey);
          await loadExcluded();
          showNotification(t('oauth_excluded.delete_success'), 'success');
        } catch (err: unknown) {
          try {
            const current = await authFilesApi.getOauthExcludedModels();
            const next: Record<string, string[]> = {};
            Object.entries(current).forEach(([key, models]) => {
              if (normalizeProviderKey(key) === providerKey) return;
              next[key] = models;
            });
            await authFilesApi.replaceOauthExcludedModels(next);
            await loadExcluded();
            showNotification(t('oauth_excluded.delete_success'), 'success');
          } catch (fallbackErr: unknown) {
            const errorMessage =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : err instanceof Error
                  ? err.message
                  : '';
            showNotification(`${t('oauth_excluded.delete_failed')}: ${errorMessage}`, 'error');
          }
        }
      };

      void runDeleteExcluded();
    },
    [loadExcluded, showNotification, t]
  );

  const deleteModelAlias = useCallback(
    (provider: string) => {
      const runDeleteModelAlias = async () => {
        try {
          await authFilesApi.deleteOauthModelAlias(provider);
          await loadModelAlias();
          showNotification(t('oauth_model_alias.delete_success'), 'success');
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('oauth_model_alias.delete_failed')}: ${errorMessage}`, 'error');
        }
      };

      void runDeleteModelAlias();
    },
    [loadModelAlias, showNotification, t]
  );

  const handleMappingUpdate = useCallback(
    async (provider: string, sourceModel: string, newAlias: string) => {
      if (!provider || !sourceModel || !newAlias) return;
      const normalizedProvider = normalizeProviderKey(provider);
      if (!normalizedProvider) return;

      const providerKey = Object.keys(modelAlias).find(
        (key) => normalizeProviderKey(key) === normalizedProvider
      );
      const currentMappings = (providerKey ? modelAlias[providerKey] : null) ?? [];

      const nameTrim = sourceModel.trim();
      const aliasTrim = newAlias.trim();
      const nameKey = nameTrim.toLowerCase();
      const aliasKey = aliasTrim.toLowerCase();

      if (
        currentMappings.some(
          (m) =>
            (m.name ?? '').trim().toLowerCase() === nameKey &&
            (m.alias ?? '').trim().toLowerCase() === aliasKey
        )
      ) {
        return;
      }

      const nextMappings: OAuthModelAliasEntry[] = [
        ...currentMappings,
        { name: nameTrim, alias: aliasTrim, fork: true },
      ];

      try {
        await authFilesApi.saveOauthModelAlias(normalizedProvider, nextMappings);
        await loadModelAlias();
        showNotification(t('oauth_model_alias.save_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('oauth_model_alias.save_failed')}: ${errorMessage}`, 'error');
      }
    },
    [loadModelAlias, modelAlias, showNotification, t]
  );

  const handleDeleteLink = useCallback(
    (provider: string, sourceModel: string, alias: string) => {
      const nameTrim = sourceModel.trim();
      const aliasTrim = alias.trim();
      if (!provider || !nameTrim || !aliasTrim) return;

      const runDeleteLink = async () => {
        const normalizedProvider = normalizeProviderKey(provider);
        const providerKey = Object.keys(modelAlias).find(
          (key) => normalizeProviderKey(key) === normalizedProvider
        );
        const currentMappings = (providerKey ? modelAlias[providerKey] : null) ?? [];
        const nameKey = nameTrim.toLowerCase();
        const aliasKey = aliasTrim.toLowerCase();
        const nextMappings = currentMappings.filter(
          (m) =>
            (m.name ?? '').trim().toLowerCase() !== nameKey ||
            (m.alias ?? '').trim().toLowerCase() !== aliasKey
        );
        if (nextMappings.length === currentMappings.length) return;

        try {
          if (nextMappings.length === 0) {
            await authFilesApi.deleteOauthModelAlias(normalizedProvider);
          } else {
            await authFilesApi.saveOauthModelAlias(normalizedProvider, nextMappings);
          }
          await loadModelAlias();
          showNotification(t('oauth_model_alias.save_success'), 'success');
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : '';
          showNotification(`${t('oauth_model_alias.save_failed')}: ${errorMessage}`, 'error');
        }
      };

      void runDeleteLink();
    },
    [loadModelAlias, modelAlias, showNotification, t]
  );

  const handleToggleFork = useCallback(
    async (provider: string, sourceModel: string, alias: string, fork: boolean) => {
      const normalizedProvider = normalizeProviderKey(provider);
      if (!normalizedProvider) return;

      const providerKey = Object.keys(modelAlias).find(
        (key) => normalizeProviderKey(key) === normalizedProvider
      );
      const currentMappings = (providerKey ? modelAlias[providerKey] : null) ?? [];
      const nameKey = sourceModel.trim().toLowerCase();
      const aliasKey = alias.trim().toLowerCase();
      let changed = false;

      const nextMappings = currentMappings.map((m) => {
        const mName = (m.name ?? '').trim().toLowerCase();
        const mAlias = (m.alias ?? '').trim().toLowerCase();
        if (mName === nameKey && mAlias === aliasKey) {
          changed = true;
          return fork ? { ...m, fork: true } : { ...m, fork: undefined };
        }
        return m;
      });

      if (!changed) return;

      try {
        await authFilesApi.saveOauthModelAlias(normalizedProvider, nextMappings);
        await loadModelAlias();
        showNotification(t('oauth_model_alias.save_success'), 'success');
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : '';
        showNotification(`${t('oauth_model_alias.save_failed')}: ${errorMessage}`, 'error');
      }
    },
    [loadModelAlias, modelAlias, showNotification, t]
  );

  const handleRenameAlias = useCallback(
    async (oldAlias: string, newAlias: string) => {
      const oldTrim = oldAlias.trim();
      const newTrim = newAlias.trim();
      if (!oldTrim || !newTrim || oldTrim === newTrim) return;

      const oldKey = oldTrim.toLowerCase();
      const providersToUpdate = Object.entries(modelAlias).filter(([_, mappings]) =>
        mappings.some((m) => (m.alias ?? '').trim().toLowerCase() === oldKey)
      );

      if (providersToUpdate.length === 0) return;

      let hadFailure = false;
      let failureMessage = '';

      try {
        const results = await Promise.allSettled(
          providersToUpdate.map(([provider, mappings]) => {
            const nextMappings = mappings.map((m) =>
              (m.alias ?? '').trim().toLowerCase() === oldKey ? { ...m, alias: newTrim } : m
            );
            return authFilesApi.saveOauthModelAlias(provider, nextMappings);
          })
        );

        const failures = results.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );

        if (failures.length > 0) {
          hadFailure = true;
          const reason = failures[0].reason;
          failureMessage = reason instanceof Error ? reason.message : String(reason ?? '');
        }
      } finally {
        await loadModelAlias();
      }

      if (hadFailure) {
        showNotification(
          failureMessage
            ? `${t('oauth_model_alias.save_failed')}: ${failureMessage}`
            : t('oauth_model_alias.save_failed'),
          'error'
        );
      } else {
        showNotification(t('oauth_model_alias.save_success'), 'success');
      }
    },
    [loadModelAlias, modelAlias, showNotification, t]
  );

  const handleDeleteAlias = useCallback(
    (aliasName: string) => {
      const aliasTrim = aliasName.trim();
      if (!aliasTrim) return;
      const aliasKey = aliasTrim.toLowerCase();
      const providersToUpdate = Object.entries(modelAlias).filter(([_, mappings]) =>
        mappings.some((m) => (m.alias ?? '').trim().toLowerCase() === aliasKey)
      );

      if (providersToUpdate.length === 0) return;

      const runDeleteAlias = async () => {
        let hadFailure = false;
        let failureMessage = '';

        try {
          const results = await Promise.allSettled(
            providersToUpdate.map(([provider, mappings]) => {
              const nextMappings = mappings.filter(
                (m) => (m.alias ?? '').trim().toLowerCase() !== aliasKey
              );
              if (nextMappings.length === 0) {
                return authFilesApi.deleteOauthModelAlias(provider);
              }
              return authFilesApi.saveOauthModelAlias(provider, nextMappings);
            })
          );

          const failures = results.filter(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
          );

          if (failures.length > 0) {
            hadFailure = true;
            const reason = failures[0].reason;
            failureMessage = reason instanceof Error ? reason.message : String(reason ?? '');
          }
        } finally {
          await loadModelAlias();
        }

        if (hadFailure) {
          showNotification(
            failureMessage
              ? `${t('oauth_model_alias.delete_failed')}: ${failureMessage}`
              : t('oauth_model_alias.delete_failed'),
            'error'
          );
        } else {
          showNotification(t('oauth_model_alias.delete_success'), 'success');
        }
      };

      void runDeleteAlias();
    },
    [loadModelAlias, modelAlias, showNotification, t]
  );

  return {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    allProviderModels,
    providerList,
    loadExcluded,
    loadModelAlias,
    deleteExcluded,
    deleteModelAlias,
    handleMappingUpdate,
    handleDeleteLink,
    handleToggleFork,
    handleRenameAlias,
    handleDeleteAlias,
  };
}
