/**
 * 认证文件与 OAuth 排除模型相关 API
 */

import { apiClient, type ApiRequestConfig } from './client';
import type { AuthFilesResponse } from '@/types/authFile';
import { normalizeOAuthReasoningEffort } from '@/utils/oauthModelAlias';
import { getPathBasename } from '@/utils/path';
import type {
  CodexRateLimitResetConsumePayload,
  CodexRateLimitResetCreditsPayload,
  CodexUsagePayload,
  OAuthModelAliasEntry,
} from '@/types';

type StatusError = { status?: number };
type AuthFileStatusResponse = { status: string; disabled: boolean };
export type AuthFilePromotionEligibilityResponse = {
  coupon: string;
  state: string;
  eligible: boolean;
};
type AuthFileEntry = AuthFilesResponse['files'][number];
type AuthFileBatchFailure = { name: string; error: string };
type AuthFileBatchUploadResponse = {
  status?: string;
  uploaded?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchDeleteResponse = {
  status?: string;
  deleted?: number;
  files?: unknown;
  failed?: unknown;
};
type AuthFileBatchUploadResult = {
  status: string;
  uploaded: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
type AuthFileBatchDeleteResult = {
  status: string;
  deleted: number;
  files: string[];
  failed: AuthFileBatchFailure[];
};
export type AuthFileDeleteTarget = {
  name: string;
  id?: string | null;
  path?: string | null;
  fileName?: string | null;
  authIndex?: string | number | null;
};
export type PatchAuthFileFieldsPayload = {
  name: string;
  prefix?: string;
  proxy_url?: string;
  headers?: Record<string, string>;
  priority?: string | number | null;
  note?: string;
  user_agent?: string;
  excluded_models?: string[];
  disable_cooling?: string | boolean | null;
  websockets?: boolean;
  service_tier_passthrough?: boolean;
};
type PatchAuthFileFieldsResponse = {
  status?: string;
  file?: AuthFileEntry;
};
export type AuthFilesListCodexSubscriptionMode = 'cache' | 'refresh' | 'skip';
export type AuthFilesListOptions = {
  codexSubscription?: AuthFilesListCodexSubscriptionMode;
  summary?: boolean;
  /** Defer fixed-size recent request buckets when the page loads card metadata first. */
  includeRecentRequests?: boolean;
  /** Request recent buckets only for the resolved server page. */
  pageRecentRequests?: boolean;
  /** Ask the server for provider counts without constructing list entries. */
  typeCountsOnly?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  sort?: string;
  problemOnly?: boolean;
  disabledOnly?: boolean;
  premiumOnly?: boolean;
};

const AUTH_FILE_INVALID_JSON_OBJECT_ERROR = 'AUTH_FILE_INVALID_JSON_OBJECT';

const AUTH_FILE_CREDENTIAL_REQUEST_CONFIG: ApiRequestConfig = {
  skipUnauthorizedLogout: true,
};

const getStatusCode = (err: unknown): number | undefined => {
  if (!err || typeof err !== 'object') return undefined;
  if ('status' in err) return (err as StatusError).status;
  return undefined;
};

const readErrorResponseData = (err: unknown): unknown => {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as { data?: unknown; details?: unknown };
  return record.data ?? record.details;
};

const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const readNestedUsageErrorMessage = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const jsonStart = value.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(value.slice(jsonStart));
        return readNestedUsageErrorMessage(parsed) ?? value;
      } catch {
        return value;
      }
    }
    return value;
  }

  if (!isRecordValue(value)) return null;

  const errorValue = value.error;
  if (isRecordValue(errorValue) && typeof errorValue.message === 'string') {
    return errorValue.message;
  }
  if (typeof errorValue === 'string') {
    return readNestedUsageErrorMessage(errorValue);
  }
  if (typeof value.message === 'string') {
    return value.message;
  }

  return null;
};

const readErrorMessage = (err: unknown): string | null => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return null;
};

