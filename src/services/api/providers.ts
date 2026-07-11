/**
 * AI 提供商相关 API
 */

import { apiClient } from './client';
import { normalizeOpenAICompatibilityConfig, normalizeProviderKeyConfig } from './transformers';
import type {
  OpenAICompatibilityApiKeyEntry,
  OpenAICompatibilityConfig,
  OpenAICompatibilityModel,
  ProviderKeyConfig,
  ModelAlias,
} from '@/types';

const serializeHeaders = (headers?: Record<string, string>) =>
  headers && Object.keys(headers).length ? headers : undefined;

const RESPONSE_ONLY_FIELDS = ['auth-index'] as const;

const PROVIDER_COMMON_KEY_FIELDS = [
  'api-key',
  'priority',
  'prefix',
  'base-url',
  'proxy-url',
  'headers',
  'models',
  'excluded-models',
  'disable-cooling',
] as const;

const CODEX_KEY_FIELDS = [...PROVIDER_COMMON_KEY_FIELDS, 'websockets', 'pool-mode'] as const;
const CLAUDE_KEY_FIELDS = [
  ...PROVIDER_COMMON_KEY_FIELDS,
  'cloak',
  'experimental-cch-signing',
] as const;

const OPENAI_COMPATIBILITY_FIELDS = [
  'name',
  'priority',
  'prefix',
  'disabled',
  'pool-mode',
  'base-url',
  'disable-cooling',
  'api-key-entries',
  'models',
  'headers',
  'test-model',
] as const;

