/**
 * Quota configuration definitions.
 */

import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type {
  AuthFileItem,
  ClaudeExtraUsage,
  ClaudeProfileResponse,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexRateLimitInfo,
  CodexRateLimitResetCredit,
  CodexRateLimitResetCredits,
  CodexCreditsSnapshot,
  CodexQuotaState,
  CodexUsageWindow,
  CodexQuotaWindow,
  CodexUsagePayload,
  KimiQuotaRow,
  KimiQuotaState,
} from '@/types';
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import { isAuthFileDisableCoolingEnabled } from '@/features/authFiles/constants';
import { mergeAuthFileUpdatePreservingRequestStats } from '@/features/authFiles/stats';

import {
  CLAUDE_PROFILE_URL,
  CLAUDE_USAGE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_WINDOW_KEYS,
  KIMI_USAGE_URL,
  KIMI_REQUEST_HEADERS,
  normalizeNumberValue,
  normalizePlanType,
  normalizeStringValue,
  parseClaudeUsagePayload,
  parseKimiUsagePayload,
  resolveCodexPlanType,
  resolveCodexSubscriptionActiveDays,
  resolveCodexSubscriptionActiveStart,
  resolveCodexSubscriptionActiveUntil,
  formatCodexResetLabel,
  resolveCodexResetTimeMs,
  resolveQuotaResetTimeMs,
  formatQuotaResetTime,
  formatKimiResetHint,
  getQuotaProgressLevel,
  type QuotaProviderType,
  buildKimiQuotaRows,
  createStatusError,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';

const getQuotaRowClassName = (styles: Record<string, string>, percent: number | null): string => {
  const level = getQuotaProgressLevel(percent);
  const levelClass =
    level === 'high'
      ? styles.quotaRowHigh
      : level === 'medium'
        ? styles.quotaRowMedium
        : level === 'low'
          ? styles.quotaRowLow
          : styles.quotaRowUnknown;
  return [styles.quotaRow, levelClass].filter(Boolean).join(' ');
};

interface QuotaConfig<TState, TData> {
  type: QuotaProviderType;
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
  mergeSuccessState?: (previous: TState | undefined, next: TState) => TState;
  buildErrorState: (message: string, status?: number) => TState;
  extractAuthFileUpdate?: (data: TData) => AuthFileItem | null;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

interface QuotaProgressBarProps {
  percent: number | null;
  highThreshold?: number;
  mediumThreshold?: number;
  ariaLabel?: string;
  ariaValueText?: string;
}

interface QuotaRenderHelpers {
  styles: Record<string, string>;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
  item?: AuthFileItem;
  promotionAction?: ReactNode;
}

interface RenderQuotaRowOptions {
  key: string;
  label: string;
  remaining: number | null;
  metaItems?: ReactNode[];
}

const QUOTA_OPTIONAL_ENRICHMENT_BUDGET_MS = 180;
const QUOTA_OPTIONAL_ENRICHMENT_CACHE_TTL_MS = 10 * 60_000;

type CachedQuotaEnrichment<T> = { value: T; fetchedAt: number };
const claudeProfileCache = new Map<string, CachedQuotaEnrichment<ClaudeProfileResponse>>();
const codexResetCreditsCache = new Map<
  string,
  CachedQuotaEnrichment<CodexRateLimitResetCredits>
>();

const readQuotaEnrichmentCache = <T>(
  cache: Map<string, CachedQuotaEnrichment<T>>,
  key: string
): T | null => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt <= QUOTA_OPTIONAL_ENRICHMENT_CACHE_TTL_MS) {
    return cached.value;
  }
  cache.delete(key);
  return null;
};

const writeQuotaEnrichmentCache = <T>(
  cache: Map<string, CachedQuotaEnrichment<T>>,
  key: string,
  value: T
) => {
  cache.set(key, { value, fetchedAt: Date.now() });
};

