import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconDiamond,
  IconDollarSign,
  IconSatellite,
  IconTimer,
  IconTrendingUp,
} from '@/components/ui/icons';
import {
  LATENCY_SOURCE_FIELD,
  formatCompactNumber,
  formatDurationMs,
  formatPerMinuteValue,
  formatUsd,
  type ModelPrice,
} from '@/utils/usage';
import { USAGE_CHART_COLORS, withUsageColorAlpha } from '@/utils/usage/chartConfig';
import {
  calculateAggregateWindowCost,
  getAggregateLatencySummary,
  getAggregateRateStats,
  getAggregateTokenBreakdown,
} from '@/utils/usageAggregate';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import { SvgSparkline } from './SvgSparkline';
import type { SparklineBundle } from './hooks/useSparklines';
import styles from '@/pages/UsagePage.module.scss';

interface StatCardData {
  key: string;
  label: string;
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  value: string;
  meta?: ReactNode;
  trend: SparklineBundle | null;
}

export interface StatCardsProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  modelPrices: Record<string, ModelPrice>;
  sparklines: {
    requests: SparklineBundle | null;
    tokens: SparklineBundle | null;
    rpm: SparklineBundle | null;
    tpm: SparklineBundle | null;
    cost: SparklineBundle | null;
  };
}

export const StatCards = memo(function StatCards({
  window,
  loading,
  modelPrices,
  sparklines,
}: StatCardsProps) {
  const { t } = useTranslation();
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const hasPrices = Object.keys(modelPrices).length > 0;

  const { tokenBreakdown, rateStats, totalCost, latencyStats } = useMemo(() => {
    const empty = {
      tokenBreakdown: { cachedTokens: 0, reasoningTokens: 0 },
      rateStats: { rpm: 0, tpm: 0, windowMinutes: 30, requestCount: 0, tokenCount: 0 },
      totalCost: 0,
      latencyStats: {
        averageMs: null as number | null,
        totalMs: null as number | null,
        sampleCount: 0,
      },
    };

    if (!window) return empty;

    return {
      tokenBreakdown: getAggregateTokenBreakdown(window),
      rateStats: getAggregateRateStats(window),
      totalCost: hasPrices ? calculateAggregateWindowCost(window, modelPrices) : 0,
      latencyStats: getAggregateLatencySummary(window),
    };
  }, [hasPrices, modelPrices, window]);

  const statsCards: StatCardData[] = [
    {
      key: 'requests',
      label: t('usage_stats.total_requests'),
      icon: <IconSatellite size={16} />,
      accent: USAGE_CHART_COLORS.requests,
      accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.requests, 0.16),
      accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.requests, 0.32),
      value: loading ? '-' : (window?.total_requests ?? 0).toLocaleString(),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            <span
              className={styles.statMetaDot}
              style={{ backgroundColor: USAGE_CHART_COLORS.success }}
            />
            {t('usage_stats.success_requests')}: {loading ? '-' : (window?.success_count ?? 0)}
          </span>
          <span className={styles.statMetaItem}>
            <span
              className={styles.statMetaDot}
              style={{ backgroundColor: USAGE_CHART_COLORS.failure }}
            />
            {t('usage_stats.failed_requests')}: {loading ? '-' : (window?.failure_count ?? 0)}
          </span>
          {latencyStats.sampleCount > 0 && (
            <span className={styles.statMetaItem} title={latencyHint}>
              {t('usage_stats.avg_time')}:{' '}
              {loading ? '-' : formatDurationMs(latencyStats.averageMs)}
            </span>
          )}
        </>
      ),
      trend: sparklines.requests,
    },
    {
      key: 'tokens',
      label: t('usage_stats.total_tokens'),
      icon: <IconDiamond size={16} />,
      accent: USAGE_CHART_COLORS.tokens,
      accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.tokens, 0.16),
      accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.tokens, 0.32),
      value: loading ? '-' : formatCompactNumber(window?.total_tokens ?? 0),
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.cached_tokens')}:{' '}
            {loading ? '-' : formatCompactNumber(tokenBreakdown.cachedTokens)}
          </span>
          <span className={styles.statMetaItem}>
            {t('usage_stats.reasoning_tokens')}:{' '}
            {loading ? '-' : formatCompactNumber(tokenBreakdown.reasoningTokens)}
          </span>
        </>
      ),
      trend: sparklines.tokens,
    },
    {
      key: 'rpm',
      label: t('usage_stats.rpm_30m'),
      icon: <IconTimer size={16} />,
      accent: USAGE_CHART_COLORS.rpm,
      accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.rpm, 0.16),
      accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.rpm, 0.32),
      value: loading ? '-' : formatPerMinuteValue(rateStats.rpm),
      meta: (
        <span className={styles.statMetaItem}>
          {t('usage_stats.total_requests')}:{' '}
          {loading ? '-' : rateStats.requestCount.toLocaleString()}
        </span>
      ),
      trend: sparklines.rpm,
    },
    {
      key: 'tpm',
      label: t('usage_stats.tpm_30m'),
      icon: <IconTrendingUp size={16} />,
      accent: USAGE_CHART_COLORS.tpm,
      accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.tpm, 0.16),
      accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.tpm, 0.32),
      value: loading ? '-' : formatPerMinuteValue(rateStats.tpm),
      meta: (
        <span className={styles.statMetaItem}>
          {t('usage_stats.total_tokens')}:{' '}
          {loading ? '-' : formatCompactNumber(rateStats.tokenCount)}
        </span>
      ),
      trend: sparklines.tpm,
    },
    {
      key: 'cost',
      label: t('usage_stats.total_cost'),
      icon: <IconDollarSign size={16} />,
      accent: USAGE_CHART_COLORS.cost,
      accentSoft: withUsageColorAlpha(USAGE_CHART_COLORS.cost, 0.16),
      accentBorder: withUsageColorAlpha(USAGE_CHART_COLORS.cost, 0.32),
      value: loading ? '-' : hasPrices ? formatUsd(totalCost) : '--',
      meta: (
        <>
          <span className={styles.statMetaItem}>
            {t('usage_stats.total_tokens')}:{' '}
            {loading ? '-' : formatCompactNumber(window?.total_tokens ?? 0)}
          </span>
          {!hasPrices && (
            <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
              {t('usage_stats.cost_need_price')}
            </span>
          )}
        </>
      ),
      trend: hasPrices ? sparklines.cost : null,
    },
  ];

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
          <div className={styles.statTrend}>
            {card.trend ? (
              <SvgSparkline className={styles.sparkline} sparkline={card.trend} />
            ) : (
              <div className={styles.statTrendPlaceholder}></div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

StatCards.displayName = 'StatCards';
