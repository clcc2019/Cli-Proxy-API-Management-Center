import { Suspense, lazy, memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from '@/components/ui/icons';
import { DeferredRender } from '@/components/common/DeferredRender';
import styles from '@/pages/UsagePage.module.scss';
import { DeferredUsageCard } from './DeferredUsageCard';
import { UsageSectionIntro } from './UsageSectionIntro';
import type { ModelPrice } from '@/utils/usage';
import type { UsageAggregateWindow } from '@/types/usageAggregate';

export interface UsageAnalysisSectionProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  modelPrices: Record<string, ModelPrice>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const loadUsageAnalysisCharts = () => import('./UsageAnalysisCharts');

const LazyLatencyTrendChart = lazy(async () => ({
  default: (await loadUsageAnalysisCharts()).LatencyTrendChart,
}));
const LazyCostTrendChart = lazy(async () => ({
  default: (await loadUsageAnalysisCharts()).CostTrendChart,
}));
const LazyTokenBreakdownChart = lazy(async () => ({
  default: (await loadUsageAnalysisCharts()).TokenBreakdownChart,
}));

export const UsageAnalysisSection = memo(function UsageAnalysisSection({
  window,
  loading,
  isDark,
  isMobile,
  hourWindowHours,
  modelPrices,
  collapsed: controlledCollapsed,
  onToggleCollapse,
}: UsageAnalysisSectionProps) {
  const { t } = useTranslation();
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const handleToggleCollapse = useCallback(() => {
    if (onToggleCollapse) {
      onToggleCollapse();
      return;
    }
    setInternalCollapsed((current) => !current);
  }, [onToggleCollapse]);
  const deferredChartCaption = t('usage_stats.render_on_demand');
  const latencyTrendTitle = t('usage_stats.latency_trend');
  const costTrendTitle = t('usage_stats.cost_trend');
  const tokenBreakdownTitle = t('usage_stats.token_breakdown');

  return (
    <section className={styles.section}>
      <UsageSectionIntro
        title={t('usage_stats.analysis_title')}
        description={t('usage_stats.analysis_desc')}
        action={
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={!collapsed}
            onClick={handleToggleCollapse}
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
      {!collapsed && (
        <div className={styles.analysisGrid}>
          <DeferredRender
            className={styles.deferredBlock}
            minHeight={380}
            placeholder={
              <DeferredUsageCard title={latencyTrendTitle} caption={deferredChartCaption} />
            }
          >
            <Suspense
              fallback={
                <DeferredUsageCard title={latencyTrendTitle} caption={deferredChartCaption} />
              }
            >
              <LazyLatencyTrendChart
                window={window}
                loading={loading}
                isDark={isDark}
                isMobile={isMobile}
                hourWindowHours={hourWindowHours}
              />
            </Suspense>
          </DeferredRender>

          <DeferredRender
            className={styles.deferredBlock}
            minHeight={380}
            placeholder={
              <DeferredUsageCard title={costTrendTitle} caption={deferredChartCaption} />
            }
          >
            <Suspense
              fallback={<DeferredUsageCard title={costTrendTitle} caption={deferredChartCaption} />}
            >
              <LazyCostTrendChart
                window={window}
                loading={loading}
                isDark={isDark}
                isMobile={isMobile}
                modelPrices={modelPrices}
                hourWindowHours={hourWindowHours}
              />
            </Suspense>
          </DeferredRender>

          <DeferredRender
            className={styles.deferredBlock}
            minHeight={380}
            placeholder={
              <DeferredUsageCard title={tokenBreakdownTitle} caption={deferredChartCaption} />
            }
          >
            <Suspense
              fallback={
                <DeferredUsageCard title={tokenBreakdownTitle} caption={deferredChartCaption} />
              }
            >
              <LazyTokenBreakdownChart
                window={window}
                loading={loading}
                isDark={isDark}
                isMobile={isMobile}
                hourWindowHours={hourWindowHours}
              />
            </Suspense>
          </DeferredRender>
        </div>
      )}
    </section>
  );
});

UsageAnalysisSection.displayName = 'UsageAnalysisSection';