const settleQuotaEnrichmentWithinBudget = async <T>(
  request: Promise<T>
): Promise<PromiseSettledResult<T> | null> => {
  let timeoutId: number | null = null;
  const settledRequest: Promise<PromiseSettledResult<T>> = request.then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason: unknown) => ({ status: 'rejected' as const, reason })
  );
  const timeout = new Promise<null>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(null), QUOTA_OPTIONAL_ENRICHMENT_BUDGET_MS);
  });

  try {
    return await Promise.race([settledRequest, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
};

const clampPercent = (value: number | null): number | null =>
  value === null ? null : Math.max(0, Math.min(100, value));

const getRemainingQuotaPercent = (usedPercent: number | null): number | null => {
  const clampedUsed = clampPercent(usedPercent);
  return clampedUsed === null ? null : Math.max(0, 100 - clampedUsed);
};

const formatQuotaPercentLabel = (percent: number | null): string =>
  percent === null ? '--' : `${Math.round(percent)}%`;

const renderQuotaRow = (
  helpers: QuotaRenderHelpers,
  { key, label, remaining, metaItems = [] }: RenderQuotaRowOptions
): ReactElement => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const percentLabel = formatQuotaPercentLabel(remaining);

  return h(
    'div',
    { key, className: getQuotaRowClassName(styleMap, remaining) },
    h(
      'div',
      { className: styleMap.quotaRowHeader },
      h('span', { className: styleMap.quotaModel }, label),
      h(
        'div',
        { className: styleMap.quotaMeta },
        h('span', { className: styleMap.quotaPercent }, percentLabel),
        ...metaItems
      )
    ),
    h(QuotaProgressBar, {
      percent: remaining,
      ariaLabel: label,
      ariaValueText: percentLabel,
    })
  );
};

const buildCodexQuotaWindows = (
  payload: CodexUsagePayload,
  t: TFunction,
  planTypeHint?: string | null
): CodexQuotaWindow[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;
  const isFreePlan =
    normalizePlanType(
      planTypeHint ??
        payload.plan_type ??
        payload.planType ??
        payload.chatgpt_plan_type ??
        payload.chatgptPlanType
    ) === 'free';
  const WINDOW_META = {
    codeFiveHour: { id: 'five-hour', labelKey: 'codex_quota.primary_window' },
    codeWeekly: { id: 'weekly', labelKey: 'codex_quota.secondary_window' },
    codeReviewFiveHour: {
      id: 'code-review-five-hour',
      labelKey: 'codex_quota.code_review_primary_window',
    },
    codeReviewWeekly: {
      id: 'code-review-weekly',
      labelKey: 'codex_quota.code_review_secondary_window',
    },
  } as const;

  const rateLimit = payload.rate_limit ?? payload.rateLimit ?? undefined;
  const codeReviewLimit =
    payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? undefined;
  const additionalRateLimits = payload.additional_rate_limits ?? payload.additionalRateLimits ?? [];
  const reachedTypeRaw = payload.rate_limit_reached_type ?? payload.rateLimitReachedType;
  const reachedType = normalizeStringValue(
    typeof reachedTypeRaw === 'string' ? reachedTypeRaw : reachedTypeRaw?.kind
  )?.toLowerCase();
  const windows: CodexQuotaWindow[] = [];

  const addWindow = (
    id: string,
    label: string,
    labelKey: string | undefined,
    labelParams: Record<string, string | number> | undefined,
    window?: CodexUsageWindow | null,
    limitReached?: boolean,
    allowed?: boolean,
    explicitlyReached = false
  ) => {
    if (!window) return;
    const resetLabel = formatCodexResetLabel(window);
    const resetAt = resolveCodexResetTimeMs(window);
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const isLimitReached = Boolean(limitReached) || allowed === false;
    const usedPercent =
      explicitlyReached && isLimitReached
        ? 100
        : (usedPercentRaw ?? (isLimitReached && resetLabel !== '-' ? 100 : null));
    windows.push({
      id,
      label,
      labelKey,
      labelParams,
      usedPercent,
      resetLabel,
      resetAt: resetAt ?? undefined,
    });
  };

  const getWindowSeconds = (window?: CodexUsageWindow | null): number | null => {
    if (!window) return null;
    return normalizeNumberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
  };

  const rawLimitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const rawAllowed = rateLimit?.allowed;
  const primaryLimitReached =
    reachedType === 'primary' ||
    reachedType === 'primary_window' ||
    reachedType === 'primary-window' ||
    reachedType === 'five_hour' ||
    reachedType === 'five-hour' ||
    reachedType === '5h';
  const secondaryLimitReached =
    reachedType === 'secondary' ||
    reachedType === 'secondary_window' ||
    reachedType === 'secondary-window' ||
    reachedType === 'weekly' ||
    reachedType === 'week' ||
    reachedType === '7d';

  const pickClassifiedWindows = (
    limitInfo?: CodexRateLimitInfo | null,
    options?: { allowOrderFallback?: boolean }
  ): { fiveHourWindow: CodexUsageWindow | null; weeklyWindow: CodexUsageWindow | null } => {
    const allowOrderFallback = options?.allowOrderFallback ?? true;
    const primaryWindow = limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null;
    const secondaryWindow = limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null;
    const rawWindows = [primaryWindow, secondaryWindow];

    let fiveHourWindow: CodexUsageWindow | null = null;
    let weeklyWindow: CodexUsageWindow | null = null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getWindowSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHourWindow) {
        fiveHourWindow = window;
      } else if (seconds === WEEK_SECONDS && !weeklyWindow) {
        weeklyWindow = window;
      }
    }

    // For legacy payloads without window duration, fallback to primary/secondary ordering.
    if (allowOrderFallback) {
      if (!fiveHourWindow && !isFreePlan) {
        fiveHourWindow = primaryWindow && primaryWindow !== weeklyWindow ? primaryWindow : null;
      }
      if (!weeklyWindow) {
        weeklyWindow =
          secondaryWindow && secondaryWindow !== fiveHourWindow ? secondaryWindow : null;
      }
    }

    // Free tier only exposes weekly limits; never surface a 5-hour row.
    if (isFreePlan) {
      fiveHourWindow = null;
      if (!weeklyWindow) {
        weeklyWindow = secondaryWindow ?? primaryWindow ?? null;
      }
    }

    return { fiveHourWindow, weeklyWindow };
  };

  const rateWindows = pickClassifiedWindows(rateLimit);
  addWindow(
    WINDOW_META.codeFiveHour.id,
    t(WINDOW_META.codeFiveHour.labelKey),
    WINDOW_META.codeFiveHour.labelKey,
    undefined,
    rateWindows.fiveHourWindow,
    rawLimitReached,
    rawAllowed,
    primaryLimitReached
  );
  addWindow(
    WINDOW_META.codeWeekly.id,
    t(WINDOW_META.codeWeekly.labelKey),
    WINDOW_META.codeWeekly.labelKey,
    undefined,
    rateWindows.weeklyWindow,
    rawLimitReached,
    rawAllowed,
    secondaryLimitReached
  );

  const codeReviewWindows = pickClassifiedWindows(codeReviewLimit);
  const codeReviewLimitReached = codeReviewLimit?.limit_reached ?? codeReviewLimit?.limitReached;
  const codeReviewAllowed = codeReviewLimit?.allowed;
  addWindow(
    WINDOW_META.codeReviewFiveHour.id,
    t(WINDOW_META.codeReviewFiveHour.labelKey),
    WINDOW_META.codeReviewFiveHour.labelKey,
    undefined,
    codeReviewWindows.fiveHourWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );
  addWindow(
    WINDOW_META.codeReviewWeekly.id,
    t(WINDOW_META.codeReviewWeekly.labelKey),
    WINDOW_META.codeReviewWeekly.labelKey,
    undefined,
    codeReviewWindows.weeklyWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );

  const normalizeWindowId = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (Array.isArray(additionalRateLimits)) {
    additionalRateLimits.forEach((limitItem, index) => {
      const rateInfo = limitItem?.rate_limit ?? limitItem?.rateLimit ?? null;
      if (!rateInfo) return;

      const limitName =
        normalizeStringValue(limitItem?.limit_name ?? limitItem?.limitName) ??
        normalizeStringValue(limitItem?.metered_feature ?? limitItem?.meteredFeature) ??
        `additional-${index + 1}`;

      const idPrefix = normalizeWindowId(limitName) || `additional-${index + 1}`;
      const additionalPrimaryWindow = rateInfo.primary_window ?? rateInfo.primaryWindow ?? null;
      const additionalSecondaryWindow =
        rateInfo.secondary_window ?? rateInfo.secondaryWindow ?? null;
      const additionalWindows = pickClassifiedWindows(rateInfo);
      const additionalLimitReached = rateInfo.limit_reached ?? rateInfo.limitReached;
      const additionalAllowed = rateInfo.allowed;

      if (!isFreePlan) {
        addWindow(
          `${idPrefix}-five-hour-${index}`,
          t('codex_quota.additional_primary_window', { name: limitName }),
          'codex_quota.additional_primary_window',
          { name: limitName },
          additionalWindows.fiveHourWindow ?? additionalPrimaryWindow,
          additionalLimitReached,
          additionalAllowed
        );
      }
      addWindow(
        `${idPrefix}-weekly-${index}`,
        t('codex_quota.additional_secondary_window', { name: limitName }),
        'codex_quota.additional_secondary_window',
        { name: limitName },
        isFreePlan
          ? (additionalWindows.weeklyWindow ?? additionalSecondaryWindow ?? additionalPrimaryWindow)
          : (additionalWindows.weeklyWindow ?? additionalSecondaryWindow),
        additionalLimitReached,
        additionalAllowed
      );
    });
  }

  return windows;
};

