import type {
  CloakConfig,
  ModelAlias,
  ProviderKeyConfig,
} from '@/types';
import type { ClientApiKeyConfig, Config } from '@/types/config';
import { extractClientApiKeyQuota } from '@/utils/clientApiKeyQuota';
import { buildHeaderObject } from '@/utils/headers';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const normalizeBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return Boolean(value);
};

const normalizeModelAliases = (models: unknown): ModelAlias[] => {
  if (!Array.isArray(models)) return [];
  return models
    .map((item) => {
      if (item === undefined || item === null) return null;
      if (typeof item === 'string') {
        const trimmed = item.trim();
        return trimmed ? ({ name: trimmed } satisfies ModelAlias) : null;
      }
      if (!isRecord(item)) return null;

      const name = item.name || item.id || item.model;
      if (!name) return null;
      const alias = item.alias || item.display_name || item.displayName;
      const trimmedName = String(name).trim();
      if (!trimmedName) return null;
      const entry: ModelAlias = { name: trimmedName };
      if (alias && String(alias).trim() !== trimmedName) {
        entry.alias = String(alias).trim();
      }
      return entry;
    })
    .filter(Boolean) as ModelAlias[];
};

const normalizeHeaders = (headers: unknown) => {
  if (!headers || typeof headers !== 'object') return undefined;
  const normalized = buildHeaderObject(
    Array.isArray(headers)
      ? (headers as Array<{ key: string; value: string }>)
      : (headers as Record<string, string | undefined | null>)
  );
  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeExcludedModels = (input: unknown): string[] => {
  const rawList = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? input.split(/[\n,]/)
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

const normalizePrefix = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const normalizeClientApiKeyConfig = (entry: unknown): ClientApiKeyConfig | null => {
  if (entry === undefined || entry === null) return null;
  const record = isRecord(entry) ? entry : null;
  const apiKey =
    record?.['api-key'] ??
    record?.apiKey ??
    record?.key ??
    (typeof entry === 'string' ? entry : '');
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: ClientApiKeyConfig = { apiKey: trimmed };
  const disabled = normalizeBoolean(record?.disabled ?? record?.disable ?? record?.isDisabled);
  const enabled = normalizeBoolean(record?.enabled ?? record?.enable ?? record?.isEnabled);
  if (disabled === true || (disabled === undefined && enabled === false)) {
    config.disabled = true;
  }
  const allowedModels = normalizeExcludedModels(
    record?.['allowed-models'] ?? record?.allowedModels ?? record?.['allowed_models']
  );
  const excludedModels = normalizeExcludedModels(
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

const normalizeProviderKeyConfig = (item: unknown): ProviderKeyConfig | null => {
  if (item === undefined || item === null) return null;
  const record = isRecord(item) ? item : null;
  const apiKey = record?.['api-key'] ?? record?.apiKey ?? (typeof item === 'string' ? item : '');
  const trimmed = String(apiKey || '').trim();
  if (!trimmed) return null;

  const config: ProviderKeyConfig = { apiKey: trimmed };
  const priority = record?.priority ?? record?.['priority'];
  if (priority !== undefined && priority !== null && String(priority).trim() !== '') {
    const parsed = Number(priority);
    if (Number.isFinite(parsed)) {
      config.priority = parsed;
    }
  }
  const prefix = normalizePrefix(record?.prefix ?? record?.['prefix']);
  if (prefix) config.prefix = prefix;
  const baseUrl = record ? (record['base-url'] ?? record.baseUrl) : undefined;
  const proxyUrl = record ? (record['proxy-url'] ?? record.proxyUrl) : undefined;
  if (baseUrl) config.baseUrl = String(baseUrl);
  const websockets = normalizeBoolean(record?.websockets ?? record?.['websockets']);
  if (websockets !== undefined) config.websockets = websockets;
  if (proxyUrl) config.proxyUrl = String(proxyUrl);
  const headers = normalizeHeaders(record?.headers);
  if (headers) config.headers = headers;
  const models = normalizeModelAliases(record?.models);
  if (models.length) config.models = models;
  const excludedModels = normalizeExcludedModels(
    record?.['excluded-models'] ??
      record?.excludedModels ??
      record?.['excluded_models'] ??
      record?.excluded_models
  );
  if (excludedModels.length) config.excludedModels = excludedModels;

  const cloakRaw = record?.cloak;
  if (isRecord(cloakRaw)) {
    const cloak: CloakConfig = {};
    const mode = cloakRaw.mode ?? cloakRaw['mode'];
    if (typeof mode === 'string' && mode.trim()) {
      cloak.mode = mode.trim();
    }
    const strictMode = normalizeBoolean(
      cloakRaw['strict-mode'] ?? cloakRaw.strictMode ?? cloakRaw.strict_mode
    );
    if (strictMode !== undefined) {
      cloak.strictMode = strictMode;
    }
    const sensitiveWords = normalizeExcludedModels(
      cloakRaw['sensitive-words'] ?? cloakRaw.sensitiveWords ?? cloakRaw.sensitive_words
    );
    if (sensitiveWords.length) {
      cloak.sensitiveWords = sensitiveWords;
    }
    const cacheUserId = normalizeBoolean(
      cloakRaw['cache-user-id'] ?? cloakRaw.cacheUserId ?? cloakRaw.cache_user_id
    );
    if (cacheUserId !== undefined) {
      cloak.cacheUserId = cacheUserId;
    }
    if (Object.keys(cloak).length) {
      config.cloak = cloak;
    }
  }

  const experimentalCchSigning = normalizeBoolean(
    record?.['experimental-cch-signing'] ??
      record?.experimentalCchSigning ??
      record?.experimental_cch_signing
  );
  if (experimentalCchSigning !== undefined) {
    config.experimentalCchSigning = experimentalCchSigning;
  }

  return config;
};

const normalizeOauthExcluded = (payload: unknown): Record<string, string[]> | undefined => {
  if (!isRecord(payload)) return undefined;
  const source = payload['oauth-excluded-models'] ?? payload.items ?? payload;
  if (!isRecord(source)) return undefined;
  const map: Record<string, string[]> = {};
  Object.entries(source).forEach(([provider, models]) => {
    const key = String(provider || '').trim();
    if (!key) return;
    const normalized = normalizeExcludedModels(models);
    map[key.toLowerCase()] = normalized;
  });
  return map;
};

/**
 * 规范化 /config 返回值
 */
export const normalizeConfigResponse = (raw: unknown): Config => {
  const config: Config = { raw: isRecord(raw) ? raw : {} };
  if (!isRecord(raw)) {
    return config;
  }

  config.debug = normalizeBoolean(raw.debug);
  const proxyUrl = raw['proxy-url'] ?? raw.proxyUrl;
  config.proxyUrl =
    typeof proxyUrl === 'string'
      ? proxyUrl
      : proxyUrl === undefined || proxyUrl === null
        ? undefined
        : String(proxyUrl);
  const requestRetry = raw['request-retry'] ?? raw.requestRetry;
  if (typeof requestRetry === 'number' && Number.isFinite(requestRetry)) {
    config.requestRetry = requestRetry;
  } else if (typeof requestRetry === 'string' && requestRetry.trim() !== '') {
    const parsed = Number(requestRetry);
    if (Number.isFinite(parsed)) {
      config.requestRetry = parsed;
    }
  }

  const quota = raw['quota-exceeded'] ?? raw.quotaExceeded;
  if (isRecord(quota)) {
    config.quotaExceeded = {
      switchProject: normalizeBoolean(quota['switch-project'] ?? quota.switchProject),
      switchPreviewModel: normalizeBoolean(
        quota['switch-preview-model'] ?? quota.switchPreviewModel
      ),
    };
  }

  config.usageStatisticsEnabled = normalizeBoolean(
    raw['usage-statistics-enabled'] ?? raw.usageStatisticsEnabled
  );
  config.usageStatisticsPersist = normalizeBoolean(
    raw['usage-statistics-persist'] ?? raw.usageStatisticsPersist
  );
  const usageStatisticsFile = raw['usage-statistics-file'] ?? raw.usageStatisticsFile;
  config.usageStatisticsFile =
    typeof usageStatisticsFile === 'string'
      ? usageStatisticsFile
      : usageStatisticsFile === undefined || usageStatisticsFile === null
        ? undefined
        : String(usageStatisticsFile);
  const usageStatisticsPersistInterval =
    raw['usage-statistics-persist-interval'] ?? raw.usageStatisticsPersistInterval;
  if (
    typeof usageStatisticsPersistInterval === 'number' &&
    Number.isFinite(usageStatisticsPersistInterval)
  ) {
    config.usageStatisticsPersistInterval = usageStatisticsPersistInterval;
  } else if (
    typeof usageStatisticsPersistInterval === 'string' &&
    usageStatisticsPersistInterval.trim() !== ''
  ) {
    const parsed = Number(usageStatisticsPersistInterval);
    if (Number.isFinite(parsed)) {
      config.usageStatisticsPersistInterval = parsed;
    }
  }
  config.requestLog = normalizeBoolean(raw['request-log'] ?? raw.requestLog);
  config.loggingToFile = normalizeBoolean(raw['logging-to-file'] ?? raw.loggingToFile);
  const logsMaxTotalSizeMb = raw['logs-max-total-size-mb'] ?? raw.logsMaxTotalSizeMb;
  if (typeof logsMaxTotalSizeMb === 'number' && Number.isFinite(logsMaxTotalSizeMb)) {
    config.logsMaxTotalSizeMb = logsMaxTotalSizeMb;
  } else if (typeof logsMaxTotalSizeMb === 'string' && logsMaxTotalSizeMb.trim() !== '') {
    const parsed = Number(logsMaxTotalSizeMb);
    if (Number.isFinite(parsed)) {
      config.logsMaxTotalSizeMb = parsed;
    }
  }
  config.wsAuth = normalizeBoolean(raw['ws-auth'] ?? raw.wsAuth);
  config.forceModelPrefix = normalizeBoolean(raw['force-model-prefix'] ?? raw.forceModelPrefix);
  const routing = raw.routing;
  const strategyRaw = isRecord(routing)
    ? (routing.strategy ?? routing['strategy'])
    : (raw['routing-strategy'] ?? raw.routingStrategy);
  if (strategyRaw !== undefined && strategyRaw !== null) {
    config.routingStrategy = String(strategyRaw);
  }
  const apiKeysRaw = raw['api-keys'] ?? raw.apiKeys;
  if (Array.isArray(apiKeysRaw)) {
    config.apiKeys = apiKeysRaw
      .map((entry) => normalizeClientApiKeyConfig(entry))
      .filter(Boolean) as ClientApiKeyConfig[];
  }

  const codexList = raw['codex-api-key'] ?? raw.codexApiKey ?? raw.codexApiKeys;
  if (Array.isArray(codexList)) {
    config.codexApiKeys = codexList
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const claudeList = raw['claude-api-key'] ?? raw.claudeApiKey ?? raw.claudeApiKeys;
  if (Array.isArray(claudeList)) {
    config.claudeApiKeys = claudeList
      .map((item) => normalizeProviderKeyConfig(item))
      .filter(Boolean) as ProviderKeyConfig[];
  }

  const oauthExcluded = normalizeOauthExcluded(
    raw['oauth-excluded-models'] ?? raw.oauthExcludedModels
  );
  if (oauthExcluded) {
    config.oauthExcludedModels = oauthExcluded;
  }

  return config;
};

export {
  normalizeModelAliases,
  normalizeProviderKeyConfig,
  normalizeHeaders,
  normalizeExcludedModels,
};
