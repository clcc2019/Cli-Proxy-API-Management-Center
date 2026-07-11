import { usageApi } from '@/services/api/usage';
import { loadModelPrices, saveModelPrices, type ModelPrice } from '@/utils/usage';

type SetModelPrices = (prices: Record<string, ModelPrice>) => void;

const hasModelPrices = (prices: Record<string, ModelPrice>) => Object.keys(prices).length > 0;

const applyModelPrices = (
  prices: Record<string, ModelPrice>,
  setModelPrices: SetModelPrices
) => {
  if (!hasModelPrices(prices)) return;
  setModelPrices(prices);
  saveModelPrices(prices);
};

export const primeModelPrices = (setModelPrices: SetModelPrices) => {
  setModelPrices(loadModelPrices());
  void usageApi
    .getModelPrices()
    .then((prices) => applyModelPrices(prices, setModelPrices))
    .catch(() => {});
};

export const saveAndSyncModelPrices = (
  prices: Record<string, ModelPrice>,
  setModelPrices: SetModelPrices,
  onSyncError: (error: unknown) => void
) => {
  setModelPrices(prices);
  saveModelPrices(prices);
  void usageApi.updateModelPrices(prices).catch(onSyncError);
};
