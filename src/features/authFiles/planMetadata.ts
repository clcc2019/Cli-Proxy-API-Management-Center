import type { AuthFileItem, ClaudeQuotaState, CodexQuotaState } from '@/types';
import { normalizePlanType, normalizeUnixTimestampSeconds } from '@/utils/quota/parsers';
import { resolveCodexPlanType, resolveCodexSubscriptionActiveUntil } from '@/utils/quota/resolvers';
import { normalizeProviderKey } from './constants';

const PLUS_CODEX_PLAN_TYPES = new Set(['plus', 'k12']);
const PREMIUM_CODEX_PLAN_TYPES = new Set(['pro', 'prolite', 'pro-lite', 'pro_lite']);

export const AUTH_FILE_PLAN_FILTERS = [
  'all',
  'premium',
  'free',
  'plus',
  'pro',
  'prolite',
  'team',
  'max',
  'unknown',
] as const;

export type AuthFilePlanFilter = (typeof AUTH_FILE_PLAN_FILTERS)[number];
export type AuthFilePlanType = Exclude<AuthFilePlanFilter, 'all' | 'premium'>;

const AUTH_FILE_PLAN_FILTER_SET = new Set<AuthFilePlanFilter>(AUTH_FILE_PLAN_FILTERS);

export const isAuthFilePlanFilter = (value: unknown): value is AuthFilePlanFilter =>
  typeof value === 'string' && AUTH_FILE_PLAN_FILTER_SET.has(value as AuthFilePlanFilter);

export type AuthFilePlanBadgeInfo = {
  kind: 'plus' | 'pro';
  labelKey: string;
};

export type AuthFilePlanSources = {
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
};

type CodexPlanSignal = {
  planType: string | null;
  subscriptionUntil: string | number | null;
};

const isCodexPremiumPlanType = (planType: string | null | undefined): planType is string =>
  Boolean(
    planType && (PLUS_CODEX_PLAN_TYPES.has(planType) || PREMIUM_CODEX_PLAN_TYPES.has(planType))
  );

const isFutureTimestamp = (value: unknown, nowMs = Date.now()) => {
  const timestampSec = normalizeUnixTimestampSeconds(value);
  return timestampSec !== null && timestampSec * 1000 > nowMs;
};

const isPastTimestamp = (value: unknown, nowMs = Date.now()) => {
  const timestampSec = normalizeUnixTimestampSeconds(value);
  return timestampSec !== null && timestampSec * 1000 <= nowMs;
};

const resolveActiveCodexPlanType = (
  signals: CodexPlanSignal[],
  nowMs = Date.now()
): string | null => {
  for (const signal of signals) {
    if (
      isCodexPremiumPlanType(signal.planType) &&
      isFutureTimestamp(signal.subscriptionUntil, nowMs)
    ) {
      return signal.planType;
    }
  }

  const hasExplicitNonPremiumOrExpiredSignal = signals.some((signal) => {
    if (!signal.planType) return false;
    if (!isCodexPremiumPlanType(signal.planType)) return true;
    return isPastTimestamp(signal.subscriptionUntil, nowMs);
  });
  if (hasExplicitNonPremiumOrExpiredSignal) {
    return null;
  }

  for (const signal of signals) {
    if (isCodexPremiumPlanType(signal.planType)) {
      return signal.planType;
    }
  }

  return null;
};

const resolveCachedPlanSnapshotBadge = (
  file: AuthFileItem
): AuthFilePlanBadgeInfo | null | undefined => {
  const snapshot = file.plan_snapshot ?? file.planSnapshot;
  if (!snapshot) return undefined;

  switch (snapshot.kind) {
    case 'plus':
      return { kind: 'plus', labelKey: 'codex_quota.plan_plus' };
    case 'pro':
      return { kind: 'pro', labelKey: 'codex_quota.plan_pro' };
    case 'prolite':
      return { kind: 'pro', labelKey: 'codex_quota.plan_prolite' };
    case 'none':
      return null;
    default:
      return undefined;
  }
};

export const resolveAuthFilePlanBadge = (
  file: AuthFileItem,
  sources: AuthFilePlanSources
): AuthFilePlanBadgeInfo | null => {
  const cachedPlanBadge = resolveCachedPlanSnapshotBadge(file);
  if (cachedPlanBadge !== undefined) return cachedPlanBadge;

  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? ''));

  if (providerKey === 'codex') {
    const filePlanType = normalizePlanType(resolveCodexPlanType(file));
    const quotaPlanType = normalizePlanType(sources.codexQuota[file.name]?.planType);
    const planType = resolveActiveCodexPlanType([
      {
        planType: filePlanType,
        subscriptionUntil: resolveCodexSubscriptionActiveUntil(file),
      },
      {
        planType: quotaPlanType,
        subscriptionUntil: sources.codexQuota[file.name]?.subscriptionUntil ?? null,
      },
    ]);
    if (PLUS_CODEX_PLAN_TYPES.has(planType ?? '')) {
      return { kind: 'plus', labelKey: 'codex_quota.plan_plus' };
    }
    if (PREMIUM_CODEX_PLAN_TYPES.has(planType ?? '')) {
      return {
        kind: 'pro',
        labelKey: planType === 'pro' ? 'codex_quota.plan_pro' : 'codex_quota.plan_prolite',
      };
    }
    return null;
  }

  if (providerKey === 'claude' && sources.claudeQuota[file.name]?.planType === 'plan_pro') {
    return { kind: 'pro', labelKey: 'claude_quota.plan_pro' };
  }

  return null;
};

export const hasPremiumAuthFilePlan = (file: AuthFileItem, sources: AuthFilePlanSources): boolean =>
  resolveAuthFilePlanBadge(file, sources) !== null;

const normalizeAuthFilePlanType = (value: unknown): AuthFilePlanType => {
  const planType = normalizePlanType(value)?.replace(/^plan_/, '');
  if (!planType) return 'unknown';
  if (planType === 'k12') return 'plus';
  if (planType === 'pro-lite' || planType === 'pro_lite') return 'prolite';
  if (planType === 'max5' || planType === 'max20') return 'max';
  if (['free', 'plus', 'pro', 'prolite', 'team', 'max'].includes(planType)) {
    return planType as AuthFilePlanType;
  }
  return 'unknown';
};

export const resolveAuthFilePlanType = (
  file: AuthFileItem,
  sources: AuthFilePlanSources
): AuthFilePlanType => {
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
  const quotaPlanType =
    providerKey === 'claude'
      ? sources.claudeQuota[file.name]?.planType
      : sources.codexQuota[file.name]?.planType;
  const quotaResolved = normalizeAuthFilePlanType(quotaPlanType);
  if (quotaResolved !== 'unknown') return quotaResolved;

  const fileResolved = normalizeAuthFilePlanType(resolveCodexPlanType(file));
  if (fileResolved !== 'unknown') return fileResolved;

  const snapshot = file.plan_snapshot ?? file.planSnapshot;
  return snapshot?.kind === 'plus' || snapshot?.kind === 'pro' || snapshot?.kind === 'prolite'
    ? snapshot.kind
    : 'unknown';
};

export const matchesAuthFilePlanFilter = (
  file: AuthFileItem,
  filter: AuthFilePlanFilter,
  sources: AuthFilePlanSources
): boolean => {
  if (filter === 'all') return true;
  if (filter === 'premium') return hasPremiumAuthFilePlan(file, sources);
  return resolveAuthFilePlanType(file, sources) === filter;
};