const resolveCodexRateLimitReachedType = (payload: CodexUsagePayload): string | null => {
  const raw = payload.rate_limit_reached_type ?? payload.rateLimitReachedType;
  if (typeof raw === 'string') return normalizeStringValue(raw);
  if (raw && typeof raw === 'object') return normalizeStringValue(raw.kind);
  return null;
};

// The endpoint has returned both { rate_limit_reset_credits: {...} } and
// { available_count: ... } across backend versions. Normalize both shapes before
// merging the optional response into the usage payload so a valid count is not lost.
const normalizeCodexRateLimitResetCreditsPayload = (
  payload: Awaited<ReturnType<typeof authFilesApi.getCodexRateLimitResetCredits>>
): CodexRateLimitResetCredits | null => {
  const nested = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  const directCount = normalizeNumberValue(payload.available_count ?? payload.availableCount);
  if (nested && typeof nested === 'object') {
    const nestedCount = normalizeNumberValue(nested.available_count ?? nested.availableCount);
    if (nestedCount !== null || directCount === null) return nested;
    return { ...nested, available_count: directCount };
  }
  return directCount === null ? null : { available_count: directCount };
};

const resolveCodexRateLimitResetCreditsAvailable = (payload: CodexUsagePayload): number | null => {
  const raw = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  if (!raw || typeof raw !== 'object') return null;
  const credits = raw as CodexRateLimitResetCredits;
  const count = normalizeNumberValue(credits.available_count ?? credits.availableCount);
  return count === null ? null : Math.max(0, Math.trunc(count));
};

