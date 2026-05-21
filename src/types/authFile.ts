/**
 * 认证文件相关类型
 * 基于原项目 src/modules/auth-files.js
 */

export type AuthFileType =
  | 'qwen'
  | 'kimi'
  | 'gemini'
  | 'gemini-cli'
  | 'aistudio'
  | 'claude'
  | 'codex'
  | 'antigravity'
  | 'iflow'
  | 'kiro'
  | 'xai'
  | 'vertex'
  | 'empty'
  | 'unknown';

export interface AuthFileItem {
  id?: string;
  name: string;
  type?: AuthFileType | string;
  provider?: string;
  size?: number;
  path?: string;
  file_name?: string;
  fileName?: string;
  authIndex?: string | number | null;
  runtimeOnly?: boolean | string;
  disabled?: boolean;
  unavailable?: boolean;
  status?: string;
  statusMessage?: string;
  lastRefresh?: string | number;
  last_refresh?: string | number;
  last_refreshed_at?: string | number;
  runtimeUpdatedAt?: string | number;
  runtime_updated_at?: string | number;
  runtime_saved_at?: string | number;
  modified?: number;
  user_agent?: string;
  websockets?: boolean;
  websocket_handshake_debug?: boolean;
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
