/**
 * Quota constants for API URLs, headers, and theme colors.
 */

import type { TypeColorSet } from '@/types';

// Theme colors for type badges — 与 authFiles/constants.ts 保持同步
export const TYPE_COLORS: Record<string, TypeColorSet> = {
  qwen: {
    light: { bg: '#f5f3ff', text: '#7c3aed' },
    dark: { bg: '#34215f', text: '#ddd6fe' },
  },
  aistudio: {
    light: { bg: '#f0f2f5', text: '#2f343c' },
    dark: { bg: '#373c42', text: '#cfd3db' },
  },
  claude: {
    light: { bg: '#fff7ed', text: '#c2410c' },
    dark: { bg: '#4a2b17', text: '#fed7aa' },
  },
  codex: {
    light: { bg: '#eef2ff', text: '#4f46e5' },
    dark: { bg: '#2d2a67', text: '#c7d2fe' },
  },
  kimi: {
    light: { bg: '#ecfeff', text: '#0891b2' },
    dark: { bg: '#103f4a', text: '#a5f3fc' },
  },
  empty: {
    light: { bg: '#f5f5f5', text: '#616161' },
    dark: { bg: '#424242', text: '#bdbdbd' },
  },
  unknown: {
    light: { bg: '#f0f0f0', text: '#666666', border: '1px dashed #999999' },
    dark: { bg: '#3a3a3a', text: '#aaaaaa', border: '1px dashed #666666' },
  },
};

export const QUOTA_PROGRESS_HIGH_THRESHOLD = 50;
export const QUOTA_PROGRESS_MEDIUM_THRESHOLD = 20;

// Claude API configuration
export const CLAUDE_PROFILE_URL = 'https://api.anthropic.com/api/oauth/profile';

export const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export const CLAUDE_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'anthropic-beta': 'oauth-2025-04-20',
};

export const CLAUDE_USAGE_WINDOW_KEYS = [
  { key: 'five_hour', id: 'five-hour', labelKey: 'claude_quota.five_hour' },
  { key: 'seven_day', id: 'seven-day', labelKey: 'claude_quota.seven_day' },
  {
    key: 'seven_day_oauth_apps',
    id: 'seven-day-oauth-apps',
    labelKey: 'claude_quota.seven_day_oauth_apps',
  },
  { key: 'seven_day_opus', id: 'seven-day-opus', labelKey: 'claude_quota.seven_day_opus' },
  { key: 'seven_day_sonnet', id: 'seven-day-sonnet', labelKey: 'claude_quota.seven_day_sonnet' },
  { key: 'seven_day_cowork', id: 'seven-day-cowork', labelKey: 'claude_quota.seven_day_cowork' },
  { key: 'iguana_necktie', id: 'iguana-necktie', labelKey: 'claude_quota.iguana_necktie' },
] as const;

// Codex API configuration
export const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

export const CODEX_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
  'Content-Type': 'application/json',
  'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal',
};

// Kimi API configuration
export const KIMI_USAGE_URL = 'https://api.kimi.com/coding/v1/usages';

export const KIMI_REQUEST_HEADERS = {
  Authorization: 'Bearer $TOKEN$',
};
