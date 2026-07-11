import { useCallback, useEffect, useRef } from 'react';

export function useTimeoutRegistry() {
  const timeoutIdsRef = useRef<Set<number>>(new Set());

  const clearAllTimeouts = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current.clear();
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delay);

    timeoutIdsRef.current.add(timeoutId);
    return () => {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(timeoutId);
    };
  }, []);

  useEffect(() => clearAllTimeouts, [clearAllTimeouts]);

  return { clearAllTimeouts, scheduleTimeout };
}
