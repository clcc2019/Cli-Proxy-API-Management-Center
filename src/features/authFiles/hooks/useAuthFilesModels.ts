import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

type ModelsError = 'unsupported' | null;
const EMPTY_AUTH_FILE_MODELS: AuthFileModelItem[] = [];
const getModelsCacheKey = (scopeKey: string, fileName: string) => `${scopeKey}\u0000${fileName}`;

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

export function useAuthFilesModels(scopeKey = ''): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
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
    setModelsModalOpen(false);
    setModelsLoading(false);
    setModelsList((prev) => (prev.length === 0 ? prev : EMPTY_AUTH_FILE_MODELS));
    setModelsError(null);
  }, [scopeKey]);

  const closeModelsModal = useCallback(() => {
    modelsRequestSeqRef.current += 1;
    setModelsModalOpen((prev) => (prev ? false : prev));
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      const requestSeq = modelsRequestSeqRef.current + 1;
      modelsRequestSeqRef.current = requestSeq;
      const fileType = item.type || '';
      const cacheKey = getModelsCacheKey(scopeKey, item.name);
      const cached = modelsCacheRef.current.get(cacheKey);
      setModelsFileName((prev) => (prev === item.name ? prev : item.name));
      setModelsFileType((prev) => (prev === fileType ? prev : fileType));
      setModelsError((prev) => (prev === null ? prev : null));
      setModelsModalOpen((prev) => (prev ? prev : true));

      if (cached) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        setModelsList((prev) => (prev === cached ? prev : cached));
        setModelsLoading((prev) => (prev ? false : prev));
        return;
      }

      if (unsupportedModelsRef.current.has(cacheKey)) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        setModelsList((prev) => (prev.length === 0 ? prev : EMPTY_AUTH_FILE_MODELS));
        setModelsError('unsupported');
        setModelsLoading((prev) => (prev ? false : prev));
        return;
      }

      setModelsList((prev) => (prev.length === 0 ? prev : EMPTY_AUTH_FILE_MODELS));
      setModelsLoading((prev) => (prev ? prev : true));
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
        setModelsList((prev) => (prev === models ? prev : models));
      } catch (err) {
        if (!mountedRef.current || modelsRequestSeqRef.current !== requestSeq) return;
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          unsupportedModelsRef.current.add(cacheKey);
          setModelsError('unsupported');
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        if (inFlightModelsRef.current.get(cacheKey) === request) {
          inFlightModelsRef.current.delete(cacheKey);
        }
        if (mountedRef.current && modelsRequestSeqRef.current === requestSeq) {
          setModelsLoading(false);
        }
      }
    },
    [scopeKey, showNotification, t]
  );

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  };
}
