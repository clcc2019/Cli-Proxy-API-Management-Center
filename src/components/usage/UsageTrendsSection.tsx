import { lazy, memo, Suspense, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from '@/components/ui/icons';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import type { UsageChartPeriod } from './chartPeriod';
import { ChartLineSelector } from './ChartLineSelector';
import { DeferredUsageCard } from './DeferredUsageCard';
import { UsageSectionIntro } from './UsageSectionIntro';
import { useUsageAggregateChartData } from './hooks/useUsageAggregateChartData';
import styles from '@/pages/UsagePage.module.scss';

const LazyUsageChart = lazy(async () => ({
  default: (await import('./UsageAnalysisCharts')).UsageChart,
}));

interface UsageTrendsContentProps {
  window: UsageAggregateWindow | null;
  chartLines: string[];
  chartDataLines: string[];
  modelNames: string[];
  isDark: boolean;
  isMobile: boolean;
  loading: boolean;
  preferredPeriod: UsageChartPeriod;
  onChartLinesChange: (lines: string[]) => void;
}

const UsageTrendsContent = memo(function UsageTrendsContent({
  window,
  chartLines,
  chartDataLines,
  modelNames,
  isDark,
  isMobile,
  loading,
  preferredPeriod,
  onChartLinesChange,
}: UsageTrendsContentProps) {
  const { t } = useTranslation();
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
    window,
    chartLines: chartDataLines,
    isDark,
    isMobile,
    preferredPeriod,
    allModelsLabel: t('usage_stats.chart_line_all'),
  });
  const showComparePanel = modelNames.length > 1;
  const requestsTitle = t('usage_stats.requests_trend');
  const tokensTitle = t('usage_stats.tokens_trend');
  const fallbackCaption = t('usage_stats.render_on_demand');

  return (
    <div className={styles.trendGrid}>
      {showComparePanel && (
        <aside className={styles.trendSidebar}>
          <ChartLineSelector
            chartLines={chartLines}
            modelNames={modelNames}
            onChange={onChartLinesChange}
          />
        </aside>
      )}

      <div
        className={[styles.trendCharts, !showComparePanel ? styles.trendChartsFull : '']
          .filter(Boolean)
          .join(' ')}
      >
        <Suspense
          fallback={
            <>
              <DeferredUsageCard title={requestsTitle} caption={fallbackCaption} />
              <DeferredUsageCard title={tokensTitle} caption={fallbackCaption} />
            </>
          }
        >
          <LazyUsageChart
            title={requestsTitle}
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
            title={tokensTitle}
            period={tokensPeriod}
            onPeriodChange={setTokensPeriod}
            chartData={tokensChartData}
            chartOptions={tokensChartOptions}
            loading={loading}
            isMobile={isMobile}
            emptyText={t('usage_stats.no_data')}
            tone="neutral"
          />
        </Suspense>
      </div>
    </div>
  );
});

export interface UsageTrendsSectionProps extends UsageTrendsContentProps {
  initiallyCollapsed?: boolean;
}

export const UsageTrendsSection = memo(function UsageTrendsSection({
  initiallyCollapsed = true,
  ...contentProps
}: UsageTrendsSectionProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const handleToggle = useCallback(() => setCollapsed((current) => !current), []);

  return (
    <section id="usage-trends" className={styles.section}>
      <UsageSectionIntro
        title={t('usage_stats.trends_title')}
        description={t('usage_stats.trends_desc')}
        action={
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={!collapsed}
            onClick={handleToggle}
          >
            <span
              className={`${styles.sectionToggleIcon} ${
                !collapsed ? styles.sectionToggleIconExpanded : ''
              }`}
              aria-hidden="true"
            >
              <IconChevronDown size={14} />
            </span>
            <span>{t(collapsed ? 'common.expand' : 'common.collapse')}</span>
          </button>
        }
      />
      {!collapsed && <UsageTrendsContent {...contentProps} />}
    </section>
  );
});

UsageTrendsSection.displayName = 'UsageTrendsSection';
