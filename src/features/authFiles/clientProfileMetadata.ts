import type { AuthFileItem } from '@/types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasDisplayValue = (value: unknown): boolean => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.values(value).some(hasDisplayValue);
  return true;
};

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const normalizedHeaders = (value: unknown): Record<string, string> | null => {
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const header = key.trim();
    const text = readString(raw);
    if (header && text) out[header] = text;
  }
  return Object.keys(out).length ? out : null;
};

const fromExplicitProfile = (source: Record<string, unknown>): Record<string, unknown> | null => {
  const raw = source.client_profile ?? source.clientProfile;
  if (!isRecord(raw)) return null;
  return hasDisplayValue(raw) ? raw : null;
};

const fromAuthMetadata = (source: Record<string, unknown>): Record<string, unknown> | null => {
  const out: Record<string, unknown> = {};
  const pinned = source.codex_client_profile_pinned ?? source.codexClientProfilePinned;
  if (typeof pinned === 'boolean') out.pinned = pinned;

  const userAgent = readString(source.user_agent ?? source.userAgent ?? source['user-agent']);
  if (userAgent) out.user_agent = userAgent;

  const originator = readString(source.originator);
  if (originator) out.originator = originator;

  const headers = normalizedHeaders(source.headers);
  if (headers) out.headers = headers;

  return hasDisplayValue(out) ? out : null;
};

export const resolveAuthFileClientProfileMetadata = (
  file: AuthFileItem | Record<string, unknown> | null | undefined
): Record<string, unknown> | null => {
  if (!isRecord(file)) return null;
  return fromExplicitProfile(file) ?? fromAuthMetadata(file);
};

export const formatClientProfileJson = (metadata: Record<string, unknown> | null): string => {
  if (!metadata) return '';
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return '';
  }
};
