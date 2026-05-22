import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotificationStore } from '@/stores';
import { usageApi, type UsageExportPayload } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import { loadModelPrices, saveModelPrices, type ModelPrice } from '@/utils/usage';
import type { UsageAggregateSnapshot } from '@/types/usageAggregate';

export interface LoadUsageAggregateOptions {
  force?: boolean;
  preferCache?: boolean;
}

export interface UseUsageAggregateDataReturn {
  usage: UsageAggregateSnapshot | null;
  loading: boolean;
  error: string;
  lastRefreshedAt: Date | null;
  modelPrices: Record<string, ModelPrice>;
  setModelPrices: (prices: Record<string, ModelPrice>) => void;
  loadUsage: (options?: LoadUsageAggregateOptions) => Promise<void>;
  handleExport: () => Promise<void>;
  handleExportDetailed: () => Promise<void>;
  handleImport: () => void;
  handleImportChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  importInputRef: React.RefObject<HTMLInputElement | null>;
  exporting: boolean;
  exportingDetailed: boolean;
  importing: boolean;
}

const asAggregateSnapshot = (value: unknown): UsageAggregateSnapshot | null =>
  value && typeof value === 'object' ? (value as UsageAggregateSnapshot) : null;

const AGGREGATE_USAGE_STALE_TIME_MS = 240_000;

interface AggregateUsageCacheEntry {
  snapshot: UsageAggregateSnapshot | null;
  generatedAt: Date | null;
  fetchedAt: number;
}

let aggregateUsageRequestToken = 0;
let inFlightAggregateUsageRequest: {
  id: number;
  scopeKey: string;
  promise: Promise<AggregateUsageCacheEntry>;
} | null = null;

const aggregateUsageCache = new Map<string, AggregateUsageCacheEntry>();

const getUsageScopeKey = () => {
  const { apiBase = '', managementKey = '' } = useAuthStore.getState();
  return `${apiBase}::${managementKey}`;
};

const resolveGeneratedAt = (snapshot: UsageAggregateSnapshot | null) => {
  if (snapshot?.generated_at && !Number.isNaN(Date.parse(snapshot.generated_at))) {
    return new Date(snapshot.generated_at);
  }
  return new Date();
};

const readAggregateUsageCache = (scopeKey = getUsageScopeKey()) =>
  aggregateUsageCache.get(scopeKey);

const hasPrices = (prices: Record<string, ModelPrice>) => Object.keys(prices).length > 0;

