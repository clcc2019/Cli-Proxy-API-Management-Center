import { useCallback, useMemo } from 'react';
import { useInterval } from '@/hooks/useInterval';
import { USAGE_STATS_STALE_TIME_MS, useUsageStatsStore } from '@/stores';
import type { UsageDetail } from '@/utils/usage';

export const useProviderStats = () => {
  const keyStats = useUsageStatsStore((state) => state.keyStats);
  const usageDetails = useUsageStatsStore((state) => state.usageDetails);
  const isLoading = useUsageStatsStore((state) => state.loading);
  const loadUsageStats = useUsageStatsStore((state) => state.loadUsageStats);

  const usageDetailsBySource = useMemo(() => {
    const map = new Map<string, UsageDetail[]>();
    usageDetails.forEach((detail) => {
      if (!detail.source) return;
      const bucket = map.get(detail.source);
      if (bucket) {
        bucket.push(detail);
      } else {
        map.set(detail.source, [detail]);
      }
    });
    return map;
  }, [usageDetails]);

  // 首次进入页面优先复用缓存，避免跨页面重复拉取 /usage。
  const loadKeyStats = useCallback(async () => {
    await loadUsageStats({ staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  // 定时器触发时强制刷新共享 usage。
  const refreshKeyStats = useCallback(async () => {
    await loadUsageStats({ force: true, staleTimeMs: USAGE_STATS_STALE_TIME_MS });
  }, [loadUsageStats]);

  useInterval(() => {
    void refreshKeyStats().catch(() => {});
  }, 240_000);

  return { keyStats, usageDetails, usageDetailsBySource, loadKeyStats, refreshKeyStats, isLoading };
};
