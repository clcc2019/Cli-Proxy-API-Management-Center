/**
 * 使用统计相关工具
 * 迁移自基线 modules/usage.js 的纯逻辑部分
 */

import type { ScriptableContext } from 'chart.js';
import { extractLatencyMs } from './usage/latency';
import { maskApiKey } from './format';
import { parseTimestampMs } from './timestamp';

export type { DurationFormatOptions, LatencyStats, LatencyTone } from './usage/latency';
export {
  LATENCY_SOURCE_FIELD,
  LATENCY_SOURCE_UNIT,
  calculateLatencyStatsFromDetails,
  extractLatencyMs,
  formatDurationMs,
  getLatencyTone,
} from './usage/latency';

export interface KeyStatBucket {
  success: number;
  failure: number;
}

export interface KeyStats {
  bySource: Record<string, KeyStatBucket>;
  byAuthIndex: Record<string, KeyStatBucket>;
}

export interface KeyUsageBucket extends KeyStatBucket {
  totalTokens: number;
  totalCost: number;
  pricedRequests: number;
}

export interface KeyUsageStats {
  bySource: Record<string, KeyUsageBucket>;
  byAuthIndex: Record<string, KeyUsageBucket>;
}

export interface ModelPrice {
  prompt: number;
  completion: number;
  cache: number;
}

export interface UsageDetail {
  requested_model?: string;
  upstream_model?: string;
  response_model?: string;
  model_downgraded?: boolean;
  response_model_mismatch?: boolean | null;
  response_model_conflict?: boolean;
  timestamp: string;
  api_key?: string;
  endpoint?: string;
  client_ip?: string;
  source: string;
  auth_index: number;
  model_reasoning_effort?: string;
  requested_reasoning_effort?: string;
  upstream_reasoning_effort?: string;
  requested_service_tier?: string;
  upstream_service_tier?: string;
  response_service_tier?: string;
  model_mapping_chain?: string;
  error_message?: string;
  latency_ms?: number;
  ttft_ms?: number;
  tokens: {
    input_tokens: number;
    output_tokens: number;
    reasoning_tokens: number;
    cached_tokens: number;
    cache_tokens?: number;
    total_tokens: number;
  };
  failed: boolean;
  __modelName?: string;
  __timestampMs?: number;
}

export const extractTTFTMs = (detail: unknown): number | null => {
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const value = Number((detail as { ttft_ms?: unknown }).ttft_ms);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

export interface UsageDetailWithEndpoint extends UsageDetail {
  __endpoint: string;
  __endpointMethod?: string;
  __endpointPath?: string;
  __timestampMs: number;
}

export interface ApiStats {
  endpoint: string;
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  totalCost: number;
  models: Record<
    string,
    { requests: number; successCount: number; failureCount: number; tokens: number }
  >;
}

export interface ModelStatsSummary {
  model: string;
  requests: number;
  successCount: number;
  failureCount: number;
  tokens: number;
  cost: number;
  averageLatencyMs: number | null;
  totalLatencyMs: number | null;
  latencySampleCount: number;
}

export type UsageTimeRange = '1h' | '3h' | '6h' | '12h' | '24h' | '7d' | 'all';

const TOKENS_PER_PRICE_UNIT = 1_000_000;
const MODEL_PRICE_STORAGE_KEY = 'cli-proxy-model-prices-v2';
const USAGE_ENDPOINT_METHOD_REGEX = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(\S+)/i;
const MODEL_DATE_SUFFIX_REGEX = /-\d{8}$/;
const DEFAULT_MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-5.4': {
    prompt: 2.5,
    completion: 15,
    cache: 0.25,
  },
  'gpt-5.5': {
    prompt: 5,
    completion: 30,
    cache: 0.25,
  },
  'claude-opus-4.7': {
    prompt: 5,
    completion: 25,
    cache: 0.5,
  },
  'claude-opus-4.6': {
    prompt: 5,
    completion: 25,
    cache: 0.5,
  },
  'claude-opus-4.5': {
    prompt: 5,
    completion: 25,
    cache: 0.5,
  },
  'claude-sonnet-4.6': {
    prompt: 3,
    completion: 15,
    cache: 0.3,
  },
  'claude-sonnet-4.5': {
    prompt: 3,
    completion: 15,
    cache: 0.3,
  },
  'claude-sonnet-4': {
    prompt: 3,
    completion: 15,
    cache: 0.3,
  },
  'claude-haiku-4.5': {
    prompt: 1,
    completion: 5,
    cache: 0.1,
  },
  'claude-opus-4.1': {
    prompt: 15,
    completion: 75,
    cache: 1.5,
  },
  'claude-opus-4': {
    prompt: 15,
    completion: 75,
    cache: 1.5,
  },
};
const USAGE_TIME_RANGE_MS: Record<Exclude<UsageTimeRange, 'all'>, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isDigits = (value: string): boolean => /^\d+$/.test(value);

const hyphenNumericVersionToDot = (modelName: string): string => {
  const parts = modelName.split('-');
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (isDigits(parts[index]) && isDigits(parts[index + 1])) {
      return [
        ...parts.slice(0, index),
        `${parts[index]}.${parts[index + 1]}`,
        ...parts.slice(index + 2),
      ].join('-');
    }
  }
  return modelName;
};

const dotNumericVersionToHyphen = (modelName: string): string => {
  const parts = modelName.split('-');
  for (let index = 0; index < parts.length; index += 1) {
    const [left, right, extra] = parts[index].split('.');
    if (extra === undefined && right !== undefined && isDigits(left) && isDigits(right)) {
      const converted = [...parts];
      converted[index] = `${left}-${right}`;
      return converted.join('-');
    }
  }
  return modelName;
};

