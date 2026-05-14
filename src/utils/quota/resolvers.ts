/**
 * Resolver functions for extracting data from auth files.
 */

import type { AuthFileItem } from '@/types';
import {
  normalizeStringValue,
  normalizePlanType,
  parseIdTokenPayload
} from './parsers';

const OPENAI_AUTH_CLAIM = 'https://api.openai.com/auth';

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const resolveOpenAiAuthClaim = (payload: Record<string, unknown> | null): Record<string, unknown> | null =>
  asRecord(payload?.[OPENAI_AUTH_CLAIM]);

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

  const candidates = [
    file.account,
    file['account'],
    metadata?.account,
    attributes?.account
  ];

  for (const candidate of candidates) {
    const projectId = extractGeminiCliProjectId(candidate);
    if (projectId) return projectId;
  }

  return null;
}