const resolveCodexRateLimitResetCreditDetails = (
  payload: CodexUsagePayload
): CodexRateLimitResetCredit[] => {
  const raw = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.credits)) return [];
  return raw.credits.filter((credit): credit is CodexRateLimitResetCredit =>
    Boolean(credit && typeof credit === 'object')
  );
};

const resolveCodexCreditsSnapshot = (
  payload: CodexUsagePayload,
  fallback?: AuthFileItem | null
): CodexCreditsSnapshot | null => {
  const authFile = payload.auth_file ?? payload.authFile;
  const credits =
    payload.credits ??
    (authFile && typeof authFile === 'object' ? authFile.credits : null) ??
    fallback?.credits;
  const expiringBalanceDetails = payload.expiring_balance_details ?? payload.expiringBalanceDetails;
  if (credits) {
    const existingDetails = credits.expiring_balance_details ?? credits.expiringBalanceDetails;
    return expiringBalanceDetails && !existingDetails
      ? { ...credits, expiring_balance_details: expiringBalanceDetails }
      : credits;
  }

  const balance = normalizeStringValue(payload.remaining_balance ?? payload.remainingBalance);
  return balance === null
    ? null
    : {
        has_credits: true,
        unlimited: false,
        balance,
        expiring_balance_details: expiringBalanceDetails,
      };
};

const resolveCodexUpdatedAuthFile = (
  file: AuthFileItem,
  payload: CodexUsagePayload
): AuthFileItem | null => {
  const creditsEnabled = isAuthFileDisableCoolingEnabled(file);
  const snapshot = payload.auth_file ?? payload.authFile;
  if (snapshot && typeof snapshot === 'object') {
    const update = snapshot as AuthFileItem;
    if (!creditsEnabled) {
      return mergeAuthFileUpdatePreservingRequestStats(file, { ...update, credits: null });
    }
    const credits = resolveCodexCreditsSnapshot(payload);
    const mergedCredits = credits ? { ...(update.credits ?? {}), ...credits } : update.credits;
    return mergeAuthFileUpdatePreservingRequestStats(
      file,
      mergedCredits ? { ...update, credits: mergedCredits } : update
    );
  }

  const credits = creditsEnabled ? resolveCodexCreditsSnapshot(payload) : null;
  const patch: Partial<AuthFileItem> = { credits: creditsEnabled ? credits : null };
  const planType = normalizePlanType(
    payload.plan_type ?? payload.planType ?? payload.chatgpt_plan_type ?? payload.chatgptPlanType
  );
  if (planType) {
    patch.plan_type = planType;
    patch.chatgpt_plan_type = planType;
  }
  const subscriptionUntil = resolveCodexSubscriptionActiveUntil(payload as AuthFileItem);
  if (subscriptionUntil !== null) {
    patch.subscription_expires_at = subscriptionUntil;
    patch.chatgpt_subscription_active_until = subscriptionUntil;
  }
  const subscriptionStart = resolveCodexSubscriptionActiveStart(payload as AuthFileItem);
  if (subscriptionStart !== null) {
    patch.chatgpt_subscription_active_start = subscriptionStart;
    patch.subscription_active_start = subscriptionStart;
  }
  const subscriptionDays = resolveCodexSubscriptionActiveDays(payload as AuthFileItem);
  if (subscriptionDays !== null) {
    patch.subscription_active_days = subscriptionDays;
  }

  return Object.keys(patch).length > 0
    ? mergeAuthFileUpdatePreservingRequestStats(file, patch)
    : null;
};