const MODEL_ALIAS_FIELDS = ['name', 'alias', 'priority', 'test-model'] as const;
const OPENAI_MODEL_ALIAS_FIELDS = [...MODEL_ALIAS_FIELDS, 'image', 'thinking'] as const;
const API_KEY_ENTRY_FIELDS = ['api-key', 'proxy-url'] as const;
const CLOAK_FIELDS = ['mode', 'strict-mode', 'cache-user-id', 'sensitive-words'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const getStringField = (record: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

const providerKeyIdentity = (record: Record<string, unknown>) => {
  const apiKey = getStringField(record, ['api-key']);
  if (!apiKey) return '';
  const baseUrl = getStringField(record, ['base-url']);
  return `${apiKey}\u0000${baseUrl}`;
};

const openAICompatibilityIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['name']);

const modelIdentity = (record: Record<string, unknown>) => getStringField(record, ['name']);

const apiKeyEntryIdentity = (record: Record<string, unknown>) =>
  getStringField(record, ['api-key']);

const cloneWithoutKnownFields = (
  raw: unknown,
  knownFields: readonly string[]
): Record<string, unknown> => {
  const next: Record<string, unknown> = isRecord(raw) ? { ...raw } : {};
  [...knownFields, ...RESPONSE_ONLY_FIELDS].forEach((field) => {
    delete next[field];
  });
  return next;
};

const mergeKnownFields = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = cloneWithoutKnownFields(raw, knownFields);
  Object.entries(payload).forEach(([key, value]) => {
    if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
};

const findRawRecord = (
  rawRecords: Array<Record<string, unknown> | undefined>,
  usedIndexes: Set<number>,
  payload: Record<string, unknown>,
  index: number,
  getIdentity: (record: Record<string, unknown>) => string,
  fallbackByIndex = true
) => {
  const identity = getIdentity(payload);
  if (identity) {
    for (let i = 0; i < rawRecords.length; i += 1) {
      const candidate = rawRecords[i];
      if (!candidate || usedIndexes.has(i)) continue;
      if (getIdentity(candidate) === identity) {
        usedIndexes.add(i);
        return candidate;
      }
    }
  }

  if (fallbackByIndex) {
    const fallback = rawRecords[index];
    if (fallback && !usedIndexes.has(index)) {
      usedIndexes.add(index);
      return fallback;
    }
  }

  return undefined;
};

const mergeKnownRecordList = (
  rawItems: unknown,
  payloadItems: Record<string, unknown>[],
  knownFields: readonly string[],
  getIdentity: (record: Record<string, unknown>) => string,
  fallbackByIndex = true
) => {
  const rawRecords = Array.isArray(rawItems)
    ? rawItems.map((item) => (isRecord(item) ? item : undefined))
    : [];
  const usedIndexes = new Set<number>();

  return payloadItems.map((payload, index) => {
    const raw = findRawRecord(
      rawRecords,
      usedIndexes,
      payload,
      index,
      getIdentity,
      fallbackByIndex
    );
    return mergeKnownFields(raw, payload, knownFields);
  });
};

const getRawSectionList = (rawConfig: unknown, section: string): unknown[] => {
  if (!isRecord(rawConfig)) return [];
  const value = rawConfig[section];
  return Array.isArray(value) ? value : [];
};

const mergeModelPayloads = (
  raw: unknown,
  models: unknown,
  knownFields: readonly string[] = MODEL_ALIAS_FIELDS
) =>
  Array.isArray(models)
    ? mergeKnownRecordList(
        isRecord(raw) ? raw.models : undefined,
        models.filter(isRecord),
        knownFields,
        modelIdentity,
        false
      )
    : undefined;

const mergeProviderKeyPayload = (
  raw: unknown,
  payload: Record<string, unknown>,
  knownFields: readonly string[]
) => {
  const next = mergeKnownFields(raw, payload, knownFields);
  const models = mergeModelPayloads(raw, payload.models);
  if (models) next.models = models;
  if (isRecord(payload.cloak)) {
    next.cloak = mergeKnownFields(
      isRecord(raw) ? raw.cloak : undefined,
      payload.cloak,
      CLOAK_FIELDS
    );
  }
  return next;
};

const mergeOpenAICompatibilityPayload = (raw: unknown, payload: Record<string, unknown>) => {
  const next = mergeKnownFields(raw, payload, OPENAI_COMPATIBILITY_FIELDS);
  const apiKeyEntries = payload['api-key-entries'];
  if (Array.isArray(apiKeyEntries)) {
    next['api-key-entries'] = mergeKnownRecordList(
      isRecord(raw) ? raw['api-key-entries'] : undefined,
      apiKeyEntries.filter(isRecord),
      API_KEY_ENTRY_FIELDS,
      apiKeyEntryIdentity
    );
  }
  const models = mergeModelPayloads(raw, payload.models, OPENAI_MODEL_ALIAS_FIELDS);
  if (models) next.models = models;
  return next;
};

const buildPreservedList = async <T>(
  section: string,
  configs: T[],
  serialize: (item: T) => Record<string, unknown>,
  mergePayload: (raw: unknown, payload: Record<string, unknown>) => Record<string, unknown>,
  getIdentity: (record: Record<string, unknown>) => string
) => {
  const rawConfig = await apiClient.get('/config');
  const rawItems = getRawSectionList(rawConfig, section);
  const payloads = configs.map((item) => serialize(item));
  const rawRecords = rawItems.map((item) => (isRecord(item) ? item : undefined));
  const usedIndexes = new Set<number>();

  return payloads.map((payload, index) => {
    const raw = findRawRecord(rawRecords, usedIndexes, payload, index, getIdentity);
    return mergePayload(raw, payload);
  });
};

const extractArrayPayload = (data: unknown, key: string): unknown[] => {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  const candidate = data[key] ?? data.items ?? data.data ?? data;
  return Array.isArray(candidate) ? candidate : [];
};

const buildProviderDeleteQuery = (apiKey: string, baseUrl?: string) => {
  const params = new URLSearchParams();
  params.set('api-key', apiKey.trim());
  params.set('base-url', (baseUrl ?? '').trim());
  return `?${params.toString()}`;
};

const serializeModelAliases = (models?: ModelAlias[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { name: model.name.trim() };
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias.trim();
          }
          if (model.priority !== undefined) payload.priority = model.priority;
          if (model.testModel) payload['test-model'] = model.testModel;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeOpenAICompatibilityApiKeys = (items?: OpenAICompatibilityApiKeyEntry[]) =>
  Array.isArray(items)
    ? items
        .map((item) => {
          const apiKey = item?.apiKey?.trim();
          if (!apiKey) return null;
          const payload: Record<string, unknown> = { 'api-key': apiKey };
          if (item.proxyUrl?.trim()) payload['proxy-url'] = item.proxyUrl.trim();
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeOpenAICompatibilityModels = (models?: OpenAICompatibilityModel[]) =>
  Array.isArray(models)
    ? models
        .map((model) => {
          if (!model?.name) return null;
          const payload: Record<string, unknown> = { name: model.name.trim() };
          if (model.alias && model.alias !== model.name) {
            payload.alias = model.alias.trim();
          }
          if (model.priority !== undefined) payload.priority = model.priority;
          if (model.testModel) payload['test-model'] = model.testModel;
          if (model.image !== undefined) payload.image = model.image;
          if (model.thinking !== undefined) payload.thinking = model.thinking;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeProviderKey = (config: ProviderKeyConfig, includeEmptyPatchFields = false) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim() || includeEmptyPatchFields) {
    payload.prefix = config.prefix?.trim() ?? '';
  }
  if (config.baseUrl !== undefined || includeEmptyPatchFields) {
    payload['base-url'] = config.baseUrl ?? '';
  }
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  if (config.poolMode !== undefined) payload['pool-mode'] = config.poolMode;
  if (config.proxyUrl !== undefined || includeEmptyPatchFields) {
    payload['proxy-url'] = config.proxyUrl ?? '';
  }
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  const headers = serializeHeaders(config.headers);
  if (headers || includeEmptyPatchFields) payload.headers = headers ?? {};
  const models = serializeModelAliases(config.models);
  if ((models && models.length) || includeEmptyPatchFields) payload.models = models ?? [];
  if ((config.excludedModels && config.excludedModels.length) || includeEmptyPatchFields) {
    payload['excluded-models'] = config.excludedModels ?? [];
  }
  if (config.cloak) {
    const cloakPayload: Record<string, unknown> = {};
    const mode = config.cloak.mode?.trim();
    if (mode) cloakPayload.mode = mode;
    if (config.cloak.strictMode !== undefined)
      cloakPayload['strict-mode'] = config.cloak.strictMode;
    if (config.cloak.cacheUserId !== undefined)
      cloakPayload['cache-user-id'] = config.cloak.cacheUserId;
    if (config.cloak.sensitiveWords && config.cloak.sensitiveWords.length) {
      cloakPayload['sensitive-words'] = config.cloak.sensitiveWords;
    }
    if (Object.keys(cloakPayload).length) {
      payload.cloak = cloakPayload;
    }
  }
  if (config.experimentalCchSigning !== undefined) {
    payload['experimental-cch-signing'] = config.experimentalCchSigning;
  }
  return payload;
};

const serializeOpenAICompatibilityConfig = (
  config: OpenAICompatibilityConfig,
  includeEmptyPatchFields = false
) => {
  const payload: Record<string, unknown> = {};
  if (config.name?.trim() || includeEmptyPatchFields) payload.name = config.name?.trim() ?? '';
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim() || includeEmptyPatchFields) {
    payload.prefix = config.prefix?.trim() ?? '';
  }
  if (config.disabled !== undefined) payload.disabled = config.disabled;
  if (config.poolMode !== undefined) payload['pool-mode'] = config.poolMode;
  if (config.baseUrl?.trim() || includeEmptyPatchFields) {
    payload['base-url'] = config.baseUrl?.trim() ?? '';
  }
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  if (config.testModel?.trim()) payload['test-model'] = config.testModel.trim();
  const apiKeyEntries = serializeOpenAICompatibilityApiKeys(config.apiKeyEntries);
  if ((apiKeyEntries && apiKeyEntries.length) || includeEmptyPatchFields) {
    payload['api-key-entries'] = apiKeyEntries ?? [];
  }
  const models = serializeOpenAICompatibilityModels(config.models);
  if ((models && models.length) || includeEmptyPatchFields) payload.models = models ?? [];
  const headers = serializeHeaders(config.headers);
  if (headers || includeEmptyPatchFields) payload.headers = headers ?? {};
  return payload;
};

export const providersApi = {
  async getCodexConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/codex-api-key');
    const list = extractArrayPayload(data, 'codex-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveCodexConfigs: async (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/codex-api-key',
      await buildPreservedList(
        'codex-api-key',
        configs,
        serializeProviderKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, CODEX_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  updateCodexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/codex-api-key', {
      index,
      value: serializeProviderKey(value, true),
    }),

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: async (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/claude-api-key',
      await buildPreservedList(
        'claude-api-key',
        configs,
        serializeProviderKey,
        (raw, payload) => mergeProviderKeyPayload(raw, payload, CLAUDE_KEY_FIELDS),
        providerKeyIdentity
      )
    ),

  updateClaudeConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/claude-api-key', {
      index,
      value: serializeProviderKey(value, true),
    }),

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getOpenAICompatConfigs(): Promise<OpenAICompatibilityConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item) => normalizeOpenAICompatibilityConfig(item))
      .filter(Boolean) as OpenAICompatibilityConfig[];
  },

  saveOpenAICompatConfigs: async (configs: OpenAICompatibilityConfig[]) =>
    apiClient.put(
      '/openai-compatibility',
      await buildPreservedList(
        'openai-compatibility',
        configs,
        serializeOpenAICompatibilityConfig,
        mergeOpenAICompatibilityPayload,
        openAICompatibilityIdentity
      )
    ),

  updateOpenAICompatConfig: (index: number, value: OpenAICompatibilityConfig) =>
    apiClient.patch('/openai-compatibility', {
      index,
      value: serializeOpenAICompatibilityConfig(value, true),
    }),

  deleteOpenAICompatConfig: (index: number) =>
    apiClient.delete(`/openai-compatibility?index=${encodeURIComponent(String(index))}`),
};
