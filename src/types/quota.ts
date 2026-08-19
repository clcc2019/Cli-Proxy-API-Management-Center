/**
 * Quota management types.
 */

import type { AuthFileItem, CodexCreditsSnapshot, CodexExpiringBalanceDetail } from './authFile';

// Theme types
export type ThemeColors = { bg: string; text: string; border?: string };
export type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
export type ResolvedTheme = 'light' | 'dark';

export interface CodexUsageWindow {
  used_percent?: number | string;
  usedPercent?: number | string;
  limit_window_seconds?: number | string;
  limitWindowSeconds?: number | string;
  reset_after_seconds?: number | string;
  resetAfterSeconds?: number | string;
  reset_at?: number | string;
  resetAt?: number | string;
}

export interface CodexRateLimitInfo {
  allowed?: boolean;
  limit_reached?: boolean;
  limitReached?: boolean;
  primary_window?: CodexUsageWindow | null;
  primaryWindow?: CodexUsageWindow | null;
  secondary_window?: CodexUsageWindow | null;
  secondaryWindow?: CodexUsageWindow | null;
}

export interface CodexAdditionalRateLimit {
  limit_name?: string;
  limitName?: string;
  metered_feature?: string;
  meteredFeature?: string;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
}

export interface CodexUsagePayload {
  auth_file?: AuthFileItem | null;
  authFile?: AuthFileItem | null;
  credits?: CodexCreditsSnapshot | null;
  remaining_balance?: number | string | null;
  remainingBalance?: number | string | null;
  expiring_balance_details?: CodexExpiringBalanceDetail[] | null;
  expiringBalanceDetails?: CodexExpiringBalanceDetail[] | null;
  rate_limit_reset_credits?: CodexRateLimitResetCredits | null;
  rateLimitResetCredits?: CodexRateLimitResetCredits | null;
  plan_type?: string;
  planType?: string;
  chatgpt_plan_type?: string;
  chatgptPlanType?: string;
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
  subscription_expires_at?: string | number | null;
  subscriptionExpiresAt?: string | number | null;
  current_period_end?: string | number | null;
  currentPeriodEnd?: string | number | null;
  expires_at?: string | number | null;
  expiresAt?: string | number | null;
  chatgpt_subscription_active_start?: string | number | null;
  chatgptSubscriptionActiveStart?: string | number | null;
  chatgpt_subscription_active_until?: string | number | null;
  chatgptSubscriptionActiveUntil?: string | number | null;
  rate_limit?: CodexRateLimitInfo | null;
  rateLimit?: CodexRateLimitInfo | null;
  code_review_rate_limit?: CodexRateLimitInfo | null;
  codeReviewRateLimit?: CodexRateLimitInfo | null;
  additional_rate_limits?: CodexAdditionalRateLimit[] | null;
  additionalRateLimits?: CodexAdditionalRateLimit[] | null;
  rate_limit_reached_type?: string | { kind?: string | null } | null;
  rateLimitReachedType?: string | { kind?: string | null } | null;
}

export interface CodexRateLimitResetCredits {
  available_count?: number | string;
  availableCount?: number | string;
  credits?: CodexRateLimitResetCredit[] | null;
}

export interface CodexRateLimitResetCredit {
  id?: string;
  reset_type?: string;
  resetType?: string;
  status?: string;
  granted_at?: string | number | null;
  grantedAt?: string | number | null;
  expires_at?: string | number | null;
  expiresAt?: string | number | null;
  title?: string | null;
  description?: string | null;
}

export interface CodexRateLimitResetCreditsPayload {
  auth_file?: AuthFileItem | null;
  authFile?: AuthFileItem | null;
  rate_limit_reset_credits?: CodexRateLimitResetCredits | null;
  rateLimitResetCredits?: CodexRateLimitResetCredits | null;
  available_count?: number | string;
  availableCount?: number | string;
}

