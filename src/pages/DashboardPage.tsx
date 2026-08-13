import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';
import { apiKeysApi, providersApi, authFilesApi } from '@/services/api';
import { scheduleIdleTask } from '@/utils/scheduleIdleTask';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import type { Config } from '@/types';
import type { ModelInfo } from '@/utils/models';
import styles from './DashboardPage.module.scss';

interface QuickStat {
  label: string;
  value: number | string;
  path: string;
  loading?: boolean;
}

interface ConfigSummaryItem {
  label: string;
  value: string;
  active?: boolean;
}

interface ProviderStats {
  codex: number | null;
  claude: number | null;
}

const MODELS_IDLE_LOAD_DELAY_MS = 320;
const MODELS_IDLE_LOAD_TIMEOUT_MS = 1_500;
const DASHBOARD_STATS_CACHE_TTL_MS = 1_000;
const EMPTY_MODELS: ModelInfo[] = [];

const getConfiguredItemCount = (items: unknown): number | null =>
  Array.isArray(items) ? items.length : null;

interface DashboardStatsData {
  apiKeys: number | null;
  authFiles: number | null;
  providers: ProviderStats;
}

type DashboardStatsCacheEntry = {
  data: DashboardStatsData;
  timestamp: number;
};

const dashboardStatsCache = new Map<string, DashboardStatsCacheEntry>();
const dashboardStatsRequests = new Map<string, Promise<DashboardStatsData>>();

const getDashboardStatsCacheKey = (apiBase: string, config: Config | null) =>
  [
    apiBase,
    getConfiguredItemCount(config?.apiKeys) ?? 'api-keys-pending',
    getConfiguredItemCount(config?.codexApiKeys) ?? 'codex-pending',
    getConfiguredItemCount(config?.claudeApiKeys) ?? 'claude-pending',
  ].join('|');