const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{
  authFile: AuthFileItem | null;
  planType: string | null;
  subscriptionActiveStart: string | number | null;
  subscriptionActiveDays: number | null;
  subscriptionUntil: string | number | null;
  rateLimitReachedType: string | null;
  rateLimitResetCreditsAvailable: number | null;
  rateLimitResetCredits: CodexRateLimitResetCredit[];
  credits: CodexCreditsSnapshot | null;
  windows: CodexQuotaWindow[];
}> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  const planTypeFromFile = resolveCodexPlanType(file);
  const creditsEnabled = isAuthFileDisableCoolingEnabled(file);
  const resetCreditsCacheKey = `${file.name}:${authIndex ?? ''}`;
  const resetCreditsResultPromise = authFilesApi
    .getCodexRateLimitResetCredits(file.name, authIndex ?? undefined)
    .then((payload) => {
      const resetCredits = normalizeCodexRateLimitResetCreditsPayload(payload);
      if (resetCredits) {
        writeQuotaEnrichmentCache(codexResetCreditsCache, resetCreditsCacheKey, resetCredits);
        return resetCredits;
      }
      return readQuotaEnrichmentCache(codexResetCreditsCache, resetCreditsCacheKey);
    })
    .catch(() => readQuotaEnrichmentCache(codexResetCreditsCache, resetCreditsCacheKey));
  const usagePayload = await authFilesApi.getCodexUsage(
    file.name,
    authIndex ?? undefined,
    'refresh'
  );
  const resetCredits = await resetCreditsResultPromise;
  const payload = resetCredits
    ? ({ ...usagePayload, rate_limit_reset_credits: resetCredits } as CodexUsagePayload)
    : usagePayload;
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(
    payload.plan_type ?? payload.planType ?? payload.chatgpt_plan_type ?? payload.chatgptPlanType
  );
  const authFileSnapshot = payload.auth_file ?? payload.authFile;
  const normalizedAuthFileSnapshot =
    authFileSnapshot && typeof authFileSnapshot === 'object' ? authFileSnapshot : null;
  const subscriptionSource = {
    ...file,
    ...normalizedAuthFileSnapshot,
    ...payload,
    name: file.name,
  } as AuthFileItem;
  const subscriptionActiveStart = resolveCodexSubscriptionActiveStart(subscriptionSource);
  const subscriptionActiveDays = resolveCodexSubscriptionActiveDays(subscriptionSource);
  const subscriptionUntil = resolveCodexSubscriptionActiveUntil(subscriptionSource);
  const credits = creditsEnabled ? resolveCodexCreditsSnapshot(payload, file) : null;
  const windows = buildCodexQuotaWindows(payload, t, planTypeFromUsage ?? planTypeFromFile);
  const rateLimitReachedType = resolveCodexRateLimitReachedType(payload);
  const rateLimitResetCreditsAvailable = resolveCodexRateLimitResetCreditsAvailable(payload);
  const rateLimitResetCredits = resolveCodexRateLimitResetCreditDetails(payload);
  const authFile = resolveCodexUpdatedAuthFile(file, payload);
  return {
    authFile,
    planType: planTypeFromUsage ?? planTypeFromFile,
    subscriptionActiveStart,
    subscriptionActiveDays,
    subscriptionUntil,
    rateLimitReachedType,
    rateLimitResetCreditsAvailable,
    rateLimitResetCredits,
    credits,
    windows,
  };
};

const PREMIUM_CODEX_PLAN_TYPES = new Set(['pro', 'prolite', 'pro-lite', 'pro_lite']);

const formatCodexSubscriptionUntil = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;

  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));

  if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  const fallback = String(raw).trim();
  return fallback || null;
};

const resolveCodexSubscriptionUntilLabel = (
  quota: CodexQuotaState,
  item?: AuthFileItem
): string | null => {
  const value =
    quota.subscriptionUntil ?? (item ? resolveCodexSubscriptionActiveUntil(item) : null);
  return formatCodexSubscriptionUntil(value);
};

const resolveCodexSubscriptionActiveDaysLabel = (
  quota: CodexQuotaState,
  item: AuthFileItem | undefined,
  t: TFunction
): string | null => {
  const days =
    quota.subscriptionActiveDays ?? (item ? resolveCodexSubscriptionActiveDays(item) : null);
  if (days === null || days < 0) return null;
  return t('codex_quota.subscription_active_days', { days });
};

