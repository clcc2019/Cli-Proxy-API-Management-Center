import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import { buildAggregateChartData } from '@/utils/usageAggregate';
import type { ChartData } from '@/utils/usage';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import { useSyncedUsageChartPeriods, type UsageChartPeriod } from '../chartPeriod';
import { relabelAllModels } from './chartDataUtils';

const EMPTY_CHART_DATA: ChartData = {
  labels: [],
  datasets: [],
};

export interface UseUsageAggregateChartDataOptions {
  window: UsageAggregateWindow | null;
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  preferredPeriod?: UsageChartPeriod;
  allModelsLabel?: string;
}

export interface UseUsageAggregateChartDataReturn {
  requestsPeriod: UsageChartPeriod;
  setRequestsPeriod: (period: UsageChartPeriod) => void;
  tokensPeriod: UsageChartPeriod;
  setTokensPeriod: (period: UsageChartPeriod) => void;
  requestsChartData: ChartData;
  tokensChartData: ChartData;
  requestsChartOptions: ChartOptions<'line'>;
  tokensChartOptions: ChartOptions<'line'>;
}

export function useUsageAggregateChartData({
  window,
  chartLines,
  isDark,
  isMobile,
  preferredPeriod = 'day',
  allModelsLabel
}: UseUsageAggregateChartDataOptions): UseUsageAggregateChartDataReturn {
  const { requestsPeriod, setRequestsPeriod, tokensPeriod, setTokensPeriod } =
    useSyncedUsageChartPeriods(preferredPeriod);

  const requestsChartData = useMemo(() => {
    if (!window) {
      return EMPTY_CHART_DATA;
    }

    const chartData = buildAggregateChartData(window, requestsPeriod, 'requests', chartLines);
    return relabelAllModels(chartData, allModelsLabel);
  }, [allModelsLabel, chartLines, requestsPeriod, window]);

  const tokensChartData = useMemo(() => {
    if (!window) {
      return EMPTY_CHART_DATA;
    }

    const chartData = buildAggregateChartData(window, tokensPeriod, 'tokens', chartLines);
    return relabelAllModels(chartData, allModelsLabel);
  }, [allModelsLabel, chartLines, tokensPeriod, window]);

  const emptyChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: preferredPeriod,
        labels: EMPTY_CHART_DATA.labels,
        isDark,
        isMobile
      }),
    [isDark, isMobile, preferredPeriod]
  );

  const requestsChartOptions = useMemo(
    () =>
      window
        ? buildChartOptions({
            period: requestsPeriod,
            labels: requestsChartData.labels,
            isDark,
            isMobile
          })
        : emptyChartOptions,
    [emptyChartOptions, isDark, isMobile, requestsChartData.labels, requestsPeriod, window]
  );

  const tokensChartOptions = useMemo(
    () =>
      window
        ? buildChartOptions({
            period: tokensPeriod,
            labels: tokensChartData.labels,
            isDark,
            isMobile
          })
        : emptyChartOptions,
    [emptyChartOptions, isDark, isMobile, tokensChartData.labels, tokensPeriod, window]
  );

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions
  };
}
