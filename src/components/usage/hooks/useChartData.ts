import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { buildChartData, type ChartData } from '@/utils/usage';
import { buildChartOptions } from '@/utils/usage/chartConfig';
import { useSyncedUsageChartPeriods, type UsageChartPeriod } from '../chartPeriod';
import type { UsagePayload } from './useUsageData';
import { relabelAllModels } from './chartDataUtils';

export interface UseChartDataOptions {
  usage: UsagePayload | null;
  chartLines: string[];
  isDark: boolean;
  isMobile: boolean;
  hourWindowHours?: number;
  preferredPeriod?: UsageChartPeriod;
  allModelsLabel?: string;
}

export interface UseChartDataReturn {
  requestsPeriod: UsageChartPeriod;
  setRequestsPeriod: (period: UsageChartPeriod) => void;
  tokensPeriod: UsageChartPeriod;
  setTokensPeriod: (period: UsageChartPeriod) => void;
  requestsChartData: ChartData;
  tokensChartData: ChartData;
  requestsChartOptions: ChartOptions<'line'>;
  tokensChartOptions: ChartOptions<'line'>;
}

export function useChartData({
  usage,
  chartLines,
  isDark,
  isMobile,
  hourWindowHours,
  preferredPeriod = 'day',
  allModelsLabel,
}: UseChartDataOptions): UseChartDataReturn {
  const { requestsPeriod, setRequestsPeriod, tokensPeriod, setTokensPeriod } =
    useSyncedUsageChartPeriods(preferredPeriod);

  const requestsChartData = useMemo(() => {
    if (!usage) {
      return { labels: [], datasets: [] };
    }

    const chartData = buildChartData(usage, requestsPeriod, 'requests', chartLines, {
      hourWindowHours,
    });
    return relabelAllModels(chartData, allModelsLabel);
  }, [allModelsLabel, chartLines, hourWindowHours, requestsPeriod, usage]);

  const tokensChartData = useMemo(() => {
    if (!usage) {
      return { labels: [], datasets: [] };
    }

    const chartData = buildChartData(usage, tokensPeriod, 'tokens', chartLines, {
      hourWindowHours,
    });
    return relabelAllModels(chartData, allModelsLabel);
  }, [allModelsLabel, chartLines, hourWindowHours, tokensPeriod, usage]);

  const requestsChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: requestsPeriod,
        labels: requestsChartData.labels,
        isDark,
        isMobile,
      }),
    [requestsPeriod, requestsChartData.labels, isDark, isMobile]
  );

  const tokensChartOptions = useMemo(
    () =>
      buildChartOptions({
        period: tokensPeriod,
        labels: tokensChartData.labels,
        isDark,
        isMobile,
      }),
    [tokensPeriod, tokensChartData.labels, isDark, isMobile]
  );

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
    requestsChartData,
    tokensChartData,
    requestsChartOptions,
    tokensChartOptions,
  };
}
