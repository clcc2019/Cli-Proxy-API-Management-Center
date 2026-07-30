/**
 * Quota cache that survives page refreshes.
 */

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { ClaudeQuotaState, CodexQuotaState, KimiQuotaState } from '@/types';
import { STORAGE_KEY_QUOTA_CACHE } from '@/utils/constants';
import { scheduleIdleTask } from '@/utils/scheduleIdleTask';

type QuotaUpdater<T> = T | ((prev: T) => T);
type PersistableQuotaState = Pick<QuotaStoreState, 'claudeQuota' | 'codexQuota' | 'kimiQuota'>;
type PersistedQuotaEnvelope = { state?: Partial<PersistableQuotaState>; version?: number };
type QuotaSnapshot = { status?: string };

interface QuotaStoreState {
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

const createEmptyQuotaCache = (): PersistableQuotaState => ({
  claudeQuota: {},
  codexQuota: {},
  kimiQuota: {},
});

const resolveUpdater = <T>(updater: QuotaUpdater<T>, prev: T): T => {
  if (typeof updater === 'function') {
    return (updater as (value: T) => T)(prev);
  }
  return updater;
};

const readPersistedQuotaEnvelope = (raw: string | null): PersistedQuotaEnvelope | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedQuotaEnvelope;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const sanitizeQuotaRecord = <T extends QuotaSnapshot>(
  record: Record<string, T> | undefined
): Record<string, T> => {
  if (!record) return {};

  return Object.entries(record).reduce<Record<string, T>>((result, [name, entry]) => {
    if (!entry || typeof entry !== 'object' || entry.status === 'loading') {
      return result;
    }

    result[name] = entry;
    return result;
  }, {});
};

const sanitizePersistedQuotaState = (
  state: Partial<PersistableQuotaState> | null | undefined
): PersistableQuotaState => ({
  claudeQuota: sanitizeQuotaRecord(state?.claudeQuota),
  codexQuota: sanitizeQuotaRecord(state?.codexQuota),
  kimiQuota: sanitizeQuotaRecord(state?.kimiQuota),
});

const mergeQuotaRecord = <T extends QuotaSnapshot>(
  previous: Record<string, T> | undefined,
  next: Record<string, T> | undefined
): Record<string, T> => {
  if (!next) return {};

  return Object.entries(next).reduce<Record<string, T>>((result, [name, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return result;
    }

    if (entry.status === 'loading') {
      const cached = previous?.[name];
      if (cached && cached.status !== 'loading') {
        result[name] = cached;
      }
      return result;
    }

    result[name] = entry;
    return result;
  }, {});
};

const mergePersistedQuotaState = (
  previous: Partial<PersistableQuotaState> | null | undefined,
  next: Partial<PersistableQuotaState> | null | undefined
): PersistableQuotaState => ({
  claudeQuota: mergeQuotaRecord(previous?.claudeQuota, next?.claudeQuota),
  codexQuota: mergeQuotaRecord(previous?.codexQuota, next?.codexQuota),
  kimiQuota: mergeQuotaRecord(previous?.kimiQuota, next?.kimiQuota),
});

type PendingQuotaCacheWrite = { name: string; value: string };

let pendingQuotaCacheWrite: PendingQuotaCacheWrite | null = null;
let cancelScheduledQuotaCacheWrite: (() => void) | null = null;
let quotaCacheFlushListenersInstalled = false;

const getPersistedQuotaCacheValue = (name: string): string | null =>
  window.localStorage.getItem(name);

const flushPendingQuotaCacheWrite = () => {
  const pending = pendingQuotaCacheWrite;
  pendingQuotaCacheWrite = null;
  const cancelScheduledWrite = cancelScheduledQuotaCacheWrite;
  cancelScheduledQuotaCacheWrite = null;
  cancelScheduledWrite?.();
  if (!pending) return;

  window.localStorage.setItem(pending.name, pending.value);
};

const ensureQuotaCacheFlushListeners = () => {
  if (quotaCacheFlushListenersInstalled || typeof window === 'undefined') return;
  quotaCacheFlushListenersInstalled = true;

  window.addEventListener('pagehide', flushPendingQuotaCacheWrite);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushPendingQuotaCacheWrite();
    }
  });
};

