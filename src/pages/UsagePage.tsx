import { Suspense, lazy, useCallback, useDeferredValue, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DeferredRender } from '@/components/common/DeferredRender';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useConfigStore } from '@/stores';
import { DeferredUsageCard } from '@/components/usage/DeferredUsageCard';
import { StatCards } from '@/components/usage/StatCards';
import { UsagePageHeader } from '@/components/usage/UsagePageHeader';
import { UsageSectionIntro } from '@/components/usage/UsageSectionIntro';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useUsageAggregateData } from '@/components/usage/hooks/useUsageAggregateData';
import { useUsageTimeRangeState } from '@/components/usage/hooks/useUsageTimeRangeState';
import styles from './UsagePage.module.scss';

const LazyUsageDetailsSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageDetailsSection')).UsageDetailsSection,
}));

const LazyUsageSupportSection = lazy(async () => ({
  default: (await import('@/components/usage/UsageSupportSection')).UsageSupportSection,
}));

export function UsagePage() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
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

  const { deferredTimeRange, handleTimeRangeChange, timeRange, timeRangeOptions } =
    useUsageTimeRangeState();

  useHeaderRefresh(loadUsage, isCurrentLayer);

  const selectedWindow = useMemo(
    () => usage?.windows?.[deferredTimeRange] ?? null,
    [deferredTimeRange, usage]
  );
  const deferredWindow = useDeferredValue(selectedWindow);
  const visibleWindow = isCurrentLayer ? deferredWindow : null;
  const deferredChartCaption = t('usage_stats.render_on_demand');
  const detailsFallback = (
    <section className={styles.section}>
      <div className={styles.detailsGrid}>
        <DeferredUsageCard title={t('usage_stats.api_details')} caption={deferredChartCaption} />
        <DeferredUsageCard title={t('usage_stats.models')} caption={deferredChartCaption} />
      </div>
    </section>
  );
  const supportFallback = (
    <div className={styles.supportStack}>
      <DeferredUsageCard title={t('usage_stats.credential_stats')} caption={deferredChartCaption} />
    </div>
  );
  const handleRefresh = useCallback(() => {
    void loadUsage({ force: true }).catch(() => {});
  }, [loadUsage]);
  return (
    <main className={styles.container} data-xai-mode="console">
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
        />
        <StatCards window={visibleWindow} loading={loading} modelPrices={modelPrices} />
      </section>

      <div className={styles.workspaceGrid}>
        <DeferredRender
          className={styles.workspaceCell}
          minHeight={420}
          rootMargin="160px 0px"
          placeholder={detailsFallback}
        >
          <Suspense fallback={detailsFallback}>
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
          placeholder={supportFallback}
        >
          <Suspense fallback={supportFallback}>
            <LazyUsageSupportSection window={visibleWindow} loading={loading} config={config} />
          </Suspense>
        </DeferredRender>
      </div>
    </main>
  );
}
