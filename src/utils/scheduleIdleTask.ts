type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface ScheduleIdleTaskOptions {
  delayMs?: number;
  fallbackDelayMs?: number;
  timeoutMs?: number;
}

export const scheduleIdleTask = (
  callback: () => void,
  options: ScheduleIdleTaskOptions = {}
): (() => void) => {
  if (typeof window === 'undefined') {
    callback();
    return () => {};
  }

  const { delayMs = 0, fallbackDelayMs = 0, timeoutMs = 2_000 } = options;
  const idleWindow = window as IdleCapableWindow;
  let cancelled = false;
  let delayTimeoutId: number | null = null;
  let fallbackTimeoutId: number | null = null;
  let idleHandle: number | null = null;

  const run = () => {
    if (cancelled) return;
    callback();
  };

  const schedule = () => {
    if (cancelled) return;
    if (typeof idleWindow.requestIdleCallback === 'function') {
      idleHandle = idleWindow.requestIdleCallback(run, { timeout: timeoutMs });
      return;
    }
    fallbackTimeoutId = window.setTimeout(run, fallbackDelayMs);
  };

  if (delayMs > 0) {
    delayTimeoutId = window.setTimeout(schedule, delayMs);
  } else {
    schedule();
  }

  return () => {
    cancelled = true;
    if (delayTimeoutId !== null) {
      window.clearTimeout(delayTimeoutId);
    }
    if (fallbackTimeoutId !== null) {
      window.clearTimeout(fallbackTimeoutId);
    }
    if (idleHandle !== null) {
      idleWindow.cancelIdleCallback?.(idleHandle);
    }
  };
};