export interface CodexRateLimitResetConsumePayload extends CodexRateLimitResetCreditsPayload {
  consume?: {
    code?: string;
    windows_reset?: number | string;
    windowsReset?: number | string;
  };
  code?: string;
  windows_reset?: number | string;
  windowsReset?: number | string;
  redeem_request_id?: string;
  redeemRequestId?: string;
  local_quota_cooldown_cleared?: boolean;
  localQuotaCooldownCleared?: boolean;
  usage_refresh_error?: string;
  usageRefreshError?: string;
}

// Claude API payload types
export interface ClaudeUsageWindow {
  utilization: number;
  resets_at: string;
}

export interface ClaudeExtraUsage {
  is_enabled: boolean;
  monthly_limit: number;
  used_credits: number;
  utilization: number | null;
}

export interface ClaudeUsagePayload {
  five_hour?: ClaudeUsageWindow | null;
  seven_day?: ClaudeUsageWindow | null;
  seven_day_oauth_apps?: ClaudeUsageWindow | null;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
  seven_day_cowork?: ClaudeUsageWindow | null;
  iguana_necktie?: ClaudeUsageWindow | null;
  extra_usage?: ClaudeExtraUsage | null;
}

export interface ClaudeProfileResponse {
  account?: {
    uuid?: string;
    full_name?: string;
    display_name?: string;
    email?: string;
    has_claude_max?: boolean;
    has_claude_pro?: boolean;
    created_at?: string;
  };
  organization?: {
    uuid?: string;
    name?: string;
    organization_type?: string;
    billing_type?: string;
    rate_limit_tier?: string;
    has_extra_usage_enabled?: boolean;
    subscription_status?: string;
    subscription_created_at?: string;
  };
}

export interface ClaudeQuotaWindow {
  id: string;
  label: string;
  labelKey?: string;
  usedPercent: number | null;
  resetLabel: string;
  resetAt?: number;
}

export interface ClaudeQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
  error?: string;
  errorStatus?: number;
}

export interface CodexQuotaWindow {
  id: string;
  label: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  usedPercent: number | null;
  resetLabel: string;
  resetAt?: number;
}

export interface CodexQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  windows: CodexQuotaWindow[];
  credits?: CodexCreditsSnapshot | null;
  rateLimitResetCreditsAvailable?: number | null;
  rateLimitResetCredits?: CodexRateLimitResetCredit[];
  planType?: string | null;
  rateLimitReachedType?: string | null;
  subscriptionActiveStart?: string | number | null;
  subscriptionActiveDays?: number | null;
  subscriptionUntil?: string | number | null;
  error?: string;
  errorStatus?: number;
}

// Kimi API payload types
export interface KimiUsageDetail {
  used?: number;
  limit?: number;
  remaining?: number;
  name?: string;
  title?: string;
  resetAt?: string;
  reset_at?: string;
  resetTime?: string;
  reset_time?: string;
  resetIn?: number;
  reset_in?: number;
  ttl?: number;
}

export interface KimiLimitWindow {
  duration?: number;
  timeUnit?: string;
}

export interface KimiLimitItem {
  name?: string;
  title?: string;
  scope?: string;
  detail?: KimiUsageDetail;
  window?: KimiLimitWindow;
  used?: number;
  limit?: number;
  remaining?: number;
  duration?: number;
  timeUnit?: string;
  resetAt?: string;
  reset_at?: string;
  resetIn?: number;
  reset_in?: number;
  ttl?: number;
}

export interface KimiUsagePayload {
  usage?: KimiUsageDetail;
  limits?: KimiLimitItem[];
}

export interface KimiQuotaRow {
  id: string;
  label?: string;
  labelKey?: string;
  labelParams?: Record<string, string | number>;
  used: number;
  limit: number;
  resetHint?: string;
  resetAt?: number;
}

export interface KimiQuotaState {
  status: 'idle' | 'loading' | 'success' | 'error';
  rows: KimiQuotaRow[];
  error?: string;
  errorStatus?: number;
}
