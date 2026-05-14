import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconChartLine } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useConfigStore, useThemeStore } from '@/stores';
import {
  ApiDetailsCard,
  UsageAnalysisSection,
  ChartLineSelector,
  CredentialStatsCard,
  DeferredUsageCard,
  ModelStatsCard,
  PriceSettingsCard,
  StatCards,
  UsagePageHero,
  UsageSectionIntro,
  useUsageAggregateChartData,
  useUsageAggregateData,
  useUsageAggregateSparklines,
  useUsageViewState,
} from '@/components/usage';
import {
  getAggregateApiStats,
  getAggregateModelNames,
  getAggregateModelStats,
  getAggregateWindowModelNames,
} from '@/utils/usageAggregate';
import styles from './UsagePage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

const LazyUsageChart = lazy(async () => ({
  default: (await import('@/components/usage/UsageChart')).UsageChart,
}));

const buildTrendChartFallback = (requestTitle: string, tokenTitle: string, caption: string) => (
  <>
    <DeferredUsageCard title={requestTitle} caption={caption} />
    <DeferredUsageCard title={tokenTitle} caption={caption} />
  </>
);

export function UsagePage() {
  const { t } = useTranslation();
  const [trendsCollapsed, setTrendsCollapsed] = useState(true);
  const [analysisCollapsed, setAnalysisCollapsed] = useState(true);
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isDark = useThemeStore((state) => state.resolvedTheme === 'dark');
  const config = useConfigStore((state) => state.config);

  const {
    usage,
    loading,
    error,
    lastRefreshedAt,
    modelPrices,
    setModelPrices,
    loadUsage,
    handleExport,
    handleExportDetailed,
    handleImport,
    handleImportChange,
    importInputRef,
    exporting,
    exportingDetailed,
    importing,
  } = useUsageAggregateData();

  const {
    chartLines,
    deferredChartLines,
    deferredTimeRange,
    handleChartLinesChange,
    handleTimeRangeChange,
    hourWindowHours,
    preferredChartPeriod,
    selectedRangeLabel,
    timeRange,
    timeRangeOptions,
  } = useUsageViewState();

  useHeaderRefresh(loadUsage);

  const selectedWindow = useMemo(
    () => usage?.windows?.[deferredTimeRange] ?? null,
    [deferredTimeRange, usage]
  );
  const deferredWindow = useDeferredValue(selectedWindow);

  const allModelNames = useMemo(() => getAggregateModelNames(usage), [usage]);
  const visibleModelNames = useMemo(
    () => getAggregateWindowModelNames(deferredWindow),
    [deferredWindow]
  );

  const { requestsSparkline, tokensSparkline, rpmSparkline, tpmSparkline, costSparkline } =
    useUsageAggregateSparklines({ window: deferredWindow, loading });

  const {
    requestsPeriod,
    requestsChartData,
    requestsChartOptions,
    setRequestsPeriod,
    setTokensPeriod,
    tokensChartData,
    tokensChartOptions,
    tokensPeriod,
  } = useUsageAggregateChartData({
    window: deferredWindow,
    chartLines: deferredChartLines,
    isDark,
    isMobile,
    preferredPeriod: preferredChartPeriod,
    allModelsLabel: t('usage_stats.chart_line_all'),
  });

  const apiStats = useMemo(
    () => getAggregateApiStats(deferredWindow, modelPrices),
    [deferredWindow, modelPrices]
  );
  const modelStats = useMemo(
    () => getAggregateModelStats(deferredWindow, modelPrices),
    [deferredWindow, modelPrices]
  );

  const hasPrices = Object.keys(modelPrices).length > 0;
  const showComparePanel = visibleModelNames.length > 1;
  const trendRequestsTitle = t('usage_stats.requests_trend');
  const trendTokensTitle = t('usage_stats.tokens_trend');
  const deferredChartCaption = t('usage_stats.render_on_demand');
  return (
    <main className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div id="usage-actions" className={styles.anchorBlock}>
        <UsagePageHero
          timeRange={timeRange}
          timeRangeOptions={timeRangeOptions}
          selectedRangeLabel={selectedRangeLabel}
          visibleModelCount={visibleModelNames.length}
          selectedSeriesCount={chartLines.length}
          lastRefreshedAt={lastRefreshedAt}
          loading={loading}
          exporting={exporting}
          exportingDetailed={exportingDetailed}
          importing={importing}
          onTimeRangeChange={handleTimeRangeChange}
          onExport={handleExport}
          onExportDetailed={handleExportDetailed}
          onImport={handleImport}
          onRefresh={() => void loadUsage().catch(() => {})}
          importInputRef={importInputRef}
          onImportChange={handleImportChange}
        />
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <section id="usage-overview" className={`${styles.section} ${styles.overviewPanel}`}>
        <UsageSectionIntro
          title={t('usage_stats.overview_title')}
          description={t('usage_stats.overview_desc')}
          eyebrow={
            <>
              <IconChartLine size={15} />
              {t('usage_stats.core_overview', { defaultValue: '核心概览' })}
            </>
          }
        />
        <StatCards
          window={deferredWindow}
          loading={loading}
          modelPrices={modelPrices}
          sparklines={{
            requests: requestsSparkline,
            tokens: tokensSparkline,
            rpm: rpmSparkline,
            tpm: tpmSparkline,
            cost: costSparkline,
          }}
        />
      </section>

      <section id="usage-trends" className={styles.section}>
        <UsageSectionIntro
          title={t('usage_stats.trends_title')}
          description={t('usage_stats.trends_desc')}
          action={
            <button
              type="button"
              className={styles.sectionToggle}
              aria-expanded={!trendsCollapsed}
              onClick={() => setTrendsCollapsed((current) => !current)}
            >
              <span className={styles.sectionToggleIcon} aria-hidden="true">
                {trendsCollapsed ? '+' : '-'}
              </span>
              <span>{t(trendsCollapsed ? 'common.expand' : 'common.collapse')}</span>
            </button>
          }
        />
        {!trendsCollapsed && (
          <div className={styles.trendGrid}>
            {showComparePanel && (
              <div className={styles.trendSidebar}>
                <ChartLineSelector
                  chartLines={chartLines}
                  modelNames={visibleModelNames}
                  onChange={handleChartLinesChange}
                />
              </div>
            )}

            <div
              className={[styles.trendCharts, !showComparePanel ? styles.trendChartsFull : '']
                .filter(Boolean)
                .join(' ')}
            >
              <Suspense
                fallback={buildTrendChartFallback(
                  trendRequestsTitle,
                  trendTokensTitle,
                  deferredChartCaption
                )}
              >
                <LazyUsageChart
                  title={trendRequestsTitle}
                  period={requestsPeriod}
                  onPeriodChange={setRequestsPeriod}
                  chartData={requestsChartData}
                  chartOptions={requestsChartOptions}
                  loading={loading}
                  isMobile={isMobile}
                  emptyText={t('usage_stats.no_data')}
                  tone="neutral"
                />
                <LazyUsageChart
                  title={trendTokensTitle}
                  period={tokensPeriod}
                  onPeriodChange={setTokensPeriod}
                  chartData={tokensChartData}
                  chartOptions={tokensChartOptions}
                  loading={loading}
                  isMobile={isMobile}
                  emptyText={t('usage_stats.no_data')}
                  tone="violet"
                />
              </Suspense>
            </div>
          </div>
        )}
      </section>

      <div id="usage-analysis" className={styles.anchorBlock}>
        <UsageAnalysisSection
          window={deferredWindow}
          loading={loading}
          isDark={isDark}
          isMobile={isMobile}
          hourWindowHours={hourWindowHours}
          modelPrices={modelPrices}
          collapsed={analysisCollapsed}
          onToggleCollapse={() => setAnalysisCollapsed((current) => !current)}
        />
      </div>

      <section id="usage-models" className={styles.section}>
        <UsageSectionIntro
          title={t('usage_stats.details_title')}
          description={t('usage_stats.details_desc')}
        />
        <div className={styles.detailsGrid}>
          <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
          <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
        </div>
      </section>

      <div className={styles.supportStack}>
        <div id="usage-health" className={styles.anchorBlock}>
          <CredentialStatsCard
            credentials={deferredWindow?.credentials ?? (EMPTY_LIST as never[])}
            loading={loading}
            geminiKeys={config?.geminiApiKeys ?? (EMPTY_LIST as never[])}
            claudeConfigs={config?.claudeApiKeys ?? (EMPTY_LIST as never[])}
            codexConfigs={config?.codexApiKeys ?? (EMPTY_LIST as never[])}
            vertexConfigs={config?.vertexApiKeys ?? (EMPTY_LIST as never[])}
            openaiProviders={config?.openaiCompatibility ?? (EMPTY_LIST as never[])}
          />
        </div>

        <div id="usage-pricing" className={styles.anchorBlock}>
          <PriceSettingsCard
            modelNames={allModelNames}
            modelPrices={modelPrices}
            onPricesChange={setModelPrices}
          />
        </div>
      </div>
    </main>
  );
}
