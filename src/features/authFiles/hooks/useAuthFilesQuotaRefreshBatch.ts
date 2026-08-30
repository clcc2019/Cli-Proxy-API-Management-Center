import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '@/stores';
import { REFRESH_FEEDBACK_MS } from '@/utils/refreshFeedback';
import type { AuthFileItem } from '@/types';
import type { AuthFileQuotaRefreshTarget } from '@/features/authFiles/quotaRefresh';

type BatchState = {
  refreshing: boolean;
  completed: number;
  total: number;
};

type UseAuthFilesQuotaRefreshBatchOptions = {
  disabled: boolean;
  visibleCount: number;
  targets: readonly AuthFileQuotaRefreshTarget[];
  onAuthFilesUpdated: (files: AuthFileItem[]) => void;
};

const IDLE_STATE: BatchState = { refreshing: false, completed: 0, total: 0 };

export function useAuthFilesQuotaRefreshBatch({
  disabled,
  visibleCount,
  targets,
  onAuthFilesUpdated,
}: UseAuthFilesQuotaRefreshBatchOptions) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [state, setState] = useState(IDLE_STATE);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const progressFrameRef = useRef<number | null>(null);
  const pendingProgressRef = useRef<BatchState | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
      pendingProgressRef.current = null;
    };
  }, []);

  const execute = useCallback(async () => {
    if (disabled || visibleCount === 0 || runningRef.current) return;
    if (targets.length === 0) {
      showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      return;
    }

    runningRef.current = true;
    setState({ refreshing: true, completed: 0, total: targets.length });
    const minimumFeedback = new Promise<void>((resolve) =>
      window.setTimeout(resolve, REFRESH_FEEDBACK_MS)
    );

    try {
      const { refreshAuthFileQuotasInParallel } = await import('@/features/authFiles/quotaRefresh');
      const result = await refreshAuthFileQuotasInParallel({
        targets,
        disableControls: disabled,
        t,
        initialSkipped: Math.max(0, visibleCount - targets.length),
        shouldContinue: () => mountedRef.current,
        onProgress: ({ completed, total }) => {
          pendingProgressRef.current = { refreshing: true, completed, total };
          if (progressFrameRef.current !== null) return;
          progressFrameRef.current = window.requestAnimationFrame(() => {
            progressFrameRef.current = null;
            const next = pendingProgressRef.current;
            pendingProgressRef.current = null;
            if (next && mountedRef.current) setState(next);
          });
        },
      });

      if (!mountedRef.current) return;
      if (result.authFiles.length > 0) onAuthFilesUpdated(result.authFiles);

      if (result.success === 0 && result.failed === 0) {
        showNotification(t('auth_files.page_quota_refresh_none'), 'info');
      } else if (result.failed === 0 && result.skipped === 0) {
        showNotification(
          t('auth_files.batch_quota_refresh_success', { count: result.success }),
          'success'
        );
      } else {
        showNotification(t('auth_files.batch_quota_refresh_partial', result), 'warning');
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = error instanceof Error ? error.message : String(error);
        showNotification(`${t('notification.refresh_failed')}: ${message}`, 'error');
      }
    } finally {
      const pendingProgress = pendingProgressRef.current;
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
      pendingProgressRef.current = null;
      if (pendingProgress && mountedRef.current) setState(pendingProgress);
      await minimumFeedback;
      runningRef.current = false;
      if (mountedRef.current) setState(IDLE_STATE);
    }
  }, [disabled, onAuthFilesUpdated, showNotification, t, targets, visibleCount]);

  const refresh = useCallback(() => {
    void execute();
  }, [execute]);

  return {
    refresh,
    refreshing: state.refreshing,
    disabled: disabled || state.refreshing || visibleCount === 0,
    label: state.refreshing
      ? t('auth_files.page_quota_refresh_progress', state)
      : t('auth_files.refresh_page_quota_aria'),
  };
}
