import type { AuthFileItem, ClaudeQuotaState, CodexQuotaState } from '@/types';
import { normalizePlanType } from '@/utils/quota/parsers';
import { resolveCodexPlanType } from '@/utils/quota/resolvers';
import { normalizeProviderKey } from './constants';

const PREMIUM_CODEX_PLAN_TYPES = new Set(['pro', 'prolite', 'pro-lite', 'pro_lite']);
export type AuthFilePlanBadgeInfo = {
  kind: 'plus' | 'pro';
  labelKey: string;
  fallbackLabel: string;
};

export type AuthFilePlanSources = {
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
};

export const resolveAuthFilePlanBadge = (
  file: AuthFileItem,
  sources: AuthFilePlanSources
): AuthFilePlanBadgeInfo | null => {
  const providerKey = normalizeProviderKey(String(file.type ?? file.provider ?? ''));

  if (providerKey === 'codex') {
    const planType = normalizePlanType(
      sources.codexQuota[file.name]?.planType ?? resolveCodexPlanType(file)
    );
    if (planType === 'plus') {
      return { kind: 'plus', labelKey: 'codex_quota.plan_plus', fallbackLabel: 'Plus' };
    }
    if (PREMIUM_CODEX_PLAN_TYPES.has(planType ?? '')) {
      return {
        kind: 'pro',
        labelKey: planType === 'pro' ? 'codex_quota.plan_pro' : 'codex_quota.plan_prolite',
        fallbackLabel: 'Pro',
      };
    }
    return null;
  }

  if (providerKey === 'claude' && sources.claudeQuota[file.name]?.planType === 'plan_pro') {
    return { kind: 'pro', labelKey: 'claude_quota.plan_pro', fallbackLabel: 'Pro' };
  }

  return null;
};

export const hasPremiumAuthFilePlan = (
  file: AuthFileItem,
  sources: AuthFilePlanSources
): boolean => resolveAuthFilePlanBadge(file, sources) !== null;
