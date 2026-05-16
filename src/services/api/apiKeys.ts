/**
 * API 密钥管理
 */

import { apiClient } from './client';
import type { ClientApiKeyConfig } from '@/types/config';
import { extractClientApiKeyQuota, serializeClientApiKeyQuota } from '@/utils/clientApiKeyQuota';

const normalizeModelPatterns = (value: unknown): string[] => {
  const rawList = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  rawList.forEach((item) => {
    const trimmed = String(item ?? '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(trimmed);
  });

  return normalized;
};

const parseBooleanFlag = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return undefined;
};

const readDisabledFlag = (record: Record<string, unknown> | null): boolean => {
  if (!record) return false;
  const disabled = parseBooleanFlag(record.disabled ?? record.disable ?? record.isDisabled);
  if (disabled !== undefined) return disabled;
  const enabled = parseBooleanFlag(record.enabled ?? record.enable ?? record.isEnabled);
  return enabled === undefined ? false : !enabled;
};

const normalizeClientApiKey = (entry: unknown): ClientApiKeyConfig | null => {
  if (entry === undefined || entry === null) return null;
  const record =
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : null;
  const apiKey =
    record?.['api-key'] ??
    record?.apiKey ??
    record?.key ??
    (typeof entry === 'string' ? entry : '');
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: ClientApiKeyConfig = { apiKey: trimmed };
  if (readDisabledFlag(record)) {
    config.disabled = true;
  }
  const noteRaw = record?.['note'] ?? record?.['remark'] ?? record?.['description'];
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  if (note) {
    config.note = note;
  }
  const allowedModels = normalizeModelPatterns(
    record?.['allowed-models'] ?? record?.allowedModels ?? record?.['allowed_models']
  );
  const excludedModels = normalizeModelPatterns(
    record?.['excluded-models'] ?? record?.excludedModels ?? record?.['excluded_models']
  );

  if (allowedModels.length) {
    config.allowedModels = allowedModels;
  }
  if (excludedModels.length) {
    config.excludedModels = excludedModels;
  }
  if (record) {
    const quota = extractClientApiKeyQuota(record);
    if (quota) {
      config.quota = quota;
    }
  }

  return config;
};

const serializeClientApiKey = (entry: ClientApiKeyConfig): string | Record<string, unknown> => {
  const apiKey = String(entry.apiKey ?? '').trim();
  const note = typeof entry.note === 'string' ? entry.note.trim() : '';
  const disabled = Boolean(entry.disabled);
  const allowedModels = normalizeModelPatterns(entry.allowedModels);
  const excludedModels = normalizeModelPatterns(entry.excludedModels);
  const quota = serializeClientApiKeyQuota(entry.quota);

  if (!note && !disabled && !allowedModels.length && !excludedModels.length && !quota) {
    return apiKey;
  }

  return {
    'api-key': apiKey,
    ...(note ? { note } : {}),
    ...(disabled ? { disabled: true } : {}),
    ...(allowedModels.length ? { 'allowed-models': allowedModels } : {}),
    ...(excludedModels.length ? { 'excluded-models': excludedModels } : {}),
    ...(quota ? { quota } : {}),
  };
};

export const apiKeysApi = {
  async list(): Promise<ClientApiKeyConfig[]> {
    const data = await apiClient.get<Record<string, unknown>>('/api-keys');
    const keys = data['api-keys'] ?? data.apiKeys;
    return Array.isArray(keys)
      ? (keys.map((entry) => normalizeClientApiKey(entry)).filter(Boolean) as ClientApiKeyConfig[])
      : [];
  },

  replace: (keys: ClientApiKeyConfig[]) =>
    apiClient.put(
      '/api-keys',
      keys.map((entry) => serializeClientApiKey(entry))
    ),

  update: (index: number, value: ClientApiKeyConfig) =>
    apiClient.patch('/api-keys', {
      index,
      entry: serializeClientApiKey(value),
    }),

  delete: (index: number) => apiClient.delete(`/api-keys?index=${index}`),
};
