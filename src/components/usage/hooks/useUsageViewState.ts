import { startTransition, useCallback, useDeferredValue, useEffect, useState } from 'react';
import { getAdaptiveChartPeriod } from '../chartPeriod';
import { useUsageTimeRangeState } from './useUsageTimeRangeState';

const CHART_LINES_STORAGE_KEY = 'cli-proxy-usage-chart-lines-v1';
const DEFAULT_CHART_LINES = ['all'];
export const MAX_USAGE_CHART_LINES = 5;

import type { UsageTimeRange } from '@/utils/usage';
const HOUR_WINDOW_BY_TIME_RANGE: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '1h': 1,
  '3h': 3,
  '6h': 6,
  '12h': 12,
  '24h': 24,
  '7d': 7 * 24,
};

const normalizeChartLines = (value: unknown, maxLines: number): string[] => {
  if (!Array.isArray(value)) {
    return DEFAULT_CHART_LINES;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  return filtered.length ? filtered : DEFAULT_CHART_LINES;
};

const loadChartLines = (maxLines: number): string[] => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_CHART_LINES;
    }

    const raw = localStorage.getItem(CHART_LINES_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_CHART_LINES;
    }

    return normalizeChartLines(JSON.parse(raw), maxLines);
  } catch {
    return DEFAULT_CHART_LINES;
  }
};

const persistUsageViewValue = (key: string, value: string) => {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors.
  }
};

export function useUsageViewState(maxLines = MAX_USAGE_CHART_LINES) {
  const { timeRange, deferredTimeRange, timeRangeOptions, handleTimeRangeChange } =
    useUsageTimeRangeState();
  const [chartLines, setChartLines] = useState<string[]>(() => loadChartLines(maxLines));
  const deferredChartLines = useDeferredValue(chartLines);
  const hourWindowHours =
    deferredTimeRange === 'all' ? undefined : HOUR_WINDOW_BY_TIME_RANGE[deferredTimeRange];

  const handleChartLinesChange = useCallback(
    (lines: string[]) => {
      startTransition(() => {
        setChartLines(normalizeChartLines(lines, maxLines));
      });
    },
    [maxLines]
  );

  useEffect(() => {
    persistUsageViewValue(CHART_LINES_STORAGE_KEY, JSON.stringify(chartLines));
  }, [chartLines]);

  return {
    chartLines,
    deferredChartLines,
    timeRange,
    deferredTimeRange,
    timeRangeOptions,
    hourWindowHours,
    preferredChartPeriod: getAdaptiveChartPeriod(hourWindowHours),
    handleChartLinesChange,
    handleTimeRangeChange,
  };
}