const modelPriceAliasCandidates = (modelName: string): string[] => {
  const trimmed = modelName.trim();
  if (!trimmed) return [];

  const candidates: string[] = [];
  const add = (value: string) => {
    const normalized = value.trim();
    if (normalized && normalized !== trimmed) {
      candidates.push(normalized);
    }
  };

  const parenIndex = trimmed.indexOf('(');
  if (parenIndex > 0) add(trimmed.slice(0, parenIndex));
  if (trimmed.startsWith('models/')) add(trimmed.slice('models/'.length));
  const slashIndex = trimmed.lastIndexOf('/');
  if (slashIndex >= 0 && slashIndex + 1 < trimmed.length) add(trimmed.slice(slashIndex + 1));
  ['kiro-', 'amazonq-'].forEach((prefix) => {
    if (trimmed.startsWith(prefix)) add(trimmed.slice(prefix.length));
  });
  ['-agentic', '-chat', '-thinking', '-1m'].forEach((suffix) => {
    if (trimmed.endsWith(suffix)) add(trimmed.slice(0, -suffix.length));
  });
  const withoutDate = trimmed.replace(MODEL_DATE_SUFFIX_REGEX, '');
  if (withoutDate !== trimmed) add(withoutDate);
  const dotted = hyphenNumericVersionToDot(trimmed);
  if (dotted !== trimmed) add(dotted);
  const hyphenated = dotNumericVersionToHyphen(trimmed);
  if (hyphenated !== trimmed) add(hyphenated);

  return candidates;
};

export function getModelPriceLookupKeys(modelName: string): string[] {
  const first = modelName.trim();
  if (!first) return [];

  const seen = new Set<string>();
  const keys: string[] = [];
  const queue: string[] = [];
  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    keys.push(trimmed);
    queue.push(trimmed);
  };

  add(first);
  add(first.toLowerCase());
  for (let index = 0; index < queue.length; index += 1) {
    modelPriceAliasCandidates(queue[index]).forEach((candidate) => {
      add(candidate);
      add(candidate.toLowerCase());
    });
  }
  return keys;
}

export function lookupModelPrice(
  modelPrices: Record<string, ModelPrice>,
  modelName: string
): ModelPrice | undefined {
  for (const key of getModelPriceLookupKeys(modelName)) {
    const price = modelPrices[key];
    if (price) return price;
  }
  return undefined;
}

const getApisRecord = (usageData: unknown): Record<string, unknown> | null => {
  const usageRecord = isRecord(usageData) ? usageData : null;
  const apisRaw = usageRecord ? usageRecord.apis : null;
  return isRecord(apisRaw) ? apisRaw : null;
};

interface UsageSummary {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  totalTokens: number;
}

const createUsageSummary = (): UsageSummary => ({
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  totalTokens: 0,
});

const toUsageSummaryFields = (summary: UsageSummary) => ({
  total_requests: summary.totalRequests,
  success_count: summary.successCount,
  failure_count: summary.failureCount,
  total_tokens: summary.totalTokens,
});

const AGGREGATED_USAGE_FIELD = '__aggregatedSnapshot';
const AGGREGATED_WINDOW_FIELD = '__aggregatedWindow';
const AGGREGATED_WINDOW_KEY_FIELD = '__aggregatedWindowKey';

type AggregatedWindowKey = UsageTimeRange;

interface AggregatedUsageWindowRecord {
  total_requests?: number;
  success_count?: number;
  failure_count?: number;
  total_tokens?: number;
  token_breakdown?: Record<string, unknown>;
  latency?: Record<string, unknown>;
  credentials?: unknown[];
}

interface AggregatedUsageSnapshotRecord {
  windows?: Record<string, unknown>;
  model_names?: unknown[];
}

type UsageWithAggregatedView = Record<string, unknown> & {
  [AGGREGATED_USAGE_FIELD]?: AggregatedUsageSnapshotRecord;
  [AGGREGATED_WINDOW_FIELD]?: AggregatedUsageWindowRecord;
  [AGGREGATED_WINDOW_KEY_FIELD]?: AggregatedWindowKey;
};

const getEmbeddedAggregatedSnapshot = (
  usageData: unknown
): AggregatedUsageSnapshotRecord | null => {
  const usageRecord = isRecord(usageData) ? (usageData as UsageWithAggregatedView) : null;
  const embedded = usageRecord?.[AGGREGATED_USAGE_FIELD];
  return isRecord(embedded) ? (embedded as AggregatedUsageSnapshotRecord) : null;
};

const getAggregatedWindowKey = (range: UsageTimeRange): AggregatedWindowKey => range;

const getSelectedAggregatedWindow = (usageData: unknown): AggregatedUsageWindowRecord | null => {
  const usageRecord = isRecord(usageData) ? (usageData as UsageWithAggregatedView) : null;
  const directWindow = usageRecord?.[AGGREGATED_WINDOW_FIELD];
  if (isRecord(directWindow)) {
    return directWindow as AggregatedUsageWindowRecord;
  }

  const snapshot = getEmbeddedAggregatedSnapshot(usageData);
  if (!snapshot || !isRecord(snapshot.windows)) {
    return null;
  }

  const requestedKey = usageRecord?.[AGGREGATED_WINDOW_KEY_FIELD];
  const selectedKey =
    typeof requestedKey === 'string' && requestedKey.trim() ? requestedKey.trim() : 'all';
  const window = snapshot.windows[selectedKey] ?? snapshot.windows.all;
  return isRecord(window) ? (window as AggregatedUsageWindowRecord) : null;
};

