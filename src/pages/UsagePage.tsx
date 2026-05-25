import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeferredRender } from '@/components/common/DeferredRender';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconChartLine } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useConfigStore, useThemeStore } from '@/stores';
import { ChartLineSelector } from '@/components/usage/ChartLineSelector';
import { DeferredUsageCard } from '@/components/usage/DeferredUsageCard';
import { StatCards } from '@/components/usage/StatCards';
import { UsageAnalysisSection } from '@/components/usage/UsageAnalysisSection';
import { UsagePageHero } from '@/components/usage/UsagePageHero';
import { UsageSectionIntro } from '@/components/usage/UsageSectionIntro';
import { useUsageAggregateChartData } from '@/components/usage/hooks/useUsageAggregateChartData';
import { useUsageAggregateData } from '@/components/usage/hooks/useUsageAggregateData';
import { useUsageViewState } from '@/components/usage/hooks/useUsageViewState';
import { getAggregateWindowModelNames } from '@/utils/usageAggregate';
import styles from './UsagePage.module.scss';

const EMPTY_CHART_LINES: string[] = [];

const LazyUsageChart = lazy(async () => ({
  default: (await import('@/components/usage/UsageChart')).UsageChart,
}));

const LazyUsageDetailsSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageDetailsSection')).UsageDetailsSection,
}));

const LazyUsageSupportSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageSupportSection')).UsageSupportSection,
}));

const buildTrendChartFallback = (requestTitle: string, tokenTitle: string, caption: string) => (
  <>
    <DeferredUsageCard title={requestTitle} caption={caption} />
    <DeferredUsageCard title={tokenTitle} caption={caption} />
  </>
);

const buildDetailsFallback = (apiTitle: string, modelTitle: string, caption: string) => (
  <section className={styles.section}>
    <div className={styles.detailsGrid}>
      <DeferredUsageCard title={apiTitle} caption={caption} />
      <DeferredUsageCard title={modelTitle} caption={caption} />
    </div>
  </section>
);

const buildSupportFallback = (credentialTitle: string, pricingTitle: string, caption: string) => (
  <div className={styles.supportStack}>
    <DeferredUsageCard title={credentialTitle} caption={caption} />
    <DeferredUsageCard title={pricingTitle} caption={caption} />
  </div>
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

  const visibleModelNames = useMemo(
    () => getAggregateWindowModelNames(deferredWindow),
    [deferredWindow]
  );
  const trendWindow = trendsCollapsed ? null : deferredWindow;
  const trendChartLines = trendsCollapsed ? EMPTY_CHART_LINES : deferredChartLines;

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
    window: trendWindow,
    chartLines: trendChartLines,
    isDark,
    isMobile,
    preferredPeriod: preferredChartPeriod,
    allModelsLabel: t('usage_stats.chart_line_all'),
  });

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
        <StatCards window={deferredWindow} loading={loading} modelPrices={modelPrices} />
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

      <DeferredRender
        minHeight={420}
        rootMargin="160px 0px"
        placeholder={buildDetailsFallback(
          t('usage_stats.api_details'),
          t('usage_stats.models'),
          deferredChartCaption
        )}
      >
        <Suspense
          fallback={buildDetailsFallback(
            t('usage_stats.api_details'),
            t('usage_stats.models'),
            deferredChartCaption
          )}
        >
          <LazyUsageDetailsSection
            window={deferredWindow}
            loading={loading}
            modelPrices={modelPrices}
          />
        </Suspense>
      </DeferredRender>

      <DeferredRender
        minHeight={420}
        rootMargin="160px 0px"
        placeholder={buildSupportFallback(
          t('usage_stats.credential_stats'),
          t('usage_stats.model_price_settings'),
          deferredChartCaption
        )}
      >
        <Suspense
          fallback={buildSupportFallback(
            t('usage_stats.credential_stats'),
            t('usage_stats.model_price_settings'),
            deferredChartCaption
          )}
        >
          <LazyUsageSupportSection
            usage={usage}
            window={deferredWindow}
            loading={loading}
            config={config}
            modelPrices={modelPrices}
            onPricesChange={setModelPrices}
          />
        </Suspense>
      </DeferredRender>
    </main>
  );
}
