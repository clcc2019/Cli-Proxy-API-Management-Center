/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import { normalizeStringValue, normalizePlanType, parseIdTokenPayload } from './parsers';

const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth';
const CODEX_SUBSCRIPTION_CONTAINER_KEYS = [
  'account',
  'entitlement',
  'subscription',
  'providerSpecificData',
] as const;
const CODEX_SUBSCRIPTION_UNTIL_KEYS = [
  'subscription_expires_at',
  'subscriptionExpiresAt',
  'chatgpt_subscription_active_until',
  'chatgptSubscriptionActiveUntil',
  'subscription_active_until',
  'subscriptionActiveUntil',
  'expires_at',
  'expiresAt',
  'current_period_end',
  'currentPeriodEnd',
  'period_end',
  'periodEnd',
] as const;
const CODEX_SUBSCRIPTION_ACTIVE_START_KEYS = [
  'chatgpt_subscription_active_start',
  'chatgptSubscriptionActiveStart',
  'subscription_active_start',
  'subscriptionActiveStart',
  'subscription_started_at',
  'subscriptionStartedAt',
  'subscription_start_date',
  'subscriptionStartDate',
  'current_period_start',
  'currentPeriodStart',
  'period_start',
  'periodStart',
  'started_at',
  'startedAt',
  'starts_at',
  'startsAt',
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const resolveOpenAiAuthClaim = (
  payload: Record<string, unknown> | null
): Record<string, unknown> | null => asRecord(payload?.[OPENAI_AUTH_CLAIM]);

const normalizeDateLikeValue = (value: unknown): string | number | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
};

const resolveDateLikeFromRecord = (
  record: Record<string, unknown> | null,
  keys: readonly string[]
): string | number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = normalizeDateLikeValue(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const resolveDateLikeFromRecords = (
  records: Array<Record<string, unknown> | null>,
  keys: readonly string[]
): string | number | null => {
  for (const record of records) {
    const direct = resolveDateLikeFromRecord(record, keys);
    if (direct !== null) return direct;

    for (const containerKey of CODEX_SUBSCRIPTION_CONTAINER_KEYS) {
      const nested = asRecord(record?.[containerKey]);
      const nestedValue = resolveDateLikeFromRecord(nested, keys);
      if (nestedValue !== null) return nestedValue;
    }
  }
  return null;
};

const normalizeNonNegativeInteger = (value: unknown): number | null => {
  const raw = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
};

const dateLikeToTimestampMs = (value: unknown): number | null => {
  const normalized = normalizeDateLikeValue(value);
  if (normalized === null) return null;
  if (typeof normalized === 'number') {
    const timestamp = normalized < 1_000_000_000_000 ? normalized * 1000 : normalized;
    return timestamp > 0 ? timestamp : null;
  }

  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    const timestamp = numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    return timestamp > 0 ? timestamp : null;
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : parsed;
};

const addMonthsClampedUtc = (date: Date, months: number): Date => {
  const monthIndex = date.getUTCMonth() + months;
  const target = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      monthIndex,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
};

const deriveCodexSubscriptionActiveStartFromUntil = (untilValue: unknown): string | null => {
  const untilMs = dateLikeToTimestampMs(untilValue);
  if (untilMs === null) return null;
  const until = new Date(untilMs);
  const start = addMonthsClampedUtc(until, -1);
  return start.getTime() < untilMs ? start.toISOString() : null;
};

export function calculateCodexSubscriptionActiveDays(
  startValue: unknown,
  nowMs = Date.now()
): number | null {
  const startMs = dateLikeToTimestampMs(startValue);
  if (startMs === null || !Number.isFinite(nowMs)) return null;
  if (startMs > nowMs) return 0;
  const elapsedMs = nowMs - startMs;
  const days = Math.ceil(elapsedMs / 86_400_000);
  return Math.max(1, days);
}

export function extractCodexChatgptAccountId(value: unknown): string | null {
  const payload = parseIdTokenPayload(value);
  if (!payload) return null;
  const authClaim = resolveOpenAiAuthClaim(payload);
  const candidates = [
    payload.chatgpt_account_id,
    payload.chatgptAccountId,
    payload.account_id,
    payload.accountId,
    authClaim?.chatgpt_account_id,
    authClaim?.chatgptAccountId,
    authClaim?.account_id,
    authClaim?.accountId,
  ];

  for (const candidate of candidates) {
    const accountId = normalizeStringValue(candidate);
    if (accountId) return accountId;
  }

  return null;
}

export function resolveCodexChatgptAccountId(file: AuthFileItem): string | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);

  const directCandidates = [
    file.account_id,
    file.accountId,
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file['account_id'],
    file['accountId'],
    metadata?.account_id,
    metadata?.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
  ];

  for (const candidate of directCandidates) {
    const accountId = normalizeStringValue(candidate);
    if (accountId) return accountId;
  }

  const candidates = [file.id_token, metadata?.id_token, attributes?.id_token];

  for (const candidate of candidates) {
    const id = extractCodexChatgptAccountId(candidate);
    if (id) return id;
  }

  return null;
}

