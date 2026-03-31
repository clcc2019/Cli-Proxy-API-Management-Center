import { useState, useMemo, useCallback, useEffect, startTransition } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select } from '@/components/ui/Select';
import { IconChevronDown } from '@/components/ui/icons';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useThemeStore, useConfigStore } from '@/stores';
import {
  StatCards,
  UsageChart,
  ChartLineSelector,
  ApiDetailsCard,
  ModelStatsCard,
  PriceSettingsCard,
  CredentialStatsCard,
  TokenBreakdownChart,
  CostTrendChart,
  LatencyTrendChart,
  ServiceHealthCard,
  useUsageData,
  useSparklines,
  useChartData
} from '@/components/usage';
import {
  getModelNamesFromUsage,
  getApiStats,
  getModelStats,
  formatCompactNumber,
  filterUsageByTimeRange,
  type UsageTimeRange
} from '@/utils/usage';
import styles from './UsagePage.module.scss';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_CHART_LINES = ['all'];
const DEFAULT_TIME_RANGE: UsageTimeRange = '3h';
const MAX_CHART_LINES = 9;
const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '3h', labelKey: 'usage_stats.range_3h' },
  { value: '6h', labelKey: 'usage_stats.range_6h' },
  { value: '12h', labelKey: 'usage_stats.range_12h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];
const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '3h': 3,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '7d': 7 * 24
};

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '3h' || value === '6h' || value === '12h' || value === '24h' || value === '7d' || value === 'all';

const normalizeChartLines = (value: unknown, maxLines = MAX_CHART_LINES): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }
    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }
    return normalizeChartLines(JSON.parse(raw));
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }
    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