const isTruthyCodexFlag = (value: unknown): boolean =>
  value === true ||
  value === 1 ||
  (typeof value === 'string' && ['1', 'true'].includes(value.trim().toLowerCase()));

const formatCodexCreditsBalance = (value: unknown): string | null => {
  const numeric = normalizeNumberValue(value);
  if (numeric !== null) {
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return normalizeStringValue(value);
};

const resolveCodexCreditsProgress = (
  credits: CodexCreditsSnapshot | null
): { remainingPercent: number; used: number; remaining: number; granted: number } | null => {
  const details = credits?.expiring_balance_details ?? credits?.expiringBalanceDetails;
  if (!Array.isArray(details)) return null;

  let granted = 0;
  let remaining = 0;
  details.forEach((detail) => {
    const amountGranted = normalizeNumberValue(detail?.amount_granted);
    const amountRemaining = normalizeNumberValue(detail?.amount_remaining);
    if (amountGranted === null || amountGranted <= 0 || amountRemaining === null) return;
    granted += amountGranted;
    remaining += Math.min(amountGranted, Math.max(0, amountRemaining));
  });

  if (granted <= 0) return null;
  return {
    remainingPercent: clampPercent((remaining / granted) * 100) ?? 0,
    used: Math.max(0, granted - remaining),
    remaining,
    granted,
  };
};

const renderCodexItems = (
  quota: CodexQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;
  const creditsEnabled = Boolean(helpers.item && isAuthFileDisableCoolingEnabled(helpers.item));
  const credits = creditsEnabled ? (quota.credits ?? helpers.item?.credits ?? null) : null;
  const creditBalance = formatCodexCreditsBalance(credits?.balance);
  const showCredits = Boolean(
    credits &&
    (creditBalance !== null ||
      isTruthyCodexFlag(credits.unlimited) ||
      isTruthyCodexFlag(credits.has_credits ?? credits.hasCredits))
  );
  const creditProgress = resolveCodexCreditsProgress(credits);
  const mainQuotaWindows = windows.filter((window) => ['five-hour', 'weekly'].includes(window.id));
  const quotaWindows = mainQuotaWindows.length > 0 ? mainQuotaWindows : windows;
  const hasQuotaRemaining = quotaWindows.some((window) => {
    const remaining = getRemainingQuotaPercent(window.usedPercent);
    return remaining !== null && remaining > 0;
  });
  const showCreditProgress =
    !hasQuotaRemaining && creditProgress !== null && creditProgress.remaining > 0;
  const visibleWindows = windows;
  const subscriptionUntilLabel = resolveCodexSubscriptionUntilLabel(quota, helpers.item);
  const subscriptionActiveDaysLabel = resolveCodexSubscriptionActiveDaysLabel(
    quota,
    helpers.item,
    t
  );

  const getPlanLabel = (pt?: string | null): string | null => {
    const normalized = normalizePlanType(pt);
    if (!normalized) return null;
    if (normalized === 'pro') return t('codex_quota.plan_pro');
    if (PREMIUM_CODEX_PLAN_TYPES.has(normalized) && normalized !== 'pro') {
      return t('codex_quota.plan_prolite');
    }
    if (normalized === 'plus') return t('codex_quota.plan_plus');
    if (normalized === 'team') return t('codex_quota.plan_team');
    if (normalized === 'free') return t('codex_quota.plan_free');
    return pt || normalized;
  };

  const planLabel = getPlanLabel(planType);
  const normalizedPlanType = normalizePlanType(planType);
  const isPaidPlan = Boolean(normalizedPlanType && normalizedPlanType !== 'free');
  const nodes: ReactNode[] = [];

  if (planLabel || subscriptionUntilLabel || subscriptionActiveDaysLabel) {
    const valueClass =
      normalizedPlanType === 'free'
        ? styleMap.freePlanValue
        : isPaidPlan
          ? styleMap.premiumPlanValue
          : styleMap.codexPlanValue;
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.plan_label')),
        h('span', { className: valueClass }, planLabel ?? t('codex_quota.plan_unknown')),
        normalizedPlanType === 'free' ? helpers.promotionAction : null,
        subscriptionUntilLabel
          ? h('span', { className: styleMap.codexPlanExpiry }, subscriptionUntilLabel)
          : null,
        subscriptionActiveDaysLabel
          ? h('span', { className: styleMap.codexPlanExpiry }, subscriptionActiveDaysLabel)
          : null
      )
    );
  }

  if (showCredits) {
    const creditValue = isTruthyCodexFlag(credits?.unlimited)
      ? t('codex_quota.credits_unlimited')
      : (creditBalance ?? t('codex_quota.credits_unknown'));
    nodes.push(
      h(
        'div',
        { key: 'credits', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.credits_label')),
        h('span', { className: styleMap.codexPlanValue }, creditValue)
      )
    );
  }

  if (showCreditProgress) {
    nodes.push(
      renderQuotaRow(helpers, {
        key: 'credits-progress',
        label: t('codex_quota.credits_progress_label'),
        remaining: creditProgress.remainingPercent,
        metaItems: [
          h(
            'span',
            { key: 'used', className: styleMap.quotaReset },
            t('codex_quota.credits_progress_value', {
              used: formatCodexCreditsBalance(creditProgress.used),
              granted: formatCodexCreditsBalance(creditProgress.granted),
              percent: formatCodexCreditsBalance(100 - creditProgress.remainingPercent),
            })
          ),
        ],
      })
    );
  }

  if (visibleWindows.length === 0) {
    if (!showCredits && !showCreditProgress) {
      nodes.push(
        h('div', { key: 'empty', className: styleMap.quotaMessage }, t('codex_quota.empty_windows'))
      );
    }
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...visibleWindows.map((window) => {
      const remaining = getRemainingQuotaPercent(window.usedPercent);
      const windowLabel = window.labelKey
        ? t(window.labelKey, window.labelParams as Record<string, string | number>)
        : window.label;

      return renderQuotaRow(helpers, {
        key: window.id,
        label: windowLabel,
        remaining,
        metaItems: [h('span', { key: 'reset', className: styleMap.quotaReset }, window.resetLabel)],
      });
    })
  );

  return h(Fragment, null, ...nodes);
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const windows: ClaudeQuotaWindow[] = [];

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    const resetAt = resolveQuotaResetTimeMs(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
      resetAt: resetAt ?? undefined,
    });
  }

  return windows;
};