const getAggregatedWindowNumber = (
  window: AggregatedUsageWindowRecord | null,
  key: 'total_requests' | 'success_count' | 'failure_count' | 'total_tokens'
): number => {
  const raw = window?.[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
};

const buildAggregatedUsageView = <T>(usageData: T, range: UsageTimeRange): T => {
  const usageRecord = isRecord(usageData) ? (usageData as UsageWithAggregatedView) : null;
  const aggregated = getEmbeddedAggregatedSnapshot(usageData);
  if (!usageRecord || !aggregated || !isRecord(aggregated.windows)) {
    return usageData;
  }

  const windowKey = getAggregatedWindowKey(range);
  const selectedWindowRaw = aggregated.windows[windowKey] ?? aggregated.windows.all;
  if (!isRecord(selectedWindowRaw)) {
    return usageData;
  }

  const selectedWindow = selectedWindowRaw as AggregatedUsageWindowRecord;
  return {
    ...usageRecord,
    ...toUsageSummaryFields({
      totalRequests: getAggregatedWindowNumber(selectedWindow, 'total_requests'),
      successCount: getAggregatedWindowNumber(selectedWindow, 'success_count'),
      failureCount: getAggregatedWindowNumber(selectedWindow, 'failure_count'),
      totalTokens: getAggregatedWindowNumber(selectedWindow, 'total_tokens'),
    }),
    [AGGREGATED_WINDOW_KEY_FIELD]: windowKey,
    [AGGREGATED_WINDOW_FIELD]: selectedWindow,
  } as T;
};

export function filterUsageByTimeRange<T>(
  usageData: T,
  range: UsageTimeRange,
  nowMs: number = Date.now()
): T {
  if (getEmbeddedAggregatedSnapshot(usageData)) {
    return buildAggregatedUsageView(usageData, range);
  }

  if (range === 'all') {
    return usageData;
  }

  const usageRecord = isRecord(usageData) ? usageData : null;
  const apis = getApisRecord(usageData);
  if (!usageRecord || !apis) {
    return usageData;
  }

  const rangeMs = USAGE_TIME_RANGE_MS[range];
  if (!Number.isFinite(rangeMs) || rangeMs <= 0) {
    return usageData;
  }

  const windowStart = nowMs - rangeMs;
  const filteredApis: Record<string, unknown> = {};
  const totalSummary = createUsageSummary();

  Object.entries(apis).forEach(([apiName, apiEntry]) => {
    if (!isRecord(apiEntry)) {
      return;
    }

    const models = isRecord(apiEntry.models) ? apiEntry.models : null;
    if (!models) {
      return;
    }

    const filteredModels: Record<string, unknown> = {};
    const apiSummary = createUsageSummary();
    let hasModelData = false;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) {
        return;
      }

      const detailsRaw = Array.isArray(modelEntry.details) ? modelEntry.details : [];
      const modelSummary = createUsageSummary();
      const filteredDetails: unknown[] = [];

      detailsRaw.forEach((detail) => {
        const detailRecord = isRecord(detail) ? detail : null;
        if (!detailRecord || typeof detailRecord.timestamp !== 'string') {
          return;
        }
        const timestamp = parseTimestampMs(detailRecord.timestamp);
        if (Number.isNaN(timestamp) || timestamp < windowStart || timestamp > nowMs) {
          return;
        }

        filteredDetails.push(detail);
        modelSummary.totalRequests += 1;
        if (detailRecord.failed === true) {
          modelSummary.failureCount += 1;
        } else {
          modelSummary.successCount += 1;
        }
        modelSummary.totalTokens += extractTotalTokens(detailRecord);
      });

      if (!filteredDetails.length) {
        return;
      }

      filteredModels[modelName] = {
        ...modelEntry,
        ...toUsageSummaryFields(modelSummary),
        details: filteredDetails,
      };
      hasModelData = true;

      apiSummary.totalRequests += modelSummary.totalRequests;
      apiSummary.successCount += modelSummary.successCount;
      apiSummary.failureCount += modelSummary.failureCount;
      apiSummary.totalTokens += modelSummary.totalTokens;
    });

    if (!hasModelData) {
      return;
    }

    filteredApis[apiName] = {
      ...apiEntry,
      ...toUsageSummaryFields(apiSummary),
      models: filteredModels,
    };

    totalSummary.totalRequests += apiSummary.totalRequests;
    totalSummary.successCount += apiSummary.successCount;
    totalSummary.failureCount += apiSummary.failureCount;
    totalSummary.totalTokens += apiSummary.totalTokens;
  });

  return {
    ...usageRecord,
    ...toUsageSummaryFields(totalSummary),
    apis: filteredApis,
  } as T;
}

export const normalizeAuthIndex = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const USAGE_SOURCE_PREFIX_KEY = 'k:';
const USAGE_SOURCE_PREFIX_MASKED = 'm:';
const USAGE_SOURCE_PREFIX_TEXT = 't:';

