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

const EMPTY_AUTH_FILE_RECENT_REQUEST_BUCKETS: AuthFileRecentRequestBucketLike[] = [];

export const readAuthFileNumericCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const AUTH_FILE_SUCCESS_STAT_KEYS = [
  'success',
  'success_count',
  'successCount',
  'total_success',
  'totalSuccess',
] as const;

const AUTH_FILE_FAILURE_STAT_KEYS = [
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
] as const;

const firstPositiveCount = (record: Record<string, unknown>, keys: readonly string[]): number => {
  for (const key of keys) {
    const count = readAuthFileNumericCount(record[key]);
    if (count > 0) return count;
  }
  return 0;
};

export const readAuthFileRecentRequestBuckets = (
  file: AuthFileItem
): AuthFileRecentRequestBucketLike[] => {
  const snake = Array.isArray(file.recent_requests)
    ? file.recent_requests
    : EMPTY_AUTH_FILE_RECENT_REQUEST_BUCKETS;
  const camel = Array.isArray(file.recentRequests)
    ? file.recentRequests
    : EMPTY_AUTH_FILE_RECENT_REQUEST_BUCKETS;
  if (snake.length === 0) return camel;
  if (camel.length === 0 || camel === snake) return snake;
  return authFileRecentRequestsTotal(camel) > authFileRecentRequestsTotal(snake) ? camel : snake;
};

/**
 * `summary=true` 的新服务端会为每个条目返回 recent_requests（没有请求时为空数组）。
 * 只有字段本身存在才能视为支持摘要；单纯判断数组非空会让零请求凭据退回到昂贵的
 * usage/details 请求。
 */
export const authFileIncludesRecentRequestSummary = (file: AuthFileItem): boolean =>
  Array.isArray(file.recent_requests) || Array.isArray(file.recentRequests);

const sumAuthFileRecentRequestBuckets = (
  buckets: AuthFileRecentRequestBucketLike[]
): AuthFileRequestStats =>
  buckets.reduce<AuthFileRequestStats>(
    (total, bucket) => ({
      success: total.success + readAuthFileNumericCount(bucket.success),
      failure: total.failure + readAuthFileNumericCount(bucket.failed ?? bucket.failure),
    }),
    { success: 0, failure: 0 }
  );

const authFileRecentRequestsTotal = (buckets: AuthFileRecentRequestBucketLike[]): number => {
  const total = sumAuthFileRecentRequestBuckets(buckets);
  return total.success + total.failure;
};

export const hasAuthFileRequestStats = (stats: AuthFileRequestStats): boolean =>
  stats.success > 0 || stats.failure > 0;

export const readAuthFileRequestStats = (file: AuthFileItem): AuthFileRequestStats => {
  const record = file as Record<string, unknown>;
  const direct = {
    success: firstPositiveCount(record, AUTH_FILE_SUCCESS_STAT_KEYS),
    failure: firstPositiveCount(record, AUTH_FILE_FAILURE_STAT_KEYS),
  };

  if (hasAuthFileRequestStats(direct)) {
    return direct;
  }

  return sumAuthFileRecentRequestBuckets(readAuthFileRecentRequestBuckets(file));
};

const AUTH_FILE_REQUEST_STAT_KEYS = [
  'recent_requests',
  'recentRequests',
  ...AUTH_FILE_SUCCESS_STAT_KEYS,
  ...AUTH_FILE_FAILURE_STAT_KEYS,
] as const;

/**
 * Quota endpoints may return an auth-file snapshot without the list endpoint's
 * recent-request summary (or with an empty summary). Keep the request metrics
 * owned by the auth-files list response while applying quota-owned fields.
 */
export const mergeAuthFileUpdatePreservingRequestStats = (
  file: AuthFileItem,
  update: Partial<AuthFileItem>
): AuthFileItem => {
  const next = { ...file, ...update, name: file.name } as AuthFileItem;
  const fileRecord = file as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;

  AUTH_FILE_REQUEST_STAT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(fileRecord, key)) {
      nextRecord[key] = fileRecord[key];
    } else {
      delete nextRecord[key];
    }
  });

  return next;
};
