import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ScriptableContext } from 'chart.js';
import { formatLatencyMs } from '@/utils/usage';
import { buildAggregateLatencyTrend } from '@/utils/usageAggregate';
import {
  USAGE_CHART_COLORS,
  buildChartOptions,
  buildUsageAreaGradient,
  withUsageColorAlpha,
} from '@/utils/usage/chartConfig';
import { getAdaptiveAnalysisChartPeriod } from './chartPeriod';
import { UsageChartPanel } from './UsageChartPanel';
import type { UsageAggregateWindow } from '@/types/usageAggregate';

export interface LatencyTrendChartProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
}

const LATENCY_COLOR = USAGE_CHART_COLORS.latency;
const LATENCY_BG = withUsageColorAlpha(LATENCY_COLOR, 0.14);
const isNonNegativeNumber = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const LatencyTrendChart = memo(function LatencyTrendChart({
  window,
  loading,
  isDark,
  isMobile,
  hourWindowHours,
}: LatencyTrendChartProps) {
  const { t } = useTranslation();
  const preferredPeriod = getAdaptiveAnalysisChartPeriod(hourWindowHours);
  const [period, setPeriod] = useState<'hour' | 'day'>(preferredPeriod);

  useEffect(() => {
    setPeriod(preferredPeriod);
  }, [preferredPeriod]);

  const { chartData, chartOptions, hasData, summary } = useMemo(() => {
    const series = buildAggregateLatencyTrend(window, period);
    const values = series.data.filter(isNonNegativeNumber);
    const latest = values.length ? values[values.length - 1] : 0;
    const peak = values.length ? Math.max(...values) : 0;
    const average = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

    const data = {
      labels: series.labels,
      datasets: [
        {
          label: t('usage_stats.avg_latency'),
          data: series.data,
          borderColor: LATENCY_COLOR,
          backgroundColor: (ctx: ScriptableContext<'line'>) =>
            buildUsageAreaGradient(ctx, LATENCY_COLOR, LATENCY_BG),
          pointBackgroundColor: LATENCY_COLOR,
          pointBorderColor: LATENCY_COLOR,
          fill: true,
          tension: 0.3,
          spanGaps: true,
        },
      ],
    };

    const baseOptions = buildChartOptions({ period, labels: series.labels, isDark, isMobile });
    const options = {
      ...baseOptions,
      scales: {
        ...baseOptions.scales,
        y: {
          ...baseOptions.scales?.y,
          ticks: {
            ...(baseOptions.scales?.y && 'ticks' in baseOptions.scales.y
              ? baseOptions.scales.y.ticks
              : {}),
            callback: (value: string | number) => formatLatencyMs(Number(value)),
          },
        },
      },
    };

    return {
      chartData: data,
      chartOptions: options,
      hasData: series.hasData,
      summary: { latest, peak, average },
    };
  }, [isDark, isMobile, period, t, window]);

  const summaryItems = [
    { label: t('usage_stats.chart_latest'), value: formatLatencyMs(summary.latest) },
    { label: t('usage_stats.chart_peak'), value: formatLatencyMs(summary.peak) },
    { label: t('usage_stats.avg_latency'), value: formatLatencyMs(summary.average) },
  ];

  return (
    <UsageChartPanel
      title={t('usage_stats.latency_trend')}
      period={period}
      onPeriodChange={setPeriod}
      chartData={chartData}
      chartOptions={chartOptions}
      loading={loading}
      isMobile={isMobile}
      emptyText={t('usage_stats.latency_no_data')}
      summaryItems={summaryItems}
      tone="success"
      hasData={hasData}
    />
  );
});

LatencyTrendChart.displayName = 'LatencyTrendChart';
