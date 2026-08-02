import { useCallback, useState } from 'react';

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

export const getAdaptiveAnalysisChartPeriod = (hourWindowHours?: number): UsageChartPeriod => {
  if (!hourWindowHours) {
    return 'day';
  }

  return hourWindowHours <= 7 * 24 ? 'hour' : 'day';
};

export const useAdaptiveAnalysisChartPeriod = (
  hourWindowHours?: number
): [UsageChartPeriod, (period: UsageChartPeriod) => void] => {
  const preferredPeriod = getAdaptiveAnalysisChartPeriod(hourWindowHours);
  const [selection, setSelection] = useState(() => ({
    preferredPeriod,
    period: preferredPeriod,
  }));

  // Derive the reset value from the latest preference during render. This avoids an effect-driven
  // intermediate chart render when the selected window changes from hourly to daily (or back).
  const period = selection.preferredPeriod === preferredPeriod ? selection.period : preferredPeriod;
  const setPeriod = useCallback(
    (nextPeriod: UsageChartPeriod) => {
      setSelection({ preferredPeriod, period: nextPeriod });
    },
    [preferredPeriod]
  );

  return [period, setPeriod];
};

export const useSyncedUsageChartPeriods = (
  preferredPeriod: UsageChartPeriod = 'day'
): SyncedUsageChartPeriods => {
  const [selection, setSelection] = useState(() => ({
    preferredPeriod,
    requestsPeriod: preferredPeriod,
    tokensPeriod: preferredPeriod,
  }));

  const hasCurrentPreference = selection.preferredPeriod === preferredPeriod;
  const requestsPeriod = hasCurrentPreference ? selection.requestsPeriod : preferredPeriod;
  const tokensPeriod = hasCurrentPreference ? selection.tokensPeriod : preferredPeriod;
  const setRequestsPeriod = useCallback(
    (nextPeriod: UsageChartPeriod) => {
      setSelection((current) => ({
        preferredPeriod,
        requestsPeriod: nextPeriod,
        tokensPeriod:
          current.preferredPeriod === preferredPeriod ? current.tokensPeriod : preferredPeriod,
      }));
    },
    [preferredPeriod]
  );
  const setTokensPeriod = useCallback(
    (nextPeriod: UsageChartPeriod) => {
      setSelection((current) => ({
        preferredPeriod,
        requestsPeriod:
          current.preferredPeriod === preferredPeriod ? current.requestsPeriod : preferredPeriod,
        tokensPeriod: nextPeriod,
      }));
    },
    [preferredPeriod]
  );

  return {
    requestsPeriod,
    setRequestsPeriod,
    tokensPeriod,
    setTokensPeriod,
  };
};
