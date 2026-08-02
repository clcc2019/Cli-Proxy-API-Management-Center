import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { USAGE_STATS_STALE_TIME_MS, useNotificationStore, useUsageStatsStore } from '@/stores';
import { usageApi } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import { loadModelPrices, type ModelPrice } from '@/utils/usage';
import { primeModelPrices, saveAndSyncModelPrices } from './usageModelPriceUtils';
import {
  appendErrorMessage,
  buildUsageImportMessageOptions,
  buildUsageExportFilename,
  createJsonExportBlob,
  readJsonFile,
} from './usageFileUtils';

export interface UsagePayload {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  apis?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UseUsageDataReturn {
  usage: UsagePayload | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => void;
  loadUsage: () => Promise<void>;
  handleExport: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  importing: boolean;
}

export interface UseUsageDataOptions {
  detailsLimit?: number;
  compactDetails?: boolean;
  includeAggregated?: boolean;
}

export function useUsageData(options: UseUsageDataOptions = {}): UseUsageDataReturn {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const usageSnapshot = useUsageStatsStore((state) => (isCurrentLayer ? state.usage : null));
  const loading = useUsageStatsStore((state) => (isCurrentLayer ? state.loading : false));
  const storeError = useUsageStatsStore((state) => (isCurrentLayer ? state.error : null));
  const lastRefreshedAtTs = useUsageStatsStore((state) =>
    isCurrentLayer ? state.lastRefreshedAt : null
  );
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);
  const isCurrentLayerRef = useRef(isCurrentLayer);
  useLayoutEffect(() => {
    isCurrentLayerRef.current = isCurrentLayer;
  }, [isCurrentLayer]);

  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>(() => loadModelPrices());
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const detailsLimit = options.detailsLimit;
  const compactDetails = options.compactDetails === true;
  const includeAggregated = options.includeAggregated !== false;

  const loadUsage = useCallback(async () => {
    if (!isCurrentLayerRef.current) return;
    await loadUsageStats({
      force: true,
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
      detailsLimit,
      compactDetails,
      includeAggregated,
    });
  }, [compactDetails, detailsLimit, includeAggregated, loadUsageStats]);

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    let active = true;
    void loadUsageStats({
      staleTimeMs: USAGE_STATS_STALE_TIME_MS,
      detailsLimit,
      compactDetails,
      includeAggregated,
    }).catch(() => {});
    primeModelPrices(setModelPrices, {
      hydrateLocal: false,
      shouldApply: () => active && isCurrentLayerRef.current,
    });

    return () => {
      active = false;
    };
  }, [compactDetails, detailsLimit, includeAggregated, isCurrentLayer, loadUsageStats]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const data = await usageApi.exportDetailedUsage(usageSnapshot);
      downloadBlob({
        filename: buildUsageExportFilename('usage-export-details', data),
        blob: createJsonExportBlob(data)
      });
      showNotification(t('usage_stats.export_success'), 'success');
    } catch (err: unknown) {
      showNotification(appendErrorMessage(t('notification.download_failed'), err), 'error');
    } finally {
      setExporting(false);
    }
  }, [showNotification, t, usageSnapshot]);

  const handleImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      setImporting(true);
      try {
        let payload: unknown;
        try {
          payload = await readJsonFile(file);
        } catch {
          showNotification(t('usage_stats.import_invalid'), 'error');
          return;
        }

        const result = await usageApi.importUsage(payload);
        showNotification(
          t('usage_stats.import_success', buildUsageImportMessageOptions(result)),
          'success'
        );
        try {
          await loadUsageStats({
            force: true,
            staleTimeMs: USAGE_STATS_STALE_TIME_MS,
            detailsLimit,
            compactDetails,
            includeAggregated,
          });
        } catch (err: unknown) {
          showNotification(
            appendErrorMessage(t('notification.refresh_failed'), err),
            'error'
          );
        }
      } catch (err: unknown) {
        showNotification(appendErrorMessage(t('notification.upload_failed'), err), 'error');
      } finally {
        setImporting(false);
      }
    },
    [compactDetails, detailsLimit, includeAggregated, loadUsageStats, showNotification, t]
  );

  const handleSetModelPrices = useCallback(
    (prices: Record<string, ModelPrice>) => {
      saveAndSyncModelPrices(prices, setModelPrices, (err) => {
        showNotification(appendErrorMessage(t('notification.save_failed'), err), 'error');
      });
    },
    [showNotification, t]
  );

  const usage = usageSnapshot as UsagePayload | null;
  const error = storeError || '';
  const lastRefreshedAt = useMemo(
    () => (lastRefreshedAtTs ? new Date(lastRefreshedAtTs) : null),
    [lastRefreshedAtTs]
  );

  return {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices: handleSetModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  };
}