const buildExportFilename = (prefix: string, payload: UsageExportPayload) => {
  const exportedAt =
    typeof payload?.exported_at === 'string' ? new Date(payload.exported_at) : new Date();
  const safeTimestamp = Number.isNaN(exportedAt.getTime())
    ? new Date().toISOString()
    : exportedAt.toISOString();
  return `${prefix}-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
};

export function useUsageAggregateData(): UseUsageAggregateDataReturn {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const initialCache = readAggregateUsageCache();
  const [usage, setUsage] = useState<UsageAggregateSnapshot | null>(
    () => initialCache?.snapshot ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(
    () => initialCache?.generatedAt ?? null
  );
  const [modelPrices, setModelPrices] = useState<Record<string, ModelPrice>>({});
  const [exporting, setExporting] = useState(false);
  const [exportingDetailed, setExportingDetailed] = useState(false);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const applyCacheEntry = useCallback((entry: AggregateUsageCacheEntry | undefined) => {
    if (!entry) return;
    setUsage(entry.snapshot);
    setLastRefreshedAt(entry.generatedAt ?? new Date(entry.fetchedAt));
  }, []);

  const loadUsage = useCallback(
    async (options: LoadUsageAggregateOptions = {}) => {
      const scopeKey = getUsageScopeKey();
      const cached = readAggregateUsageCache(scopeKey);
      const force = options.force === true;
      const preferCache = options.preferCache === true;

      if (preferCache && cached) {
        applyCacheEntry(cached);
        const fresh = Date.now() - cached.fetchedAt < AGGREGATE_USAGE_STALE_TIME_MS;
        if (!force && fresh) {
          setError('');
          return;
        }
      }

      if (!force && inFlightAggregateUsageRequest?.scopeKey === scopeKey) {
        setLoading(true);
        setError('');
        try {
          applyCacheEntry(await inFlightAggregateUsageRequest.promise);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (inFlightAggregateUsageRequest && inFlightAggregateUsageRequest.scopeKey !== scopeKey) {
        aggregateUsageRequestToken += 1;
        inFlightAggregateUsageRequest = null;
      }

      setLoading(true);
      setError('');
      const requestId = (aggregateUsageRequestToken += 1);
      const requestPromise = (async (): Promise<AggregateUsageCacheEntry> => {
        const response = await usageApi.getUsageAggregated();
        const snapshot = asAggregateSnapshot(response?.usage ?? response);
        const cacheEntry: AggregateUsageCacheEntry = {
          snapshot,
          generatedAt: resolveGeneratedAt(snapshot),
          fetchedAt: Date.now(),
        };
        aggregateUsageCache.set(scopeKey, cacheEntry);
        return cacheEntry;
      })();

      inFlightAggregateUsageRequest = { id: requestId, scopeKey, promise: requestPromise };

      try {
        const cacheEntry = await requestPromise;
        if (requestId !== aggregateUsageRequestToken) return;
        applyCacheEntry(cacheEntry);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('usage_stats.loading_error');
        if (requestId !== aggregateUsageRequestToken) return;
        setError(message);
        throw err;
      } finally {
        if (inFlightAggregateUsageRequest?.id === requestId) {
          inFlightAggregateUsageRequest = null;
        }
        if (requestId === aggregateUsageRequestToken) {
          setLoading(false);
        }
      }
    },
    [applyCacheEntry, t]
  );

  useEffect(() => {
    void loadUsage({ preferCache: true }).catch(() => {});
    setModelPrices(loadModelPrices());
    void usageApi
      .getModelPrices()
      .then((prices) => {
        if (!hasPrices(prices)) return;
        setModelPrices(prices);
        saveModelPrices(prices);
      })
      .catch(() => {});
  }, [loadUsage]);

  const downloadExport = useCallback(
    async (
      run: () => Promise<UsageExportPayload>,
      filenamePrefix: string,
      setBusy: (value: boolean) => void,
      successKey: string
    ) => {
      setBusy(true);
      try {
        const data = await run();
        downloadBlob({
          filename: buildExportFilename(filenamePrefix, data),
          blob: new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' }),
        });
        showNotification(t(successKey), 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.download_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      } finally {
        setBusy(false);
      }
    },
    [showNotification, t]
  );

  const handleExport = useCallback(
    () =>
      downloadExport(
        () => usageApi.exportUsage(usage),
        'usage-export-aggregated',
        setExporting,
        'usage_stats.export_success'
      ),
    [downloadExport, usage]
  );

  const handleExportDetailed = useCallback(
    () =>
      downloadExport(
        () => usageApi.exportDetailedUsage(),
        'usage-export-details',
        setExportingDetailed,
        'usage_stats.export_details_success'
      ),
    [downloadExport]
  );

  const handleImport = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }

      setImporting(true);
      try {
        const text = await file.text();
        let payload: unknown;
        try {
          payload = JSON.parse(text);
        } catch {
          showNotification(t('usage_stats.import_invalid'), 'error');
          return;
        }

        const result = await usageApi.importUsage(payload);
        showNotification(
          t('usage_stats.import_success', {
            added: result?.added ?? 0,
            skipped: result?.skipped ?? 0,
            total: result?.total_requests ?? 0,
            failed: result?.failed_requests ?? 0,
          }),
          'success'
        );
        await loadUsage();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.upload_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      } finally {
        setImporting(false);
      }
    },
    [loadUsage, showNotification, t]
  );

  const handleSetModelPrices = useCallback(
    (prices: Record<string, ModelPrice>) => {
      setModelPrices(prices);
      saveModelPrices(prices);
      void usageApi.updateModelPrices(prices).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : '';
        showNotification(
          `${t('notification.save_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      });
    },
    [showNotification, t]
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
    handleExportDetailed,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    exportingDetailed,
    importing,
  };
}
