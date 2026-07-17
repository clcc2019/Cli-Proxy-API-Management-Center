import type { TFunction } from 'i18next';
import { CLAUDE_CONFIG, CODEX_CONFIG, KIMI_CONFIG } from '@/components/quota';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { getStatusFromError } from '@/utils/quota';
import { isRuntimeOnlyAuthFile, type QuotaProviderType } from '@/features/authFiles/constants';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

const quotaRequestVersions = new Map<string, number>();
let nextQuotaRequestVersion = 0;
const CODEX_REFRESH_SETTLE_DELAY_MS = 400;
const AUTH_FILE_QUOTA_REFRESH_CONCURRENCY = 4;

const waitForQuotaRefreshSettle = () =>
  new Promise<void>((resolve) => window.setTimeout(resolve, CODEX_REFRESH_SETTLE_DELAY_MS));

type ComparableQuotaWindow = { id?: string; usedPercent?: number | null };
type ComparableCodexQuotaData = { windows?: ComparableQuotaWindow[] };

const stabilizeCodexQuotaData = (first: unknown, confirmation: unknown): unknown => {
  if (!first || typeof first !== 'object' || !confirmation || typeof confirmation !== 'object') {
    return confirmation;
  }

  const firstData = first as ComparableCodexQuotaData;
  const confirmationData = confirmation as ComparableCodexQuotaData;
  if (!Array.isArray(firstData.windows) || !Array.isArray(confirmationData.windows)) {
    return confirmation;
  }

  const firstWindows = new Map(
    firstData.windows.filter((window) => window.id).map((window) => [window.id as string, window])
  );
  const windows = confirmationData.windows.map((window) => {
    const previous = window.id ? firstWindows.get(window.id) : undefined;
    const previousUsed = previous?.usedPercent;
    const confirmationUsed = window.usedPercent;
    return typeof previousUsed === 'number' &&
      typeof confirmationUsed === 'number' &&
      previousUsed > confirmationUsed
      ? previous
      : window;
  });

  return { ...(confirmation as Record<string, unknown>), windows };
};

type AuthFileQuotaConfig = {
  i18nPrefix: string;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<unknown>;
  buildLoadingState: () => unknown;
  buildSuccessState: (data: unknown) => unknown;
  buildErrorState: (message: string, status?: number) => unknown;
  extractAuthFileUpdate?: (data: unknown) => AuthFileItem | null;
  renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
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

export const getAuthFileQuotaConfig = (type: QuotaProviderType) => {
  if (type === 'claude') return CLAUDE_CONFIG;
  if (type === 'codex') return CODEX_CONFIG;
  return KIMI_CONFIG;
};

const getTypedQuotaConfig = (type: QuotaProviderType) =>
  getAuthFileQuotaConfig(type) as unknown as AuthFileQuotaConfig;

const getQuotaEntry = (quotaType: QuotaProviderType, fileName: string): QuotaState => {
  const state = useQuotaStore.getState();
  if (quotaType === 'claude') return state.claudeQuota[fileName] as QuotaState;
  if (quotaType === 'codex') return state.codexQuota[fileName] as QuotaState;
  return state.kimiQuota[fileName] as QuotaState;
};

const getQuotaStateUpdater = (quotaType: QuotaProviderType) => {
  const state = useQuotaStore.getState();
  if (quotaType === 'claude') {
    return state.setClaudeQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'codex') {
    return state.setCodexQuota as unknown as (updater: unknown) => void;
  }
  if (quotaType === 'kimi') {
    return state.setKimiQuota as unknown as (updater: unknown) => void;
  }
  return state.setKimiQuota as unknown as (updater: unknown) => void;
};

export async function refreshAuthFileQuota(options: {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  t: TFunction;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
  stabilizeCodexRefresh?: boolean;
}): Promise<AuthFileQuotaRefreshResult> {
  const {
    file,
    quotaType,
    disableControls,
    t,
    onAuthFileUpdated,
    stabilizeCodexRefresh = false,
  } = options;
  const fileName = file.name;

  if (disableControls) return { status: 'skipped', fileName };
  if (isRuntimeOnlyAuthFile(file)) return { status: 'skipped', fileName };
  if (file.disabled) return { status: 'skipped', fileName };
  if (getQuotaEntry(quotaType, fileName)?.status === 'loading') {
    return { status: 'skipped', fileName };
  }

  const config = getTypedQuotaConfig(quotaType);
  const updateQuotaState = getQuotaStateUpdater(quotaType);
  const requestKey = `${quotaType}:${fileName}`;
  const requestVersion = ++nextQuotaRequestVersion;
  quotaRequestVersions.set(requestKey, requestVersion);
  const isLatestRequest = () => quotaRequestVersions.get(requestKey) === requestVersion;

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
    let data = await config.fetchQuota(file, t);
    if (quotaType === 'codex' && stabilizeCodexRefresh) {
      await waitForQuotaRefreshSettle();
      if (!isLatestRequest()) return { status: 'skipped', fileName };
      try {
        const confirmation = await config.fetchQuota(file, t);
        data = stabilizeCodexQuotaData(data, confirmation);
      } catch {
        // The first successful snapshot remains usable when the confirmation read fails.
      }
    }
    if (!isLatestRequest()) return { status: 'skipped', fileName };
    const authFile = config.extractAuthFileUpdate?.(data) ?? null;
    if (authFile) {
      onAuthFileUpdated?.(authFile);
    }
    updateQuotaState((prev: Record<string, unknown>) => ({
      ...prev,
      [fileName]: config.buildSuccessState(data),
    }));
    return authFile ? { status: 'success', fileName, authFile } : { status: 'success', fileName };
  } catch (err: unknown) {
    if (!isLatestRequest()) return { status: 'skipped', fileName };
    const message = err instanceof Error ? err.message : t('common.unknown_error');
    const errorStatus = getStatusFromError(err);
    updateQuotaState((prev: Record<string, unknown>) => ({
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
