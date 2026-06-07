import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconDiamond, IconDollarSign, IconSatellite, IconTimer } from '@/components/ui/icons';
import {
  LATENCY_SOURCE_FIELD,
  formatCompactNumber,
  formatDurationMs,
  formatPerMinuteValue,
  formatUsd,
  type ModelPrice,
} from '@/utils/usage';
import { USAGE_CHART_COLORS, withUsageColorAlpha } from '@/utils/usage/chartConfig';
import { getAggregateOverviewMetrics } from '@/utils/usageAggregate';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import styles from '@/pages/UsagePage.module.scss';

interface StatCardData {
  key: string;
  label: string;
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  value: ReactNode;
  meta?: ReactNode;
}

const formatPercentage = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) {
    return '-';
  }

  const percent = value * 100;
  const decimals = percent > 0 && percent < 0.1 ? 2 : 1;
  return `${percent.toFixed(decimals)}%`;
};

export interface StatCardsProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  modelPrices: Record<string, ModelPrice>;
}

export const StatCards = memo(function StatCards({ window, loading, modelPrices }: StatCardsProps) {
  const { t } = useTranslation();
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const metrics = useMemo(
    () => getAggregateOverviewMetrics(window, modelPrices),
    [modelPrices, window]
  );

  const statsCards = useMemo<StatCardData[]>(
    () => [
      {
        key: 'requests',
        label: t('usage_stats.total_requests'),
        icon: <IconSatellite size={16} />,
        accent: USAGE_CHART_COLORS.requests,
        accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.requests, 0.16),
        accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.requests, 0.32),
        value: loading ? '-' : metrics.totalRequests.toLocaleString(),
        meta: (
          <>
            <span className={styles.statMetaItem}>
              {t('usage_stats.success_requests')}:{' '}
              {loading
                ? '-'
                : `${metrics.successCount.toLocaleString()} (${formatPercentage(
                    metrics.successRate
                  )})`}
            </span>
            <span className={styles.statMetaItem}>
              {t('usage_stats.failed_requests')}:{' '}
              {loading
                ? '-'
                : `${metrics.failureCount.toLocaleString()} (${formatPercentage(
                    metrics.failureRate
                  )})`}
            </span>
            {metrics.latencyStats.sampleCount > 0 && (
              <>
                <span className={styles.statMetaItem} title={latencyHint}>
                  {t('usage_stats.avg_time')}:{' '}
                  {loading ? '-' : formatDurationMs(metrics.latencyStats.averageMs)}
                </span>
                <span className={styles.statMetaItem}>
                  {t('usage_stats.latency_samples')}:{' '}
                  {loading ? '-' : metrics.latencyStats.sampleCount.toLocaleString()}
                </span>
              </>
            )}
          </>
        ),
      },
      {
        key: 'tokens',
        label: t('usage_stats.total_tokens'),
        icon: <IconDiamond size={16} />,
        accent: USAGE_CHART_COLORS.tokens,
        accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.tokens, 0.16),
        accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.tokens, 0.32),
        value: loading ? '-' : formatCompactNumber(metrics.totalTokens),
        meta: (
          <>
            <span className={styles.statMetaItem}>
              {t('usage_stats.cached_tokens')}:{' '}
              {loading
                ? '-'
                : `${formatCompactNumber(
                    metrics.tokenBreakdown.cachedTokens
                  )} (${formatPercentage(metrics.tokenBreakdown.cachedRate)})`}
            </span>
            <span className={styles.statMetaItem}>
              {t('usage_stats.reasoning_tokens')}:{' '}
              {loading
                ? '-'
                : `${formatCompactNumber(
                    metrics.tokenBreakdown.reasoningTokens
                  )} (${formatPercentage(metrics.tokenBreakdown.reasoningRate)})`}
            </span>
          </>
        ),
      },
      {
        key: 'rate',
        label: t('usage_stats.rate_30m'),
        icon: <IconTimer size={16} />,
        accent: USAGE_CHART_COLORS.rpm,
        accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.rpm, 0.16),
        accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.rpm, 0.32),
        value: (
          <span className={styles.statSplitValue}>
            <span className={styles.statSplitItem}>
              <strong>{loading ? '-' : formatPerMinuteValue(metrics.rateStats.rpm)}</strong>
              <span>{t('usage_stats.rpm_30m')}</span>
            </span>
            <span className={styles.statSplitDivider} aria-hidden="true" />
            <span className={styles.statSplitItem}>
              <strong>{loading ? '-' : formatPerMinuteValue(metrics.rateStats.tpm)}</strong>
              <span>{t('usage_stats.tpm_30m')}</span>
            </span>
          </span>
        ),
        meta: (
          <>
            <span className={styles.statMetaItem}>
              {t('usage_stats.total_requests')}:{' '}
              {loading ? '-' : metrics.rateStats.requestCount.toLocaleString()}
            </span>
            <span className={styles.statMetaItem}>
              {t('usage_stats.total_tokens')}:{' '}
              {loading ? '-' : formatCompactNumber(metrics.rateStats.tokenCount)}
            </span>
          </>
        ),
      },
      {
        key: 'cost',
        label: t('usage_stats.total_cost'),
        icon: <IconDollarSign size={16} />,
        accent: USAGE_CHART_COLORS.cost,
        accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.cost, 0.16),
        accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.cost, 0.32),
        value: loading ? '-' : metrics.hasPrices ? formatUsd(metrics.totalCost) : '--',
        meta: (
          <>
            <span className={styles.statMetaItem}>
              {t('usage_stats.total_tokens')}:{' '}
              {loading ? '-' : formatCompactNumber(metrics.totalTokens)}
            </span>
            {metrics.hasPrices && metrics.modelCount > 0 ? (
              <span className={styles.statMetaItem}>
                {t('usage_stats.priced_models')}:{' '}
                {loading ? '-' : `${metrics.pricedModelCount}/${metrics.modelCount}`}
              </span>
            ) : (
              !metrics.hasPrices && (
                <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
                  {t('usage_stats.cost_need_price')}
                </span>
              )
            )}
          </>
        ),
      },
    ],
    [latencyHint, loading, metrics, t]
  );

  return (
    <div className={styles.statsGrid}>
      {statsCards.map((card) => (
        <div
          key={card.key}
          className={styles.statCard}
          style={
            {
              '--accent': card.accent,
              '--accent-soft': card.accentSoft,
              '--accent-border': card.accentBorder,
            } as CSSProperties
          }
        >
          <div className={styles.statCardHeader}>
            <div className={styles.statLabelGroup}>
              <span className={styles.statLabel}>{card.label}</span>
            </div>
            <span className={styles.statIconBadge}>{card.icon}</span>
          </div>
          <div className={styles.statValue}>{card.value}</div>
          {card.meta && <div className={styles.statMetaRow}>{card.meta}</div>}
        </div>
      ))}
    </div>
  );
});

StatCards.displayName = 'StatCards';