export function resolveCodexPlanType(file: AuthFileItem): string | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const idToken = parseIdTokenPayload(file.id_token);
  const metadataIdToken = parseIdTokenPayload(metadata?.id_token);
  const attributesIdToken = parseIdTokenPayload(attributes?.id_token);
  const authClaim = resolveOpenAiAuthClaim(idToken);
  const metadataAuthClaim = resolveOpenAiAuthClaim(metadataIdToken);
  const attributesAuthClaim = resolveOpenAiAuthClaim(attributesIdToken);
  const candidates = [
    file.plan_type,
    file.planType,
    file['plan_type'],
    file['planType'],
    idToken?.plan_type,
    idToken?.planType,
    idToken?.chatgpt_plan_type,
    idToken?.chatgptPlanType,
    authClaim?.chatgpt_plan_type,
    authClaim?.chatgptPlanType,
    authClaim?.plan_type,
    authClaim?.planType,
    metadata?.plan_type,
    metadata?.planType,
    metadataIdToken?.plan_type,
    metadataIdToken?.planType,
    metadataIdToken?.chatgpt_plan_type,
    metadataIdToken?.chatgptPlanType,
    metadataAuthClaim?.chatgpt_plan_type,
    metadataAuthClaim?.chatgptPlanType,
    metadataAuthClaim?.plan_type,
    metadataAuthClaim?.planType,
    attributes?.plan_type,
    attributes?.planType,
    attributesIdToken?.plan_type,
    attributesIdToken?.planType,
    attributesIdToken?.chatgpt_plan_type,
    attributesIdToken?.chatgptPlanType,
    attributesAuthClaim?.chatgpt_plan_type,
    attributesAuthClaim?.chatgptPlanType,
    attributesAuthClaim?.plan_type,
    attributesAuthClaim?.planType,
  ];

  for (const candidate of candidates) {
    const planType = normalizePlanType(candidate);
    if (planType) return planType;
  }

  return null;
}

