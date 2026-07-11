import { useEffect, useState } from 'react';

export function useDelayedBoolean(value: boolean, falseDelayMs: number): boolean {
  const [delayedValue, setDelayedValue] = useState(value);

  useEffect(() => {
    if (value) {
      setDelayedValue(true);
      return undefined;
    }

    if (!delayedValue) return undefined;
    if (falseDelayMs <= 0) {
      setDelayedValue(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setDelayedValue(false);
    }, falseDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayedValue, falseDelayMs, value]);

  return delayedValue;
}
