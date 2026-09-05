import type { TFunction } from 'i18next';
import { create } from 'zustand';
import { CLAUDE_CONFIG, CODEX_CONFIG, KIMI_CONFIG } from '@/components/quota';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem, CodexCreditsSnapshot } from '@/types';
import { getStatusFromError, isRuntimeOnlyAuthFile, type QuotaProviderType } from '@/utils/quota';
import { REFRESH_FEEDBACK_MS } from '@/utils/refreshFeedback';

export type AuthFileQuotaState = {
  status?: string;
  error?: string;
  errorStatus?: number;
  __hasCachedQuotaSnapshot?: boolean;
  credits?: CodexCreditsSnapshot | null;
};

type AuthFileQuotaConfig = {
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  buildLoadingState: () => AuthFileQuotaState;
  buildSuccessState: (data: unknown) => AuthFileQuotaState;
  mergeSuccessState?: (
    previous: AuthFileQuotaState | undefined,
    next: AuthFileQuotaState
  ) => AuthFileQuotaState;
  buildErrorState: (message: string, status?: number) => AuthFileQuotaState;
  extractAuthFileUpdate?: (data: unknown) => AuthFileItem | null;
  renderQuotaItems: (quota: AuthFileQuotaState, t: TFunction, helpers: unknown) => unknown;
};

export type AuthFileQuotaRefreshResult =
  | { status: 'success'; fileName: string; authFile?: AuthFileItem }
  | { status: 'skipped'; fileName: string }
  | { status: 'error'; fileName: string; message: string; errorStatus?: number };

export type AuthFileQuotaRefreshTarget = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
};

export type AuthFileQuotaRefreshSummary = {
  success: number;
  failed: number;
  skipped: number;
  authFiles: AuthFileItem[];
};

export type AuthFileQuotaRefreshProgress = {
  completed: number;
  total: number;
  success: number;
  failed: number;
  skipped: number;
};

type AuthFileQuotaMap = Record<string, AuthFileQuotaState>;
type AuthFileQuotaUpdater = (updater: (previous: AuthFileQuotaMap) => AuthFileQuotaMap) => void;

const AUTH_FILE_QUOTA_REFRESH_CONCURRENCY = 4;

type QuotaRefreshActivityState = {
  activeKeys: ReadonlySet<string>;
};

type QuotaRefreshActivity = {
  finish: () => void;
};

const useQuotaRefreshActivityStore = create<QuotaRefreshActivityState>(() => ({
  activeKeys: new Set(),
}));

const getActivityKey = (quotaType: QuotaProviderType, fileName: string) =>
  `${quotaType}\u0000${fileName}`;

const stopActivity = (key: string) => {
  const { activeKeys } = useQuotaRefreshActivityStore.getState();
  if (!activeKeys.has(key)) return;

  const next = new Set(activeKeys);
  next.delete(key);
  useQuotaRefreshActivityStore.setState({ activeKeys: next });
};

const beginQuotaRefreshActivity = (
  quotaType: QuotaProviderType,
  fileName: string
): QuotaRefreshActivity | null => {
  const key = getActivityKey(quotaType, fileName);
  const { activeKeys } = useQuotaRefreshActivityStore.getState();
  if (activeKeys.has(key)) return null;

  useQuotaRefreshActivityStore.setState({ activeKeys: new Set(activeKeys).add(key) });
  const startedAt = performance.now();
  let finished = false;

  return {
    finish: () => {
      if (finished) return;
      finished = true;
      const remaining = REFRESH_FEEDBACK_MS - (performance.now() - startedAt);
      if (remaining <= 0) {
        stopActivity(key);
        return;
      }
      window.setTimeout(() => stopActivity(key), remaining);
    },
  };
};

export const useAuthFileQuotaRefreshing = (
  quotaType: QuotaProviderType,
  fileName: string
): boolean => {
  const key = getActivityKey(quotaType, fileName);
  return useQuotaRefreshActivityStore((state) => state.activeKeys.has(key));
};

export const getAuthFileQuotaConfig = (type: QuotaProviderType): AuthFileQuotaConfig => {
  const config = type === 'claude' ? CLAUDE_CONFIG : type === 'codex' ? CODEX_CONFIG : KIMI_CONFIG;
  return config as unknown as AuthFileQuotaConfig;
};

