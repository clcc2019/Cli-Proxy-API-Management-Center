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

export const stripAuthFileRuntimeMetadata = (
  source: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...source };
  for (const key of RUNTIME_FIELD_KEYS) {
    delete next[key];
  }
  return next;
};