const createUsageRequestError = (err: unknown): Error => {
  const status = getStatusCode(err);
  if (!status) return err instanceof Error ? err : new Error(String(err));

  const responseData = readErrorResponseData(err);
  const message =
    readNestedUsageErrorMessage(responseData) ?? readErrorMessage(err) ?? 'Request failed';
  const wrapped = new Error(message) as Error & StatusError & { data?: unknown; details?: unknown };
  wrapped.status = status;
  wrapped.data = responseData;
  wrapped.details = responseData;
  return wrapped;
};
const normalizeRequestedAuthFileNames = (names: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  names.forEach((name) => {
    const trimmed = String(name ?? '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
};

const normalizeDeleteIdentifier = (value: unknown): string => String(value ?? '').trim();

export const normalizeAuthFileDeleteAliases = (candidates: unknown[]): string[] =>
  normalizeRequestedAuthFileNames(candidates.map(normalizeDeleteIdentifier));

const deleteTargetAliases = (target: AuthFileDeleteTarget): string[] => {
  const candidates = [target.authIndex, target.id, target.path, target.fileName, target.name];
  const pathBase = getPathBasename(normalizeDeleteIdentifier(target.path));
  if (pathBase) {
    candidates.push(pathBase);
  }
  return normalizeAuthFileDeleteAliases(candidates);
};

const normalizeAuthFileDeleteTargets = (targets: Array<string | AuthFileDeleteTarget>) => {
  const seenIdentifiers = new Set<string>();
  const identifiers: string[] = [];
  const displayNames: string[] = [];
  const displayNameByIdentifier = new Map<string, string>();

  targets.forEach((target) => {
    const name =
      typeof target === 'string' ? String(target ?? '').trim() : String(target.name ?? '').trim();
    const aliases = typeof target === 'string' ? [name] : deleteTargetAliases(target);
    const identifier = aliases[0] || name;
    if (!identifier || seenIdentifiers.has(identifier)) return;

    seenIdentifiers.add(identifier);
    identifiers.push(identifier);
    if (name) {
      displayNames.push(name);
      aliases.forEach((alias) => displayNameByIdentifier.set(alias, name));
    }
  });

  return { identifiers, displayNames, displayNameByIdentifier };
};

const normalizeBatchFileNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return normalizeRequestedAuthFileNames(value.map((item) => String(item ?? '')));
};

const normalizeBatchFailures = (value: unknown): AuthFileBatchFailure[] => {
  if (!Array.isArray(value)) return [];

  return value.reduce<AuthFileBatchFailure[]>((result, item) => {
    if (!item || typeof item !== 'object') return result;
    const entry = item as Record<string, unknown>;
    const name = String(entry.name ?? '').trim();
    const error =
      typeof entry.error === 'string'
        ? entry.error.trim()
        : typeof entry.message === 'string'
          ? entry.message.trim()
          : '';

    if (!name && !error) return result;
    result.push({ name, error: error || 'Unknown error' });
    return result;
  }, []);
};

const deriveSuccessfulFileNames = (
  requestedNames: string[],
  failed: AuthFileBatchFailure[]
): string[] => {
  const failedNames = new Set(failed.map((entry) => entry.name.trim()).filter(Boolean));

  if (failedNames.size === 0) {
    return [...requestedNames];
  }

  return requestedNames.filter((name) => !failedNames.has(name));
};

const normalizeBatchUploadResponse = (
  payload: AuthFileBatchUploadResponse | undefined,
  requestedNames: string[]
): AuthFileBatchUploadResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const uploadedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const uploaded =
    typeof payload?.uploaded === 'number'
      ? payload.uploaded
      : uploadedFilesFromPayload.length > 0
        ? uploadedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let uploadedFiles = uploadedFilesFromPayload;
  if (uploadedFiles.length === 0 && uploaded > 0) {
    if (failed.length === 0 && uploaded === requestedNames.length) {
      uploadedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === uploaded) {
        uploadedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    uploaded,
    files: uploadedFiles,
    failed,
  };
};

const normalizeBatchDeleteResponse = (
  payload: AuthFileBatchDeleteResponse | undefined,
  requestedNames: string[]
): AuthFileBatchDeleteResult => {
  const failed = normalizeBatchFailures(payload?.failed);
  const deletedFilesFromPayload = normalizeBatchFileNames(payload?.files);
  const deleted =
    typeof payload?.deleted === 'number'
      ? payload.deleted
      : deletedFilesFromPayload.length > 0
        ? deletedFilesFromPayload.length
        : requestedNames.length === 1 && failed.length === 0
          ? 1
          : 0;

  let deletedFiles = deletedFilesFromPayload;
  if (deletedFiles.length === 0 && deleted > 0) {
    if (failed.length === 0 && deleted === requestedNames.length) {
      deletedFiles = [...requestedNames];
    } else {
      const derivedNames = deriveSuccessfulFileNames(requestedNames, failed);
      if (derivedNames.length === deleted) {
        deletedFiles = derivedNames;
      }
    }
  }

  return {
    status:
      typeof payload?.status === 'string' ? payload.status : failed.length > 0 ? 'partial' : 'ok',
    deleted,
    files: deletedFiles,
    failed,
  };
};

const readTextField = (entry: AuthFileEntry, key: string): string => {
  const value = entry[key];
  return typeof value === 'string' ? value.trim() : '';
};

const readDateField = (entry: AuthFileEntry): number => {
  const candidates = [
    entry['modtime'],
    entry.modified,
    entry['updated_at'],
    entry['last_refresh'],
    entry.lastRefresh,
    entry['last_refreshed_at'],
    entry['runtime_updated_at'],
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) {
        return asNumber < 1e12 ? asNumber * 1000 : asNumber;
      }
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
};

const isRuntimeOnlyEntry = (entry: AuthFileEntry): boolean => {
  const value = entry['runtime_only'] ?? entry.runtimeOnly;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
  return false;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const readNumericCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const recentRequestsTotal = (value: unknown): number => {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, item) => {
    if (!item || typeof item !== 'object') return total;
    const bucket = item as Record<string, unknown>;
    return (
      total + readNumericCount(bucket.success) + readNumericCount(bucket.failed ?? bucket.failure)
    );
  }, 0);
};

const countMeaningfulFields = (entry: AuthFileEntry): number =>
  Object.values(entry).reduce<number>(
    (count, value) => count + (hasMeaningfulValue(value) ? 1 : 0),
    0
  );

const authFilePriorityScore = (entry: AuthFileEntry): number => {
  let score = 0;
  if (readTextField(entry, 'source').toLowerCase() === 'file') score += 32;
  if (readTextField(entry, 'path')) score += 16;
  if (!isRuntimeOnlyEntry(entry)) score += 8;
  if (entry.disabled !== true) score += 4;
  if (readDateField(entry) > 0) score += 2;
  return score;
};

const compareAuthFileEntries = (left: AuthFileEntry, right: AuthFileEntry): number => {
  const scoreDiff = authFilePriorityScore(right) - authFilePriorityScore(left);
  if (scoreDiff !== 0) return scoreDiff;

  const dateDiff = readDateField(right) - readDateField(left);
  if (dateDiff !== 0) return dateDiff;

  const fieldDiff = countMeaningfulFields(right) - countMeaningfulFields(left);
  if (fieldDiff !== 0) return fieldDiff;

  return 0;
};

const mergeAuthFileEntries = (entries: AuthFileEntry[]): AuthFileEntry => {
  const [primary, ...rest] = [...entries].sort(compareAuthFileEntries);
  const merged: AuthFileEntry = { ...primary };
  const mergedRecord = merged as Record<string, unknown>;

  rest.forEach((entry) => {
    Object.entries(entry).forEach(([key, value]) => {
      if (key === 'recent_requests' || key === 'recentRequests') {
        const currentTotal = recentRequestsTotal(mergedRecord[key]);
        const nextTotal = recentRequestsTotal(value);
        if (nextTotal > currentTotal) {
          mergedRecord[key] = value;
          if (key === 'recent_requests') delete merged.recentRequests;
          if (key === 'recentRequests') delete merged.recent_requests;
        }
        return;
      }
      if (!hasMeaningfulValue(mergedRecord[key]) && hasMeaningfulValue(value)) {
        mergedRecord[key] = value;
      }
    });
  });

  return merged;
};

const dedupeAuthFilesResponse = (payload: AuthFilesResponse): AuthFilesResponse => {
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const grouped = new Map<string, AuthFileEntry[]>();

  files.forEach((entry) => {
    const name = readTextField(entry, 'name');
    const key = name || JSON.stringify(entry);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(entry);
      return;
    }
    grouped.set(key, [entry]);
  });

  const normalizedFiles = Array.from(grouped.values()).map(mergeAuthFileEntries);
  if (typeof payload?.page_size !== 'number') {
    normalizedFiles.sort((left, right) =>
      readTextField(left, 'name').localeCompare(readTextField(right, 'name'), undefined, {
        sensitivity: 'accent',
      })
    );
  }

  return {
    ...payload,
    files: normalizedFiles,
    total: typeof payload?.total === 'number' ? payload.total : normalizedFiles.length,
  };
};