export function resolveCodexSubscriptionActiveUntil(file: AuthFileItem): string | number | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const idToken = parseIdTokenPayload(file.id_token);
  const metadataIdToken = parseIdTokenPayload(metadata?.id_token);
  const attributesIdToken = parseIdTokenPayload(attributes?.id_token);
  const authClaim = resolveOpenAiAuthClaim(idToken);
  const metadataAuthClaim = resolveOpenAiAuthClaim(metadataIdToken);
  const attributesAuthClaim = resolveOpenAiAuthClaim(attributesIdToken);
  const candidates = [
    file.subscription_expires_at,
    file.subscriptionExpiresAt,
    file['subscription_expires_at'],
    file['subscriptionExpiresAt'],
    file.chatgpt_subscription_active_until,
    file.chatgptSubscriptionActiveUntil,
    file['chatgpt_subscription_active_until'],
    file['chatgptSubscriptionActiveUntil'],
    idToken?.subscription_expires_at,
    idToken?.subscriptionExpiresAt,
    idToken?.chatgpt_subscription_active_until,
    idToken?.chatgptSubscriptionActiveUntil,
    authClaim?.subscription_expires_at,
    authClaim?.subscriptionExpiresAt,
    authClaim?.chatgpt_subscription_active_until,
    authClaim?.chatgptSubscriptionActiveUntil,
    metadata?.subscription_expires_at,
    metadata?.subscriptionExpiresAt,
    metadata?.chatgpt_subscription_active_until,
    metadata?.chatgptSubscriptionActiveUntil,
    metadataIdToken?.subscription_expires_at,
    metadataIdToken?.subscriptionExpiresAt,
    metadataIdToken?.chatgpt_subscription_active_until,
    metadataIdToken?.chatgptSubscriptionActiveUntil,
    metadataAuthClaim?.subscription_expires_at,
    metadataAuthClaim?.subscriptionExpiresAt,
    metadataAuthClaim?.chatgpt_subscription_active_until,
    metadataAuthClaim?.chatgptSubscriptionActiveUntil,
    attributes?.subscription_expires_at,
    attributes?.subscriptionExpiresAt,
    attributes?.chatgpt_subscription_active_until,
    attributes?.chatgptSubscriptionActiveUntil,
    attributesIdToken?.subscription_expires_at,
    attributesIdToken?.subscriptionExpiresAt,
    attributesIdToken?.chatgpt_subscription_active_until,
    attributesIdToken?.chatgptSubscriptionActiveUntil,
    attributesAuthClaim?.subscription_expires_at,
    attributesAuthClaim?.subscriptionExpiresAt,
    attributesAuthClaim?.chatgpt_subscription_active_until,
    attributesAuthClaim?.chatgptSubscriptionActiveUntil,
  ];

  for (const candidate of candidates) {
    const value = normalizeDateLikeValue(candidate);
    if (value !== null) return value;
  }

  const aliasedValue = resolveDateLikeFromRecords(
    [
      file as unknown as Record<string, unknown>,
      idToken,
      authClaim,
      metadata,
      metadataIdToken,
      metadataAuthClaim,
      attributes,
      attributesIdToken,
      attributesAuthClaim,
    ],
    CODEX_SUBSCRIPTION_UNTIL_KEYS
  );
  if (aliasedValue !== null) return aliasedValue;

  return null;
}

