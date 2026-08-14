import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LATENCY_SOURCE_FIELD,
  formatCompactNumber,
  formatDurationMs,
  formatPerMinuteValue,
  formatUsd,
  type ModelPrice,
} from '@/utils/usage';
import { getAggregateOverviewMetrics } from '@/utils/usageAggregate';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import { StatCard } from './StatCard';
import styles from '@/pages/UsagePage.module.scss';

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

  const cards = useMemo(() => {
    return [
      {
        key: 'requests',
        label: t('usage_stats.total_requests'),
      },
      {
        key: 'tokens',
        label: t('usage_stats.total_tokens'),
      },
      {
        key: 'rate',
        label: t('usage_stats.rate_30m'),
      },
      {
        key: 'cost',
        label: t('usage_stats.total_cost'),
      },
    ];
  }, [t]);

  const requestsValue = loading ? '-' : metrics.totalRequests.toLocaleString();
  const requestsMeta: ReactNode = (
    <>
      <span className={`${styles.statMetaItem} ${styles.statSuccess}`}>
        {t('usage_stats.success_requests')}:{' '}
        {loading
          ? '-'
          : `${metrics.successCount.toLocaleString()} (${formatPercentage(metrics.successRate)})`}
      </span>
      <span className={styles.statMetaItem}>
        {t('usage_stats.failed_requests')}:{' '}
        {loading
          ? '-'
          : `${metrics.failureCount.toLocaleString()} (${formatPercentage(metrics.failureRate)})`}
      </span>
      {metrics.latencyStats.sampleCount > 0 && (
        <>
          <span className={styles.statMetaItem} title={latencyHint}>
            {t('usage_stats.avg_time')}: {loading ? '-' : formatDurationMs(metrics.latencyStats.averageMs)}
          </span>
          <span className={styles.statMetaItem}>
            {t('usage_stats.latency_samples')}:{' '}
            {loading ? '-' : metrics.latencyStats.sampleCount.toLocaleString()}
          </span>
        </>
      )}
    </>
  );

  const tokensValue = loading ? '-' : formatCompactNumber(metrics.totalTokens);
  const tokensMeta: ReactNode = (
    <>
      <span className={styles.statMetaItem}>
        {t('usage_stats.cached_tokens')}:{' '}
        {loading
          ? '-'
          : `${formatCompactNumber(metrics.tokenBreakdown.cachedTokens)} (${formatPercentage(
              metrics.tokenBreakdown.cachedRate
            )})`}
      </span>
      <span className={styles.statMetaItem}>
        {t('usage_stats.reasoning_tokens')}:{' '}
        {loading
          ? '-'
          : `${formatCompactNumber(metrics.tokenBreakdown.reasoningTokens)} (${formatPercentage(
              metrics.tokenBreakdown.reasoningRate
            )})`}
      </span>
    </>
  );

  const rateValue: ReactNode = (
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
  );
  const rateMeta: ReactNode = (
    <>
      <span className={styles.statMetaItem}>
        {t('usage_stats.total_requests')}: {loading ? '-' : metrics.rateStats.requestCount.toLocaleString()}
      </span>
      <span className={styles.statMetaItem}>
        {t('usage_stats.total_tokens')}: {loading ? '-' : formatCompactNumber(metrics.rateStats.tokenCount)}
      </span>
    </>
  );

  const costValue = loading ? '-' : metrics.hasPrices ? formatUsd(metrics.totalCost) : '--';
  const costMeta: ReactNode = (
    <>
      <span className={styles.statMetaItem}>
        {t('usage_stats.total_tokens')}: {loading ? '-' : formatCompactNumber(metrics.totalTokens)}
      </span>
      {metrics.hasPrices && metrics.modelCount > 0 ? (
        <span className={styles.statMetaItem}>
          {t('usage_stats.priced_models')}: {loading ? '-' : `${metrics.pricedModelCount}/${metrics.modelCount}`}
        </span>
      ) : (
        !metrics.hasPrices && (
          <span className={`${styles.statMetaItem} ${styles.statSubtle}`}>
            {t('usage_stats.cost_need_price')}
          </span>
        )
      )}
    </>
  );

  const values: Record<string, ReactNode> = {
    requests: requestsValue,
    tokens: tokensValue,
    rate: rateValue,
    cost: costValue,
  };
  const metas: Record<string, ReactNode> = {
    requests: requestsMeta,
    tokens: tokensMeta,
    rate: rateMeta,
    cost: costMeta,
  };

  return (
    <div className={styles.statsGrid}>
      {cards.map((card) => (
        <StatCard
          key={card.key}
          cardKey={card.key}
          label={card.label}
          value={values[card.key]}
          meta={metas[card.key]}
        />
      ))}
    </div>
  );
});

StatCards.displayName = 'StatCards';
