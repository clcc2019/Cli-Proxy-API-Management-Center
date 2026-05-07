import { useCallback, useMemo } from 'react';
import { USAGE_CHART_COLORS, withUsageColorAlpha } from '@/utils/usage/chartConfig';
import { buildAggregateSparklines } from '@/utils/usageAggregate';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import type { SparklineBundle } from './useSparklines';

export interface UseUsageAggregateSparklinesOptions {
  window: UsageAggregateWindow | null;
  loading: boolean;
}

export interface UseUsageAggregateSparklinesReturn {
  requestsSparkline: SparklineBundle | null;
  tokensSparkline: SparklineBundle | null;
  rpmSparkline: SparklineBundle | null;
  tpmSparkline: SparklineBundle | null;
  costSparkline: SparklineBundle | null;
}

export function useUsageAggregateSparklines({
  window,
  loading,
}: UseUsageAggregateSparklinesOptions): UseUsageAggregateSparklinesReturn {
  const sparklineSeries = useMemo(() => buildAggregateSparklines(window), [window]);

  const buildSparkline = useCallback(
    (
      series: { labels: string[]; data: number[] },
      color: string,
      backgroundColor: string
    ): SparklineBundle | null => {
      if (loading || !series.data.length || !series.data.some((value) => value > 0)) {
        return null;
      }

      return {
        data: {
          labels: series.labels,
          datasets: [
            {
              data: series.data,
              borderColor: color,
              backgroundColor,
              fill: true,
              tension: 0.45,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        },
      };
    },
    [loading]
  );

  const requestsSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: sparklineSeries.labels, data: sparklineSeries.requests },
        USAGE_CHART_COLORS.requests,
        withUsageColorAlpha(USAGE_CHART_COLORS.requests, 0.18)
      ),
    [buildSparkline, sparklineSeries.labels, sparklineSeries.requests]
  );

  const tokensSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: sparklineSeries.labels, data: sparklineSeries.tokens },
        USAGE_CHART_COLORS.tokens,
        withUsageColorAlpha(USAGE_CHART_COLORS.tokens, 0.18)
      ),
    [buildSparkline, sparklineSeries.labels, sparklineSeries.tokens]
  );

  const rpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: sparklineSeries.labels, data: sparklineSeries.requests },
        USAGE_CHART_COLORS.rpm,
        withUsageColorAlpha(USAGE_CHART_COLORS.rpm, 0.18)
      ),
    [buildSparkline, sparklineSeries.labels, sparklineSeries.requests]
  );

  const tpmSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: sparklineSeries.labels, data: sparklineSeries.tokens },
        USAGE_CHART_COLORS.tpm,
        withUsageColorAlpha(USAGE_CHART_COLORS.tpm, 0.18)
      ),
    [buildSparkline, sparklineSeries.labels, sparklineSeries.tokens]
  );

  const costSparkline = useMemo(
    () =>
      buildSparkline(
        { labels: sparklineSeries.labels, data: sparklineSeries.tokens },
        USAGE_CHART_COLORS.cost,
        withUsageColorAlpha(USAGE_CHART_COLORS.cost, 0.18)
      ),
    [buildSparkline, sparklineSeries.labels, sparklineSeries.tokens]
  );

  return {
    requestsSparkline,
    tokensSparkline,
    rpmSparkline,
    tpmSparkline,
    costSparkline,
  };
}
