import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  IconKey,
  IconBot,
  IconFileText,
  IconSatellite
} from '@/components/ui/icons';
import { useAlignedInterval } from '@/hooks/useAlignedInterval';
import { useInterval } from '@/hooks/useInterval';
import { useAuthStore, useConfigStore, useModelsStore } from '@/stores';
import { apiKeysApi, providersApi, authFilesApi } from '@/services/api';
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
  const [now, setNow] = useState<Date>(() => new Date());

  useAlignedInterval(() => {
    setNow(new Date());
  }, MINUTE_INTERVAL_MS);

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
        day: 'numeric'
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
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(getTimeOfDay);

  useInterval(() => {
    const tod = getTimeOfDay();
    setTimeOfDay((prev) => (prev === tod ? prev : tod));
  }, GREETING_REFRESH_INTERVAL_MS);

  return (
    <>
      <span className={styles.heroGreeting}>{t(`dashboard.greeting_${timeOfDay}`)}</span>
      <h1 className={styles.heroTitle}>{t('dashboard.welcome_back')}</h1>
      <p className={styles.heroCaring}>{t(`dashboard.caring_${timeOfDay}`)}</p>
    </>
  );
});

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const serverVersion = useAuthStore((state) => state.serverVersion);
  const serverBuildDate = useAuthStore((state) => state.serverBuildDate);
  const apiBase = useAuthStore((state) => state.apiBase);
  const config = useConfigStore((state) => state.config);

  const models = useModelsStore((state) => state.models);
  const modelsLoading = useModelsStore((state) => state.loading);
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [stats, setStats] = useState<{
    apiKeys: number | null;
    authFiles: number | null;
  }>({
    apiKeys: null,
    authFiles: null
  });

  const [providerStats, setProviderStats] = useState<ProviderStats>({
    codex: null,
    claude: null
  });

  const [loading, setLoading] = useState(true);

  const apiKeysCache = useRef<string[]>([]);

  useEffect(() => {
    apiKeysCache.current = [];
  }, [apiBase, config?.apiKeys]);

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

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch {
      return [];
    }
  }, [config?.apiKeys, normalizeApiKeyList]);

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
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [keysRes, filesRes, codexRes, claudeRes] =
          await Promise.allSettled([
            apiKeysApi.list(),
            authFilesApi.list({ codexSubscription: 'skip', summary: true, page: 1, pageSize: 1 }),
            providersApi.getCodexConfigs(),
            providersApi.getClaudeConfigs()
          ]);

        setStats({
          apiKeys: keysRes.status === 'fulfilled' ? keysRes.value.length : null,
          authFiles:
            filesRes.status === 'fulfilled'
              ? (filesRes.value.total ?? filesRes.value.files.length)
              : null
        });

        setProviderStats({
          codex: codexRes.status === 'fulfilled' ? codexRes.value.length : null,
          claude: claudeRes.status === 'fulfilled' ? claudeRes.value.length : null
        });
      } finally {
        setLoading(false);
      }
    };

    if (connectionStatus === 'connected') {
      fetchStats();
      fetchModels();
    } else {
      setLoading(false);
    }
  }, [connectionStatus, fetchModels]);

  const providerStatsReady =
    providerStats.codex !== null &&
    providerStats.claude !== null;
  const hasProviderStats =
    providerStats.codex !== null ||
    providerStats.claude !== null;
  const totalProviderKeys = providerStatsReady
    ? (providerStats.codex ?? 0) +
      (providerStats.claude ?? 0)
    : 0;

  const quickStats: QuickStat[] = useMemo(
    () => [
      {
        label: t('dashboard.management_keys'),
        value: stats.apiKeys ?? '-',
        icon: <IconKey size={24} />,
        path: '/config',
        loading: loading && stats.apiKeys === null,
        sublabel: t('nav.config_management')
      },
      {
        label: t('nav.ai_providers'),
        value: loading ? '-' : providerStatsReady ? totalProviderKeys : '-',
        icon: <IconBot size={24} />,
        path: '/ai-providers',
        loading: loading,
        sublabel: hasProviderStats
          ? t('dashboard.provider_keys_detail', {
              codex: providerStats.codex ?? '-',
              claude: providerStats.claude ?? '-'
            })
          : undefined
      },
      {
        label: t('nav.auth_files'),
        value: stats.authFiles ?? '-',
        icon: <IconFileText size={24} />,
        path: '/auth-files',
        loading: loading && stats.authFiles === null,
        sublabel: t('dashboard.oauth_credentials')
      },
      {
        label: t('dashboard.available_models'),
        value: modelsLoading ? '-' : models.length,
        icon: <IconSatellite size={24} />,
        path: '/system',
        loading: modelsLoading,
        sublabel: t('dashboard.available_models_desc')
      }
    ],
    [
      t,
      stats.apiKeys,
      stats.authFiles,
      loading,
      providerStatsReady,
      totalProviderKeys,
      hasProviderStats,
      providerStats.codex,
      providerStats.claude,
      modelsLoading,
      models.length
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
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <HeroGreeting />
        </div>
        <div className={styles.heroMeta}>
          <HeroTimeBlock />
          <div className={styles.connectionPill}>
            <span
              className={`${styles.statusDot} ${
                connectionStatus === 'connected'
                  ? styles.connected
                  : connectionStatus === 'connecting'
                    ? styles.connecting
                    : styles.disconnected
              }`}
            />
            <span className={styles.pillText}>
              {serverVersion ? `v${serverVersion.trim().replace(/^[vV]+/, '')}` : t(statusLabel)}
            </span>
          </div>
          {buildDateText && <span className={styles.buildDate}>{buildDateText}</span>}
        </div>
      </section>

      {/* Bento stats grid */}
      <section className={styles.statsSection}>
        <h2 className={styles.sectionHeading}>{t('dashboard.system_overview')}</h2>
        <div className={styles.bentoGrid}>
          {quickStats.map((stat, index) => (
            <Link
              key={stat.path}
              to={stat.path}
              className={`${styles.bentoCard} ${index === 0 ? styles.bentoLarge : ''}`}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className={styles.bentoIcon}>{stat.icon}</div>
              <div className={styles.bentoContent}>
                <span className={styles.bentoValue}>{stat.loading ? '…' : stat.value}</span>
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
        <section className={styles.configSection}>
          <h2 className={styles.sectionHeading}>{t('dashboard.current_config')}</h2>
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
                <span className={styles.configPillLabel}>{t('basic_settings.proxy_url_label')}</span>
                <span className={styles.configPillMono}>{config.proxyUrl}</span>
              </div>
            )}
          </div>
          <Link to="/config" className={styles.viewMoreLink}>
            {t('dashboard.edit_settings')} →
          </Link>
        </section>
      )}
    </div>
  );
}