const loadDashboardStats = (
  apiBase: string,
  config: Config | null,
  loadApiKeys: () => ReturnType<typeof apiKeysApi.list>
): Promise<DashboardStatsData> => {
  const cacheKey = getDashboardStatsCacheKey(apiBase, config);
  const now = Date.now();
  const cached = dashboardStatsCache.get(cacheKey);
  if (cached && now - cached.timestamp < DASHBOARD_STATS_CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const existingRequest = dashboardStatsRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const configuredApiKeyCount = getConfiguredItemCount(config?.apiKeys);
  const configuredCodexCount = getConfiguredItemCount(config?.codexApiKeys);
  const configuredClaudeCount = getConfiguredItemCount(config?.claudeApiKeys);
  const request = Promise.allSettled([
    authFilesApi.list({ codexSubscription: 'skip', summary: true, page: 1, pageSize: 1 }),
    configuredApiKeyCount === null ? loadApiKeys() : Promise.resolve(null),
    configuredCodexCount === null ? providersApi.getCodexConfigs() : Promise.resolve(null),
    configuredClaudeCount === null ? providersApi.getClaudeConfigs() : Promise.resolve(null),
  ]).then(([filesRes, keysRes, codexRes, claudeRes]): DashboardStatsData => {
    const data = {
      apiKeys:
        configuredApiKeyCount ??
        (keysRes.status === 'fulfilled' && keysRes.value ? keysRes.value.length : null),
      authFiles:
        filesRes.status === 'fulfilled'
          ? (filesRes.value.total ?? filesRes.value.files.length)
          : null,
      providers: {
        codex:
          configuredCodexCount ??
          (codexRes.status === 'fulfilled' && codexRes.value ? codexRes.value.length : null),
        claude:
          configuredClaudeCount ??
          (claudeRes.status === 'fulfilled' && claudeRes.value ? claudeRes.value.length : null),
      },
    };
    dashboardStatsCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  });

  dashboardStatsRequests.set(cacheKey, request);
  void request.finally(() => {
    if (dashboardStatsRequests.get(cacheKey) === request) {
      dashboardStatsRequests.delete(cacheKey);
    }
  });
  return request;
};

export function DashboardPage() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const serverVersion = useAuthStore((state) => (isCurrentLayer ? state.serverVersion : ''));
  const apiBase = useAuthStore((state) => (isCurrentLayer ? state.apiBase : ''));
  const config = useConfigStore((state) => (isCurrentLayer ? state.config : null));
  const configError = useConfigStore((state) => (isCurrentLayer ? state.error : ''));
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const models = useModelsStore((state) => (isCurrentLayer ? state.models : EMPTY_MODELS));
  const modelsLoading = useModelsStore((state) => (isCurrentLayer ? state.loading : false));
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [stats, setStats] = useState<{
    apiKeys: number | null;
    authFiles: number | null;
  }>({
    apiKeys: null,
    authFiles: null,
  });

  const [providerStats, setProviderStats] = useState<ProviderStats>({
    codex: null,
    claude: null,
  });

  const [loading, setLoading] = useState(true);

  const apiKeysCache = useRef<string[]>([]);
  const apiKeysRequestRef = useRef<ReturnType<typeof apiKeysApi.list> | null>(null);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    apiKeysCache.current = [];
  }, [apiBase, config?.apiKeys]);

  const loadApiKeys = useCallback(() => {
    if (apiKeysRequestRef.current) {
      return apiKeysRequestRef.current;
    }

    const request = apiKeysApi.list();
    apiKeysRequestRef.current = request;
    void request.then(
      () => {
        if (apiKeysRequestRef.current === request) {
          apiKeysRequestRef.current = null;
        }
      },
      () => {
        if (apiKeysRequestRef.current === request) {
          apiKeysRequestRef.current = null;
        }
      }
    );
    return request;
  }, []);

  const normalizeApiKeyList = useCallback((input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    const readBooleanFlag = (raw: unknown): boolean | undefined => {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return raw !== 0;
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      }
      return undefined;
    };

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const disabled = readBooleanFlag(record?.disabled ?? record?.disable ?? record?.isDisabled);
      const enabled = readBooleanFlag(record?.enabled ?? record?.enable ?? record?.isEnabled);
      if (disabled === true || (disabled === undefined && enabled === false)) return;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  }, []);

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(configRef.current?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await loadApiKeys();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch {
      return [];
    }
  }, [loadApiKeys, normalizeApiKeyList]);

  const fetchModels = useCallback(async () => {
    if (connectionStatus !== 'connected' || !apiBase) {
      return;
    }

    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      await fetchModelsFromStore(apiBase, primaryKey);
    } catch {
      // Ignore model fetch errors on dashboard
    }
  }, [connectionStatus, apiBase, resolveApiKeysForModels, fetchModelsFromStore]);

  useEffect(() => {
    if (!isCurrentLayer || connectionStatus !== 'connected') {
      return undefined;
    }

    // Login and the main layout both populate this shared store. Waiting for that request prevents
    // a transient config-less dashboard from fetching the same summary a second time with a
    // different cache key. If configuration fails, retain the endpoint fallbacks below.
    if (!config && !configError) {
      void fetchConfig().catch(() => {
        // The next render receives configError and falls back to the dedicated summary endpoints.
      });
      return undefined;
    }

    let active = true;
    const fetchStats = async () => {
      setLoading(true);
      const data = await loadDashboardStats(apiBase, configRef.current, loadApiKeys);

      if (!active) return;

      setStats({
        apiKeys: data.apiKeys,
        authFiles: data.authFiles,
      });
      setProviderStats(data.providers);
      setLoading(false);
    };

    void fetchStats();

    // The model endpoint can call through to an upstream provider. It is useful but non-critical
    // for the dashboard, so leave network and parsing capacity to the initial management requests.
    const cancelIdleModelsLoad = scheduleIdleTask(
      () => {
        void fetchModels();
      },
      {
        delayMs: MODELS_IDLE_LOAD_DELAY_MS,
        fallbackDelayMs: MODELS_IDLE_LOAD_DELAY_MS,
        timeoutMs: MODELS_IDLE_LOAD_TIMEOUT_MS,
      }
    );

    return () => {
      active = false;
      cancelIdleModelsLoad();
    };
  }, [
    apiBase,
    config,
    configError,
    connectionStatus,
    fetchConfig,
    fetchModels,
    isCurrentLayer,
    loadApiKeys,
  ]);

  const isStatsLoading = connectionStatus === 'connected' && loading;
  const providerStatsReady = providerStats.codex !== null && providerStats.claude !== null;
  const totalProviderKeys = providerStatsReady
    ? (providerStats.codex ?? 0) + (providerStats.claude ?? 0)
    : 0;

  const quickStats: QuickStat[] = useMemo(
    () => [
      {
        label: t('dashboard.management_keys'),
        value: stats.apiKeys ?? '-',
        path: '/config',
        loading: isStatsLoading && stats.apiKeys === null,
      },
      {
        label: t('nav.ai_providers'),
        value: isStatsLoading ? '-' : providerStatsReady ? totalProviderKeys : '-',
        path: '/ai-providers',
        loading: isStatsLoading,
      },
      {
        label: t('nav.auth_files'),
        value: stats.authFiles ?? '-',
        path: '/auth-files',
        loading: isStatsLoading && stats.authFiles === null,
      },
      {
        label: t('dashboard.available_models'),
        value: modelsLoading ? '-' : models.length,
        path: '/system',
        loading: modelsLoading,
      },
    ],
    [
      t,
      stats.apiKeys,
      stats.authFiles,
      isStatsLoading,
      providerStatsReady,
      totalProviderKeys,
      modelsLoading,
      models.length,
    ]
  );

  const routingStrategyRaw = config?.routingStrategy?.trim() || '';
  const routingStrategyDisplay = !routingStrategyRaw
    ? '-'
    : routingStrategyRaw === 'round-robin'
      ? t('basic_settings.routing_strategy_round_robin')
      : routingStrategyRaw === 'fill-first'
        ? t('basic_settings.routing_strategy_fill_first')
        : routingStrategyRaw;

  const configSummary: ConfigSummaryItem[] = config
    ? [
        {
          label: t('dashboard.routing_strategy'),
          value: routingStrategyDisplay,
        },
        {
          label: t('basic_settings.retry_title'),
          value: String(config.requestRetry ?? 0),
        },
        {
          label: t('basic_settings.usage_statistics_title'),
          value: config.usageStatisticsEnabled ? t('common.yes') : t('common.no'),
          active: config.usageStatisticsEnabled,
        },
        {
          label: t('basic_settings.logging_title'),
          value: config.loggingToFile ? t('common.yes') : t('common.no'),
          active: config.loggingToFile,
        },
        {
          label: t('basic_settings.ws_auth_title'),
          value: config.wsAuth ? t('common.yes') : t('common.no'),
          active: config.wsAuth,
        },
        {
          label: t('basic_settings.debug_title'),
          value: config.debug ? t('common.yes') : t('common.no'),
          active: config.debug,
        },
      ]
    : [];

  return (
    <div className={styles.dashboard}>
      <section className={styles.hero} aria-labelledby="dashboard-hero-title">
        <h1 id="dashboard-hero-title" className={styles.heroTitle}>
          {t('nav.dashboard')}
        </h1>
      </section>

      <section
        className={styles.statsSection}
        aria-labelledby="dashboard-stats-title"
        aria-busy={isStatsLoading}
      >
        <h2 id="dashboard-stats-title" className={styles.sectionTitle}>
          {t('dashboard.system_overview')}
        </h2>
        <div className={styles.bentoGrid}>
          {quickStats.map((stat) => (
            <Link
              key={stat.path}
              to={stat.path}
              className={styles.bentoCard}
              aria-label={`${stat.label}: ${stat.loading ? '…' : stat.value}`}
            >
              <div className={styles.bentoContent}>
                <span
                  className={`${styles.bentoValue} ${stat.loading ? styles.bentoValueLoading : ''}`}
                >
                  {stat.loading ? '…' : stat.value}
                </span>
                <span className={styles.bentoLabel}>{stat.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {config && (
        <section className={styles.gatewaySection} aria-labelledby="dashboard-gateway-title">
          <header className={styles.gatewayHeader}>
            <div>
              <h2 id="dashboard-gateway-title" className={styles.sectionTitle}>
                {t('dashboard.current_config')}
              </h2>
              {serverVersion && (
                <p className={styles.gatewayMeta}>
                  {t('footer.api_version')} · v{serverVersion.trim().replace(/^[vV]+/, '')}
                </p>
              )}
            </div>
            <Link to="/config" className={styles.configLink}>
              {t('dashboard.edit_settings')}
            </Link>
          </header>

          <dl className={styles.configList}>
            {configSummary.map((item) => (
              <div key={item.label} className={styles.configRow}>
                <dt>{item.label}</dt>
                <dd>
                  {typeof item.active === 'boolean' && (
                    <span
                      className={`${styles.configStatus} ${item.active ? styles.on : styles.off}`}
                      aria-hidden="true"
                    />
                  )}
                  {item.value}
                </dd>
              </div>
            ))}
            {config.proxyUrl && (
              <div className={`${styles.configRow} ${styles.configRowWide}`}>
                <dt>{t('basic_settings.proxy_title')}</dt>
                <dd className={styles.monoValue}>{config.proxyUrl}</dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </div>
  );
}
