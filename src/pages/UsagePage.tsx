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
import { UsageAnalysisSection } from '@/components/usage/UsageAnalysisSection';
import { UsagePageHero } from '@/components/usage/UsagePageHero';
import { UsageSectionIntro } from '@/components/usage/UsageSectionIntro';
import { UsageTrendsSection } from '@/components/usage/UsageTrendsSection';
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
  const deferredChartCaption = t('usage_stats.render_on_demand');
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
        <StatCards window={deferredWindow} loading={loading} modelPrices={modelPrices} />
      </section>

      <UsageTrendsSection
        window={deferredWindow}
        chartLines={chartLines}
        chartDataLines={deferredChartLines}
        modelNames={visibleModelNames}
        isDark={isDark}
        isMobile={isMobile}
        loading={loading}
        preferredPeriod={preferredChartPeriod}
        onChartLinesChange={handleChartLinesChange}
      />

      <div id="usage-analysis" className={`${styles.anchorBlock} ${styles.motionSection}`}>
        <UsageAnalysisSection
          window={deferredWindow}
          loading={loading}
          isDark={isDark}
          isMobile={isMobile}
          hourWindowHours={hourWindowHours}
          modelPrices={modelPrices}
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
