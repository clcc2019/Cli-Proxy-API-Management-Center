import { create } from 'zustand';
import type { QuotaProviderType } from '@/utils/quota';
import { REFRESH_FEEDBACK_MS } from '@/utils/refreshFeedback';

type QuotaRefreshActivityState = {
  activeKeys: ReadonlySet<string>;
};

type QuotaRefreshActivity = {
  finish: () => void;
};

const useQuotaRefreshActivityStore = create<QuotaRefreshActivityState>(() => ({
  activeKeys: new Set(),
}));

const getActivityKey = (quotaType: QuotaProviderType, fileName: string) =>
  `${quotaType}\u0000${fileName}`;

const stopActivity = (key: string) => {
  const { activeKeys } = useQuotaRefreshActivityStore.getState();
  if (!activeKeys.has(key)) return;

  const next = new Set(activeKeys);
  next.delete(key);
  useQuotaRefreshActivityStore.setState({ activeKeys: next });
};

export function beginQuotaRefreshActivity(
  quotaType: QuotaProviderType,
  fileName: string
): QuotaRefreshActivity | null {
  const key = getActivityKey(quotaType, fileName);
  const { activeKeys } = useQuotaRefreshActivityStore.getState();
  if (activeKeys.has(key)) return null;

  useQuotaRefreshActivityStore.setState({ activeKeys: new Set(activeKeys).add(key) });
  const startedAt = performance.now();
  let finished = false;

  return {
    finish: () => {
      if (finished) return;
      finished = true;
      const remaining = REFRESH_FEEDBACK_MS - (performance.now() - startedAt);
      if (remaining <= 0) {
        stopActivity(key);
        return;
      }
      window.setTimeout(() => stopActivity(key), remaining);
    },
  };
}

export function useAuthFileQuotaRefreshing(
  quotaType: QuotaProviderType,
  fileName: string
): boolean {
  const key = getActivityKey(quotaType, fileName);
  return useQuotaRefreshActivityStore((state) => state.activeKeys.has(key));
}
