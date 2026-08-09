/**
 * 模型列表状态管理（带缓存）
 */

import { create } from 'zustand';
import { modelsApi } from '@/services/api/models';
import { CACHE_EXPIRY_MS } from '@/utils/constants';
import type { ModelInfo } from '@/utils/models';
import { registerSessionCleanup } from './sessionCleanup';

interface ModelsCache {
  data: ModelInfo[];
  timestamp: number;
  apiBase: string;
  apiKey: string;
}

interface ModelsState {
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  cache: ModelsCache | null;

  fetchModels: (apiBase: string, apiKey?: string, forceRefresh?: boolean) => Promise<ModelInfo[]>;
  clearCache: () => void;
  isCacheValid: (apiBase: string, apiKey?: string) => boolean;
}

const inFlightModelRequests = new Map<string, Promise<ModelInfo[]>>();
let modelRequestGeneration = 0;
let modelsCleanupRegistered = false;

const ensureModelsCleanupRegistered = () => {
  if (modelsCleanupRegistered) return;
  modelsCleanupRegistered = true;
  registerSessionCleanup('models', () => {
    useModelsStore.getState().clearCache();
  });
};

const getModelsRequestKey = (apiBase: string, apiKey: string) => `${apiBase}\u0000${apiKey}`;

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  loading: false,
  error: null,
  cache: null,

  fetchModels: async (apiBase, apiKey, forceRefresh = false) => {
    ensureModelsCleanupRegistered();
    const { cache, isCacheValid } = get();
    const apiKeyScope = apiKey?.trim() || '';

    // 检查缓存
    if (!forceRefresh && isCacheValid(apiBase, apiKeyScope) && cache) {
      set({ models: cache.data, loading: false, error: null });
      return cache.data;
    }

    const requestKey = getModelsRequestKey(apiBase, apiKeyScope);
    const existingRequest = inFlightModelRequests.get(requestKey);
    if (existingRequest) {
      return existingRequest;
    }

    set({ loading: true, error: null });
    const requestGeneration = modelRequestGeneration;

    const request = (async () => {
      try {
        const list = await modelsApi.fetchModels(
          apiBase,
          apiKeyScope || undefined,
          {},
          forceRefresh
        );
        const now = Date.now();

        if (requestGeneration === modelRequestGeneration) {
          set({
            models: list,
            loading: false,
            cache: { data: list, timestamp: now, apiBase, apiKey: apiKeyScope },
          });
        }

        return list;
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Failed to fetch models';
        if (requestGeneration === modelRequestGeneration) {
          set({
            error: message,
            loading: false,
            models: [],
          });
        }
        throw error;
      }
    })();

    inFlightModelRequests.set(requestKey, request);
    try {
      return await request;
    } finally {
      if (inFlightModelRequests.get(requestKey) === request) {
        inFlightModelRequests.delete(requestKey);
      }
    }
  },

  clearCache: () => {
    modelRequestGeneration += 1;
    inFlightModelRequests.clear();
    set({ cache: null, models: [], loading: false, error: null });
  },

  isCacheValid: (apiBase, apiKey) => {
    const { cache } = get();
    if (!cache) return false;
    if (cache.apiBase !== apiBase) return false;
    const apiKeyScope = apiKey?.trim() || '';
    if ((cache.apiKey || '') !== apiKeyScope) return false;
    return Date.now() - cache.timestamp < CACHE_EXPIRY_MS;
  },
}));
