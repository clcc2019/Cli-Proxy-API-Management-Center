/**
 * Normalization and parsing functions for quota data.
 */

import type { ClaudeUsagePayload, CodexUsagePayload, KimiUsagePayload } from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';
import { QUOTA_PROGRESS_HIGH_THRESHOLD, QUOTA_PROGRESS_MEDIUM_THRESHOLD } from './constants';

export { normalizeAuthIndex };

export function normalizeStringValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }
  return null;
}

export function normalizeNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Normalize unix timestamps (seconds/ms/µs/ns) or ISO strings to epoch seconds. */
export function normalizeUnixTimestampSeconds(value: unknown): number | null {
  const numeric = normalizeNumberValue(value);
  if (numeric !== null && numeric > 0) {
    const abs = Math.abs(numeric);
    if (abs < 1e11) return Math.floor(numeric);
    if (abs < 1e14) return Math.floor(numeric / 1000);
    if (abs < 1e17) return Math.floor(numeric / 1e6);
    return Math.floor(numeric / 1e9);
  }
  const text = normalizeStringValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

export function normalizeQuotaFraction(value: unknown): number | null {
  const normalized = normalizeNumberValue(value);
  if (normalized !== null) return normalized;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith('%')) {
      const parsed = Number(trimmed.slice(0, -1));
      return Number.isFinite(parsed) ? parsed / 100 : null;
    }
  }
  return null;
}

export type QuotaProgressLevel = 'high' | 'medium' | 'low' | 'unknown';

export function normalizeQuotaProgressPercent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

export function getQuotaProgressLevel(
  percent: number | null,
  highThreshold = QUOTA_PROGRESS_HIGH_THRESHOLD,
  mediumThreshold = QUOTA_PROGRESS_MEDIUM_THRESHOLD
): QuotaProgressLevel {
  const normalized = normalizeQuotaProgressPercent(percent);
  if (normalized === null) return 'unknown';
  if (normalized >= highThreshold) return 'high';
  if (normalized >= mediumThreshold) return 'medium';
  return 'low';
}

export function normalizePlanType(value: unknown): string | null {
  const normalized = normalizeStringValue(value);
  return normalized ? normalized.toLowerCase() : null;
}

export function decodeBase64UrlPayload(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(padded);
    }
    if (typeof atob === 'function') {
      return atob(padded);
    }
  } catch {
    return null;
  }
  return null;
}

const ID_TOKEN_PAYLOAD_CACHE_LIMIT = 500;
const idTokenPayloadCache = new Map<string, Record<string, unknown> | null>();

const cacheIdTokenPayload = (key: string, value: Record<string, unknown> | null) => {
  if (idTokenPayloadCache.size >= ID_TOKEN_PAYLOAD_CACHE_LIMIT) {
    const firstKey = idTokenPayloadCache.keys().next().value;
    if (firstKey !== undefined) {
      idTokenPayloadCache.delete(firstKey);
    }
  }
  idTokenPayloadCache.set(key, value);
  return value;
};

export function parseIdTokenPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') {
    return Array.isArray(value) ? null : (value as Record<string, unknown>);
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (idTokenPayloadCache.has(trimmed)) {
    return idTokenPayloadCache.get(trimmed) ?? null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return cacheIdTokenPayload(trimmed, parsed);
  } catch {
    // Continue to JWT parsing
  }
  const segments = trimmed.split('.');
  if (segments.length < 2) return cacheIdTokenPayload(trimmed, null);
  const decoded = decodeBase64UrlPayload(segments[1]);
  if (!decoded) return cacheIdTokenPayload(trimmed, null);
  try {
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') return cacheIdTokenPayload(trimmed, parsed);
  } catch {
    return cacheIdTokenPayload(trimmed, null);
  }
  return cacheIdTokenPayload(trimmed, null);
}

export function parseClaudeUsagePayload(payload: unknown): ClaudeUsagePayload | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as ClaudeUsagePayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as ClaudeUsagePayload;
  }
  return null;
}

export function parseCodexUsagePayload(payload: unknown): CodexUsagePayload | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as CodexUsagePayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as CodexUsagePayload;
  }
  return null;
}

export function parseKimiUsagePayload(payload: unknown): KimiUsagePayload | null {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as KimiUsagePayload;
    } catch {
      return null;
    }
  }
  if (typeof payload === 'object') {
    return payload as KimiUsagePayload;
  }
  return null;
}
