import { buildCandidateUsageSourceIds, type KeyStatBucket, type KeyStats } from '@/utils/usage';
import type { OpenAICompatibilityConfig, ProviderKeyConfig } from '@/types';

export const DISABLE_ALL_MODELS_RULE = '*';

export type ProviderKind = 'codex' | 'claude';

export const hasDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models) &&
  models.some((model) => String(model ?? '').trim() === DISABLE_ALL_MODELS_RULE);

export const stripDisableAllModelsRule = (models?: string[]) =>
  Array.isArray(models)
    ? models.filter((model) => String(model ?? '').trim() !== DISABLE_ALL_MODELS_RULE)
    : [];

export const withDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return [...base, DISABLE_ALL_MODELS_RULE];
};

export const withoutDisableAllModelsRule = (models?: string[]) => {
  const base = stripDisableAllModelsRule(models);
  return base;
};

const getPriorityValue = (priority: number | null | undefined) =>
  Number.isFinite(priority) ? Number(priority) : 0;

export const sortToggleableProviderConfigs = <
  T extends { priority?: number | null; excludedModels?: string[] },
>(
  items: T[]
) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftEnabled = !hasDisableAllModelsRule(left.item.excludedModels);
      const rightEnabled = !hasDisableAllModelsRule(right.item.excludedModels);
      if (leftEnabled !== rightEnabled) {
        return leftEnabled ? -1 : 1;
      }

      const priorityDiff =
        getPriorityValue(right.item.priority) - getPriorityValue(left.item.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return left.index - right.index;
    })
    .map(({ item }) => item);

const normalizeOptionalString = (value: string | null | undefined) => (value ?? '').trim();

export const buildProviderConfigKey = <
  T extends { apiKey: string; baseUrl?: string; prefix?: string },
>(
  item: T
) => `${item.apiKey}:${item.baseUrl ?? ''}:${item.prefix ?? ''}`;

export const buildProviderSwitchingKey = (provider: ProviderKind, item: ProviderKeyConfig) =>
  `${provider}:${buildProviderConfigKey(item)}`;

export const buildOpenAICompatibilityConfigKey = (
  item: OpenAICompatibilityConfig,
  index: number
) => {
  const name = normalizeOptionalString(item.name);
  const baseUrl = normalizeOptionalString(item.baseUrl);
  const prefix = normalizeOptionalString(item.prefix);
  return `${name}:${baseUrl}:${prefix}:${index}`;
};

export const findProviderKeyConfigIndex = <
  T extends { apiKey: string; baseUrl?: string; prefix?: string },
>(
  items: T[],
  target: T
) => {
  const referenceIndex = items.indexOf(target);
  if (referenceIndex >= 0) return referenceIndex;

  const apiKey = normalizeOptionalString(target.apiKey);
  const baseUrl = normalizeOptionalString(target.baseUrl);
  const prefix = normalizeOptionalString(target.prefix);

  const exactIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.apiKey) === apiKey &&
      normalizeOptionalString(item.baseUrl) === baseUrl &&
      normalizeOptionalString(item.prefix) === prefix
  );
  if (exactIndex >= 0) return exactIndex;

  const apiAndUrlIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.apiKey) === apiKey &&
      normalizeOptionalString(item.baseUrl) === baseUrl
  );
  if (apiAndUrlIndex >= 0) return apiAndUrlIndex;

  return items.findIndex((item) => normalizeOptionalString(item.apiKey) === apiKey);
};

export const findOpenAICompatibilityConfigIndex = (
  items: OpenAICompatibilityConfig[],
  target: OpenAICompatibilityConfig
) => {
  const referenceIndex = items.indexOf(target);
  if (referenceIndex >= 0) return referenceIndex;

  const name = normalizeOptionalString(target.name);
  const baseUrl = normalizeOptionalString(target.baseUrl);
  const prefix = normalizeOptionalString(target.prefix);

  const exactIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.name) === name &&
      normalizeOptionalString(item.baseUrl) === baseUrl &&
      normalizeOptionalString(item.prefix) === prefix
  );
  if (exactIndex >= 0) return exactIndex;

  const nameAndUrlIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.name) === name &&
      normalizeOptionalString(item.baseUrl) === baseUrl
  );
  if (nameAndUrlIndex >= 0) return nameAndUrlIndex;

  return items.findIndex((item) => normalizeOptionalString(item.name) === name);
};

export const getEnabledProviderConfigCount = (items: ProviderKeyConfig[]) =>
  items.filter((item) => !hasDisableAllModelsRule(item.excludedModels)).length;

export const parseTextList = (text: string): string[] =>
  text
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const parseExcludedModels = parseTextList;

export const excludedModelsToText = (models?: string[]) =>
  Array.isArray(models) ? models.join('\n') : '';

export const normalizeClaudeBaseUrl = (baseUrl: string): string => {
  let trimmed = String(baseUrl || '').trim();
  if (!trimmed) {
    return 'https://api.anthropic.com';
  }
  trimmed = trimmed.replace(/\/?v0\/management\/?$/i, '');
  trimmed = trimmed.replace(/\/+$/g, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
};

export const normalizeProviderPrefix = (prefix: string): string =>
  String(prefix ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '');

export const isProviderPrefixValid = (prefix: string): boolean => {
  const normalized = normalizeProviderPrefix(prefix);
  return normalized === '' || !normalized.includes('/');
};

export const buildClaudeMessagesEndpoint = (baseUrl: string): string => {
  const trimmed = normalizeClaudeBaseUrl(baseUrl);
  if (!trimmed) return '';
  if (trimmed.endsWith('/v1/messages')) {
    return trimmed;
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/messages`;
  }
  return `${trimmed}/v1/messages`;
};

// 根据 source (apiKey) 获取统计数据 - 与旧版逻辑一致
export const getStatsBySource = (
  apiKey: string,
  keyStats: KeyStats,
  prefix?: string
): KeyStatBucket => {
  const bySource = keyStats.bySource ?? {};
  const candidates = buildCandidateUsageSourceIds({ apiKey, prefix });
  if (!candidates.length) {
    return { success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;
  candidates.forEach((candidate) => {
    const stats = bySource[candidate];
    if (!stats) return;
    success += stats.success;
    failure += stats.failure;
  });

  return { success, failure };
};
