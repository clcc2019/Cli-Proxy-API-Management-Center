import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconKey, IconBot, IconFileText, IconSatellite } from '@/components/ui/icons';
import { useAlignedInterval } from '@/hooks/useAlignedInterval';
import { useInterval } from '@/hooks/useInterval';
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
  icon: React.ReactNode;
  path: string;
  loading?: boolean;
  sublabel?: string;
}

interface ProviderStats {
  codex: number | null;
  claude: number | null;
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

const MINUTE_INTERVAL_MS = 60_000;
const GREETING_REFRESH_INTERVAL_MS = 5 * 60_000;
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

function getTimeOfDay(date = new Date()): TimeOfDay {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * 时间区域单独抽组件，避免分钟级 tick 触发整个 Dashboard 重渲染。
 * React.memo 避免父组件传 prop 变化时无谓重渲。
 */
const HeroTimeBlock = memo(function HeroTimeBlock() {
  const { i18n } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [now, setNow] = useState<Date>(() => new Date());
  const wasCurrentLayerRef = useRef(isCurrentLayer);

  useEffect(() => {
    if (!isCurrentLayer) {
      wasCurrentLayerRef.current = false;
      return;
    }
    let refreshTimer: number | null = null;
    if (!wasCurrentLayerRef.current) {
      refreshTimer = window.setTimeout(() => setNow(new Date()), 0);
    }
    wasCurrentLayerRef.current = true;
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [isCurrentLayer]);

  useAlignedInterval(
    () => {
      setNow(new Date());
    },
    MINUTE_INTERVAL_MS,
    { enabled: isCurrentLayer }
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }),
    [now, i18n.language]
  );
  const formattedDate = useMemo(
    () =>
      now.toLocaleDateString(i18n.language, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [now, i18n.language]
  );

  return (
    <div className={styles.dateTimeBlock}>
      <span className={styles.time}>{formattedTime}</span>
      <span className={styles.date}>{formattedDate}</span>
    </div>
  );
});

/**
 * 问候语也独立，读同一个时间源（每 5 分钟检查足够），减少重渲。
 */
const HeroGreeting = memo(function HeroGreeting() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay);
  const wasCurrentLayerRef = useRef(isCurrentLayer);

  useEffect(() => {
    if (!isCurrentLayer) {
      wasCurrentLayerRef.current = false;
      return;
    }
    let refreshTimer: number | null = null;
    if (!wasCurrentLayerRef.current) {
      refreshTimer = window.setTimeout(() => {
        const nextTimeOfDay = getTimeOfDay();
        setTimeOfDay((previous) => (previous === nextTimeOfDay ? previous : nextTimeOfDay));
      }, 0);
    }
    wasCurrentLayerRef.current = true;
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    };
  }, [isCurrentLayer]);

  useInterval(
    () => {
      const tod = getTimeOfDay();
      setTimeOfDay((prev) => (prev === tod ? prev : tod));
    },
    isCurrentLayer ? GREETING_REFRESH_INTERVAL_MS : null
  );

