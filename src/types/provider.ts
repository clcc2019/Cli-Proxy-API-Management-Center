/**
 * AI 提供商相关类型
 * 基于原项目 src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
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
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  cloak?: CloakConfig;
  experimentalCchSigning?: boolean;
}
