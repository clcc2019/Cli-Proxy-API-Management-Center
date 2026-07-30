import { usageApi } from '@/services/api/usage';
import { useAuthStore } from '@/stores/useAuthStore';
import { loadModelPrices, saveModelPrices, type ModelPrice } from '@/utils/usage';

type SetModelPrices = (prices: Record<string, ModelPrice>) => void;

const MODEL_PRICES_STALE_TIME_MS = 240_000;

interface ModelPricesCacheEntry {
  prices: Record<string, ModelPrice>;
  fetchedAt: number;
}

let inFlightModelPricesRequest: {
  scopeKey: string;
  promise: Promise<Record<string, ModelPrice>>;
} | null = null;

const modelPricesCache = new Map<string, ModelPricesCacheEntry>();

const getModelPricesScopeKey = () => {
  const { apiBase = '', managementKey = '' } = useAuthStore.getState();
  return `${apiBase}::${managementKey}`;
};

const hasModelPrices = (prices: Record<string, ModelPrice>) => Object.keys(prices).length > 0;

const applyModelPrices = (prices: Record<string, ModelPrice>, setModelPrices: SetModelPrices) => {
  if (!hasModelPrices(prices)) return;
  setModelPrices(prices);
  saveModelPrices(prices);
};

const loadRemoteModelPrices = (scopeKey: string) => {
  const cached = modelPricesCache.get(scopeKey);
  if (cached && Date.now() - cached.fetchedAt < MODEL_PRICES_STALE_TIME_MS) {
    return Promise.resolve(cached.prices);
  }

  if (inFlightModelPricesRequest?.scopeKey === scopeKey) {
    return inFlightModelPricesRequest.promise;
  }

  const promise = usageApi
    .getModelPrices()
    .then((prices) => {
      modelPricesCache.set(scopeKey, { prices, fetchedAt: Date.now() });
      return prices;
    })
    .finally(() => {
      if (inFlightModelPricesRequest?.promise === promise) {
        inFlightModelPricesRequest = null;
      }
    });

  inFlightModelPricesRequest = { scopeKey, promise };
  return promise;
};

export const primeModelPrices = (setModelPrices: SetModelPrices) => {
  setModelPrices(loadModelPrices());
  const scopeKey = getModelPricesScopeKey();
  void loadRemoteModelPrices(scopeKey)
    .then((prices) => {
      if (getModelPricesScopeKey() === scopeKey) {
        applyModelPrices(prices, setModelPrices);
      }
    })
    .catch(() => {});
};

export const saveAndSyncModelPrices = (
  prices: Record<string, ModelPrice>,
  setModelPrices: SetModelPrices,
  onSyncError: (error: unknown) => void
) => {
  setModelPrices(prices);
  saveModelPrices(prices);
  modelPricesCache.set(getModelPricesScopeKey(), { prices, fetchedAt: Date.now() });
  void usageApi.updateModelPrices(prices).catch(onSyncError);
};