export function resolveCodexSubscriptionActiveStart(file: AuthFileItem): string | number | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const idToken = parseIdTokenPayload(file.id_token);
  const metadataIdToken = parseIdTokenPayload(metadata?.id_token);
  const attributesIdToken = parseIdTokenPayload(attributes?.id_token);
  const authClaim = resolveOpenAiAuthClaim(idToken);
  const metadataAuthClaim = resolveOpenAiAuthClaim(metadataIdToken);
  const attributesAuthClaim = resolveOpenAiAuthClaim(attributesIdToken);
  const candidates = [
    file.subscription_active_start,
    file.subscriptionActiveStart,
    file['subscription_active_start'],
    file['subscriptionActiveStart'],
    file.subscription_started_at,
    file.subscriptionStartedAt,
    file['subscription_started_at'],
    file['subscriptionStartedAt'],
    file.chatgpt_subscription_active_start,
    file.chatgptSubscriptionActiveStart,
    file['chatgpt_subscription_active_start'],
    file['chatgptSubscriptionActiveStart'],
    idToken?.subscription_active_start,
    idToken?.subscriptionActiveStart,
    idToken?.subscription_started_at,
    idToken?.subscriptionStartedAt,
    idToken?.chatgpt_subscription_active_start,
    idToken?.chatgptSubscriptionActiveStart,
    authClaim?.subscription_active_start,
    authClaim?.subscriptionActiveStart,
    authClaim?.subscription_started_at,
    authClaim?.subscriptionStartedAt,
    authClaim?.chatgpt_subscription_active_start,
    authClaim?.chatgptSubscriptionActiveStart,
    metadata?.subscription_active_start,
    metadata?.subscriptionActiveStart,
    metadata?.subscription_started_at,
    metadata?.subscriptionStartedAt,
    metadata?.chatgpt_subscription_active_start,
    metadata?.chatgptSubscriptionActiveStart,
    metadataIdToken?.subscription_active_start,
    metadataIdToken?.subscriptionActiveStart,
    metadataIdToken?.subscription_started_at,
    metadataIdToken?.subscriptionStartedAt,
    metadataIdToken?.chatgpt_subscription_active_start,
    metadataIdToken?.chatgptSubscriptionActiveStart,
    metadataAuthClaim?.subscription_active_start,
    metadataAuthClaim?.subscriptionActiveStart,
    metadataAuthClaim?.subscription_started_at,
    metadataAuthClaim?.subscriptionStartedAt,
    metadataAuthClaim?.chatgpt_subscription_active_start,
    metadataAuthClaim?.chatgptSubscriptionActiveStart,
    attributes?.subscription_active_start,
    attributes?.subscriptionActiveStart,
    attributes?.subscription_started_at,
    attributes?.subscriptionStartedAt,
    attributes?.chatgpt_subscription_active_start,
    attributes?.chatgptSubscriptionActiveStart,
    attributesIdToken?.subscription_active_start,
    attributesIdToken?.subscriptionActiveStart,
    attributesIdToken?.subscription_started_at,
    attributesIdToken?.subscriptionStartedAt,
    attributesIdToken?.chatgpt_subscription_active_start,
    attributesIdToken?.chatgptSubscriptionActiveStart,
    attributesAuthClaim?.subscription_active_start,
    attributesAuthClaim?.subscriptionActiveStart,
    attributesAuthClaim?.subscription_started_at,
    attributesAuthClaim?.subscriptionStartedAt,
    attributesAuthClaim?.chatgpt_subscription_active_start,
    attributesAuthClaim?.chatgptSubscriptionActiveStart,
  ];

  for (const candidate of candidates) {
    const value = normalizeDateLikeValue(candidate);
    if (value !== null) return value;
  }

  const aliasedValue = resolveDateLikeFromRecords(
    [
      file as unknown as Record<string, unknown>,
      idToken,
      authClaim,
      metadata,
      metadataIdToken,
      metadataAuthClaim,
      attributes,
      attributesIdToken,
      attributesAuthClaim,
    ],
    CODEX_SUBSCRIPTION_ACTIVE_START_KEYS
  );
  if (aliasedValue !== null) return aliasedValue;

  const derivedFromUntil = deriveCodexSubscriptionActiveStartFromUntil(
    resolveCodexSubscriptionActiveUntil(file)
  );
  if (derivedFromUntil !== null) return derivedFromUntil;

  return null;
}

export function resolveCodexSubscriptionActiveDays(file: AuthFileItem): number | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const directCandidates = [
    file.subscription_active_days,
    file.subscriptionActiveDays,
    file['subscription_active_days'],
    file['subscriptionActiveDays'],
    metadata?.subscription_active_days,
    metadata?.subscriptionActiveDays,
    attributes?.subscription_active_days,
    attributes?.subscriptionActiveDays,
  ];

  for (const candidate of directCandidates) {
    const days = normalizeNonNegativeInteger(candidate);
    if (days !== null) return days;
  }

  return calculateCodexSubscriptionActiveDays(resolveCodexSubscriptionActiveStart(file));
}

export function extractGeminiCliProjectId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const matches = Array.from(value.matchAll(/\(([^()]+)\)/g));
  if (matches.length === 0) return null;
  const candidate = matches[matches.length - 1]?.[1]?.trim();
  return candidate ? candidate : null;
}

export function resolveGeminiCliProjectId(file: AuthFileItem): string | null {
  const metadata =
    file && typeof file.metadata === 'object' && file.metadata !== null
      ? (file.metadata as Record<string, unknown>)
      : null;
  const attributes =
    file && typeof file.attributes === 'object' && file.attributes !== null
      ? (file.attributes as Record<string, unknown>)
      : null;

  const candidates = [file.account, file['account'], metadata?.account, attributes?.account];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