const buildAuthFilesListParams = (options: AuthFilesListOptions) => {
  const params: Record<string, string | number | boolean> = {
    codex_subscription: options.codexSubscription ?? 'cache',
  };

  if (options.summary) {
    params.summary = true;
  }
  if (options.pageRecentRequests) {
    params.recent_requests = false;
    params.page_recent_requests = true;
  } else if (options.includeRecentRequests === false) {
    params.recent_requests = false;
  }
  if (options.typeCountsOnly) {
    params.type_counts_only = true;
  }

  if (typeof options.page === 'number' && Number.isFinite(options.page) && options.page > 0) {
    params.page = Math.round(options.page);
  }
  if (
    typeof options.pageSize === 'number' &&
    Number.isFinite(options.pageSize) &&
    options.pageSize > 0
  ) {
    params.page_size = Math.round(options.pageSize);
  }
  const search = options.search?.trim();
  if (search) params.q = search;
  const type = options.type?.trim();
  if (type) params.type = type;
  const sort = options.sort?.trim();
  if (sort) params.sort = sort;
  if (options.problemOnly) params.problem_only = true;
  if (options.disabledOnly) params.disabled_only = true;
  if (options.premiumOnly) params.premium_only = true;
  return params;
};

export const getAuthFilesListOptionsKey = (options: AuthFilesListOptions = {}): string =>
  JSON.stringify(buildAuthFilesListParams(options));

