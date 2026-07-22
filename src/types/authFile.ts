/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'claude'
  | 'codex'
  | 'xai'
  | 'empty'
  | 'unknown';

export type CodexAuthMode = 'access_token' | 'agent_identity';

export interface AuthFileItem {
  id?: string;
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  label?: string;
  source?: string;
  size?: number;
  path?: string;
  file_name?: string;
  fileName?: string;
  auth_index?: string | number | null;
  authIndex?: string | number | null;
  runtime_only?: boolean | string;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  status_message?: string;
  statusMessage?: string;
  created_at?: string | number;
  updated_at?: string | number;
  modtime?: string | number;
  lastRefresh?: string | number;
  last_refresh?: string | number;
  last_refreshed_at?: string | number;
  runtimeUpdatedAt?: string | number;
  runtime_updated_at?: string | number;
  runtime_saved_at?: string | number;
  runtimeSavedAt?: string | number;
  cliproxy_runtime_state?: Record<string, unknown>;
  runtime_state?: Record<string, unknown>;
  runtimeState?: Record<string, unknown>;
  runtime_metadata?: Record<string, unknown>;
  runtimeMetadata?: Record<string, unknown>;
  client_profile?: Record<string, unknown>;
  clientProfile?: Record<string, unknown>;
  auth_mode?: CodexAuthMode;
  authMode?: CodexAuthMode;
  has_access_token?: boolean;
  hasAccessToken?: boolean;
  has_agent_identity?: boolean;
  hasAgentIdentity?: boolean;
  next_retry_after?: string | number;
  modified?: number;
  email?: string;
  account?: string;
  account_type?: string;
  project_id?: string;
  projectId?: string;
  prefix?: string;
  proxy_url?: string;
  proxyUrl?: string;
  priority?: number | string | null;
  note?: string;
  user_agent?: string;
  userAgent?: string;
  originator?: string;
  Originator?: string;
  beta_features?: string;
  betaFeatures?: string;
  'beta-features'?: string;
  installation_id?: string;
  installationId?: string;
  'installation-id'?: string;
  include_timing_metrics?: boolean | string | null;
  includeTimingMetrics?: boolean | string | null;
  'include-timing-metrics'?: boolean | string | null;
  excluded_models?: string[];
  excludedModels?: string[];
  disable_cooling?: boolean | string | null;
  disableCooling?: boolean | string | null;
  headers?: Record<string, string>;
  websockets?: boolean;
  websocket?: boolean;
  service_tier_passthrough?: boolean | string | null;
  serviceTierPassthrough?: boolean | string | null;
  'service-tier-passthrough'?: boolean | string | null;
  fast?: boolean | string | null;
  account_id?: string;
  accountId?: string;
  chatgpt_account_id?: string;
  chatgptAccountId?: string;
  chatgpt_subscription_active_start?: string | number | null;
  chatgptSubscriptionActiveStart?: string | number | null;
  subscription_active_start?: string | number | null;
  subscriptionActiveStart?: string | number | null;
  subscription_started_at?: string | number | null;
  subscriptionStartedAt?: string | number | null;
  current_period_start?: string | number | null;
  currentPeriodStart?: string | number | null;
  period_start?: string | number | null;
  periodStart?: string | number | null;
  started_at?: string | number | null;
  startedAt?: string | number | null;
  subscription_active_days?: string | number | null;
  subscriptionActiveDays?: string | number | null;
  chatgpt_subscription_active_until?: string | number | null;
  chatgptSubscriptionActiveUntil?: string | number | null;
  subscription_expires_at?: string | number | null;
  subscriptionExpiresAt?: string | number | null;
  current_period_end?: string | number | null;
  currentPeriodEnd?: string | number | null;
  expires_at?: string | number | null;
  expiresAt?: string | number | null;
  id_token?: string | Record<string, unknown>;
  plan_type?: string;
  planType?: string;
  chatgpt_plan_type?: string;
  chatgptPlanType?: string;
  has_refresh_token?: boolean;
  hasRefreshToken?: boolean;
  last_error?: unknown;
  lastError?: unknown;
  model_states?: unknown;
  modelStates?: unknown;
  quota?: unknown;
  success?: number | string;
  failed?: number | string;
  failure?: number | string;
  success_count?: number | string;
  successCount?: number | string;
  failed_count?: number | string;
  failedCount?: number | string;
  failure_count?: number | string;
  failureCount?: number | string;
  recent_requests?: Array<{
    time?: string;
    success?: number | string;
    failed?: number | string;
    failure?: number | string;
  }>;
  recentRequests?: Array<{
    time?: string;
    success?: number | string;
    failed?: number | string;
    failure?: number | string;
  }>;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
  page?: number;
  page_size?: number;
  has_more?: boolean;
  type_counts?: Record<string, number>;
}
