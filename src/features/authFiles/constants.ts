import type { TFunction } from 'i18next';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconIflow from '@/assets/icons/iflow.svg';
import iconKiro from '@/assets/icons/kiro.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import type { AuthFileItem } from '@/types';
import { hasAuthFileRequestStats, readAuthFileRequestStats } from '@/features/authFiles/stats';
import {
  normalizeAuthIndex,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type KeyStats,
  type KeyUsageBucket,
  type KeyUsageStats,
} from '@/utils/usage';

export type ThemeColors = { bg: string; text: string; border?: string };
export type TypeColorSet = { light: ThemeColors; dark?: ThemeColors };
export type ResolvedTheme = 'light' | 'dark';
export type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};
export type AuthFileIconAsset = string | { light: string; dark: string };

export type QuotaProviderType = 'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kiro' | 'kimi';

export const QUOTA_PROVIDER_TYPES = new Set<QuotaProviderType>([
  'antigravity',
  'claude',
  'codex',
  'gemini-cli',
  'kiro',
  'kimi',
]);

export const MIN_CARD_PAGE_SIZE = 3;
export const MAX_CARD_PAGE_SIZE = 30;
export const AUTH_FILE_REFRESH_WARNING_MS = 24 * 60 * 60 * 1000;

export const INTEGER_STRING_PATTERN = /^[+-]?\d+$/;
export const TRUTHY_TEXT_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
export const FALSY_TEXT_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

// 标签类型颜色配置 — 基于各提供商 Logo 品牌色调配，确保彼此不重复
// 优化策略：light 用更柔的"奶油色"底 + 高对比文字；dark 用低饱和度深色底 + 明亮品牌色文字
export const TYPE_COLORS: Record<string, TypeColorSet> = {
  // Qwen logo: 紫罗兰渐变 #6336E7 → #6F69F7
  qwen: {
    light: { bg: '#f1ebfe', text: '#5b2bd6' },
    dark: { bg: '#2c1c6e', text: '#c4b0ff' },
  },
  // Kimi logo: 亮蓝 #027AFF（K字 + 蓝色圆点）
  kimi: {
    light: { bg: '#e2ecff', text: '#1057c9' },
    dark: { bg: '#0d2f6b', text: '#85c0ff' },
  },
  // Gemini logo: 多色蓝 #3186FF（偏柔和的蓝）
  gemini: {
    light: { bg: '#e7f1fc', text: '#1769b0' },
    dark: { bg: '#0e3d7a', text: '#7cc1f7' },
  },
  // Gemini-CLI: 同 Gemini 图标，用更深的海军蓝区分
  'gemini-cli': {
    light: { bg: '#e6edff', text: '#1f4b97' },
    dark: { bg: '#1a3a66', text: '#b4c8ff' },
  },
  // AI Studio: 使用 Gemini 图标，中性灰标签
  aistudio: {
    light: { bg: '#eef0f3', text: '#3a4049' },
    dark: { bg: '#363b42', text: '#d6dae0' },
  },
  // Claude logo: 陶土橙 #D97757
  claude: {
    light: { bg: '#fbeadf', text: '#b8521e' },
    dark: { bg: '#522411', text: '#f0b48f' },
  },
  // Codex logo: 靛蓝渐变 #B1A7FF → #3941FF
  codex: {
    light: { bg: '#ece9ff', text: '#3c3fcc' },
    dark: { bg: '#231f7c', text: '#beb8ff' },
  },
  // Antigravity logo: 多色（主色 #3789F9 蓝 + #53A89A 青绿），用青色区分
  antigravity: {
    light: { bg: '#dff4f7', text: '#0a6a72' },
    dark: { bg: '#0d3f44', text: '#8de2eb' },
  },
  // iFlow logo: 品红紫渐变 #5C5CFF → #AE5CFF
  iflow: {
    light: { bg: '#f6e6fc', text: '#8a23c0' },
    dark: { bg: '#451176', text: '#dca8f5' },
  },
  // Kiro / Amazon Q: AWS 深蓝底 + 橙色强调
  kiro: {
    light: { bg: '#fff0d6', text: '#915400' },
    dark: { bg: '#352510', text: '#ffc26a' },
  },
  // xAI / Grok: 黑白品牌
  xai: {
    light: { bg: '#e9edf2', text: '#2b3540' },
    dark: { bg: '#252d38', text: '#d2dae3' },
  },
  // Vertex logo: Google 蓝 #4285F4
  vertex: {
    light: { bg: '#e4edfc', text: '#2c5db5' },
    dark: { bg: '#173873', text: '#92b8f9' },
  },
  empty: {
    light: { bg: '#f3f4f6', text: '#5b6573' },
    dark: { bg: '#3a3f47', text: '#c2c8d1' },
  },
  unknown: {
    light: { bg: '#f3f4f6', text: '#646b76', border: '1px dashed #b4bac3' },
    dark: { bg: '#363a42', text: '#a8aeb8', border: '1px dashed #5e6470' },
  },
};

