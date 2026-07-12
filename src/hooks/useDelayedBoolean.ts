import { useEffect, useState } from 'react';

export function useDelayedBoolean(value: boolean, falseDelayMs: number): boolean {
  const [hidden, setHidden] = useState(!value);

  useEffect(() => {
    if (value) {
      if (!hidden) return undefined;
      const timeoutId = window.setTimeout(() => setHidden(false), 0);
      return () => window.clearTimeout(timeoutId);
    }

    if (hidden) return undefined;

    const timeoutId = window.setTimeout(
      () => {
        setHidden(true);
      },
      Math.max(0, falseDelayMs)
    );

    return () => window.clearTimeout(timeoutId);
  }, [falseDelayMs, hidden, value]);

  return value || !hidden;
}
