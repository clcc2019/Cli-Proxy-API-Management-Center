import { useEffect, useState } from 'react';
import { useEventCallback } from './useEventCallback';
import { useInterval } from './useInterval';

interface UseVisibleIntervalOptions {
  enabled?: boolean;
  refreshOnVisible?: boolean;
}

const isDocumentVisible = () =>
  typeof document === 'undefined' || !document.hidden;

export function useVisibleInterval(
  callback: () => void,
  delay: number | null,
  options: UseVisibleIntervalOptions = {}
) {
  const { enabled = true, refreshOnVisible = true } = options;
  const stableCallback = useEventCallback(callback);
  const [visible, setVisible] = useState(isDocumentVisible);

  useInterval(stableCallback, enabled && visible ? delay : null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const nextVisible = !document.hidden;
      setVisible(nextVisible);

      if (nextVisible && enabled && refreshOnVisible && delay !== null) {
        stableCallback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delay, enabled, refreshOnVisible, stableCallback]);
}