export const AUTH_FILE_ICONS: Record<string, AuthFileIconAsset> = {
  antigravity: iconAntigravity,
  aistudio: iconGemini,
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
  'gemini-cli': iconGemini,
  iflow: iconIflow,
  kiro: iconKiro,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  qwen: iconQwen,
  xai: iconGrok,
  vertex: iconVertex,
};

export const clampCardPageSize = (value: number) =>
  Math.min(MAX_CARD_PAGE_SIZE, Math.max(MIN_CARD_PAGE_SIZE, Math.round(value)));

export const resolveQuotaErrorMessage = (
  t: TFunction,
  status: number | undefined,
  fallback: string
): string => {
  if (status === 404) return t('common.quota_update_required');
  if (status === 403) return t('common.quota_check_credential');
  return fallback;
};

export const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

export const getAuthFileStatusMessage = (file: AuthFileItem): string => {
  const raw = file['status_message'] ?? file.statusMessage;
  if (typeof raw === 'string') return raw.trim();
  if (raw == null) return '';
  return String(raw).trim();
};

export const hasAuthFileStatusMessage = (file: AuthFileItem): boolean =>
  getAuthFileStatusMessage(file).length > 0;

export const getTypeLabel = (t: TFunction, type: string): string => {
  const key = `auth_files.filter_${type}`;
  const translated = t(key);
  if (translated !== key) return translated;
  if (type.toLowerCase() === 'iflow') return 'iFlow';
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const getTypeColor = (type: string, resolvedTheme: ResolvedTheme): ThemeColors => {
  const set = TYPE_COLORS[type] || TYPE_COLORS.unknown;
  return resolvedTheme === 'dark' && set.dark ? set.dark : set.light;
};

export const getAuthFileIcon = (type: string, resolvedTheme: ResolvedTheme): string | null => {
  const iconEntry = AUTH_FILE_ICONS[normalizeProviderKey(type)];
  if (!iconEntry) return null;
  return typeof iconEntry === 'string'
    ? iconEntry
    : resolvedTheme === 'dark'
      ? iconEntry.dark
      : iconEntry.light;
};

export const parsePriorityValue = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : undefined;
  }

  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || !INTEGER_STRING_PATTERN.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

export const normalizeExcludedModels = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  value.forEach((entry) => {
    const model = String(entry ?? '')
      .trim()
      .toLowerCase();
    if (!model || seen.has(model)) return;
    seen.add(model);
    normalized.push(model);
  });

  return normalized.sort((a, b) => a.localeCompare(b));
};

export const parseExcludedModelsText = (value: string): string[] =>
  normalizeExcludedModels(value.split(/[\n,]+/));

export const parseDisableCoolingValue = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (TRUTHY_TEXT_VALUES.has(normalized)) return true;
  if (FALSY_TEXT_VALUES.has(normalized)) return false;
  return undefined;
};

export const readCodexAuthFileWebsockets = (value: Record<string, unknown>): boolean =>
  parseDisableCoolingValue(value.websockets ?? value.websocket) ?? false;

export const readCodexAuthFileServiceTierPassthrough = (value: Record<string, unknown>): boolean =>
  parseDisableCoolingValue(
    value.service_tier_passthrough ??
      value['service-tier-passthrough'] ??
      value.serviceTierPassthrough ??
      value.fast
  ) ?? false;

export const readAuthFileWebsockets = (file: AuthFileItem): boolean | null => {
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
  if (providerKey !== 'codex') return null;

  const rawValue = file.websockets ?? file['websockets'] ?? file.websocket ?? file['websocket'];
  return parseDisableCoolingValue(rawValue) ?? false;
};

export const readAuthFileServiceTierPassthrough = (file: AuthFileItem): boolean | null => {
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? ''));
  if (providerKey !== 'codex') return null;

  const rawValue =
    file.service_tier_passthrough ??
    file['service-tier-passthrough'] ??
    file.serviceTierPassthrough ??
    file.fast;
  return parseDisableCoolingValue(rawValue) ?? false;
};

export const applyCodexAuthFileWebsockets = (
  value: Record<string, unknown>,
  websockets: boolean
): Record<string, unknown> => {
  const next = { ...value };
  delete next.websocket;
  next.websockets = websockets;
  return next;
};