  return (
    <>
      <span className={styles.heroGreeting}>{t(`dashboard.greeting_${timeOfDay}`)}</span>
      <h1 id="dashboard-hero-title" className={styles.heroTitle}>
        {t('dashboard.welcome_back')}
      </h1>
      <p className={styles.heroCaring}>{t(`dashboard.caring_${timeOfDay}`)}</p>
    </>
  );
});

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const serverVersion = useAuthStore((state) => (isCurrentLayer ? state.serverVersion : ''));
  const serverBuildDate = useAuthStore((state) => (isCurrentLayer ? state.serverBuildDate : ''));
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
  const hasProviderStats = providerStats.codex !== null || providerStats.claude !== null;
  const totalProviderKeys = providerStatsReady
    ? (providerStats.codex ?? 0) + (providerStats.claude ?? 0)
    : 0;

  const quickStats: QuickStat[] = useMemo(
    () => [
      {
        label: t('dashboard.management_keys'),
        value: stats.apiKeys ?? '-',
        icon: <IconKey size={24} />,
        path: '/config',
        loading: isStatsLoading && stats.apiKeys === null,
        sublabel: t('nav.config_management'),
      },
      {
        label: t('nav.ai_providers'),
        value: isStatsLoading ? '-' : providerStatsReady ? totalProviderKeys : '-',
        icon: <IconBot size={24} />,
        path: '/ai-providers',
        loading: isStatsLoading,
        sublabel: hasProviderStats
          ? t('dashboard.provider_keys_detail', {
              codex: providerStats.codex ?? '-',
              claude: providerStats.claude ?? '-',
            })
          : undefined,
      },
      {
        label: t('nav.auth_files'),
        value: stats.authFiles ?? '-',
        icon: <IconFileText size={24} />,
        path: '/auth-files',
        loading: isStatsLoading && stats.authFiles === null,
        sublabel: t('dashboard.oauth_credentials'),
      },
      {
        label: t('dashboard.available_models'),
        value: modelsLoading ? '-' : models.length,
        icon: <IconSatellite size={24} />,
        path: '/system',
        loading: modelsLoading,
        sublabel: t('dashboard.available_models_desc'),
      },
    ],
    [
      t,
      stats.apiKeys,
      stats.authFiles,
      isStatsLoading,
      providerStatsReady,
      totalProviderKeys,
      hasProviderStats,
      providerStats.codex,
      providerStats.claude,
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
  const routingStrategyBadgeClass = !routingStrategyRaw
    ? styles.configBadgeUnknown
    : routingStrategyRaw === 'round-robin'
      ? styles.configBadgeRoundRobin
      : routingStrategyRaw === 'fill-first'
        ? styles.configBadgeFillFirst
        : styles.configBadgeUnknown;

  const buildDateText = useMemo(
    () => (serverBuildDate ? new Date(serverBuildDate).toLocaleDateString(i18n.language) : null),
    [serverBuildDate, i18n.language]
  );

  const statusLabel =
    connectionStatus === 'connected'
      ? 'common.connected'
      : connectionStatus === 'connecting'
        ? 'common.connecting'
        : 'common.disconnected';

  return (
    <div className={styles.dashboard}>
      {/* Hero welcome section */}
      <section className={styles.hero} aria-labelledby="dashboard-hero-title">
        <div className={styles.heroContent}>
          <HeroGreeting />
        </div>
        <div className={styles.heroMeta}>
          <HeroTimeBlock />
          <div className={styles.connectionPill} role="status" aria-live="polite">
            <span
              className={`${styles.statusDot} ${
                connectionStatus === 'connected'
                  ? styles.connected
                  : connectionStatus === 'connecting'
                    ? styles.connecting
                    : styles.disconnected
              }`}
              aria-hidden="true"
            />
            <span className={styles.pillText}>{t(statusLabel)}</span>
            {serverVersion && (
              <span className={styles.pillVersion}>
                v{serverVersion.trim().replace(/^[vV]+/, '')}
              </span>
            )}
          </div>
          {buildDateText && <span className={styles.buildDate}>{buildDateText}</span>}
        </div>
      </section>

      {/* Bento stats grid */}
      <section
        className={styles.statsSection}
        aria-labelledby="dashboard-stats-title"
        aria-busy={isStatsLoading}
      >
        <h2 id="dashboard-stats-title" className={styles.sectionHeading}>
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
              <div className={styles.bentoIcon}>{stat.icon}</div>
              <div className={styles.bentoContent}>
                <span
                  className={`${styles.bentoValue} ${stat.loading ? styles.bentoValueLoading : ''}`}
                >
                  {stat.loading ? '…' : stat.value}
                </span>
                <span className={styles.bentoLabel}>{stat.label}</span>
                {stat.sublabel && !stat.loading && (
                  <span className={styles.bentoSublabel}>{stat.sublabel}</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Config pills section */}
      {config && (
        <section className={styles.configSection} aria-labelledby="dashboard-config-title">
          <h2 id="dashboard-config-title" className={styles.sectionHeading}>
            {t('dashboard.current_config')}
          </h2>
          <div className={styles.configPillGrid}>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>{t('basic_settings.debug_enable')}</span>
              <span
                className={`${styles.configPillValue} ${config.debug ? styles.on : styles.off}`}
              >
                {config.debug ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>
                {t('basic_settings.usage_statistics_enable')}
              </span>
              <span
                className={`${styles.configPillValue} ${
                  config.usageStatisticsEnabled ? styles.on : styles.off
                }`}
              >
                {config.usageStatisticsEnabled ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>
                {t('basic_settings.logging_to_file_enable')}
              </span>
              <span
                className={`${styles.configPillValue} ${
                  config.loggingToFile ? styles.on : styles.off
                }`}
              >
                {config.loggingToFile ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>
                {t('basic_settings.retry_count_label')}
              </span>
              <span className={styles.configPillValue}>{config.requestRetry ?? 0}</span>
            </div>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>{t('basic_settings.ws_auth_enable')}</span>
              <span
                className={`${styles.configPillValue} ${config.wsAuth ? styles.on : styles.off}`}
              >
                {config.wsAuth ? t('common.yes') : t('common.no')}
              </span>
            </div>
            <div className={styles.configPill}>
              <span className={styles.configPillLabel}>{t('dashboard.routing_strategy')}</span>
              <span className={`${styles.configBadge} ${routingStrategyBadgeClass}`}>
                {routingStrategyDisplay}
              </span>
            </div>
            {config.proxyUrl && (
              <div className={`${styles.configPill} ${styles.configPillWide}`}>
                <span className={styles.configPillLabel}>
                  {t('basic_settings.proxy_url_label')}
                </span>
                <span className={styles.configPillMono}>{config.proxyUrl}</span>
              </div>
            )}
          </div>
          <Link to="/config" className={styles.viewMoreLink}>
            <span>{t('dashboard.edit_settings')}</span>
            <span className={styles.viewMoreArrow} aria-hidden="true">
              →
            </span>
          </Link>
        </section>
      )}
    </div>
  );
}
