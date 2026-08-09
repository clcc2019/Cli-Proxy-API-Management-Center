import { useEffect, useRef, useState } from 'react';
import { useEventCallback } from './useEventCallback';
import { useInterval } from './useInterval';

interface UseVisibleIntervalOptions {
  enabled?: boolean;
  refreshOnVisible?: boolean;
  minRefreshGapMs?: number;
}

const isDocumentVisible = () => typeof document === 'undefined' || !document.hidden;

const isNavigatorOnline = () => typeof navigator === 'undefined' || navigator.onLine;

export function useVisibleInterval(
  callback: () => void,
  delay: number | null,
  options: UseVisibleIntervalOptions = {}
) {
  const { enabled = true, refreshOnVisible = true, minRefreshGapMs = 0 } = options;
  const stableCallback = useEventCallback(callback);
  const [visible, setVisible] = useState(isDocumentVisible);
  const [online, setOnline] = useState(isNavigatorOnline);
  const lastInvocationRef = useRef(0);
  const shouldTrackVisibility = enabled && delay !== null;
  const shouldRunInterval =
    shouldTrackVisibility && visible && online && isDocumentVisible() && isNavigatorOnline();

  const runCallback = useEventCallback(() => {
    lastInvocationRef.current = Date.now();
    stableCallback();
  });

  useInterval(runCallback, shouldRunInterval ? delay : null);

  useEffect(() => {
    if (typeof document === 'undefined' || !shouldTrackVisibility) return;

    if (lastInvocationRef.current === 0) {
      lastInvocationRef.current = Date.now();
    }

    const syncVisibility = () => {
      const nextVisible = isDocumentVisible();
      setVisible((previous) => (previous === nextVisible ? previous : nextVisible));
    };

    syncVisibility();

    const handleVisibilityChange = () => {
      const nextVisible = isDocumentVisible();
      setVisible((previous) => (previous === nextVisible ? previous : nextVisible));

      if (
        nextVisible &&
        isNavigatorOnline() &&
        enabled &&
        refreshOnVisible &&
        delay !== null &&
        Date.now() - lastInvocationRef.current >= Math.max(0, minRefreshGapMs)
      ) {
        runCallback();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [delay, enabled, minRefreshGapMs, refreshOnVisible, runCallback, shouldTrackVisibility]);

  useEffect(() => {
    if (typeof window === 'undefined' || !shouldTrackVisibility) return;
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [shouldTrackVisibility]);
}