export const getAuthFilesTypeCountsKey = (options: AuthFilesListOptions = {}): string =>
  JSON.stringify({
    search: options.search?.trim() ?? '',
    problemOnly: options.problemOnly === true,
    disabledOnly: options.disabledOnly === true,
    premiumOnly: options.premiumOnly === true,
  });

const parseAuthFileJsonObject = (rawText: string): Record<string, unknown> => {
  const trimmed = rawText.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR);
  }

  return { ...(parsed as Record<string, unknown>) };
};

const saveAuthFileText = async (name: string, text: string) => {
  const file = new File([text], name, { type: 'application/json' });
  await authFilesApi.upload(file);
};

const normalizeOauthExcludedModels = (payload: unknown): Record<string, string[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-excluded-models'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, string[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([provider, models]) => {
    const key = String(provider ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;

    const rawList = Array.isArray(models)
      ? models
      : typeof models === 'string'
        ? models.split(/[\n,]+/)
        : [];

    const seen = new Set<string>();
    const normalized: string[] = [];
    rawList.forEach((item) => {
      const trimmed = String(item ?? '').trim();
      if (!trimmed) return;
      const modelKey = trimmed.toLowerCase();
      if (seen.has(modelKey)) return;
      seen.add(modelKey);
      normalized.push(trimmed);
    });

    result[key] = normalized;
  });

  return result;
};

