import { apiClient, type ApiRequestConfig } from './client';

const DEROUTER_TIMEOUT_MS = 20 * 1000;

export interface DeRouterAccount extends Record<string, unknown> {
  id: string;
  displayName?: string;
  email?: string;
  status?: string;
  plan?: string;
  banned?: boolean;
  expired?: boolean;
  totalTasks?: number;
}

export interface DeRouterContainer extends Record<string, unknown> {
  id: string;
  displayName?: string;
  status?: string;
  authMode?: string;
  proxyRegion?: string;
  reputation?: number;
  maxAccounts?: number;
  accountCount?: number;
  totalTasks?: number;
  createdAt?: string;
  updatedAt?: string;
  accounts: DeRouterAccount[];
}

export interface DeRouterEarnings extends Record<string, unknown> {
  today: number;
  todayTasks: number;
  week: number;
  weekTasks: number;
  allTime: number;
  allTimeTasks: number;
  requestsAll: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  return text || undefined;
};

const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toNumber = (value: unknown): number => toOptionalNumber(value) ?? 0;

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const readValue = (record: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

const extractList = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of ['containers', 'items', 'results', 'data']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
      const nested = extractList(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
};

const normalizeAccount = (value: unknown, index: number): DeRouterAccount | null => {
  if (!isRecord(value)) return null;
  const id =
    toOptionalString(readValue(value, 'id', 'account_id', 'accountId', 'uuid')) ??
    `account-${index + 1}`;

  return {
    ...value,
    id,
    displayName: toOptionalString(readValue(value, 'displayName', 'display_name', 'name')),
    email: toOptionalString(readValue(value, 'email', 'account_email', 'accountEmail')),
    status: toOptionalString(readValue(value, 'status', 'state')),
    plan: toOptionalString(readValue(value, 'plan', 'subscription', 'tier')),
    banned: toOptionalBoolean(readValue(value, 'banned', 'is_banned', 'isBanned')),
    expired: toOptionalBoolean(readValue(value, 'expired', 'is_expired', 'isExpired')),
    totalTasks: toOptionalNumber(
      readValue(value, 'totalTasks', 'total_tasks', 'tasks', 'requests')
    ),
  };
};

const normalizeContainer = (value: unknown, index: number): DeRouterContainer | null => {
  if (!isRecord(value)) return null;
  const accountsValue = readValue(value, 'accounts', 'members', 'credentials');
  const accounts = (Array.isArray(accountsValue) ? accountsValue : [])
    .map(normalizeAccount)
    .filter((account): account is DeRouterAccount => Boolean(account));
  const id =
    toOptionalString(readValue(value, 'id', 'container_id', 'containerId', 'uuid')) ??
    `container-${index + 1}`;

  return {
    ...value,
    id,
    displayName: toOptionalString(readValue(value, 'displayName', 'display_name', 'name')),
    status: toOptionalString(readValue(value, 'status', 'state')),
    authMode: toOptionalString(readValue(value, 'authMode', 'auth_mode', 'type')),
    proxyRegion: toOptionalString(readValue(value, 'proxyRegion', 'proxy_region', 'region')),
    reputation: toOptionalNumber(readValue(value, 'reputation', 'score')),
    maxAccounts: toOptionalNumber(readValue(value, 'maxAccounts', 'max_accounts')),
    accountCount:
      toOptionalNumber(readValue(value, 'accountCount', 'account_count')) ?? accounts.length,
    totalTasks: toOptionalNumber(
      readValue(value, 'totalTasks', 'total_tasks', 'tasks', 'requests')
    ),
    createdAt: toOptionalString(readValue(value, 'createdAt', 'created_at')),
    updatedAt: toOptionalString(readValue(value, 'updatedAt', 'updated_at')),
    accounts,
  };
};

const extractRecord = (payload: unknown): Record<string, unknown> => {
  if (!isRecord(payload)) return {};
  for (const key of ['earnings', 'summary', 'data', 'result']) {
    if (isRecord(payload[key])) return payload[key] as Record<string, unknown>;
  }
  return payload;
};

const normalizeEarnings = (payload: unknown): DeRouterEarnings => {
  const value = extractRecord(payload);
  const allTimeTasks = toNumber(readValue(value, 'allTimeTasks', 'all_time_tasks'));

  return {
    ...value,
    today: toNumber(readValue(value, 'today', 'today_earnings', 'daily')),
    todayTasks: toNumber(readValue(value, 'todayTasks', 'today_tasks')),
    week: toNumber(readValue(value, 'week', 'week_earnings', 'weekly')),
    weekTasks: toNumber(readValue(value, 'weekTasks', 'week_tasks')),
    allTime: toNumber(readValue(value, 'allTime', 'all_time', 'total', 'total_earnings')),
    allTimeTasks,
    requestsAll: toNumber(
      readValue(value, 'requestsAll', 'requests_all', 'total_requests') ?? allTimeTasks
    ),
  };
};

export const derouterApi = {
  async getContainers(config: ApiRequestConfig = {}): Promise<DeRouterContainer[]> {
    const payload = await apiClient.get<unknown>('/derouter/containers', {
      ...config,
      timeout: config.timeout ?? DEROUTER_TIMEOUT_MS,
      // Upstream authorization errors belong to this data source, not the
      // management session. Keep them local to this page instead of logging out.
      skipUnauthorizedLogout: true,
    });
    return extractList(payload)
      .map(normalizeContainer)
      .filter((container): container is DeRouterContainer => Boolean(container));
  },

  async getEarnings(config: ApiRequestConfig = {}): Promise<DeRouterEarnings> {
    const payload = await apiClient.get<unknown>('/derouter/earnings', {
      ...config,
      timeout: config.timeout ?? DEROUTER_TIMEOUT_MS,
      skipUnauthorizedLogout: true,
    });
    return normalizeEarnings(payload);
  },
};
