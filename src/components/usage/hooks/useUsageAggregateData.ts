import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotificationStore } from '@/stores';
import { usageApi, type UsageExportPayload } from '@/services/api/usage';
import { downloadBlob } from '@/utils/download';
import type { ModelPrice } from '@/utils/usage';
import type { UsageAggregateSnapshot } from '@/types/usageAggregate';
import { primeModelPrices, saveAndSyncModelPrices } from './usageModelPriceUtils';
import {
  appendErrorMessage,
  buildUsageImportMessageOptions,
  buildUsageExportFilename,
  createJsonExportBlob,
  readJsonFile,
} from './usageFileUtils';

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
    primeModelPrices(setModelPrices);
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
          filename: buildUsageExportFilename(filenamePrefix, data),
          blob: createJsonExportBlob(data),
        });
        showNotification(t(successKey), 'success');
      } catch (err: unknown) {
        showNotification(appendErrorMessage(t('notification.download_failed'), err), 'error');
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
        await loadUsage();
      } catch (err: unknown) {
        showNotification(appendErrorMessage(t('notification.upload_failed'), err), 'error');
      } finally {
        setImporting(false);
      }
    },
    [loadUsage, showNotification, t]
  );

  const handleSetModelPrices = useCallback(
    (prices: Record<string, ModelPrice>) => {
      saveAndSyncModelPrices(prices, setModelPrices, (err) => {
        showNotification(appendErrorMessage(t('notification.save_failed'), err), 'error');
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