const getQuotaStoreUpdater = (quotaType: QuotaProviderType): AuthFileQuotaUpdater => {
  const state = useQuotaStore.getState();
  if (quotaType === 'claude') {
    return state.setClaudeQuota as unknown as AuthFileQuotaUpdater;
  }
  if (quotaType === 'codex') {
    return state.setCodexQuota as unknown as AuthFileQuotaUpdater;
  }
  return state.setKimiQuota as unknown as AuthFileQuotaUpdater;
};

const setLoadingQuota = (
  update: AuthFileQuotaUpdater,
  fileName: string,
  config: AuthFileQuotaConfig
) => {
  update((previous) => {
    const cached = previous[fileName];
    return {
      ...previous,
      [fileName]: cached
        ? {
            ...config.buildLoadingState(),
            ...cached,
            status: 'loading',
            __hasCachedQuotaSnapshot: cached.status === 'success',
          }
        : config.buildLoadingState(),
    };
  });
};

export async function refreshAuthFileQuota(options: {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  t: TFunction;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
}): Promise<AuthFileQuotaRefreshResult> {
  const { file, quotaType, disableControls, t, onAuthFileUpdated } = options;
  const fileName = file.name;

  if (disableControls || file.disabled || isRuntimeOnlyAuthFile(file)) {
    return { status: 'skipped', fileName };
  }

  const config = getAuthFileQuotaConfig(quotaType);
  const update = getQuotaStoreUpdater(quotaType);
  const activity = beginQuotaRefreshActivity(quotaType, fileName);
  if (!activity) return { status: 'skipped', fileName };

  try {
    setLoadingQuota(update, fileName, config);
    const data = await config.fetchQuota(file, t);
    const authFile = config.extractAuthFileUpdate?.(data) ?? null;
    update((previous) => {
      const next = config.buildSuccessState(data);
      return {
        ...previous,
        [fileName]: config.mergeSuccessState?.(previous[fileName], next) ?? next,
      };
    });
    if (authFile) onAuthFileUpdated?.(authFile);
    return authFile ? { status: 'success', fileName, authFile } : { status: 'success', fileName };
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.unknown_error');
    const errorStatus = getStatusFromError(error);
    update((previous) => ({
      ...previous,
      [fileName]: config.buildErrorState(message, errorStatus),
    }));
    return { status: 'error', fileName, message, errorStatus };
  } finally {
    activity.finish();
  }
}

export async function refreshAuthFileQuotasInParallel(options: {
  targets: readonly AuthFileQuotaRefreshTarget[];
  disableControls: boolean;
  t: TFunction;
  initialSkipped?: number;
  shouldContinue?: () => boolean;
  onProgress?: (progress: AuthFileQuotaRefreshProgress) => void;
}): Promise<AuthFileQuotaRefreshSummary> {
  const { targets, disableControls, t, initialSkipped = 0, shouldContinue, onProgress } = options;
  const summary: AuthFileQuotaRefreshSummary = {
    success: 0,
    failed: 0,
    skipped: Math.max(0, initialSkipped),
    authFiles: [],
  };
  const progress: AuthFileQuotaRefreshProgress = {
    completed: 0,
    total: targets.length,
    success: 0,
    failed: 0,
    skipped: 0,
  };
  let nextTarget = 0;

  const record = (result: AuthFileQuotaRefreshResult) => {
    progress.completed += 1;
    if (result.status === 'success') {
      summary.success += 1;
      progress.success += 1;
      if (result.authFile) summary.authFiles.push(result.authFile);
    } else if (result.status === 'error') {
      summary.failed += 1;
      progress.failed += 1;
    } else {
      summary.skipped += 1;
      progress.skipped += 1;
    }
    onProgress?.({ ...progress });
  };

  onProgress?.({ ...progress });
  const worker = async () => {
    while ((!shouldContinue || shouldContinue()) && nextTarget < targets.length) {
      const target = targets[nextTarget++];
      record(
        await refreshAuthFileQuota({
          file: target.file,
          quotaType: target.quotaType,
          disableControls,
          t,
        })
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(AUTH_FILE_QUOTA_REFRESH_CONCURRENCY, targets.length) }, worker)
  );
  return summary;
}
