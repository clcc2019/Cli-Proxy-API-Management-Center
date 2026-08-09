import { Suspense, lazy, useCallback, useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeferredRender } from '@/components/common/DeferredRender';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconChartLine } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useConfigStore, useThemeStore } from '@/stores';
import { DeferredUsageCard } from '@/components/usage/DeferredUsageCard';
import { StatCards } from '@/components/usage/StatCards';
import { UsagePageHeader } from '@/components/usage/UsagePageHeader';
import { UsageSectionIntro } from '@/components/usage/UsageSectionIntro';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useUsageAggregateData } from '@/components/usage/hooks/useUsageAggregateData';
import { useUsageViewState } from '@/components/usage/hooks/useUsageViewState';
import { getAggregateWindowModelNames } from '@/utils/usageAggregate';
import styles from './UsagePage.module.scss';

const LazyUsageDetailsSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageDetailsSection')).UsageDetailsSection,
}));

const LazyUsageSupportSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageSupportSection')).UsageSupportSection,
}));

const LazyUsageTrendsSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageTrendsSection')).UsageTrendsSection,
}));

const LazyUsageAnalysisSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageAnalysisSection')).UsageAnalysisSection,
}));

const EMPTY_USAGE_MODEL_NAMES: string[] = [];

const buildDetailsFallback = (apiTitle: string, modelTitle: string, caption: string) => (
  <section className={styles.section}>
    <div className={styles.detailsGrid}>
      <DeferredUsageCard title={apiTitle} caption={caption} />
      <DeferredUsageCard title={modelTitle} caption={caption} />
    </div>
  </section>
);

const buildSupportFallback = (credentialTitle: string, caption: string) => (
  <div className={styles.supportStack}>
    <DeferredUsageCard title={credentialTitle} caption={caption} />
  </div>
);

const buildSectionFallback = (title: string, description: string) => (
  <section className={styles.section} aria-busy="true">
    <UsageSectionIntro title={title} description={description} />
  </section>
);

export function UsagePage() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isDark = useThemeStore((state) => isCurrentLayer && state.resolvedTheme === 'dark');
  const config = useConfigStore((state) => (isCurrentLayer ? state.config : null));

  const {
    usage,
    loading,
    error,
    modelPrices,
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
    timeRange,
    timeRangeOptions,
  } = useUsageViewState();

  useHeaderRefresh(loadUsage, isCurrentLayer);

  const selectedWindow = useMemo(
    () => usage?.windows?.[deferredTimeRange] ?? null,
    [deferredTimeRange, usage]
  );
  const deferredWindow = useDeferredValue(selectedWindow);
  const visibleWindow = isCurrentLayer ? deferredWindow : null;

  const visibleModelNames = useMemo(
    () => (visibleWindow ? getAggregateWindowModelNames(visibleWindow) : EMPTY_USAGE_MODEL_NAMES),
    [visibleWindow]
  );
  const deferredChartCaption = t('usage_stats.render_on_demand');
  const trendsTitle = t('usage_stats.trends_title');
  const trendsDescription = t('usage_stats.trends_desc');
  const analysisTitle = t('usage_stats.analysis_title');
  const analysisDescription = t('usage_stats.analysis_desc');
  const handleRefresh = useCallback(() => {
    void loadUsage({ force: true }).catch(() => {});
  }, [loadUsage]);
  return (
    <main className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} role="status" aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div id="usage-actions" className={`${styles.anchorBlock} ${styles.introBlock}`}>
        <UsagePageHeader
          timeRange={timeRange}
          timeRangeOptions={timeRangeOptions}
          loading={loading}
          exporting={exporting}
          exportingDetailed={exportingDetailed}
          importing={importing}
          onTimeRangeChange={handleTimeRangeChange}
          onExport={handleExport}
          onExportDetailed={handleExportDetailed}
          onImport={handleImport}
          onRefresh={handleRefresh}
          importInputRef={importInputRef}
          onImportChange={handleImportChange}
        />
      </div>

      {error && (
        <div className={styles.errorBox} role="alert">
          {error}
        </div>
      )}

      <section
        id="usage-overview"
        className={`${styles.section} ${styles.overviewPanel} ${styles.motionSection}`}
      >
        <UsageSectionIntro
          title={t('usage_stats.overview_title')}
          description={t('usage_stats.overview_desc')}
          eyebrow={
            <>
              <IconChartLine size={15} />
              {t('usage_stats.core_overview')}
            </>
          }
        />
        <StatCards window={visibleWindow} loading={loading} modelPrices={modelPrices} />
      </section>

      <DeferredRender
        minHeight={420}
        rootMargin="80px 0px"
        placeholder={buildSectionFallback(trendsTitle, trendsDescription)}
      >
        <Suspense fallback={buildSectionFallback(trendsTitle, trendsDescription)}>
          <LazyUsageTrendsSection
            initiallyCollapsed={false}
            window={visibleWindow}
            chartLines={chartLines}
            chartDataLines={deferredChartLines}
            modelNames={visibleModelNames}
            isDark={isDark}
            isMobile={isMobile}
            loading={loading}
            preferredPeriod={preferredChartPeriod}
            onChartLinesChange={handleChartLinesChange}
          />
        </Suspense>
      </DeferredRender>

      <div id="usage-analysis" className={`${styles.anchorBlock} ${styles.motionSection}`}>
        <DeferredRender
          minHeight={132}
          rootMargin="240px 0px"
          placeholder={buildSectionFallback(analysisTitle, analysisDescription)}
        >
          <Suspense fallback={buildSectionFallback(analysisTitle, analysisDescription)}>
            <LazyUsageAnalysisSection
              window={visibleWindow}
              loading={loading}
              isDark={isDark}
              isMobile={isMobile}
              hourWindowHours={hourWindowHours}
              modelPrices={modelPrices}
            />
          </Suspense>
        </DeferredRender>
      </div>

      <div className={styles.workspaceGrid}>
        <DeferredRender
          className={styles.workspaceCell}
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
              window={visibleWindow}
              loading={loading}
              modelPrices={modelPrices}
            />
          </Suspense>
        </DeferredRender>

        <DeferredRender
          className={styles.workspaceCell}
          minHeight={420}
          rootMargin="160px 0px"
          placeholder={buildSupportFallback(
            t('usage_stats.credential_stats'),
            deferredChartCaption
          )}
        >
          <Suspense
            fallback={buildSupportFallback(
              t('usage_stats.credential_stats'),
              deferredChartCaption
            )}
          >
            <LazyUsageSupportSection
              window={visibleWindow}
              loading={loading}
              config={config}
            />
          </Suspense>
        </DeferredRender>
      </div>
    </main>
  );
}