const KEY_LIKE_TOKEN_REGEX =
  /(sk-[A-Za-z0-9-_]{6,}|sk-ant-[A-Za-z0-9-_]{6,}|AIza[0-9A-Za-z-_]{8,}|AI[a-zA-Z0-9_-]{6,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/;
const MASKED_TOKEN_HINT_REGEX = /^[^\s]{1,24}(\*{2,}|\.{3}|…)[^\s]{1,24}$/;

const keyFingerprintCache = new Map<string, string>();

const fnv1a64Hex = (value: string): string => {
  const cached = keyFingerprintCache.get(value);
  if (cached) return cached;

  const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;

  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = (hash * FNV_PRIME) & 0xffffffffffffffffn;
  }

  const hex = hash.toString(16).padStart(16, '0');
  keyFingerprintCache.set(value, hex);
  return hex;
};

const looksLikeRawSecret = (text: string): boolean => {
  if (!text || /\s/.test(text)) return false;

  const lower = text.toLowerCase();
  if (lower.endsWith('.json')) return false;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return false;
  if (/[\\/]/.test(text)) return false;

  if (KEY_LIKE_TOKEN_REGEX.test(text)) return true;

  if (text.length >= 32 && text.length <= 512) {
    return true;
  }

  if (text.length >= 16 && text.length < 32 && /^[A-Za-z0-9._=-]+$/.test(text)) {
    return /[A-Za-z]/.test(text) && /\d/.test(text);
  }

  return false;
};

const extractRawSecretFromText = (text: string): string | null => {
  if (!text) return null;
  if (looksLikeRawSecret(text)) return text;

  const keyLikeMatch = text.match(KEY_LIKE_TOKEN_REGEX);
  if (keyLikeMatch?.[0]) return keyLikeMatch[0];

  const queryMatch = text.match(
    /(?:[?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/i
  );
  const queryValue = queryMatch?.[2];
  if (queryValue && looksLikeRawSecret(queryValue)) {
    return queryValue;
  }

  const headerMatch = text.match(
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*[:=]\s*([A-Za-z0-9._=-]+)/i
  );
  const headerValue = headerMatch?.[2];
  if (headerValue && looksLikeRawSecret(headerValue)) {
    return headerValue;
  }

  const bearerMatch = text.match(/\bBearer\s+([A-Za-z0-9._=-]{6,})/i);
  const bearerValue = bearerMatch?.[1];
  if (bearerValue && looksLikeRawSecret(bearerValue)) {
    return bearerValue;
  }

  return null;
};

export function normalizeUsageSourceId(
  value: unknown,
  masker: (val: string) => string = maskApiKey
): string {
  const raw =
    typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const extracted = extractRawSecretFromText(trimmed);
  if (extracted) {
    return `${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(extracted)}`;
  }

  if (MASKED_TOKEN_HINT_REGEX.test(trimmed)) {
    return `${USAGE_SOURCE_PREFIX_MASKED}${masker(trimmed)}`;
  }

  return `${USAGE_SOURCE_PREFIX_TEXT}${trimmed}`;
}

export function buildCandidateUsageSourceIds(input: {
  apiKey?: string;
  prefix?: string;
}): string[] {
  const result: string[] = [];

  const prefix = input.prefix?.trim();
  if (prefix) {
    result.push(`${USAGE_SOURCE_PREFIX_TEXT}${prefix}`);
  }

  const apiKey = input.apiKey?.trim();
  if (apiKey) {
    result.push(`${USAGE_SOURCE_PREFIX_KEY}${fnv1a64Hex(apiKey)}`);
    result.push(`${USAGE_SOURCE_PREFIX_MASKED}${maskApiKey(apiKey)}`);
  }

  return Array.from(new Set(result));
}

/**
 * 对使用数据中的敏感字段进行遮罩
 */
export function maskUsageSensitiveValue(
  value: unknown,
  masker: (val: string) => string = maskApiKey
): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  if (!raw) {
    return '';
  }

  let masked = raw;

  const queryRegex = /([?&])(api[-_]?key|key|token|access_token|authorization)=([^&#\s]+)/gi;
  masked = masked.replace(
    queryRegex,
    (_full, prefix, keyName, valuePart) => `${prefix}${keyName}=${masker(valuePart)}`
  );

  const headerRegex =
    /(api[-_]?key|key|token|access[-_]?token|authorization)\s*([:=])\s*([A-Za-z0-9._-]+)/gi;
  masked = masked.replace(
    headerRegex,
    (_full, keyName, separator, valuePart) => `${keyName}${separator}${masker(valuePart)}`
  );

  const keyLikeRegex =
    /(sk-[A-Za-z0-9]{6,}|AI[a-zA-Z0-9_-]{6,}|AIza[0-9A-Za-z-_]{8,}|hf_[A-Za-z0-9]{6,}|pk_[A-Za-z0-9]{6,}|rk_[A-Za-z0-9]{6,})/g;
  masked = masked.replace(keyLikeRegex, (match) => masker(match));

  if (masked === raw) {
    const trimmed = raw.trim();
    if (trimmed && !/\s/.test(trimmed)) {
      const looksLikeKey =
        /^sk-/i.test(trimmed) ||
        /^AI/i.test(trimmed) ||
        /^AIza/i.test(trimmed) ||
        /^hf_/i.test(trimmed) ||
        /^pk_/i.test(trimmed) ||
        /^rk_/i.test(trimmed) ||
        (!/[\\/]/.test(trimmed) && (/\d/.test(trimmed) || trimmed.length >= 10)) ||
        trimmed.length >= 24;
      if (looksLikeKey) {
        return masker(trimmed);
      }
    }
  }

  return masked;
}

/**
 * 格式化每分钟数值
 */
export function formatPerMinuteValue(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0.00';
  }
  const abs = Math.abs(num);
  if (abs >= 1000) {
    return Math.round(num).toLocaleString();
  }
  if (abs >= 100) {
    return num.toFixed(0);
  }
  if (abs >= 10) {
    return num.toFixed(1);
  }
  return num.toFixed(2);
}

/**
 * 格式化紧凑数字
 */
export function formatCompactNumber(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0';
  }
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return abs >= 1 ? num.toFixed(0) : num.toFixed(2);
}

export function formatMillionTokens(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0M';
  }

  const millionValue = num / 1_000_000;
  const absMillionValue = Math.abs(millionValue);
  const fractionDigits =
    absMillionValue >= 100
      ? 0
      : absMillionValue >= 10
        ? 1
        : absMillionValue >= 1
          ? 2
          : absMillionValue >= 0.1
            ? 3
            : 4;

  const formatted = millionValue
    .toFixed(fractionDigits)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');

  return `${formatted}M`;
}

// Precision is bounded to 2–12 digits, so at most 11 formatters are retained.
const usdFormatters = new Map<number, Intl.NumberFormat>();

/**
 * 格式化美元
 */
export function formatUsd(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '$0.00';
  }

  const abs = Math.abs(num);
  // Keep the familiar two-decimal display for regular amounts, but retain
  // enough precision for small, positive per-request costs. Otherwise a
  // valid amount such as $0.00025 is rounded to $0.00 before it reaches the UI.
  const maximumFractionDigits =
    abs === 0 || abs >= 0.01
      ? 2
      : Math.min(12, Math.max(2, Math.ceil(-Math.log10(abs)) + 2));
  let formatter = usdFormatters.get(maximumFractionDigits);
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits,
    });
    usdFormatters.set(maximumFractionDigits, formatter);
  }
  return `$${formatter.format(num)}`;
}

