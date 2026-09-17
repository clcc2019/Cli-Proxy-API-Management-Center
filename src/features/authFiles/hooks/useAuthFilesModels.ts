import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

type ModelsError = 'unsupported' | null;
const EMPTY_AUTH_FILE_MODELS: AuthFileModelItem[] = [];
const getModelsCacheKey = (scopeKey: string, fileName: string) => `${scopeKey}\u0000${fileName}`;

type ModelsState = {
  scopeKey: string;
  open: boolean;
  loading: boolean;
  list: AuthFileModelItem[];
  fileName: string;
  fileType: string;
  error: ModelsError;
};

const createModelsState = (scopeKey: string): ModelsState => ({
  scopeKey,
  open: false,
  loading: false,
  list: EMPTY_AUTH_FILE_MODELS,
  fileName: '',
  fileType: '',
  error: null,
});

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useAuthFilesModels(scopeKey = '', onDismiss?: () => void): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsState, setModelsState] = useState<ModelsState>(() => createModelsState(scopeKey));
  const activeModelsState =
    modelsState.scopeKey === scopeKey ? modelsState : createModelsState(scopeKey);
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());
  const unsupportedModelsRef = useRef<Set<string>>(new Set());
  const inFlightModelsRef = useRef<Map<string, Promise<AuthFileModelItem[]>>>(new Map());
  const mountedRef = useRef(true);
  const modelsRequestSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      modelsRequestSeqRef.current += 1;
    };
  }, []);

  useEffect(() => {
    modelsRequestSeqRef.current += 1;
    modelsCacheRef.current.clear();
    unsupportedModelsRef.current.clear();
    inFlightModelsRef.current.clear();
  }, [scopeKey]);

  const closeModelsModal = useCallback(() => {
    modelsRequestSeqRef.current += 1;
    setModelsState((prev) =>
      prev.scopeKey === scopeKey && prev.open ? { ...prev, open: false } : prev
    );
    onDismiss?.();
  }, [onDismiss, scopeKey]);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      const requestSeq = modelsRequestSeqRef.current + 1;
      modelsRequestSeqRef.current = requestSeq;
      const fileType = item.type || '';
      const cacheKey = getModelsCacheKey(scopeKey, item.name);
      const cached = modelsCacheRef.current.get(cacheKey);
      setModelsState((prev) => {
        const current = prev.scopeKey === scopeKey ? prev : createModelsState(scopeKey);
        if (
          current.open &&
          current.fileName === item.name &&
          current.fileType === fileType &&
          current.error === null
        ) {
          return current;
        }
        return {
          ...current,
          open: true,
          fileName: item.name,
          fileType,
          error: null,
        };
      });

      if (cached) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        setModelsState((prev) =>
          prev.scopeKey !== scopeKey || (prev.list === cached && !prev.loading)
            ? prev
            : { ...prev, list: cached, loading: false }
        );
        return;
      }

      if (unsupportedModelsRef.current.has(cacheKey)) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        setModelsState((prev) =>
          prev.scopeKey !== scopeKey ||
          (prev.list === EMPTY_AUTH_FILE_MODELS && prev.error === 'unsupported' && !prev.loading)
            ? prev
            : { ...prev, list: EMPTY_AUTH_FILE_MODELS, error: 'unsupported', loading: false }
        );
        return;
      }

      setModelsState((prev) => {
        if (prev.scopeKey !== scopeKey) return prev;
        if (prev.list === EMPTY_AUTH_FILE_MODELS && prev.loading) return prev;
        return { ...prev, list: EMPTY_AUTH_FILE_MODELS, loading: true };
      });
      const pendingRequest = inFlightModelsRef.current.get(cacheKey);
      const request = pendingRequest ?? authFilesApi.getModelsForAuthFile(item.name);
      if (!pendingRequest) {
        inFlightModelsRef.current.set(cacheKey, request);
      }
      try {
        const models = await request;
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        modelsCacheRef.current.set(cacheKey, models);
        unsupportedModelsRef.current.delete(cacheKey);
        setModelsState((prev) =>
          prev.scopeKey !== scopeKey || (prev.list === models && !prev.loading)
            ? prev
            : { ...prev, list: models, error: null, loading: false }
        );
      } catch (err) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          unsupportedModelsRef.current.add(cacheKey);
          setModelsState((prev) =>
            prev.scopeKey !== scopeKey
              ? prev
              : { ...prev, list: EMPTY_AUTH_FILE_MODELS, error: 'unsupported', loading: false }
          );
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        if (inFlightModelsRef.current.get(cacheKey) === request) {
          inFlightModelsRef.current.delete(cacheKey);
        }
        if (mountedRef.current && modelsRequestSeqRef.current === requestSeq) {
          setModelsState((prev) =>
            prev.scopeKey === scopeKey && prev.loading ? { ...prev, loading: false } : prev
          );
        }
      }
    },
    [scopeKey, showNotification, t]
  );

  return {
    modelsModalOpen: activeModelsState.open,
    modelsLoading: activeModelsState.loading,
    modelsList: activeModelsState.list,
    modelsFileName: activeModelsState.fileName,
    modelsFileType: activeModelsState.fileType,
    modelsError: activeModelsState.error,
    showModels,
    closeModelsModal,
  };
}
