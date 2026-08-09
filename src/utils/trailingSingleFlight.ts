export type SingleFlightMode = 'reuse' | 'refresh-after-current';

type SingleFlightEntry<T> = {
  active: Promise<T>;
  trailing: Promise<T> | null;
};

export type TrailingSingleFlight<TKey, TValue> = {
  run: (key: TKey, loader: () => Promise<TValue>, mode?: SingleFlightMode) => Promise<TValue>;
  clear: (key?: TKey) => void;
};

/**
 * Coalesces work by key while preserving explicit refresh semantics.
 *
 * Normal callers join the newest scheduled request. A refresh arriving during
 * an active request queues exactly one trailing request instead of aborting and
 * restarting the active transfer. Further refreshes join that trailing request.
 */
export const createTrailingSingleFlight = <TKey, TValue>(): TrailingSingleFlight<TKey, TValue> => {
  const entries = new Map<TKey, SingleFlightEntry<TValue>>();

  const begin = (
    key: TKey,
    entry: SingleFlightEntry<TValue>,
    loader: () => Promise<TValue>
  ): Promise<TValue> => {
    const request = Promise.resolve().then(loader);
    entry.active = request;

    const cleanup = () => {
      const current = entries.get(key);
      if (current === entry && current.active === request && current.trailing === null) {
        entries.delete(key);
      }
    };
    void request.then(cleanup, cleanup);
    return request;
  };

  const run = (
    key: TKey,
    loader: () => Promise<TValue>,
    mode: SingleFlightMode = 'reuse'
  ): Promise<TValue> => {
    const existing = entries.get(key);
    if (!existing) {
      const entry: SingleFlightEntry<TValue> = {
        active: Promise.resolve(undefined as TValue),
        trailing: null,
      };
      entries.set(key, entry);
      return begin(key, entry, loader);
    }

    if (mode === 'reuse') {
      return existing.trailing ?? existing.active;
    }
    if (existing.trailing) {
      return existing.trailing;
    }

    const trailing = existing.active
      .catch(() => undefined)
      .then(() => {
        existing.trailing = null;
        return begin(key, existing, loader);
      });
    existing.trailing = trailing;
    return trailing;
  };

  const clear = (key?: TKey) => {
    if (key === undefined) {
      entries.clear();
      return;
    }
    entries.delete(key);
  };

  return { run, clear };
};