export function formatLatencyMs(value: number | null | undefined): string {
  const latency = Number(value);
  if (!Number.isFinite(latency) || latency < 0) {
    return '-';
  }
  if (latency < 1000) {
    return `${Math.round(latency).toLocaleString()} ms`;
  }

  const seconds = latency / 1000;
  const fixed = seconds < 10 ? seconds.toFixed(2) : seconds.toFixed(1);
  return `${fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')} s`;
}

const usageDetailsCache = new WeakMap<object, UsageDetail[]>();
const usageDetailsWithEndpointCache = new WeakMap<object, UsageDetailWithEndpoint[]>();
const usageDerivedCache = new WeakMap<object, Map<string, unknown>>();

const getUsageDerivedBucket = (usageData: unknown): Map<string, unknown> | null => {
  if (!isRecord(usageData)) {
    return null;
  }

  const cacheKey = usageData as object;
  let bucket = usageDerivedCache.get(cacheKey);
  if (!bucket) {
    bucket = new Map<string, unknown>();
    usageDerivedCache.set(cacheKey, bucket);
  }
  return bucket;
};

const getCachedUsageDerivedValue = <T>(
  usageData: unknown,
  cacheKey: string,
  compute: () => T
): T => {
  const bucket = getUsageDerivedBucket(usageData);
  if (!bucket) {
    return compute();
  }
  if (bucket.has(cacheKey)) {
    return bucket.get(cacheKey) as T;
  }

  const value = compute();
  bucket.set(cacheKey, value);
  return value;
};

const normalizeUsageErrorMessage = (value: unknown): string | undefined => {
  const raw =
    typeof value === 'string'
      ? value
      : isRecord(value) && typeof value.message === 'string'
        ? value.message
        : '';
  const normalized = raw.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
};

const normalizeUsageModel = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

/**
 * 从使用数据中收集所有请求明细
 */
export function collectUsageDetails(usageData: unknown): UsageDetail[] {
  const cacheKey = isRecord(usageData) ? (usageData as object) : null;
  if (cacheKey) {
    const cached = usageDetailsCache.get(cacheKey);
    if (cached) return cached;
  }

  const apis = getApisRecord(usageData);
  if (!apis) return [];
  const details: UsageDetail[] = [];
  const sourceCache = new Map<string, string>();

  const normalizeSource = (value: unknown): string => {
    const raw =
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : String(value);
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const cached = sourceCache.get(trimmed);
    if (cached !== undefined) return cached;
    const normalized = normalizeUsageSourceId(trimmed);
    sourceCache.set(trimmed, normalized);
    return normalized;
  };

  Object.entries(apis).forEach(([apiName, apiEntry]) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const modelDetailsRaw = modelEntry.details;
      const modelDetails = Array.isArray(modelDetailsRaw) ? modelDetailsRaw : [];

      modelDetails.forEach((detailRaw) => {
        if (!isRecord(detailRaw) || typeof detailRaw.timestamp !== 'string') return;
        const timestamp = detailRaw.timestamp;
        const timestampMs = parseTimestampMs(timestamp);
        const tokensRaw = isRecord(detailRaw.tokens) ? detailRaw.tokens : {};
        const latencyMs = extractLatencyMs(detailRaw);
        const ttftMs = extractTTFTMs(detailRaw);
        const apiKeyRaw =
          typeof detailRaw.api_key === 'string' && detailRaw.api_key.trim()
            ? detailRaw.api_key.trim()
            : looksLikeRawSecret(apiName)
              ? apiName.trim()
              : undefined;
        const endpoint =
          typeof detailRaw.endpoint === 'string' && detailRaw.endpoint.trim()
            ? detailRaw.endpoint.trim()
            : undefined;
        const clientIP =
          typeof detailRaw.client_ip === 'string' && detailRaw.client_ip.trim()
            ? detailRaw.client_ip.trim()
            : undefined;
        details.push({
          timestamp,
          api_key: apiKeyRaw,
          endpoint,
          client_ip: clientIP,
          source: normalizeSource(detailRaw.source),
          auth_index: detailRaw.auth_index as unknown as number,
          model_reasoning_effort:
            typeof detailRaw.model_reasoning_effort === 'string'
              ? detailRaw.model_reasoning_effort
              : undefined,
          requested_reasoning_effort:
            typeof detailRaw.requested_reasoning_effort === 'string'
              ? detailRaw.requested_reasoning_effort
              : undefined,
          upstream_reasoning_effort:
            typeof detailRaw.upstream_reasoning_effort === 'string'
              ? detailRaw.upstream_reasoning_effort
              : undefined,
          requested_service_tier:
            typeof detailRaw.requested_service_tier === 'string'
              ? detailRaw.requested_service_tier
              : undefined,
          upstream_service_tier:
            typeof detailRaw.upstream_service_tier === 'string'
              ? detailRaw.upstream_service_tier
              : undefined,
          response_service_tier:
            typeof detailRaw.response_service_tier === 'string'
              ? detailRaw.response_service_tier
              : undefined,
          model_mapping_chain:
            typeof detailRaw.model_mapping_chain === 'string'
              ? detailRaw.model_mapping_chain
              : undefined,
          requested_model: normalizeUsageModel(detailRaw.requested_model),
          upstream_model: normalizeUsageModel(detailRaw.upstream_model),
          response_model: normalizeUsageModel(detailRaw.response_model),
          model_downgraded: detailRaw.model_downgraded === true,
          response_model_mismatch:
            typeof detailRaw.response_model_mismatch === 'boolean'
              ? detailRaw.response_model_mismatch
              : null,
          response_model_conflict: detailRaw.response_model_conflict === true,
          error_message: normalizeUsageErrorMessage(
            detailRaw.error_message ?? detailRaw.errorMessage ?? detailRaw.error
          ),
          latency_ms: latencyMs ?? undefined,
          ttft_ms: ttftMs ?? undefined,
          tokens: tokensRaw as unknown as UsageDetail['tokens'],
          failed: detailRaw.failed === true,
          __modelName: modelName,
          __timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        });
      });
    });
  });

  if (cacheKey) {
    usageDetailsCache.set(cacheKey, details);
  }
  return details;
}