export function UsagePage() {
  const { t, i18n } = useTranslation();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const isDark = resolvedTheme === 'dark';
  const config = useConfigStore((state) => state.config);

  // Data hook
  const {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices,
    loadUsage,
    handleExport,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    importing
  } = useUsageData();

  useHeaderRefresh(loadUsage);

  // Chart lines state
  const [chartLines, setChartLines] = useState<string[]>(loadChartLines);
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedMounted, setAdvancedMounted] = useState(false);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((opt) => ({
        value: opt.value,
        label: t(opt.labelKey)
      })),
    [t]
  );

  const selectedTimeRangeLabel = useMemo(
    () => timeRangeOptions.find((opt) => opt.value === timeRange)?.label ?? t('usage_stats.range_filter'),
    [t, timeRange, timeRangeOptions]
  );

  const filteredUsage = useMemo(
    () => (usage ? filterUsageByTimeRange(usage, timeRange) : null),
    [usage, timeRange]
  );
  const hourWindowHours =
    timeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[timeRange];

  const handleChartLinesChange = useCallback((lines: string[]) => {
    setChartLines(normalizeChartLines(lines));
  }, []);

  const handleTimeRangeChange = useCallback((value: UsageTimeRange) => {
    startTransition(() => {
      setTimeRange(value);
    });
  }, []);

  const handleAdvancedToggle = useCallback(() => {
    startTransition(() => {
      setAdvancedMounted(true);
      setAdvancedOpen((open) => {
        return !open;
      });
    });
  }, []);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
    } catch {
      // Ignore storage errors.
    }
  }, [chartLines]);

  useEffect(() => {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    } catch {
      // Ignore storage errors.
    }
  }, [timeRange]);

  const nowMs = lastRefreshedAt?.getTime() ?? 0;

  // Sparklines hook
  const {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline
  } = useSparklines({ usage: filteredUsage, loading, nowMs });

  const sparklines = useMemo(
    () => ({
      requests: requestsSparkline,
      tokens: tokensSparkline,
      rpm: rpmSparkline,
      tpm: tpmSparkline,
      cost: costSparkline
    }),
    [costSparkline, requestsSparkline, rpmSparkline, tpmSparkline, tokensSparkline]
  );

  // Chart data hook
  const {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions
  } = useChartData({ usage: filteredUsage, chartLines, isDark, isMobile, hourWindowHours });

  // Derived data
  const modelNames = useMemo(() => getModelNamesFromUsage(usage), [usage]);
  const apiStats = useMemo(
    () => getApiStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const modelStats = useMemo(
    () => getModelStats(filteredUsage, modelPrices),
    [filteredUsage, modelPrices]
  );
  const hasPrices = Object.keys(modelPrices).length > 0;
  const heroSuccessRate = useMemo(() => {
    const totalRequests = filteredUsage?.total_requests ?? 0;
    if (!totalRequests) return null;
    const successRequests = filteredUsage?.success_count ?? 0;
    return (successRequests / totalRequests) * 100;
  }, [filteredUsage]);
  const heroLastUpdated = lastRefreshedAt
    ? lastRefreshedAt.toLocaleTimeString(i18n.language)
    : '--';
  const shouldRenderAdvanced = advancedOpen || advancedMounted;

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>{t('usage_stats.title')}</h1>
        <div className={styles.headerActions}>
          <div className={styles.timeRangeGroup}>
            <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
            <Select
              value={timeRange}
              options={timeRangeOptions}
              onChange={(value) => handleTimeRangeChange(value as UsageTimeRange)}
              className={styles.timeRangeSelectControl}
              ariaLabel={t('usage_stats.range_filter')}
              fullWidth={false}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            loading={exporting}
            disabled={loading || importing}
          >
            {t('usage_stats.export')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImport}
            loading={importing}
            disabled={loading || exporting}
          >
            {t('usage_stats.import')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadUsage().catch(() => {})}
            disabled={loading || exporting || importing}
          >
            {loading ? t('common.loading') : t('usage_stats.refresh')}
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportChange}
          />
          {lastRefreshedAt && (
            <span className={styles.lastRefreshed}>
              {t('usage_stats.last_updated')}: {heroLastUpdated}
            </span>
          )}
        </div>
      </div>

      <section className={styles.heroPanel} aria-label={t('usage_stats.title')}>
        <div className={styles.heroContent}>
          <p className={styles.heroDescription}>{t('usage_stats.dashboard_subtitle')}</p>
          <div className={styles.heroPills}>
            <span className={styles.heroPill}>
              {t('usage_stats.range_filter')}: {selectedTimeRangeLabel}
            </span>
            <span className={styles.heroPill}>
              {t('usage_stats.active_models')}: {formatCompactNumber(modelNames.length)}
            </span>
            <span className={styles.heroPill}>
              {t('usage_stats.last_updated')}: {heroLastUpdated}
            </span>
          </div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>{t('usage_stats.total_requests')}</span>
            <span className={styles.heroStatValue}>
              {loading ? '--' : formatCompactNumber(filteredUsage?.total_requests ?? 0)}
            </span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>{t('usage_stats.total_tokens')}</span>
            <span className={styles.heroStatValue}>
              {loading ? '--' : formatCompactNumber(filteredUsage?.total_tokens ?? 0)}
            </span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>{t('usage_stats.success_rate')}</span>
            <span className={styles.heroStatValue}>
              {loading ? '--' : heroSuccessRate !== null ? `${heroSuccessRate.toFixed(1)}%` : '--'}
            </span>
          </div>
        </div>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Stats Overview Cards */}
      <StatCards
        usage={filteredUsage}
        loading={loading}
        modelPrices={modelPrices}
        nowMs={nowMs}
        sparklines={sparklines}
      />

      {/* Chart Line Selection */}
      <ChartLineSelector
        chartLines={chartLines}
        modelNames={modelNames}
        maxLines={MAX_CHART_LINES}
        onChange={handleChartLinesChange}
      />

      {/* Charts Grid */}
      <div className={styles.chartsGrid}>
        <UsageChart
          title={t('usage_stats.requests_trend')}
          period={requestsPeriod}
          onPeriodChange={setRequestsPeriod}
          chartData={requestsChartData}
          chartOptions={requestsChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
        <UsageChart
          title={t('usage_stats.tokens_trend')}
          period={tokensPeriod}
          onPeriodChange={setTokensPeriod}
          chartData={tokensChartData}
          chartOptions={tokensChartOptions}
          loading={loading}
          isMobile={isMobile}
          emptyText={t('usage_stats.no_data')}
        />
      </div>

      <ServiceHealthCard usage={usage} loading={loading} />

      <section className={styles.advancedSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderText}>
            <h2 className={styles.sectionTitle}>{t('common.advanced')}</h2>
            <p className={styles.sectionDescription}>{t('usage_stats.advanced_hint')}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAdvancedToggle}
            aria-expanded={advancedOpen}
            aria-controls="usage-advanced-body"
            className={styles.sectionToggle}
          >
            {advancedOpen ? t('common.collapse') : t('common.expand')}
            <IconChevronDown
              size={14}
              className={`${styles.sectionToggleIcon} ${advancedOpen ? styles.sectionToggleIconOpen : ''}`}
            />
          </Button>
        </div>

        {shouldRenderAdvanced && (
          <div
            id="usage-advanced-body"
            className={styles.advancedBody}
            hidden={!advancedOpen}
            aria-hidden={!advancedOpen}
          >
            <TokenBreakdownChart
              usage={filteredUsage}
              loading={loading}
              isDark={isDark}
              isMobile={isMobile}
              hourWindowHours={hourWindowHours}
            />

            <LatencyTrendChart
              usage={filteredUsage}
              loading={loading}
              isDark={isDark}
              isMobile={isMobile}
              hourWindowHours={hourWindowHours}
            />

            <CostTrendChart
              usage={filteredUsage}
              loading={loading}
              isDark={isDark}
              isMobile={isMobile}
              modelPrices={modelPrices}
              hourWindowHours={hourWindowHours}
            />

            <div className={styles.detailsGrid}>
              <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
              <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
            </div>

            <CredentialStatsCard
              usage={filteredUsage}
              loading={loading}
              geminiKeys={config?.geminiApiKeys || []}
              claudeConfigs={config?.claudeApiKeys || []}
              codexConfigs={config?.codexApiKeys || []}
              vertexConfigs={config?.vertexApiKeys || []}
              openaiProviders={config?.openaiCompatibility || []}
            />

            <PriceSettingsCard
              modelNames={modelNames}
              modelPrices={modelPrices}
              onPricesChange={setModelPrices}
            />
          </div>
        )}
      </section>
    </div>
  );
}
