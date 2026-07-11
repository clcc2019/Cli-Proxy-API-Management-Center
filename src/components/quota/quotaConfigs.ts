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
  CodexRateLimitResetCredits,
  CodexQuotaState,
  CodexUsageWindow,
  CodexQuotaWindow,
  CodexUsagePayload,
  KimiQuotaRow,
  KimiQuotaState,
} from '@/types';
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
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
  formatQuotaResetTime,
  formatKimiResetHint,
  getQuotaProgressLevel,
  buildKimiQuotaRows,
  createStatusError,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaType = 'claude' | 'codex' | 'kimi';

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

export interface QuotaStore {
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  kimiQuota: Record<string, KimiQuotaState>;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setKimiQuota: (updater: QuotaUpdater<Record<string, KimiQuotaState>>) => void;
  clearQuotaCache: () => void;
}

export interface QuotaConfig<TState, TData> {
  type: QuotaType;
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
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

export interface QuotaRenderHelpers {
  styles: Record<string, string>;
  QuotaProgressBar: (props: QuotaProgressBarProps) => ReactElement;
  item?: AuthFileItem;
}

interface RenderQuotaRowOptions {
  key: string;
  label: string;
  remaining: number | null;
  metaItems?: ReactNode[];
}

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
  const windows: CodexQuotaWindow[] = [];

  const addWindow = (
    id: string,
    label: string,
    labelKey: string | undefined,
    labelParams: Record<string, string | number> | undefined,
    window?: CodexUsageWindow | null,
    limitReached?: boolean,
    allowed?: boolean
  ) => {
    if (!window) return;
    const resetLabel = formatCodexResetLabel(window);
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const isLimitReached = Boolean(limitReached) || allowed === false;
    const usedPercent = usedPercentRaw ?? (isLimitReached && resetLabel !== '-' ? 100 : null);
    windows.push({
      id,
      label,
      labelKey,
      labelParams,
      usedPercent,
      resetLabel,
    });
  };

  const getWindowSeconds = (window?: CodexUsageWindow | null): number | null => {
    if (!window) return null;
    return normalizeNumberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
  };

  const rawLimitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const rawAllowed = rateLimit?.allowed;

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
    rawAllowed
  );
  addWindow(
    WINDOW_META.codeWeekly.id,
    t(WINDOW_META.codeWeekly.labelKey),
    WINDOW_META.codeWeekly.labelKey,
    undefined,
    rateWindows.weeklyWindow,
    rawLimitReached,
    rawAllowed
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

const resolveCodexRateLimitResetCreditsAvailable = (payload: CodexUsagePayload): number | null => {
  const raw = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  if (!raw || typeof raw !== 'object') return null;
  const credits = raw as CodexRateLimitResetCredits;
  const count = normalizeNumberValue(credits.available_count ?? credits.availableCount);
  return count === null ? null : Math.max(0, Math.trunc(count));
};

const resolveCodexUpdatedAuthFile = (
  file: AuthFileItem,
  payload: CodexUsagePayload
): AuthFileItem | null => {
  const snapshot = payload.auth_file ?? payload.authFile;
  const normalizedSnapshot =
    snapshot && typeof snapshot === 'object'
      ? ({ ...file, ...snapshot, name: file.name } as AuthFileItem)
      : null;

  if (normalizedSnapshot) return normalizedSnapshot;

  const patch: Partial<AuthFileItem> = {};
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
    ? ({ ...file, ...patch, name: file.name } as AuthFileItem)
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
  windows: CodexQuotaWindow[];
}> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  const planTypeFromFile = resolveCodexPlanType(file);
  const payload = await authFilesApi.getCodexUsage(file.name, authIndex ?? undefined, 'refresh');
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
  const windows = buildCodexQuotaWindows(payload, t, planTypeFromUsage ?? planTypeFromFile);
  const rateLimitReachedType = resolveCodexRateLimitReachedType(payload);
  const rateLimitResetCreditsAvailable = resolveCodexRateLimitResetCreditsAvailable(payload);
  const authFile = resolveCodexUpdatedAuthFile(file, payload);
  return {
    authFile,
    planType: planTypeFromUsage ?? planTypeFromFile,
    subscriptionActiveStart,
    subscriptionActiveDays,
    subscriptionUntil,
    rateLimitReachedType,
    rateLimitResetCreditsAvailable,
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

const renderCodexItems = (
  quota: CodexQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;
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
  const isPremiumPlan = PREMIUM_CODEX_PLAN_TYPES.has(normalizePlanType(planType) ?? '');
  const nodes: ReactNode[] = [];

  if (planLabel || subscriptionUntilLabel || subscriptionActiveDaysLabel) {
    const valueClass = isPremiumPlan ? styleMap.premiumPlanValue : styleMap.codexPlanValue;
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.plan_label')),
        h('span', { className: valueClass }, planLabel ?? t('codex_quota.plan_unknown')),
        subscriptionUntilLabel
          ? h('span', { className: styleMap.codexPlanExpiry }, subscriptionUntilLabel)
          : null,
        subscriptionActiveDaysLabel
          ? h('span', { className: styleMap.codexPlanExpiry }, subscriptionActiveDaysLabel)
          : null
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('codex_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
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
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
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

  const [usageResult, profileResult] = await Promise.allSettled([
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_USAGE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
    apiCallApi.request({
      authIndex,
      method: 'GET',
      url: CLAUDE_PROFILE_URL,
      header: { ...CLAUDE_REQUEST_HEADERS },
    }),
  ]);

  if (usageResult.status === 'rejected') {
    throw usageResult.reason;
  }

  const result = usageResult.value;

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseClaudeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  const planType =
    profileResult.status === 'fulfilled' &&
    profileResult.value.statusCode >= 200 &&
    profileResult.value.statusCode < 300
      ? resolveClaudePlanType(
          parseClaudeProfilePayload(profileResult.value.body ?? profileResult.value.bodyText)
        )
      : null;

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
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, t(`claude_quota.${planType}`))
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
  }),
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