const normalizeOauthModelAlias = (payload: unknown): Record<string, OAuthModelAliasEntry[]> => {
  if (!payload || typeof payload !== 'object') return {};

  const record = payload as Record<string, unknown>;
  const source = record['oauth-model-alias'] ?? record.items ?? payload;
  if (!source || typeof source !== 'object') return {};

  const result: Record<string, OAuthModelAliasEntry[]> = {};

  Object.entries(source as Record<string, unknown>).forEach(([channel, mappings]) => {
    const key = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!key) return;
    if (!Array.isArray(mappings)) return;

    const seen = new Set<string>();
    const normalized = mappings
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const entry = item as Record<string, unknown>;
        const name = String(entry.name ?? entry.id ?? entry.model ?? '').trim();
        const alias = String(entry.alias ?? '').trim();
        if (!name || !alias) return null;
        const fork = entry.fork === true;
        const reasoningEffort = normalizeOAuthReasoningEffort(
          entry.reasoning_effort ?? entry.reasoningEffort ?? entry['reasoning-effort']
        );
        const normalizedEntry: OAuthModelAliasEntry = fork
          ? { name, alias, fork }
          : { name, alias };
        if (reasoningEffort) {
          normalizedEntry.reasoningEffort = reasoningEffort;
        }
        return normalizedEntry;
      })
      .filter(Boolean)
      .filter((entry) => {
        const aliasEntry = entry as OAuthModelAliasEntry;
        const dedupeKey = `${aliasEntry.name.toLowerCase()}::${aliasEntry.alias.toLowerCase()}::${aliasEntry.fork ? '1' : '0'}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }) as OAuthModelAliasEntry[];

    if (normalized.length) {
      result[key] = normalized;
    }
  });

  return result;
};

const OAUTH_MODEL_ALIAS_ENDPOINT = '/oauth-model-alias';

const serializeOauthModelAlias = (aliases: OAuthModelAliasEntry[]) =>
  aliases.map(({ reasoningEffort, ...entry }) => ({
    ...entry,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }));

export const authFilesApi = {
  list: async (options: AuthFilesListOptions = {}, config?: ApiRequestConfig) =>
    dedupeAuthFilesResponse(
      await apiClient.get<AuthFilesResponse>('/auth-files', {
        ...config,
        params: buildAuthFilesListParams(options),
      })
    ),

  setStatus: (name: string, disabled: boolean) =>
    apiClient.patch<AuthFileStatusResponse>('/auth-files/status', { name, disabled }),

  checkPromotionEligibility: (name: string) =>
    apiClient.get<AuthFilePromotionEligibilityResponse>('/auth-files/promotion-eligibility', {
      ...AUTH_FILE_CREDENTIAL_REQUEST_CONFIG,
      params: { name },
    }),

  patchFields: (payload: PatchAuthFileFieldsPayload) =>
    apiClient.patch<PatchAuthFileFieldsResponse>('/auth-files/fields', payload),

  uploadFiles: async (files: File[]): Promise<AuthFileBatchUploadResult> => {
    const requestedNames = files.map((file) => file.name);
    if (requestedNames.length === 0) {
      return { status: 'ok', uploaded: 0, files: [], failed: [] };
    }

    const formData = new FormData();
    files.forEach((file) => {
      formData.append('file', file, file.name);
    });
    const payload = await apiClient.postForm<AuthFileBatchUploadResponse>('/auth-files', formData);
    return normalizeBatchUploadResponse(payload, requestedNames);
  },

  upload: (file: File) => authFilesApi.uploadFiles([file]),

  deleteFiles: async (
    targets: Array<string | AuthFileDeleteTarget>
  ): Promise<AuthFileBatchDeleteResult> => {
    const { identifiers, displayNames, displayNameByIdentifier } =
      normalizeAuthFileDeleteTargets(targets);
    if (identifiers.length === 0) {
      return { status: 'ok', deleted: 0, files: [], failed: [] };
    }

    const payload = await apiClient.delete<AuthFileBatchDeleteResponse>('/auth-files', {
      data: { names: identifiers },
    });
    const result = normalizeBatchDeleteResponse(payload, identifiers);
    return {
      ...result,
      files: normalizeRequestedAuthFileNames(
        (result.files.length > 0 ? result.files : identifiers).map(
          (identifier) => displayNameByIdentifier.get(identifier) || identifier
        )
      ),
      failed: result.failed.map((failure) => ({
        ...failure,
        name: displayNameByIdentifier.get(failure.name) || failure.name,
      })),
      deleted:
        result.deleted === identifiers.length && displayNames.length === identifiers.length
          ? displayNames.length
          : result.deleted,
    };
  },

  deleteFile: (name: string) => authFilesApi.deleteFiles([name]),

  deleteAll: () => apiClient.delete('/auth-files', { params: { all: true } }),

  downloadText: async (name: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/auth-files/download?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    const blob = response.data as Blob;
    return blob.text();
  },

  previewText: async (name: string): Promise<string> => {
    const response = await apiClient.getRaw(
      `/auth-files/preview?name=${encodeURIComponent(name)}`,
      {
        responseType: 'blob',
      }
    );
    const blob = response.data as Blob;
    return blob.text();
  },

  async downloadJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.downloadText(name);
    return parseAuthFileJsonObject(rawText);
  },

  async previewJsonObject(name: string): Promise<Record<string, unknown>> {
    const rawText = await authFilesApi.previewText(name);
    return parseAuthFileJsonObject(rawText);
  },

  saveText: (name: string, text: string) => saveAuthFileText(name, text),

  saveJsonObject: (name: string, json: Record<string, unknown>) =>
    saveAuthFileText(name, JSON.stringify(json)),

  // OAuth 排除模型
  async getOauthExcludedModels(): Promise<Record<string, string[]>> {
    const data = await apiClient.get('/oauth-excluded-models');
    return normalizeOauthExcludedModels(data);
  },

  saveOauthExcludedModels: (provider: string, models: string[]) =>
    apiClient.patch('/oauth-excluded-models', { provider, models }),

  deleteOauthExcludedEntry: (provider: string) =>
    apiClient.delete(`/oauth-excluded-models?provider=${encodeURIComponent(provider)}`),

  replaceOauthExcludedModels: (map: Record<string, string[]>) =>
    apiClient.put('/oauth-excluded-models', normalizeOauthExcludedModels(map)),

  // OAuth 模型别名
  async getOauthModelAlias(): Promise<Record<string, OAuthModelAliasEntry[]>> {
    const data = await apiClient.get(OAUTH_MODEL_ALIAS_ENDPOINT);
    return normalizeOauthModelAlias(data);
  },

  saveOauthModelAlias: async (channel: string, aliases: OAuthModelAliasEntry[]) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    const normalizedAliases =
      normalizeOauthModelAlias({ [normalizedChannel]: aliases })[normalizedChannel] ?? [];
    await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
      channel: normalizedChannel,
      aliases: serializeOauthModelAlias(normalizedAliases),
    });
  },

  deleteOauthModelAlias: async (channel: string) => {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();

    try {
      await apiClient.patch(OAUTH_MODEL_ALIAS_ENDPOINT, {
        channel: normalizedChannel,
        aliases: [],
      });
    } catch (err: unknown) {
      const status = getStatusCode(err);
      if (status !== 405) throw err;
      await apiClient.delete(
        `${OAUTH_MODEL_ALIAS_ENDPOINT}?channel=${encodeURIComponent(normalizedChannel)}`
      );
    }
  },

  // 获取认证凭证支持的模型
  async getModelsForAuthFile(
    name: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const data = await apiClient.get<Record<string, unknown>>(
      `/auth-files/models?name=${encodeURIComponent(name)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },

  getCodexUsage: async (
    name: string,
    authIndex?: string,
    codexSubscription: AuthFilesListCodexSubscriptionMode = 'cache'
  ) => {
    const params = new URLSearchParams();
    params.set('name', name);
    params.set('codex_subscription', codexSubscription);
    if (authIndex) {
      params.set('auth_index', authIndex);
    }
    if (codexSubscription === 'refresh') {
      params.set('_ts', Date.now().toString());
    }
    try {
      return await apiClient.get<CodexUsagePayload>(
        `/auth-files/codex-usage?${params.toString()}`,
        AUTH_FILE_CREDENTIAL_REQUEST_CONFIG
      );
    } catch (err: unknown) {
      throw createUsageRequestError(err);
    }
  },

  getCodexRateLimitResetCredits: async (name: string, authIndex?: string) => {
    const params = new URLSearchParams();
    params.set('name', name);
    params.set('codex_subscription', 'refresh');
    if (authIndex) {
      params.set('auth_index', authIndex);
    }
    try {
      return await apiClient.get<CodexRateLimitResetCreditsPayload>(
        `/auth-files/codex-rate-limit-reset-credits?${params.toString()}`,
        AUTH_FILE_CREDENTIAL_REQUEST_CONFIG
      );
    } catch (err: unknown) {
      throw createUsageRequestError(err);
    }
  },

  consumeCodexRateLimitResetCredit: async (
    name: string,
    authIndex?: string,
    redeemRequestId?: string
  ) => {
    const params = new URLSearchParams();
    params.set('name', name);
    if (authIndex) {
      params.set('auth_index', authIndex);
    }
    const body = redeemRequestId ? { redeem_request_id: redeemRequestId } : {};
    try {
      return await apiClient.post<CodexRateLimitResetConsumePayload>(
        `/auth-files/codex-rate-limit-reset-credits/consume?${params.toString()}`,
        body,
        AUTH_FILE_CREDENTIAL_REQUEST_CONFIG
      );
    } catch (err: unknown) {
      throw createUsageRequestError(err);
    }
  },

  // 获取指定 channel 的模型定义
  async getModelDefinitions(
    channel: string
  ): Promise<{ id: string; display_name?: string; type?: string; owned_by?: string }[]> {
    const normalizedChannel = String(channel ?? '')
      .trim()
      .toLowerCase();
    if (!normalizedChannel) return [];
    const data = await apiClient.get<Record<string, unknown>>(
      `/model-definitions/${encodeURIComponent(normalizedChannel)}`
    );
    const models = data.models ?? data['models'];
    return Array.isArray(models)
      ? (models as { id: string; display_name?: string; type?: string; owned_by?: string }[])
      : [];
  },
};
