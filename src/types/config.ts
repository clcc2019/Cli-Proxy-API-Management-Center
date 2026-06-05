/**
 * 配置相关类型定义
 * 与基线 /config 返回结构保持一致（内部使用驼峰形式）
 */

import type { ProviderKeyConfig } from './provider';

export interface ClientApiKeyConfig {
  apiKey: string;
  note?: string;
  disabled?: boolean;
  allowedModels?: string[];
  excludedModels?: string[];
  quota?: ClientApiKeyQuota;
}

export interface ClientApiKeyQuota {
  dailyCost?: number;
  monthlyCost?: number;
  totalCost?: number;
}

export interface QuotaExceededConfig {
  switchProject?: boolean;
  switchPreviewModel?: boolean;
}

export interface Config {
  debug?: boolean;
  proxyUrl?: string;
  requestRetry?: number;
  quotaExceeded?: QuotaExceededConfig;
  usageStatisticsEnabled?: boolean;
  usageStatisticsPersist?: boolean;
  usageStatisticsFile?: string;
  usageStatisticsPersistInterval?: number;
  requestLog?: boolean;
  loggingToFile?: boolean;
  logsMaxTotalSizeMb?: number;
  wsAuth?: boolean;
  forceModelPrefix?: boolean;
  routingStrategy?: string;
  apiKeys?: ClientApiKeyConfig[];
  codexApiKeys?: ProviderKeyConfig[];
  claudeApiKeys?: ProviderKeyConfig[];
  oauthExcludedModels?: Record<string, string[]>;
  raw?: Record<string, unknown>;
}

export type RawConfigSection =
  | 'debug'
  | 'proxy-url'
  | 'request-retry'
  | 'quota-exceeded'
  | 'usage-statistics-enabled'
  | 'usage-statistics-persist'
  | 'usage-statistics-file'
  | 'usage-statistics-persist-interval'
  | 'request-log'
  | 'logging-to-file'
  | 'logs-max-total-size-mb'
  | 'ws-auth'
  | 'force-model-prefix'
  | 'routing/strategy'
  | 'api-keys'
  | 'codex-api-key'
  | 'claude-api-key'
  | 'oauth-excluded-models';

export interface ConfigCache {
  data: Config;
  timestamp: number;
}
