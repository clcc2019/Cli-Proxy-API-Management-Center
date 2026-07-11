import { useEffect, useState } from 'react';

export type UsageChartPeriod = 'hour' | 'day';

export interface SyncedUsageChartPeriods {
  requestsPeriod: UsageChartPeriod;
  setRequestsPeriod: (period: UsageChartPeriod) => void;
  tokensPeriod: UsageChartPeriod;
  setTokensPeriod: (period: UsageChartPeriod) => void;
}

export const getAdaptiveChartPeriod = (hourWindowHours?: number): UsageChartPeriod => {
  if (!hourWindowHours) {
    return 'day';
  }

  return hourWindowHours <= 24 ? 'hour' : 'day';
};

export const getAdaptiveAnalysisChartPeriod = (
  hourWindowHours?: number
): UsageChartPeriod => {
  if (!hourWindowHours) {
    return 'day';
  }

  return hourWindowHours <= 7 * 24 ? 'hour' : 'day';
};

export const useAdaptiveAnalysisChartPeriod = (
  hourWindowHours?: number
): [UsageChartPeriod, (period: UsageChartPeriod) => void] => {
  const preferredPeriod = getAdaptiveAnalysisChartPeriod(hourWindowHours);
  const [period, setPeriod] = useState<UsageChartPeriod>(preferredPeriod);

  useEffect(() => {
    setPeriod(preferredPeriod);
  }, [preferredPeriod]);

  return [period, setPeriod];
};

export const useSyncedUsageChartPeriods = (
  preferredPeriod: UsageChartPeriod = 'day'
): SyncedUsageChartPeriods => {
  const [requestsPeriod, setRequestsPeriod] = useState<UsageChartPeriod>(preferredPeriod);
  const [tokensPeriod, setTokensPeriod] = useState<UsageChartPeriod>(preferredPeriod);

  useEffect(() => {
    setRequestsPeriod(preferredPeriod);
    setTokensPeriod(preferredPeriod);
  }, [preferredPeriod]);

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
  };
};