export const applyCodexAuthFileServiceTierPassthrough = (
  value: Record<string, unknown>,
  serviceTierPassthrough: boolean
): Record<string, unknown> => {
  const next = { ...value };
  delete next['service-tier-passthrough'];
  delete next.serviceTierPassthrough;
  delete next.fast;
  next.service_tier_passthrough = serviceTierPassthrough;
  return next;
};

export function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean {
  const raw = file['runtime_only'] ?? file.runtimeOnly;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}

type AuthFileMatchedBucket = { success: number; failure: number };

const hasAuthFileMatchData = (bucket: AuthFileMatchedBucket) =>
  bucket.success > 0 || bucket.failure > 0;

const resolveAuthFileBucket = <T extends AuthFileMatchedBucket>(
  file: AuthFileItem,
  stats: { bySource?: Record<string, T>; byAuthIndex?: Record<string, T> },
  defaultStats: T,
  hasMatchData: (bucket: T) => boolean = hasAuthFileMatchData
): T => {
  const rawFileName = file?.name || '';

  // 兼容 auth_index 和 authIndex 两种字段名（API 返回的是 auth_index）
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);

  // 尝试根据 authIndex 匹配
  if (authIndexKey && stats.byAuthIndex?.[authIndexKey]) {
    const fromAuthIndex = stats.byAuthIndex[authIndexKey];
    if (hasMatchData(fromAuthIndex)) {
      return fromAuthIndex;
    }
  }

  // 尝试根据 source (文件名) 匹配
  const fileNameId = rawFileName ? normalizeUsageSourceId(rawFileName) : '';
  if (fileNameId && stats.bySource?.[fileNameId]) {
    const fromName = stats.bySource[fileNameId];
    if (hasMatchData(fromName)) {
      return fromName;
    }
  }

  // 尝试去掉扩展名后匹配
  if (rawFileName) {
    const nameWithoutExt = rawFileName.replace(/\.[^/.]+$/, '');
    if (nameWithoutExt && nameWithoutExt !== rawFileName) {
      const nameWithoutExtId = normalizeUsageSourceId(nameWithoutExt);
      const fromNameWithoutExt = nameWithoutExtId ? stats.bySource?.[nameWithoutExtId] : undefined;
      if (fromNameWithoutExt && hasMatchData(fromNameWithoutExt)) {
        return fromNameWithoutExt;
      }
    }
  }

  return defaultStats;
};

export function resolveAuthFileStats(file: AuthFileItem, stats: KeyStats): KeyStatBucket {
  const matched = resolveAuthFileBucket(file, stats, { success: 0, failure: 0 });
  if (hasAuthFileMatchData(matched)) {
    return matched;
  }

  const listStats = readAuthFileRequestStats(file);
  return hasAuthFileRequestStats(listStats) ? listStats : matched;
}

export function resolveAuthFileUsageStats(
  file: AuthFileItem,
  stats: KeyUsageStats
): KeyUsageBucket {
  const matched = resolveAuthFileBucket(
    file,
    stats,
    {
      success: 0,
      failure: 0,
      totalTokens: 0,
      totalCost: 0,
      pricedRequests: 0,
    },
    (bucket) =>
      bucket.success > 0 ||
      bucket.failure > 0 ||
      bucket.totalTokens > 0
  );

  if (
    matched.success > 0 ||
    matched.failure > 0 ||
    matched.totalTokens > 0
  ) {
    return matched;
  }

  const listStats = readAuthFileRequestStats(file);
  return hasAuthFileRequestStats(listStats)
    ? { ...matched, success: listStats.success, failure: listStats.failure }
    : matched;
}

export const formatAuthFileDate = (raw: unknown): string => {
  if (!raw) return '-';
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

export const formatModified = (item: AuthFileItem): string => {
  return formatAuthFileDate(item['modtime'] ?? item.modified);
};

export const formatLastRefresh = (item: AuthFileItem): string => {
  return formatAuthFileDate(item['last_refresh'] ?? item.lastRefresh ?? item['last_refreshed_at']);
};

// 检查模型是否被 OAuth 排除
export const isModelExcluded = (
  modelId: string,
  providerType: string,
  excluded: Record<string, string[]>
): boolean => {
  const providerKey = normalizeProviderKey(providerType);
  const excludedModels = excluded[providerKey] || excluded[providerType] || [];
  return excludedModels.some((pattern) => {
    if (pattern.includes('*')) {
      // 支持通配符匹配：先转义正则特殊字符，再将 * 视为通配符
      const regexSafePattern = pattern
        .split('*')
        .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*');
      const regex = new RegExp(`^${regexSafePattern}$`, 'i');
      return regex.test(modelId);
    }
    return pattern.toLowerCase() === modelId.toLowerCase();
  });
};
