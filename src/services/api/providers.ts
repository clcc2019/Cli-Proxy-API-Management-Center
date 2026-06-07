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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

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
          if (model.image !== undefined) payload.image = model.image;
          if (model.thinking !== undefined) payload.thinking = model.thinking;
          return payload;
        })
        .filter(Boolean)
    : undefined;

const serializeProviderKey = (config: ProviderKeyConfig) => {
  const payload: Record<string, unknown> = { 'api-key': config.apiKey };
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.baseUrl) payload['base-url'] = config.baseUrl;
  if (config.websockets !== undefined) payload.websockets = config.websockets;
  if (config.proxyUrl) payload['proxy-url'] = config.proxyUrl;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
  const models = serializeModelAliases(config.models);
  if (models && models.length) payload.models = models;
  if (config.excludedModels && config.excludedModels.length) {
    payload['excluded-models'] = config.excludedModels;
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

const serializeOpenAICompatibilityConfig = (config: OpenAICompatibilityConfig) => {
  const payload: Record<string, unknown> = {};
  if (config.name?.trim()) payload.name = config.name.trim();
  if (config.priority !== undefined) payload.priority = config.priority;
  if (config.prefix?.trim()) payload.prefix = config.prefix.trim();
  if (config.disabled !== undefined) payload.disabled = config.disabled;
  if (config.poolMode !== undefined) payload['pool-mode'] = config.poolMode;
  if (config.baseUrl?.trim()) payload['base-url'] = config.baseUrl.trim();
  if (config.disableCooling !== undefined) payload['disable-cooling'] = config.disableCooling;
  const apiKeyEntries = serializeOpenAICompatibilityApiKeys(config.apiKeyEntries);
  if (apiKeyEntries && apiKeyEntries.length) payload['api-key-entries'] = apiKeyEntries;
  const models = serializeOpenAICompatibilityModels(config.models);
  if (models && models.length) payload.models = models;
  const headers = serializeHeaders(config.headers);
  if (headers) payload.headers = headers;
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

  saveCodexConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/codex-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  updateCodexConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/codex-api-key', { index, value: serializeProviderKey(value) }),

  deleteCodexConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/codex-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getClaudeConfigs(): Promise<ProviderKeyConfig[]> {
    const data = await apiClient.get('/claude-api-key');
    const list = extractArrayPayload(data, 'claude-api-key');
    return list
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  },

  saveClaudeConfigs: (configs: ProviderKeyConfig[]) =>
    apiClient.put(
      '/claude-api-key',
      configs.map((item) => serializeProviderKey(item))
    ),

  updateClaudeConfig: (index: number, value: ProviderKeyConfig) =>
    apiClient.patch('/claude-api-key', { index, value: serializeProviderKey(value) }),

  deleteClaudeConfig: (apiKey: string, baseUrl?: string) =>
    apiClient.delete(`/claude-api-key${buildProviderDeleteQuery(apiKey, baseUrl)}`),

  async getOpenAICompatConfigs(): Promise<OpenAICompatibilityConfig[]> {
    const data = await apiClient.get('/openai-compatibility');
    const list = extractArrayPayload(data, 'openai-compatibility');
    return list
      .map((item) => normalizeOpenAICompatibilityConfig(item))
      .filter(Boolean) as OpenAICompatibilityConfig[];
  },

  saveOpenAICompatConfigs: (configs: OpenAICompatibilityConfig[]) =>
    apiClient.put(
      '/openai-compatibility',
      configs.map((item) => serializeOpenAICompatibilityConfig(item))
    ),

  updateOpenAICompatConfig: (index: number, value: OpenAICompatibilityConfig) =>
    apiClient.patch('/openai-compatibility', {
      index,
      value: serializeOpenAICompatibilityConfig(value),
    }),

  deleteOpenAICompatConfig: (index: number) =>
    apiClient.delete(`/openai-compatibility?index=${encodeURIComponent(String(index))}`),
};