/**
 * 从使用数据中收集包含 endpoint/method/path 的请求明细
 */
export function collectUsageDetailsWithEndpoint(usageData: unknown): UsageDetailWithEndpoint[] {
  const cacheKey = isRecord(usageData) ? (usageData as object) : null;
  if (cacheKey) {
    const cached = usageDetailsWithEndpointCache.get(cacheKey);
    if (cached) return cached;
  }

  const apis = getApisRecord(usageData);
  if (!apis) return [];

  const details: UsageDetailWithEndpoint[] = [];
  const sourceCache = new Map<string, string>();

  const normalizeSource = (value: unknown): string => {
    const raw =
      typeof value === 'string'
        ? value
        : value === null || value === undefined
          ? ''
          : String(value);
    const trimmed = raw.trim();
    if (!trimmed) return '';
    const cached = sourceCache.get(trimmed);
    if (cached !== undefined) return cached;
    const normalized = normalizeUsageSourceId(trimmed);
    sourceCache.set(trimmed, normalized);
    return normalized;
  };

  Object.entries(apis).forEach(([endpoint, apiEntry]) => {
    if (!isRecord(apiEntry)) return;
    const modelsRaw = apiEntry.models;
    const models = isRecord(modelsRaw) ? modelsRaw : null;
    if (!models) return;

    Object.entries(models).forEach(([modelName, modelEntry]) => {
      if (!isRecord(modelEntry)) return;
      const modelDetailsRaw = modelEntry.details;
      const modelDetails = Array.isArray(modelDetailsRaw) ? modelDetailsRaw : [];

      modelDetails.forEach((detailRaw) => {
        if (!isRecord(detailRaw) || typeof detailRaw.timestamp !== 'string') return;
        const timestamp = detailRaw.timestamp;
        const timestampMs = parseTimestampMs(timestamp);
        const tokensRaw = isRecord(detailRaw.tokens) ? detailRaw.tokens : {};
        const latencyMs = extractLatencyMs(detailRaw);
        const ttftMs = extractTTFTMs(detailRaw);
        const apiKeyRaw =
          typeof detailRaw.api_key === 'string' && detailRaw.api_key.trim()
            ? detailRaw.api_key.trim()
            : looksLikeRawSecret(endpoint)
              ? endpoint.trim()
              : undefined;
        const detailEndpoint =
          typeof detailRaw.endpoint === 'string' && detailRaw.endpoint.trim()
            ? detailRaw.endpoint.trim()
            : endpoint;
        const endpointMatch = detailEndpoint.match(USAGE_ENDPOINT_METHOD_REGEX);
        const endpointMethod = endpointMatch?.[1]?.toUpperCase();
        const endpointPath = endpointMatch?.[2];
        const clientIP =
          typeof detailRaw.client_ip === 'string' && detailRaw.client_ip.trim()
            ? detailRaw.client_ip.trim()
            : undefined;
        details.push({
          timestamp,
          api_key: apiKeyRaw,
          endpoint: detailEndpoint,
          client_ip: clientIP,
          source: normalizeSource(detailRaw.source),
          auth_index: detailRaw.auth_index as unknown as number,
          model_reasoning_effort:
            typeof detailRaw.model_reasoning_effort === 'string'
              ? detailRaw.model_reasoning_effort
              : undefined,
          requested_reasoning_effort:
            typeof detailRaw.requested_reasoning_effort === 'string'
              ? detailRaw.requested_reasoning_effort
              : undefined,
          upstream_reasoning_effort:
            typeof detailRaw.upstream_reasoning_effort === 'string'
              ? detailRaw.upstream_reasoning_effort
              : undefined,
          requested_service_tier:
            typeof detailRaw.requested_service_tier === 'string'
              ? detailRaw.requested_service_tier
              : undefined,
          upstream_service_tier:
            typeof detailRaw.upstream_service_tier === 'string'
              ? detailRaw.upstream_service_tier
              : undefined,
          response_service_tier:
            typeof detailRaw.response_service_tier === 'string'
              ? detailRaw.response_service_tier
              : undefined,
          model_mapping_chain:
            typeof detailRaw.model_mapping_chain === 'string'
              ? detailRaw.model_mapping_chain
              : undefined,
          requested_model: normalizeUsageModel(detailRaw.requested_model),
          upstream_model: normalizeUsageModel(detailRaw.upstream_model),
          response_model: normalizeUsageModel(detailRaw.response_model),
          model_downgraded: detailRaw.model_downgraded === true,
          response_model_mismatch:
            typeof detailRaw.response_model_mismatch === 'boolean'
              ? detailRaw.response_model_mismatch
              : null,
          response_model_conflict: detailRaw.response_model_conflict === true,
          error_message: normalizeUsageErrorMessage(
            detailRaw.error_message ?? detailRaw.errorMessage ?? detailRaw.error
          ),
          latency_ms: latencyMs ?? undefined,
          ttft_ms: ttftMs ?? undefined,
          tokens: tokensRaw as unknown as UsageDetail['tokens'],
          failed: detailRaw.failed === true,
          __modelName: modelName,
          __endpoint: detailEndpoint,
          __endpointMethod: endpointMethod,
          __endpointPath: endpointPath,
          __timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        });
      });
    });
  });

  if (cacheKey) {
    usageDetailsWithEndpointCache.set(cacheKey, details);
  }
  return details;
}

/**
 * 从单条明细提取总 tokens
 */
export function extractTotalTokens(detail: unknown): number {
  const record = isRecord(detail) ? detail : null;
  const tokensRaw = record?.tokens;
  const tokens = isRecord(tokensRaw) ? tokensRaw : {};
  if (typeof tokens.total_tokens === 'number') {
    return tokens.total_tokens;
  }
  const inputTokens = typeof tokens.input_tokens === 'number' ? tokens.input_tokens : 0;
  const outputTokens = typeof tokens.output_tokens === 'number' ? tokens.output_tokens : 0;
  const reasoningTokens = typeof tokens.reasoning_tokens === 'number' ? tokens.reasoning_tokens : 0;
  const cachedTokens = Math.max(
    typeof tokens.cached_tokens === 'number' ? Math.max(tokens.cached_tokens, 0) : 0,
    typeof tokens.cache_tokens === 'number' ? Math.max(tokens.cache_tokens, 0) : 0
  );

  return inputTokens + outputTokens + reasoningTokens + cachedTokens;
}

