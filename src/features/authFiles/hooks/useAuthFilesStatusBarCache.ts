import { useMemo } from 'react';
import type { AuthFileItem } from '@/types';
import {
  calculateStatusBarData,
  normalizeAuthIndex,
  type StatusBlockState,
  type UsageDetail,
} from '@/utils/usage';
import { authFileUsageSourceCandidates } from '@/features/authFiles/constants';
import {
  authFileIncludesRecentRequestSummary,
  readAuthFileNumericCount,
  readAuthFileRecentRequestBuckets,
  type AuthFileRecentRequestBucketLike,
} from '@/features/authFiles/stats';
import { collectUsageDetailsForCandidates, indexUsageDetailsBySource } from '@/utils/usageIndex';

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

const buildFileStatusBarData = (
  recentRequestBuckets: AuthFileRecentRequestBucketLike[],
  detailsForFile: UsageDetail[] | undefined
): AuthFileStatusBarData => {
  const fromDetails =
    detailsForFile && detailsForFile.length > 0 ? calculateStatusBarData(detailsForFile) : null;
  const fromRecent = calculateStatusBarDataFromRecentRequests(recentRequestBuckets);
  return chooseStatusBarData(fromDetails, fromRecent);
};

type StatusBarCacheEntry = {
  detailsForFile: UsageDetail[] | undefined;
  recentRequestsSignature: string;
  statusData: AuthFileStatusBarData;
};

const FILE_STATUS_CACHE = new WeakMap<AuthFileItem, StatusBarCacheEntry>();
const EMPTY_DETAILS_BY_AUTH_INDEX = new Map<string, UsageDetail[]>();

const getRecentRequestsSignature = (buckets: AuthFileRecentRequestBucketLike[]): string =>
  buckets
    .map(
      (bucket) =>
        `${readAuthFileNumericCount(bucket.success)}:${readAuthFileNumericCount(
          bucket.failed ?? bucket.failure
        )}`
    )
    .join('|');

const mergeUsageDetails = (
  fromSource: UsageDetail[],
  fromAuthIndex: UsageDetail[] | undefined
): UsageDetail[] | undefined => {
  if (fromSource.length === 0) return fromAuthIndex;
  if (!fromAuthIndex || fromAuthIndex.length === 0 || fromAuthIndex === fromSource) {
    return fromSource;
  }

  const merged = [...fromSource];
  const seen = new Set(fromSource);
  fromAuthIndex.forEach((detail) => {
    if (seen.has(detail)) return;
    seen.add(detail);
    merged.push(detail);
  });
  return merged;
};

export function useAuthFilesStatusBarCache(files: AuthFileItem[], usageDetails: UsageDetail[]) {
  const needsUsageDetailsFallback = useMemo(
    () =>
      usageDetails.length > 0 && files.some((file) => !authFileIncludesRecentRequestSummary(file)),
    [files, usageDetails.length]
  );

  // usageDetails 引用变化时才重建 auth_index -> details 索引。
  // usageDetails 通常来自 store，引用稳定，避免每次 files 局部更新都重算索引。
  const detailsByAuthIndex = useMemo(() => {
    if (!needsUsageDetailsFallback) return EMPTY_DETAILS_BY_AUTH_INDEX;

    const index = new Map<string, UsageDetail[]>();
    usageDetails.forEach((detail) => {
      const authIndexKey = normalizeAuthIndex(detail.auth_index);
      if (!authIndexKey) return;
      const list = index.get(authIndexKey);
      if (list) {
        list.push(detail);
      } else {
        index.set(authIndexKey, [detail]);
      }
    });
    return index;
  }, [needsUsageDetailsFallback, usageDetails]);

  const detailsBySource = useMemo(
    () =>
      needsUsageDetailsFallback
        ? indexUsageDetailsBySource(usageDetails)
        : EMPTY_DETAILS_BY_AUTH_INDEX,
    [needsUsageDetailsFallback, usageDetails]
  );

  // 这里不再对整个 Map 做「内容相等则复用旧引用」的处理。
  //
  // 真正决定卡片是否重渲染的是每个 statusData 的引用，而它已由
  // FILE_STATUS_CACHE（WeakMap，按 file 对象缓存）保证稳定：内容没变时
  // 取到的是同一个对象，AuthFileCard 的 memo 依旧命中。Map 自身的引用只
  // 影响 authFileCardNodes 那一层 useMemo 是否重建 —— 那只是重新创建
  // 十几个廉价的 React element，代价远小于为此在渲染期读写 ref
  // （React 纯度规则不允许，eslint react-hooks/refs 会直接报错）。
  return useMemo(() => {
    const cache = new Map<string, AuthFileStatusBarData>();

    files.forEach((file) => {
      const rawAuthIndex = file['auth_index'] ?? file.authIndex;
      const authIndexKey = normalizeAuthIndex(rawAuthIndex);
      const detailsForSource = collectUsageDetailsForCandidates(
        detailsBySource,
        authFileUsageSourceCandidates(file)
      );
      const detailsForAuthIndex =
        authIndexKey && authIndexKey !== '0' ? detailsByAuthIndex.get(authIndexKey) : undefined;
      const detailsForFile = mergeUsageDetails(detailsForSource, detailsForAuthIndex);
      const recentRequestBuckets = readAuthFileRecentRequestBuckets(file);
      const recentRequestsSignature = getRecentRequestsSignature(recentRequestBuckets);
      const cached = FILE_STATUS_CACHE.get(file);
      const statusData =
        cached &&
        cached.detailsForFile === detailsForFile &&
        cached.recentRequestsSignature === recentRequestsSignature
          ? cached.statusData
          : buildFileStatusBarData(recentRequestBuckets, detailsForFile);

      FILE_STATUS_CACHE.set(file, {
        detailsForFile,
        recentRequestsSignature,
        statusData,
      });

      if (authIndexKey) {
        cache.set(authIndexKey, statusData);
      }
      if (file.name) {
        cache.set(file.name, statusData);
      }
    });

    return cache;
  }, [detailsByAuthIndex, detailsBySource, files]);
}
