/**
 * 定时器 Hook
 */

import { useEffect } from 'react';
import { useEventCallback } from './useEventCallback';

export function useInterval(callback: () => void, delay: number | null) {
  const stableCallback = useEventCallback(callback);

  useEffect(() => {
    if (delay === null) return;

    const id = setInterval(stableCallback, delay);
    return () => clearInterval(id);
  }, [delay, stableCallback]);
}
