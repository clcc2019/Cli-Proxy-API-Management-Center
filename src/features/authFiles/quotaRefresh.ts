import type { TFunction } from 'i18next';
import { CLAUDE_CONFIG, CODEX_CONFIG, KIMI_CONFIG } from '@/components/quota';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  getStatusFromError,
  isRuntimeOnlyAuthFile,
  type QuotaProviderType,
} from '@/utils/quota';

export type AuthFileQuotaState = {
  status?: string;
  error?: string;
  errorStatus?: number;
  __hasCachedQuotaSnapshot?: boolean;
};

const quotaRequestVersions = new Map<string, number>();
let nextQuotaRequestVersion = 0;
const MINIMUM_QUOTA_REFRESH_INDICATOR_MS = 220;
const AUTH_FILE_QUOTA_REFRESH_CONCURRENCY = 4;

const waitForMinimumIndicatorDuration = (startedAt: number) => {
  const remaining = MINIMUM_QUOTA_REFRESH_INDICATOR_MS - (Date.now() - startedAt);
  return remaining > 0
    ? new Promise<void>((resolve) => window.setTimeout(resolve, remaining))
    : Promise.resolve();
};

type AuthFileQuotaConfig = {
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  buildLoadingState: () => AuthFileQuotaState;
  buildSuccessState: (data: unknown) => AuthFileQuotaState;
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

export const getAuthFileQuotaConfig = (type: QuotaProviderType): AuthFileQuotaConfig => {
  const config = type === 'claude' ? CLAUDE_CONFIG : type === 'codex' ? CODEX_CONFIG : KIMI_CONFIG;
  return config as unknown as AuthFileQuotaConfig;
};

type AuthFileQuotaMap = Record<string, AuthFileQuotaState>;
type AuthFileQuotaUpdater = (updater: (previous: AuthFileQuotaMap) => AuthFileQuotaMap) => void;

const getQuotaStoreAccess = (quotaType: QuotaProviderType) => {
  const state = useQuotaStore.getState();
  if (quotaType === 'claude') {
    return {
      entries: state.claudeQuota as AuthFileQuotaMap,
      update: state.setClaudeQuota as unknown as AuthFileQuotaUpdater,
    };
  }
  if (quotaType === 'codex') {
    return {
      entries: state.codexQuota as AuthFileQuotaMap,
      update: state.setCodexQuota as unknown as AuthFileQuotaUpdater,
    };
  }
  return {
    entries: state.kimiQuota as AuthFileQuotaMap,
    update: state.setKimiQuota as unknown as AuthFileQuotaUpdater,
  };
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

  if (disableControls) return { status: 'skipped', fileName };
  if (isRuntimeOnlyAuthFile(file)) return { status: 'skipped', fileName };
  if (file.disabled) return { status: 'skipped', fileName };
  const { entries, update: updateQuotaState } = getQuotaStoreAccess(quotaType);
  if (entries[fileName]?.status === 'loading') {
    return { status: 'skipped', fileName };
  }

  const config = getAuthFileQuotaConfig(quotaType);
  const requestKey = `${quotaType}:${fileName}`;
  const requestVersion = ++nextQuotaRequestVersion;
  quotaRequestVersions.set(requestKey, requestVersion);
  const isLatestRequest = () => quotaRequestVersions.get(requestKey) === requestVersion;
  const indicatorStartedAt = Date.now();

  updateQuotaState((prev) => {
    const previousEntry = prev[fileName];
    const loadingState = config.buildLoadingState();
    const nextEntry = previousEntry
      ? {
          ...loadingState,
          ...previousEntry,
          status: 'loading',
          __hasCachedQuotaSnapshot: previousEntry.status === 'success',
        }
      : loadingState;

    return {
      ...prev,
      [fileName]: nextEntry,
    };
  });

  try {
    const data = await config.fetchQuota(file, t);
    await waitForMinimumIndicatorDuration(indicatorStartedAt);
    if (!isLatestRequest()) return { status: 'skipped', fileName };
    const authFile = config.extractAuthFileUpdate?.(data) ?? null;
    if (authFile) {
      onAuthFileUpdated?.(authFile);
    }
    updateQuotaState((prev) => ({
      ...prev,
      [fileName]: config.buildSuccessState(data),
    }));
    return authFile ? { status: 'success', fileName, authFile } : { status: 'success', fileName };
  } catch (err: unknown) {
    await waitForMinimumIndicatorDuration(indicatorStartedAt);
    if (!isLatestRequest()) return { status: 'skipped', fileName };
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    const errorStatus = getStatusFromError(err);
    updateQuotaState((prev) => ({
      ...prev,
      [fileName]: config.buildErrorState(message, errorStatus),
    }));
    return { status: 'error', fileName, message, errorStatus };
  } finally {
    if (isLatestRequest()) quotaRequestVersions.delete(requestKey);
  }
}

export async function refreshAuthFileQuotasInParallel(options: {
  targets: readonly AuthFileQuotaRefreshTarget[];
  disableControls: boolean;
  t: TFunction;
  initialSkipped?: number;
  shouldContinue?: () => boolean;
}): Promise<AuthFileQuotaRefreshSummary> {
  const { targets, disableControls, t, initialSkipped = 0, shouldContinue } = options;
  const summary: AuthFileQuotaRefreshSummary = {
    success: 0,
    failed: 0,
    skipped: Math.max(0, initialSkipped),
    authFiles: [],
  };

  let nextTargetIndex = 0;

  const takeNextTarget = (): AuthFileQuotaRefreshTarget | null => {
    if (shouldContinue && !shouldContinue()) return null;
    if (nextTargetIndex >= targets.length) return null;
    const target = targets[nextTargetIndex];
    nextTargetIndex += 1;
    return target;
  };

  const recordResult = (result: AuthFileQuotaRefreshResult) => {
    if (result.status === 'success') {
      summary.success += 1;
      if (result.authFile) summary.authFiles.push(result.authFile);
    } else if (result.status === 'error') {
      summary.failed += 1;
    } else {
      summary.skipped += 1;
    }
  };

  const workerCount = Math.min(AUTH_FILE_QUOTA_REFRESH_CONCURRENCY, targets.length);
  const workers = Array.from({ length: workerCount }, async () => {
    for (;;) {
      const target = takeNextTarget();
      if (!target) return;

      try {
        const result = await refreshAuthFileQuota({
          file: target.file,
          quotaType: target.quotaType,
          disableControls,
          t,
        });
        recordResult(result);
      } catch {
        // Keep the queue moving if an unexpected error escapes the per-file refresh path.
        summary.failed += 1;
      }
    }
  });

  await Promise.all(workers);

  return summary;
}
