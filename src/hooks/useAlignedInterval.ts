import { useEffect } from 'react';
import { useEventCallback } from './useEventCallback';

interface UseAlignedIntervalOptions {
  enabled?: boolean;
  getDelayUntilNextTick?: (delay: number) => number;
}

const getDefaultDelayUntilNextTick = (delay: number) => {
  const remainder = Date.now() % delay;
  return remainder === 0 ? delay : delay - remainder;
};

export function useAlignedInterval(
  callback: () => void,
  delay: number | null,
  options: UseAlignedIntervalOptions = {}
) {
  const { enabled = true, getDelayUntilNextTick = getDefaultDelayUntilNextTick } =
    options;
  const stableCallback = useEventCallback(callback);

  useEffect(() => {
    if (!enabled || delay === null || delay <= 0) return;

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      stableCallback();
      intervalId = window.setInterval(stableCallback, delay);
    }, getDelayUntilNextTick(delay));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [delay, enabled, getDelayUntilNextTick, stableCallback]);
}
