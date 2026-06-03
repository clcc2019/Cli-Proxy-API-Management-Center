import type { AuthFileItem } from '@/types';

const RUNTIME_METADATA_KEYS = [
  'cliproxy_runtime_state',
  'runtime_state',
  'runtimeState',
  'runtime_metadata',
  'runtimeMetadata',
] as const;

const RUNTIME_SUMMARY_KEYS = [
  'runtime_updated_at',
  'runtimeUpdatedAt',
  'runtime_saved_at',
  'runtimeSavedAt',
  'next_retry_after',
  'nextRetryAfter',
  'quota',
  'last_error',
  'lastError',
  'model_states',
  'modelStates',
  'unavailable',
  'success',
  'failed',
  'failure',
  'recent_requests',
  'recentRequests',
] as const;

const RUNTIME_FIELD_KEYS = [...RUNTIME_METADATA_KEYS, ...RUNTIME_SUMMARY_KEYS] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasRuntimeSummaryValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(hasRuntimeSummaryValue);
  return true;
};

const findRuntimeMetadata = (source: Record<string, unknown>): unknown => {
  for (const key of RUNTIME_METADATA_KEYS) {
    const value = source[key];
    if (hasRuntimeSummaryValue(value)) return value;
  }

  const metadata = source.metadata;
  if (isRecord(metadata)) {
    for (const key of RUNTIME_METADATA_KEYS) {
      const value = metadata[key];
      if (hasRuntimeSummaryValue(value)) return value;
    }
  }

  return null;
};

const buildRuntimeSummary = (source: Record<string, unknown>): Record<string, unknown> | null => {
  const summary: Record<string, unknown> = {};
  for (const key of RUNTIME_SUMMARY_KEYS) {
    const value = source[key];
    if (hasRuntimeSummaryValue(value)) {
      summary[key] = value;
    }
  }
  return Object.keys(summary).length > 0 ? summary : null;
};

export const resolveAuthFileRuntimeMetadata = (
  file: AuthFileItem | Record<string, unknown> | null | undefined
): Record<string, unknown> | null => {
  if (!isRecord(file)) return null;

  const runtimeMetadata = findRuntimeMetadata(file);
  if (isRecord(runtimeMetadata)) {
    return runtimeMetadata;
  }
  if (hasRuntimeSummaryValue(runtimeMetadata)) {
    return { value: runtimeMetadata };
  }

  return buildRuntimeSummary(file);
};

export const formatRuntimeMetadataJson = (metadata: Record<string, unknown> | null): string => {
  if (!metadata) return '';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return '';
  }
};

export const stripAuthFileRuntimeMetadata = (
  source: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...source };
  for (const key of RUNTIME_FIELD_KEYS) {
    delete next[key];
  }
  return next;
};
