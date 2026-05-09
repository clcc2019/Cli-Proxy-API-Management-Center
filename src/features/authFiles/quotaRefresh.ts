import type { TFunction } from 'i18next';
import {
  ANTIGRAVITY_CONFIG,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GEMINI_CLI_CONFIG,
  KIRO_CONFIG,
  KIMI_CONFIG,
} from '@/components/quota';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import {
  isRuntimeOnlyAuthFile,
  type QuotaProviderType,
} from '@/features/authFiles/constants';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

type AuthFileQuotaConfig = {
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  buildLoadingState: () => unknown;
  buildSuccessState: (data: unknown) => unknown;
  buildErrorState: (message: string, status?: number) => unknown;
  renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
};

export type AuthFileQuotaRefreshResult =
  | { status: 'success'; fileName: string }
  | { status: 'skipped'; fileName: string }
  | { status: 'error'; fileName: string; message: string; errorStatus?: number };

export const getAuthFileQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'antigravity') return ANTIGRAVITY_CONFIG;
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  if (type === 'kiro') return KIRO_CONFIG;
  if (type === 'kimi') return KIMI_CONFIG;
  return GEMINI_CLI_CONFIG;
};

const getTypedQuotaConfig = (type: QuotaProviderType) =>
  getAuthFileQuotaConfig(type) as unknown as AuthFileQuotaConfig;

const getQuotaEntry = (quotaType: QuotaProviderType, fileName: string): QuotaState => {
  const state = useQuotaStore.getState();
  if (quotaType === 'antigravity') return state.antigravityQuota[fileName] as QuotaState;
  if (quotaType === 'claude') return state.claudeQuota[fileName] as QuotaState;
  if (quotaType === 'codex') return state.codexQuota[fileName] as QuotaState;
  if (quotaType === 'kiro') return state.kiroQuota[fileName] as QuotaState;
  if (quotaType === 'kimi') return state.kimiQuota[fileName] as QuotaState;
  return state.geminiCliQuota[fileName] as QuotaState;
};

const getQuotaStateUpdater = (quotaType: QuotaProviderType) => {
  const state = useQuotaStore.getState();
  if (quotaType === 'antigravity') {
    return state.setAntigravityQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'claude') {
    return state.setClaudeQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'codex') {
    return state.setCodexQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'kimi') {
    return state.setKimiQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'kiro') {
    return state.setKiroQuota as unknown as (updater: unknown) => void;
  }
  return state.setGeminiCliQuota as unknown as (updater: unknown) => void;
};

export async function refreshAuthFileQuota(options: {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  t: TFunction;
}): Promise<AuthFileQuotaRefreshResult> {
  const { file, quotaType, disableControls, t } = options;
  const fileName = file.name;

  if (disableControls) return { status: 'skipped', fileName };
  if (isRuntimeOnlyAuthFile(file)) return { status: 'skipped', fileName };
  if (file.disabled) return { status: 'skipped', fileName };
  if (getQuotaEntry(quotaType, fileName)?.status === 'loading') {
    return { status: 'skipped', fileName };
  }

  const config = getTypedQuotaConfig(quotaType);
  const updateQuotaState = getQuotaStateUpdater(quotaType);

  updateQuotaState((prev: Record<string, unknown>) => {
    const previousEntry = prev[fileName];
    const loadingState = config.buildLoadingState();
    const nextEntry =
      previousEntry && typeof previousEntry === 'object'
        ? {
            ...(loadingState as Record<string, unknown>),
            ...(previousEntry as Record<string, unknown>),
            status: 'loading',
          }
        : loadingState;

    return {
      ...prev,
      [fileName]: nextEntry,
    };
  });

  try {
    const data = await config.fetchQuota(file, t);
    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [fileName]: config.buildSuccessState(data),
    }));
    return { status: 'success', fileName };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    const errorStatus = getStatusFromError(err);
    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [fileName]: config.buildErrorState(message, errorStatus),
    }));
    return { status: 'error', fileName, message, errorStatus };
  }
}
