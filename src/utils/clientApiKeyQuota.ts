import type { ClientApiKeyQuota } from '@/types/config';

export type ClientApiKeyQuotaField = keyof ClientApiKeyQuota;

export const CLIENT_API_KEY_QUOTA_FIELDS = [
  {
    field: 'dailyCost',
    yamlKey: 'daily-cost',
    aliases: ['daily-cost', 'dailyCost', 'daily-usd', 'dailyUSD', 'daily-spend', 'dailySpend'],
  },
  {
    field: 'monthlyCost',
    yamlKey: 'monthly-cost',
    aliases: [
      'monthly-cost',
      'monthlyCost',
      'monthly-usd',
      'monthlyUSD',
      'monthly-spend',
      'monthlySpend',
    ],
  },
  {
    field: 'totalCost',
    yamlKey: 'total-cost',
    aliases: ['total-cost', 'totalCost', 'total-usd', 'totalUSD', 'total-spend', 'totalSpend'],
  },
] as const satisfies readonly {
  field: ClientApiKeyQuotaField;
  yamlKey: string;
  aliases: readonly string[];
}[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function normalizeQuotaLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed =
    typeof value === 'string' && value.trim() === '' ? NaN : Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function mergeQuotaLimit(base: number | undefined, extra: number | undefined): number | undefined {
  if (!base) return extra;
  if (!extra) return base;
  return Math.min(base, extra);
}

export function hasClientApiKeyQuota(quota?: ClientApiKeyQuota): boolean {
  return CLIENT_API_KEY_QUOTA_FIELDS.some(({ field }) => normalizeQuotaLimit(quota?.[field]));
}

export function normalizeClientApiKeyQuota(raw: unknown): ClientApiKeyQuota | undefined {
  if (!isRecord(raw)) return undefined;

  const quota: ClientApiKeyQuota = {};
  CLIENT_API_KEY_QUOTA_FIELDS.forEach(({ field, aliases }) => {
    for (const alias of aliases) {
      const limit = normalizeQuotaLimit(raw[alias]);
      if (limit) {
        quota[field] = limit;
        return;
      }
    }
  });

  return hasClientApiKeyQuota(quota) ? quota : undefined;
}

export function extractClientApiKeyQuota(
  record: Record<string, unknown>
): ClientApiKeyQuota | undefined {
  const nested = normalizeClientApiKeyQuota(record.quota);
  const flat = normalizeClientApiKeyQuota(record);
  const quota: ClientApiKeyQuota = {};

  CLIENT_API_KEY_QUOTA_FIELDS.forEach(({ field }) => {
    const merged = mergeQuotaLimit(nested?.[field], flat?.[field]);
    if (merged) quota[field] = merged;
  });

  return hasClientApiKeyQuota(quota) ? quota : undefined;
}

export function clientApiKeyQuotaLimitCount(quota?: ClientApiKeyQuota): number {
  return CLIENT_API_KEY_QUOTA_FIELDS.reduce(
    (count, { field }) => count + (normalizeQuotaLimit(quota?.[field]) ? 1 : 0),
    0
  );
}

export function serializeClientApiKeyQuota(
  quota?: ClientApiKeyQuota
): Record<string, number> | undefined {
  if (!hasClientApiKeyQuota(quota)) return undefined;

  const serialized: Record<string, number> = {};
  CLIENT_API_KEY_QUOTA_FIELDS.forEach(({ field, yamlKey }) => {
    const limit = normalizeQuotaLimit(quota?.[field]);
    if (limit) serialized[yamlKey] = limit;
  });

  return Object.keys(serialized).length ? serialized : undefined;
}
