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

const readBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return null;
};

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

const readHeader = (headers: Record<string, string> | null, headerName: string): string | null => {
  if (!headers) return null;
  const direct = readString(headers[headerName]);
  if (direct) return direct;
  const match = Object.entries(headers).find(
    ([key]) => key.trim().toLowerCase() === headerName.toLowerCase()
  );
  return match ? readString(match[1]) : null;
};

const enrichClientProfileFromHeaders = (
  profile: Record<string, unknown>
): Record<string, unknown> => {
  const out = { ...profile };
  const headers = normalizedHeaders(out.headers);

  if (!readString(out.user_agent)) {
    const userAgent = readHeader(headers, 'User-Agent');
    if (userAgent) out.user_agent = userAgent;
  }
  if (!readString(out.originator)) {
    const originator = readHeader(headers, 'Originator');
    if (originator) out.originator = originator;
  }
  if (!readString(out.beta_features)) {
    const betaFeatures = readHeader(headers, 'X-Codex-Beta-Features');
    if (betaFeatures) out.beta_features = betaFeatures;
  }
  if (!readString(out.installation_id)) {
    const installationId = readHeader(headers, 'X-Codex-Installation-Id');
    if (installationId) out.installation_id = installationId;
  }
  if (readBoolean(out.include_timing_metrics) === null) {
    const includeTimingMetrics = readBoolean(
      readHeader(headers, 'x-responsesapi-include-timing-metrics')
    );
    if (includeTimingMetrics !== null) out.include_timing_metrics = includeTimingMetrics;
  }

  return out;
};

const fromExplicitProfile = (source: Record<string, unknown>): Record<string, unknown> | null => {
  const raw = source.client_profile ?? source.clientProfile;
  if (!isRecord(raw)) return null;
  const profile = enrichClientProfileFromHeaders(raw);
  return hasDisplayValue(profile) ? profile : null;
};

const fromAuthMetadata = (source: Record<string, unknown>): Record<string, unknown> | null => {
  const out: Record<string, unknown> = {};
  const headers = normalizedHeaders(source.headers);
  const pinned = source.codex_client_profile_pinned ?? source.codexClientProfilePinned;
  if (typeof pinned === 'boolean') out.pinned = pinned;

  const userAgent =
    readString(
      source.user_agent ?? source.userAgent ?? source['user-agent'] ?? source['header:User-Agent']
    ) ?? readHeader(headers, 'User-Agent');
  if (userAgent) out.user_agent = userAgent;

  const originator =
    readString(source.originator ?? source.Originator ?? source['header:Originator']) ??
    readHeader(headers, 'Originator');
  if (originator) out.originator = originator;

  const betaFeatures =
    readString(
      source.beta_features ??
        source.betaFeatures ??
        source['beta-features'] ??
        source['header:X-Codex-Beta-Features']
    ) ?? readHeader(headers, 'X-Codex-Beta-Features');
  if (betaFeatures) out.beta_features = betaFeatures;

  const installationId =
    readString(
      source.installation_id ??
        source.installationId ??
        source['installation-id'] ??
        source['header:X-Codex-Installation-Id']
    ) ?? readHeader(headers, 'X-Codex-Installation-Id');
  if (installationId) out.installation_id = installationId;

  const includeTimingMetrics =
    readBoolean(
      source.include_timing_metrics ??
        source.includeTimingMetrics ??
        source['include-timing-metrics'] ??
        source['header:x-responsesapi-include-timing-metrics']
    ) ?? readBoolean(readHeader(headers, 'x-responsesapi-include-timing-metrics'));
  if (includeTimingMetrics !== null) out.include_timing_metrics = includeTimingMetrics;

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
