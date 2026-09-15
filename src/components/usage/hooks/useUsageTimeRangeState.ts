import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type UsageTimeRange } from '@/utils/usage';

const TIME_RANGE_STORAGE_KEY = 'cli-proxy-usage-time-range-v1';
const DEFAULT_TIME_RANGE: UsageTimeRange = '3h';

const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: UsageTimeRange; labelKey: string }> = [
  { value: 'all', labelKey: 'usage_stats.range_all' },
  { value: '1h', labelKey: 'usage_stats.range_1h' },
  { value: '3h', labelKey: 'usage_stats.range_3h' },
  { value: '6h', labelKey: 'usage_stats.range_6h' },
  { value: '12h', labelKey: 'usage_stats.range_12h' },
  { value: '24h', labelKey: 'usage_stats.range_24h' },
  { value: '7d', labelKey: 'usage_stats.range_7d' },
];

const isUsageTimeRange = (value: unknown): value is UsageTimeRange =>
  value === '1h' ||
  value === '3h' ||
  value === '6h' ||
  value === '12h' ||
  value === '24h' ||
  value === '7d' ||
  value === 'all';

const loadTimeRange = (): UsageTimeRange => {
  try {
    if (typeof localStorage === 'undefined') {
      return DEFAULT_TIME_RANGE;
    }

    const raw = localStorage.getItem(TIME_RANGE_STORAGE_KEY);
    return isUsageTimeRange(raw) ? raw : DEFAULT_TIME_RANGE;
  } catch {
    return DEFAULT_TIME_RANGE;
  }
};

const persistTimeRange = (timeRange: UsageTimeRange) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TIME_RANGE_STORAGE_KEY, timeRange);
    }
  } catch {
    // Ignore storage errors.
  }
};

export function useUsageTimeRangeState() {
  const { t } = useTranslation();
  const [timeRange, setTimeRange] = useState<UsageTimeRange>(loadTimeRange);
  const deferredTimeRange = useDeferredValue(timeRange);

  const timeRangeOptions = useMemo(
    () =>
      TIME_RANGE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t]
  );

  const handleTimeRangeChange = useCallback((value: string) => {
    if (!isUsageTimeRange(value)) {
      return;
    }

    startTransition(() => {
      setTimeRange(value);
    });
  }, []);

  useEffect(() => {
    persistTimeRange(timeRange);
  }, [timeRange]);

  return {
    timeRange,
    deferredTimeRange,
    timeRangeOptions,
    handleTimeRangeChange,
  };
}
