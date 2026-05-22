import type { AuthFileItem } from '@/types';

export type AuthFileRequestStats = {
  success: number;
  failure: number;
};

export type AuthFileRecentRequestBucketLike = {
  success?: unknown;
  failed?: unknown;
  failure?: unknown;
};

export const readAuthFileNumericCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const firstPositiveCount = (record: Record<string, unknown>, keys: string[]): number => {
  for (const key of keys) {
    const count = readAuthFileNumericCount(record[key]);
    if (count > 0) return count;
  }
  return 0;
};

export const readAuthFileRecentRequestBuckets = (
  file: AuthFileItem
): AuthFileRecentRequestBucketLike[] => {
  const snake = Array.isArray(file.recent_requests) ? file.recent_requests : [];
  const camel = Array.isArray(file.recentRequests) ? file.recentRequests : [];
  return authFileRecentRequestsTotal(camel) > authFileRecentRequestsTotal(snake) ? camel : snake;
};

export const sumAuthFileRecentRequestBuckets = (
  buckets: AuthFileRecentRequestBucketLike[]
): AuthFileRequestStats =>
  buckets.reduce<AuthFileRequestStats>(
    (total, bucket) => ({
      success: total.success + readAuthFileNumericCount(bucket.success),
      failure: total.failure + readAuthFileNumericCount(bucket.failed ?? bucket.failure),
    }),
    { success: 0, failure: 0 }
  );

export const authFileRecentRequestsTotal = (
  buckets: AuthFileRecentRequestBucketLike[]
): number => {
  const total = sumAuthFileRecentRequestBuckets(buckets);
  return total.success + total.failure;
};

export const hasAuthFileRequestStats = (stats: AuthFileRequestStats): boolean =>
  stats.success > 0 || stats.failure > 0;

export const readAuthFileRequestStats = (file: AuthFileItem): AuthFileRequestStats => {
  const record = file as Record<string, unknown>;
  const direct = {
    success: firstPositiveCount(record, [
      'success',
      'success_count',
      'successCount',
      'total_success',
      'totalSuccess',
    ]),
    failure: firstPositiveCount(record, [
      'failed',
      'failure',
      'failed_count',
      'failedCount',
      'failure_count',
      'failureCount',
      'total_failed',
      'totalFailed',
      'total_failure',
      'totalFailure',
    ]),
  };

  if (hasAuthFileRequestStats(direct)) {
    return direct;
  }

  return sumAuthFileRecentRequestBuckets(readAuthFileRecentRequestBuckets(file));
};