const scheduleQuotaCacheWrite = (name: string, value: string) => {
  const persistedValue = getPersistedQuotaCacheValue(name);
  if (value === persistedValue) {
    if (pendingQuotaCacheWrite?.name === name) {
      pendingQuotaCacheWrite = null;
      cancelScheduledQuotaCacheWrite?.();
      cancelScheduledQuotaCacheWrite = null;
    }
    return;
  }

  pendingQuotaCacheWrite = { name, value };
  ensureQuotaCacheFlushListeners();
  if (cancelScheduledQuotaCacheWrite) return;

  // 一页配额刷新会在很短时间内产生多次 loading/success 更新。合并后在空闲期只写
  // 最终快照，避免每次响应都同步序列化并写入整份 localStorage 缓存而阻塞主线程。
  cancelScheduledQuotaCacheWrite = scheduleIdleTask(flushPendingQuotaCacheWrite, {
    delayMs: 120,
    timeoutMs: 1_000,
  });
};

const quotaPersistStorage = createJSONStorage<PersistableQuotaState>(() => ({
  getItem: (name) => {
    const raw =
      pendingQuotaCacheWrite?.name === name
        ? pendingQuotaCacheWrite.value
        : getPersistedQuotaCacheValue(name);
    const persisted = readPersistedQuotaEnvelope(raw);
    if (!persisted) return raw;

    return JSON.stringify({
      ...persisted,
      state: sanitizePersistedQuotaState(persisted.state),
    });
  },
  setItem: (name, value) => {
    const previousRaw =
      pendingQuotaCacheWrite?.name === name
        ? pendingQuotaCacheWrite.value
        : getPersistedQuotaCacheValue(name);
    const previous = readPersistedQuotaEnvelope(previousRaw);
    const next = readPersistedQuotaEnvelope(value);
    if (!next) {
      scheduleQuotaCacheWrite(name, value);
      return;
    }

    scheduleQuotaCacheWrite(
      name,
      JSON.stringify({
        ...next,
        state: mergePersistedQuotaState(previous?.state, next.state),
      })
    );
  },
  removeItem: (name) => {
    if (pendingQuotaCacheWrite?.name === name) {
      pendingQuotaCacheWrite = null;
      cancelScheduledQuotaCacheWrite?.();
      cancelScheduledQuotaCacheWrite = null;
    }
    window.localStorage.removeItem(name);
  },
}));

export const useQuotaStore = create<QuotaStoreState>()(
  persist(
    (set) => ({
      ...createEmptyQuotaCache(),
      setClaudeQuota: (updater) =>
        set((state) => {
          const claudeQuota = resolveUpdater(updater, state.claudeQuota);
          return claudeQuota === state.claudeQuota ? state : { claudeQuota };
        }),
      setCodexQuota: (updater) =>
        set((state) => {
          const codexQuota = resolveUpdater(updater, state.codexQuota);
          return codexQuota === state.codexQuota ? state : { codexQuota };
        }),
      setKimiQuota: (updater) =>
        set((state) => {
          const kimiQuota = resolveUpdater(updater, state.kimiQuota);
          return kimiQuota === state.kimiQuota ? state : { kimiQuota };
        }),
      clearQuotaCache: () => set(createEmptyQuotaCache()),
    }),
    {
      name: STORAGE_KEY_QUOTA_CACHE,
      storage: quotaPersistStorage,
      partialize: (state) => ({
        claudeQuota: state.claudeQuota,
        codexQuota: state.codexQuota,
        kimiQuota: state.kimiQuota,
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...sanitizePersistedQuotaState(persistedState as Partial<PersistableQuotaState>),
      }),
    }
  )
);