/**
 * 计算成本数据
 */
export function calculateCost(
  detail: UsageDetail,
  modelPrices: Record<string, ModelPrice>
): number {
  const modelName = detail.__modelName || '';
  const price = lookupModelPrice(modelPrices, modelName);
  if (!price) {
    return 0;
  }
  const tokens = detail.tokens;
  const rawInputTokens = Number(tokens.input_tokens);
  const rawCompletionTokens = Number(tokens.output_tokens);
  const rawCachedTokensPrimary = Number(tokens.cached_tokens);
  const rawCachedTokensAlternate = Number(tokens.cache_tokens);

  const inputTokens = Number.isFinite(rawInputTokens) ? Math.max(rawInputTokens, 0) : 0;
  const completionTokens = Number.isFinite(rawCompletionTokens)
    ? Math.max(rawCompletionTokens, 0)
    : 0;
  const cachedTokens = Math.max(
    Number.isFinite(rawCachedTokensPrimary) ? Math.max(rawCachedTokensPrimary, 0) : 0,
    Number.isFinite(rawCachedTokensAlternate) ? Math.max(rawCachedTokensAlternate, 0) : 0
  );
  const promptTokens = Math.max(inputTokens - cachedTokens, 0);

  const promptCost = (promptTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.prompt) || 0);
  const cachedCost = (cachedTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.cache) || 0);
  const completionCost =
    (completionTokens / TOKENS_PER_PRICE_UNIT) * (Number(price.completion) || 0);
  const total = promptCost + cachedCost + completionCost;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

/**
 * 从 localStorage 加载模型价格
 */
export function loadModelPrices(): Record<string, ModelPrice> {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_MODEL_PRICES };
    }
    const raw = localStorage.getItem(MODEL_PRICE_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_MODEL_PRICES };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ...DEFAULT_MODEL_PRICES };
    }
    const normalized: Record<string, ModelPrice> = { ...DEFAULT_MODEL_PRICES };
    Object.entries(parsed).forEach(([model, price]: [string, unknown]) => {
      if (!model) return;
      const priceRecord = isRecord(price) ? price : null;
      const promptRaw = Number(priceRecord?.prompt);
      const completionRaw = Number(priceRecord?.completion);
      const cacheRaw = Number(priceRecord?.cache);

      if (
        !Number.isFinite(promptRaw) &&
        !Number.isFinite(completionRaw) &&
        !Number.isFinite(cacheRaw)
      ) {
        return;
      }

      const prompt = Number.isFinite(promptRaw) && promptRaw >= 0 ? promptRaw : 0;
      const completion = Number.isFinite(completionRaw) && completionRaw >= 0 ? completionRaw : 0;
      const cache =
        Number.isFinite(cacheRaw) && cacheRaw >= 0
          ? cacheRaw
          : Number.isFinite(promptRaw) && promptRaw >= 0
            ? promptRaw
            : prompt;

      normalized[model] = {
        prompt,
        completion,
        cache,
      };
    });
    return normalized;
  } catch {
    return { ...DEFAULT_MODEL_PRICES };
  }
}

/**
 * 保存模型价格到 localStorage
 */
export function saveModelPrices(prices: Record<string, ModelPrice>): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(MODEL_PRICE_STORAGE_KEY, JSON.stringify(prices));
  } catch {
    console.warn('保存模型价格失败');
  }
}

/**
 * 格式化小时标签
 */
export function formatHourLabel(date: Date): string {
  if (!(date instanceof Date)) {
    return '';
  }
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  return `${month}-${day} ${hour}:00`;
}

/**
 * 格式化日期标签
 */