const normalizeFlagValue = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(trimmed)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(trimmed)) return false;
  }
  return undefined;
};

const parseClaudeProfilePayload = (payload: unknown): ClaudeProfileResponse | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeProfileResponse;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeProfileResponse;
  }
  return null;
};

const resolveClaudePlanType = (profile: ClaudeProfileResponse | null): string | null => {
  if (!profile) return null;

  const hasClaudeMax = normalizeFlagValue(profile.account?.has_claude_max);
  if (hasClaudeMax) return 'plan_max';

  const hasClaudePro = normalizeFlagValue(profile.account?.has_claude_pro);
  if (hasClaudePro) return 'plan_pro';

  if (hasClaudeMax === false && hasClaudePro === false) return 'plan_free';

  return null;
};

const fetchClaudeQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{
  windows: ClaudeQuotaWindow[];
  extraUsage?: ClaudeExtraUsage | null;
  planType?: string | null;
}> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  const profileResultPromise = settleQuotaEnrichmentWithinBudget(
    apiCallApi
      .request({
        authIndex,
        method: 'GET',
        url: CLAUDE_PROFILE_URL,
        header: { ...CLAUDE_REQUEST_HEADERS },
      })
      .then((profileResult) => {
        if (profileResult.statusCode >= 200 && profileResult.statusCode < 300) {
          const profile = parseClaudeProfilePayload(profileResult.body ?? profileResult.bodyText);
          if (profile) writeQuotaEnrichmentCache(claudeProfileCache, authIndex, profile);
        }
        return profileResult;
      })
  );
  const usageResult = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CLAUDE_USAGE_URL,
    header: { ...CLAUDE_REQUEST_HEADERS },
  });
  const profileResult = await profileResultPromise;

  if (usageResult.statusCode < 200 || usageResult.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(usageResult), usageResult.statusCode);
  }

  const payload = parseClaudeUsagePayload(usageResult.body ?? usageResult.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const freshProfile =
    profileResult?.status === 'fulfilled' &&
    profileResult.value.statusCode >= 200 &&
    profileResult.value.statusCode < 300
      ? parseClaudeProfilePayload(profileResult.value.body ?? profileResult.value.bodyText)
      : null;
  const planType = resolveClaudePlanType(
    freshProfile ?? readQuotaEnrichmentCache(claudeProfileCache, authIndex)
  );

  return { windows, extraUsage: payload.extra_usage, planType };
};

