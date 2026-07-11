/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
  image?: boolean;
  thinking?: unknown;
}

export interface OpenAICompatibilityModel extends ModelAlias {
  image?: boolean;
  thinking?: unknown;
}

export interface OpenAICompatibilityApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  authIndex?: string;
}

export interface OpenAICompatibilityConfig {
  name: string;
  priority?: number;
  prefix?: string;
  disabled?: boolean;
  poolMode?: boolean;
  baseUrl: string;
  apiKeyEntries?: OpenAICompatibilityApiKeyEntry[];
  models?: OpenAICompatibilityModel[];
  headers?: Record<string, string>;
  testModel?: string;
  disableCooling?: boolean;
  authIndex?: string;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
  cacheUserId?: boolean;
}

export interface ProviderKeyConfig {
  apiKey: string;
  priority?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  poolMode?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  disableCooling?: boolean;
  cloak?: CloakConfig;
  experimentalCchSigning?: boolean;
  authIndex?: string;
}
