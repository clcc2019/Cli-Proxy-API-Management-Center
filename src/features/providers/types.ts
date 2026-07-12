import type { OpenAICompatibilityConfig, ProviderKeyConfig } from '@/types';

export type ProviderBrand = 'codex' | 'claude' | 'openaiCompatibility';
export type ProviderSortBy = 'name' | 'priority' | 'recent-success';
export type SortDir = 'asc' | 'desc';

export interface ProviderResourceFlags {
  cloakEnabled?: boolean;
  websockets?: boolean;
}

export interface ProviderResource {
  id: string;
  brand: ProviderBrand;
  originalIndex: number;
  name: string | null;
  identifier: string;
  apiKeyPreview: string | null;
  apiKey: string | null;
  authIndex: string | null;
  baseUrl: string | null;
  proxyUrl: string | null;
  prefix: string | null;
  modelCount: number;
  models: string[];
  priority: number;
  headerCount: number;
  apiKeyEntryCount: number;
  disabled: boolean;
  flags: ProviderResourceFlags;
  raw: ProviderKeyConfig | OpenAICompatibilityConfig;
}

export interface ProviderGroup {
  id: ProviderBrand;
  resources: ProviderResource[];
}
