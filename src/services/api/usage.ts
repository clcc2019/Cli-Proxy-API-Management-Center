/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, type KeyStats, type ModelPrice } from '@/utils/usage';

const USAGE_TIMEOUT_MS = 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const extractUsageSnapshot = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) {
    return null;
  }

  const nestedUsage = value.usage;
  if (isRecord(nestedUsage)) {
    return nestedUsage;
  }

  return value;
};

const normalizeModelPrices = (value: unknown): Record<string, ModelPrice> => {
  if (!isRecord(value)) return {};

  const prices: Record<string, ModelPrice> = {};
  Object.entries(value).forEach(([model, rawPrice]) => {
    const price = isRecord(rawPrice) ? rawPrice : null;
    if (!model || !price) return;

    const prompt = Number(price.prompt);
    const completion = Number(price.completion);
    const cache = Number(price.cache);
    const normalized = {
      prompt: Number.isFinite(prompt) && prompt > 0 ? prompt : 0,
      completion: Number.isFinite(completion) && completion > 0 ? completion : 0,
      cache: Number.isFinite(cache) && cache > 0 ? cache : 0,
    };
    if (normalized.prompt > 0 || normalized.completion > 0 || normalized.cache > 0) {
      prices[model] = normalized;
    }
  });
  return prices;
};

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  aggregated?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export interface UsageDetailsOptions {
  recent?: number;
  compact?: boolean;
}

const DEFAULT_USAGE_DETAILS_RECENT_LIMIT = 20;
const USAGE_DETAILS_RECENT_FALLBACKS = [10, 5, 1] as const;
let acceptedUsageDetailsRecentLimit = DEFAULT_USAGE_DETAILS_RECENT_LIMIT;

export const normalizeUsageDetailsRecentLimit = (value: unknown): number | undefined => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(Math.floor(parsed), acceptedUsageDetailsRecentLimit);
};

const isRecentTooLargeError = (error: unknown) =>
  error instanceof Error && /\brecent\b.*\btoo large\b/i.test(error.message);

const getUsageDetailsRequest = (recent: number | undefined, compact: boolean) =>
  apiClient.get<Record<string, unknown>>('/usage/details', {
    params:
      recent === undefined
        ? undefined
        : {
            recent,
            ...(compact ? { compact: true } : {}),
          },
    timeout: USAGE_TIMEOUT_MS,
  });

export const usageApi = {
  /**
   * 获取轻量使用统计汇总
   */
  getUsage: () => apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),

  getAggregatedUsage: () =>
    apiClient.get<Record<string, unknown>>('/usage/aggregated', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 获取包含请求明细的使用统计
   */
  getUsageDetails: async (options: UsageDetailsOptions = {}) => {
    const recent = normalizeUsageDetailsRecentLimit(options.recent);
    const compact = options.compact === true;

    try {
      return await getUsageDetailsRequest(recent, compact);
    } catch (error: unknown) {
      if (recent === undefined || !isRecentTooLargeError(error)) throw error;

      for (const fallback of USAGE_DETAILS_RECENT_FALLBACKS) {
        if (fallback >= recent) continue;
        try {
          const response = await getUsageDetailsRequest(fallback, compact);
          acceptedUsageDetailsRecentLimit = fallback;
          return response;
        } catch (fallbackError: unknown) {
          if (!isRecentTooLargeError(fallbackError)) throw fallbackError;
        }
      }

      throw error;
    }
  },

  /**
   * 获取使用统计页面所需的聚合数据
   */
  getUsageAggregated: () =>
    apiClient.get<Record<string, unknown>>('/usage/aggregated', { timeout: USAGE_TIMEOUT_MS }),

  async getModelPrices(): Promise<Record<string, ModelPrice>> {
    const data = await apiClient.get<Record<string, unknown>>('/model-prices');
    return normalizeModelPrices(data?.['model-prices'] ?? data?.modelPrices ?? data?.value ?? data);
  },

  updateModelPrices: (prices: Record<string, ModelPrice>) =>
    apiClient.put('/model-prices', { value: prices }),

  /**
   * 导出聚合使用统计快照
   */
  exportUsage: async (fallbackUsage?: unknown): Promise<UsageExportPayload> => {
    const [exportResult, usageResult] = await Promise.allSettled([
      apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),
      apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS }),
    ]);

    const exportPayload =
      exportResult.status === 'fulfilled' && isRecord(exportResult.value) ? exportResult.value : {};

    const fullUsage =
      (usageResult.status === 'fulfilled' ? extractUsageSnapshot(usageResult.value) : null) ??
      extractUsageSnapshot(fallbackUsage) ??
      extractUsageSnapshot(exportPayload.usage);

    if (!fullUsage) {
      if (usageResult.status === 'rejected') {
        throw usageResult.reason;
      }
      if (exportResult.status === 'rejected') {
        throw exportResult.reason;
      }
      throw new Error('Usage export payload is empty');
    }

    return {
      ...exportPayload,
      version: typeof exportPayload.version === 'number' ? exportPayload.version : 1,
      exported_at:
        typeof exportPayload.exported_at === 'string'
          ? exportPayload.exported_at
          : new Date().toISOString(),
      usage: fullUsage,
    };
  },

  /**
   * 导出包含全部请求明细的使用统计快照
   */
  exportDetailedUsage: async (fallbackUsage?: unknown): Promise<UsageExportPayload> => {
    const [exportResult, usageResult] = await Promise.allSettled([
      apiClient.get<UsageExportPayload>('/usage/export/details', { timeout: USAGE_TIMEOUT_MS }),
      apiClient.get<Record<string, unknown>>('/usage/details', { timeout: USAGE_TIMEOUT_MS }),
    ]);

    const exportPayload =
      exportResult.status === 'fulfilled' && isRecord(exportResult.value) ? exportResult.value : {};

    const fullUsage =
      (usageResult.status === 'fulfilled' ? extractUsageSnapshot(usageResult.value) : null) ??
      extractUsageSnapshot(fallbackUsage) ??
      extractUsageSnapshot(exportPayload.usage);

    if (!fullUsage) {
      if (usageResult.status === 'rejected') {
        throw usageResult.reason;
      }
      if (exportResult.status === 'rejected') {
        throw exportResult.reason;
      }
      throw new Error('Detailed usage export payload is empty');
    }

    return {
      ...exportPayload,
      version: typeof exportPayload.version === 'number' ? exportPayload.version : 3,
      exported_at:
        typeof exportPayload.exported_at === 'string'
          ? exportPayload.exported_at
          : new Date().toISOString(),
      usage: fullUsage,
    };
  },

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await apiClient.get<Record<string, unknown>>('/usage/details', {
        timeout: USAGE_TIMEOUT_MS,
      });
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  },
};