const renderClaudeItems = (
  quota: ClaudeQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const extraUsage = quota.extraUsage ?? null;
  const planType = quota.planType ?? null;
  const nodes: ReactNode[] = [];

  if (planType) {
    const valueClass =
      planType === 'plan_free' ? styleMap.freePlanValue : styleMap.premiumPlanValue;
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.plan_label')),
        h('span', { className: valueClass }, t(`claude_quota.${planType}`))
      )
    );
  }

  if (extraUsage && extraUsage.is_enabled) {
    const usedLabel = `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;
    nodes.push(
      h(
        'div',
        { key: 'extra', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.extra_usage_label')),
        h('span', { className: styleMap.codexPlanValue }, usedLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('claude_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const remaining = getRemainingQuotaPercent(window.usedPercent);
      const windowLabel = window.labelKey ? t(window.labelKey) : window.label;

      return renderQuotaRow(helpers, {
        key: window.id,
        label: windowLabel,
        remaining,
        metaItems: [h('span', { key: 'reset', className: styleMap.quotaReset }, window.resetLabel)],
      });
    })
  );

  return h(Fragment, null, ...nodes);
};

export const CLAUDE_CONFIG: QuotaConfig<
  ClaudeQuotaState,
  { windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null; planType?: string | null }
> = {
  type: 'claude',
  i18nPrefix: 'claude_quota',
  fetchQuota: fetchClaudeQuota,
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    extraUsage: data.extraUsage,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  renderQuotaItems: renderClaudeItems,
};

export const CODEX_CONFIG: QuotaConfig<
  CodexQuotaState,
  {
    authFile: AuthFileItem | null;
    planType: string | null;
    subscriptionActiveStart: string | number | null;
    subscriptionActiveDays: number | null;
    subscriptionUntil: string | number | null;
    rateLimitReachedType: string | null;
    rateLimitResetCreditsAvailable: number | null;
    rateLimitResetCredits: CodexRateLimitResetCredit[];
    credits: CodexCreditsSnapshot | null;
    windows: CodexQuotaWindow[];
  }
> = {
  type: 'codex',
  i18nPrefix: 'codex_quota',
  fetchQuota: fetchCodexQuota,
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    planType: data.planType,
    rateLimitReachedType: data.rateLimitReachedType,
    subscriptionActiveStart: data.subscriptionActiveStart,
    subscriptionActiveDays: data.subscriptionActiveDays,
    subscriptionUntil: data.subscriptionUntil,
    rateLimitResetCreditsAvailable: data.rateLimitResetCreditsAvailable,
    rateLimitResetCredits: data.rateLimitResetCredits,
    credits: data.credits,
  }),
  mergeSuccessState: (previous, next) => {
    if (next.rateLimitResetCreditsAvailable !== null || !previous) return next;
    return {
      ...next,
      rateLimitResetCreditsAvailable: previous.rateLimitResetCreditsAvailable,
      rateLimitResetCredits: previous.rateLimitResetCredits,
    };
  },
  extractAuthFileUpdate: (data) => data.authFile,
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  renderQuotaItems: renderCodexItems,
};

const fetchKimiQuota = async (file: AuthFileItem, t: TFunction): Promise<KimiQuotaRow[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kimi_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: KIMI_USAGE_URL,
    header: { ...KIMI_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseKimiUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kimi_quota.empty_data'));
  }

  return buildKimiQuotaRows(payload);
};

const renderKimiItems = (
  quota: KimiQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap } = helpers;
  const { createElement: h } = React;
  const rows = quota.rows ?? [];

  if (rows.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('kimi_quota.empty_data'));
  }

  return rows.map((row) => {
    const limit = row.limit;
    const used = row.used;
    const remaining =
      limit > 0
        ? Math.max(0, Math.min(100, Math.round(((limit - used) / limit) * 100)))
        : used > 0
          ? 0
          : null;
    const rowLabel = row.labelKey
      ? t(row.labelKey, (row.labelParams ?? {}) as Record<string, string | number>)
      : (row.label ?? '');
    const resetLabel = formatKimiResetHint(t, row.resetHint);
    const metaItems = [
      limit > 0
        ? h('span', { key: 'amount', className: styleMap.quotaAmount }, `${used} / ${limit}`)
        : null,
      resetLabel ? h('span', { key: 'reset', className: styleMap.quotaReset }, resetLabel) : null,
    ];

    return renderQuotaRow(helpers, {
      key: row.id,
      label: rowLabel,
      remaining,
      metaItems,
    });
  });
};

export const KIMI_CONFIG: QuotaConfig<KimiQuotaState, KimiQuotaRow[]> = {
  type: 'kimi',
  i18nPrefix: 'kimi_quota',
  fetchQuota: fetchKimiQuota,
  buildLoadingState: () => ({ status: 'loading', rows: [] }),
  buildSuccessState: (rows) => ({ status: 'success', rows }),
  buildErrorState: (message, status) => ({
    status: 'error',
    rows: [],
    error: message,
    errorStatus: status,
  }),
  renderQuotaItems: renderKimiItems,
};
