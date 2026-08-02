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
  const shouldTrackVisibility = enabled && delay !== null;
  const shouldRunInterval = shouldTrackVisibility && visible && isDocumentVisible();

  useInterval(stableCallback, shouldRunInterval ? delay : null);

  useEffect(() => {
    if (typeof document === 'undefined' || !shouldTrackVisibility) return;

    const syncVisibility = () => {
      const nextVisible = isDocumentVisible();
      setVisible((previous) => (previous === nextVisible ? previous : nextVisible));
    };

    syncVisibility();

    const handleVisibilityChange = () => {
      const nextVisible = isDocumentVisible();
      setVisible((previous) => (previous === nextVisible ? previous : nextVisible));

      if (nextVisible && enabled && refreshOnVisible && delay !== null) {
        stableCallback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delay, enabled, refreshOnVisible, shouldTrackVisibility, stableCallback]);
}