export function formatDayLabel(date: Date): string {
  if (!(date instanceof Date)) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface ChartDataset {
  label: string;
  data: Array<number | null>;
  borderColor: string;
  backgroundColor:
    | string
    | CanvasGradient
    | ((context: ScriptableContext<'line'>) => string | CanvasGradient);
  pointBackgroundColor?: string;
  pointBorderColor?: string;
  fill: boolean;
  tension: number;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export const ALL_MODELS_CHART_LABEL = 'All Models';

/**
 * 状态栏单个格子的状态
 */
export type StatusBlockState = 'success' | 'failure' | 'mixed' | 'idle';

/**
 * 状态栏单个格子的详细信息
 */
export interface StatusBlockDetail {
  success: number;
  failure: number;
  /** 该格子的成功率 (0–1)，无请求时为 -1 */
  rate: number;
  /** 格子起始时间戳 (ms) */
  startTime: number;
  /** 格子结束时间戳 (ms) */
  endTime: number;
}

/**
 * 状态栏数据
 */
export interface StatusBarData {
  blocks: StatusBlockState[];
  blockDetails: StatusBlockDetail[];
  successRate: number;
  totalSuccess: number;
  totalFailure: number;
}

/**
 * 计算状态栏数据（默认最近200分钟，分为20个10分钟的时间块）
 * 每个时间块代表窗口内的一个等长区间，用于展示成功/失败趋势。
 * `blockDurationMs` 可供认证文件卡片使用更短的统计间隔。
 */
export function calculateStatusBarData(
  usageDetails: UsageDetail[],
  sourceFilter?: string,
  authIndexFilter?: number,
  blockDurationMs = 10 * 60 * 1000
): StatusBarData {
  const BLOCK_COUNT = 20;
  const BLOCK_DURATION_MS = blockDurationMs;
  const WINDOW_MS = BLOCK_COUNT * BLOCK_DURATION_MS;

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Initialize blocks
  const blockStats: Array<{ success: number; failure: number }> = Array.from(
    { length: BLOCK_COUNT },
    () => ({ success: 0, failure: 0 })
  );

  let totalSuccess = 0;
  let totalFailure = 0;

  // Filter and bucket the usage details
  usageDetails.forEach((detail) => {
    const timestamp =
      typeof detail.__timestampMs === 'number'
        ? detail.__timestampMs
        : parseTimestampMs(detail.timestamp);
    if (
      !Number.isFinite(timestamp) ||
      timestamp <= 0 ||
      timestamp < windowStart ||
      timestamp > now
    ) {
      return;
    }

    // Apply filters if provided
    if (sourceFilter !== undefined && detail.source !== sourceFilter) {
      return;
    }
    if (authIndexFilter !== undefined && detail.auth_index !== authIndexFilter) {
      return;
    }

    // Calculate which block this falls into (0 = oldest, 19 = newest)
    const ageMs = now - timestamp;
    const blockIndex = BLOCK_COUNT - 1 - Math.floor(ageMs / BLOCK_DURATION_MS);

    if (blockIndex >= 0 && blockIndex < BLOCK_COUNT) {
      if (detail.failed) {
        blockStats[blockIndex].failure += 1;
        totalFailure += 1;
      } else {
        blockStats[blockIndex].success += 1;
        totalSuccess += 1;
      }
    }
  });

  // Convert stats to block states and build details
  const blocks: StatusBlockState[] = [];
  const blockDetails: StatusBlockDetail[] = [];

  blockStats.forEach((stat, idx) => {
    const total = stat.success + stat.failure;
    if (total === 0) {
      blocks.push('idle');
    } else if (stat.failure === 0) {
      blocks.push('success');
    } else if (stat.success === 0) {
      blocks.push('failure');
    } else {
      blocks.push('mixed');
    }

    const blockStartTime = windowStart + idx * BLOCK_DURATION_MS;
    blockDetails.push({
      success: stat.success,
      failure: stat.failure,
      rate: total > 0 ? stat.success / total : -1,
      startTime: blockStartTime,
      endTime: blockStartTime + BLOCK_DURATION_MS,
    });
  });

  // Calculate success rate
  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? (totalSuccess / total) * 100 : 100;

  return {
    blocks,
    blockDetails,
    successRate,
    totalSuccess,
    totalFailure,
  };
}

export function computeKeyStats(
  usageData: unknown,
  masker: (val: string) => string = maskApiKey
): KeyStats {
  const compute = (): KeyStats => {
    const aggregatedWindow = getSelectedAggregatedWindow(usageData);
    if (aggregatedWindow && Array.isArray(aggregatedWindow.credentials)) {
      const bySource: Record<string, KeyStatBucket> = {};
      const byAuthIndex: Record<string, KeyStatBucket> = {};

      aggregatedWindow.credentials.forEach((item) => {
        if (!isRecord(item)) {
          return;
        }

        const source = normalizeUsageSourceId(item.source, masker);
        const authIndexKey = normalizeAuthIndex(item.auth_index);
        const successCount =
          typeof item.success_count === 'number' && Number.isFinite(item.success_count)
            ? item.success_count
            : 0;
        const failureCount =
          typeof item.failure_count === 'number' && Number.isFinite(item.failure_count)
            ? item.failure_count
            : 0;

        if (source) {
          const bucket = bySource[source] ?? { success: 0, failure: 0 };
          bucket.success += successCount;
          bucket.failure += failureCount;
          bySource[source] = bucket;
        }

        if (authIndexKey) {
          const bucket = byAuthIndex[authIndexKey] ?? { success: 0, failure: 0 };
          bucket.success += successCount;
          bucket.failure += failureCount;
          byAuthIndex[authIndexKey] = bucket;
        }
      });

      return { bySource, byAuthIndex };
    }

    const apis = getApisRecord(usageData);
    if (!apis) {
      return { bySource: {}, byAuthIndex: {} };
    }

    const sourceStats: Record<string, KeyStatBucket> = {};
    const authIndexStats: Record<string, KeyStatBucket> = {};

    const ensureBucket = (bucket: Record<string, KeyStatBucket>, key: string) => {
      if (!bucket[key]) {
        bucket[key] = { success: 0, failure: 0 };
      }
      return bucket[key];
    };

    Object.values(apis).forEach((apiEntry) => {
      if (!isRecord(apiEntry)) return;
      const modelsRaw = apiEntry.models;
      const models = isRecord(modelsRaw) ? modelsRaw : null;
      if (!models) return;

      Object.values(models).forEach((modelEntry) => {
        if (!isRecord(modelEntry)) return;
        const details = Array.isArray(modelEntry.details) ? modelEntry.details : [];

        details.forEach((detail) => {
          const detailRecord = isRecord(detail) ? detail : null;
          const source = normalizeUsageSourceId(detailRecord?.source, masker);
          const authIndexKey = normalizeAuthIndex(detailRecord?.auth_index);
          const isFailed = detailRecord?.failed === true;

          if (source) {
            const bucket = ensureBucket(sourceStats, source);
            if (isFailed) {
              bucket.failure += 1;
            } else {
              bucket.success += 1;
            }
          }

          if (authIndexKey) {
            const bucket = ensureBucket(authIndexStats, authIndexKey);
            if (isFailed) {
              bucket.failure += 1;
            } else {
              bucket.success += 1;
            }
          }
        });
      });
    });

    return {
      bySource: sourceStats,
      byAuthIndex: authIndexStats,
    };
  };

  if (masker !== maskApiKey) {
    return compute();
  }

  return getCachedUsageDerivedValue(usageData, 'keyStats', compute);
}

export type TokenCategory = 'input' | 'output' | 'cached' | 'reasoning';

export interface TokenBreakdownSeries {
  labels: string[];
  dataByCategory: Record<TokenCategory, number[]>;
  hasData: boolean;
}

export interface CostSeries {
  labels: string[];
  data: number[];
  hasData: boolean;
}

export interface LatencySeries {
  labels: string[];
  data: Array<number | null>;
  hasData: boolean;
}
