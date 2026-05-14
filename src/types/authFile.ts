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
  id_token?: string | Record<string, unknown>;
  plan_type?: string;
  planType?: string;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files: AuthFileItem[];
  total?: number;
}
