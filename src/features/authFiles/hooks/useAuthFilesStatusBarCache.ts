import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import {
  calculateStatusBarData,
  normalizeAuthIndex,
  type StatusBlockState,
  type UsageDetail,
} from '@/utils/usage';
import {
  readAuthFileNumericCount,
  readAuthFileRecentRequestBuckets,
  type AuthFileRecentRequestBucketLike,
} from '@/features/authFiles/stats';

export type AuthFileStatusBarData = ReturnType<typeof calculateStatusBarData>;

export const EMPTY_AUTH_FILE_STATUS_BAR_DATA: AuthFileStatusBarData = calculateStatusBarData([]);

const STATUS_BLOCK_COUNT = 20;
const STATUS_BLOCK_DURATION_MS = 10 * 60 * 1000;

const statusBarRequestTotal = (data: AuthFileStatusBarData | null): number =>
  data ? data.totalSuccess + data.totalFailure : 0;

const calculateStatusBarDataFromRecentRequests = (
  buckets: AuthFileRecentRequestBucketLike[]
): AuthFileStatusBarData | null => {
  if (buckets.length === 0) return null;

  const recent = buckets.slice(-STATUS_BLOCK_COUNT);
  const paddingCount = Math.max(0, STATUS_BLOCK_COUNT - recent.length);
  const normalized: AuthFileRecentRequestBucketLike[] = [
    ...Array.from({ length: paddingCount }, () => ({ success: 0, failed: 0 })),
    ...recent,
  ];

  const now = Date.now();
  const windowStart = now - STATUS_BLOCK_COUNT * STATUS_BLOCK_DURATION_MS;
  const blocks: StatusBlockState[] = [];
  const blockDetails: AuthFileStatusBarData['blockDetails'] = [];
  let totalSuccess = 0;
  let totalFailure = 0;

  normalized.forEach((bucket, idx) => {
    const success = readAuthFileNumericCount(bucket.success);
    const failure = readAuthFileNumericCount(bucket.failed ?? bucket.failure);
    const total = success + failure;
    totalSuccess += success;
    totalFailure += failure;

    if (total === 0) {
      blocks.push('idle');
    } else if (failure === 0) {
      blocks.push('success');
    } else if (success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const startTime = windowStart + idx * STATUS_BLOCK_DURATION_MS;
    blockDetails.push({
      success,
      failure,
      rate: total > 0 ? success / total : -1,
      startTime,
      endTime: startTime + STATUS_BLOCK_DURATION_MS,
    });
  });

  const total = totalSuccess + totalFailure;
  return {
    blocks,
    blockDetails,
    successRate: total > 0 ? (totalSuccess / total) * 100 : 100,
    totalSuccess,
    totalFailure,
  };
};

const chooseStatusBarData = (
  fromDetails: AuthFileStatusBarData | null,
  fromRecent: AuthFileStatusBarData | null
): AuthFileStatusBarData => {
  if (!fromDetails) return fromRecent ?? EMPTY_AUTH_FILE_STATUS_BAR_DATA;
  if (!fromRecent) return fromDetails;
  return statusBarRequestTotal(fromRecent) > statusBarRequestTotal(fromDetails)
    ? fromRecent
    : fromDetails;
};

export function useAuthFilesStatusBarCache(files: AuthFileItem[], usageDetails: UsageDetail[]) {
  return useMemo(() => {
    const cache = new Map<string, AuthFileStatusBarData>();

    const usageDetailsByAuthIndex = new Map<string, UsageDetail[]>();
    usageDetails.forEach((detail) => {
      const authIndexKey = normalizeAuthIndex(detail.auth_index);
      if (!authIndexKey) return;

      const list = usageDetailsByAuthIndex.get(authIndexKey);
      if (list) {
        list.push(detail);
      } else {
        usageDetailsByAuthIndex.set(authIndexKey, [detail]);
      }
    });

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndex(rawAuthIndex);
      const details = authIndexKey ? usageDetailsByAuthIndex.get(authIndexKey) : undefined;
      const fromDetails = details && details.length > 0 ? calculateStatusBarData(details) : null;
      const fromRecent = calculateStatusBarDataFromRecentRequests(
        readAuthFileRecentRequestBuckets(file)
      );
      const statusData = chooseStatusBarData(fromDetails, fromRecent);

      if (authIndexKey) {
        cache.set(authIndexKey, statusData);
      }
      if (file.name) {
        cache.set(file.name, statusData);
      }
    });

    return cache;
  }, [files, usageDetails]);
}
