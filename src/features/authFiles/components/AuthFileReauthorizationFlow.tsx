import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconCopy,
  IconExternalLink,
  IconLoader2,
  IconRefreshCw,
  IconShield,
} from '@/components/ui/icons';
import { parsePriorityValue } from '@/features/authFiles/constants';
import { refreshAuthFileQuota } from '@/features/authFiles/quotaRefresh';
import type { AuthFileReauthorizationProps } from '@/features/authFiles/components/AuthFileReauthorization';
import { useOAuthFlow, type OAuthFlowState } from '@/features/oauthLogin/useOAuthFlow';
import styles from '@/pages/AuthFilesPageRefresh.module.scss';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import { copyToClipboard } from '@/utils/clipboard';
import { AUTH_FILES_REFRESH_EVENT } from '@/utils/constants';

const getFlowErrorMessage = (
  state: Extract<OAuthFlowState, { phase: 'error' }>,
  t: ReturnType<typeof useTranslation>['t']
): string => {
  if (state.kind === 'unauthorized') return t('auth_login.oauth_unauthorized');
  if (state.kind === 'missingState' || state.kind === 'invalidResponse') {
    return t('auth_login.invalid_start_response');
  }
  return state.message || t('auth_files.reauth_error');
};

const AuthFileReauthorizationFlow = memo(function AuthFileReauthorizationFlow({
  file,
  disableControls,
  onAuthFileUpdated,
}: AuthFileReauthorizationProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const { getState, start, cancel } = useOAuthFlow();
  const flowState = getState('codex');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const preservedPriorityRef = useRef<number | undefined>(undefined);
  const successHandledRef = useRef(false);

  const userCode = 'userCode' in flowState ? flowState.userCode : undefined;
  const authUrl =
    flowState.phase === 'awaiting' || flowState.phase === 'submitting'
      ? flowState.url
      : flowState.phase === 'timedOut' || flowState.phase === 'error'
        ? flowState.url
        : undefined;
  const isPolling = flowState.phase === 'awaiting' || flowState.phase === 'submitting';
  const isDeviceFlow = 'mode' in flowState && flowState.mode === 'device';
  const resultErrorDetails =
    flowState.phase === 'timedOut'
      ? t('auth_files.reauth_timed_out')
      : flowState.phase === 'error'
        ? getFlowErrorMessage(flowState, t)
        : '';

  useEffect(() => {
    if (flowState.phase !== 'success' || successHandledRef.current) return;
    successHandledRef.current = true;

    const priority = preservedPriorityRef.current;
    const fileWithPreservedPriority = priority === undefined ? file : { ...file, priority };

    void (async () => {
      if (priority !== undefined) {
        try {
          const response = await authFilesApi.patchFields({ name: file.name, priority });
          onAuthFileUpdated?.({
            ...file,
            ...response.file,
            name: file.name,
            priority: response.file?.priority ?? priority,
          });
          window.dispatchEvent(new Event(AUTH_FILES_REFRESH_EVENT));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
        }
      }

      await refreshAuthFileQuota({
        file: fileWithPreservedPriority,
        quotaType: 'codex',
        disableControls,
        t,
        onAuthFileUpdated: (updated) =>
          onAuthFileUpdated?.(
            priority === undefined ? updated : { ...updated, name: file.name, priority }
          ),
      });
    })();
  }, [disableControls, file, flowState.phase, onAuthFileUpdated, showNotification, t]);

  const handleStart = useCallback(() => {
    preservedPriorityRef.current = parsePriorityValue(file.priority);
    successHandledRef.current = false;
    void start('codex');
  }, [file.priority, start]);

  const handleCancel = useCallback(() => {
    cancel('codex');
  }, [cancel]);

  const handleCopyCode = useCallback(async () => {
    if (!userCode) return;
    const copied = await copyToClipboard(userCode);
    if (copied) setCopiedCode(userCode);
  }, [setCopiedCode, userCode]);

  const handleOpenAuthorization = useCallback(() => {
    if (!authUrl) return;
    window.open(authUrl, '_blank', 'noopener,noreferrer');
  }, [authUrl]);

  return (
    <section className={styles.reauthPanel} aria-label={t('auth_files.reauth_title')}>
      <div className={styles.reauthHeader}>
        <span className={styles.reauthMark} aria-hidden="true">
          {flowState.phase === 'success' ? (
            <IconCheckCircle2 size={15} />
          ) : flowState.phase === 'starting' || isPolling ? (
            <IconLoader2 className={styles.reauthSpinner} size={15} />
          ) : flowState.phase === 'error' || flowState.phase === 'timedOut' ? (
            <IconAlertTriangle size={15} />
          ) : (
            <IconShield size={15} />
          )}
        </span>
        <div className={styles.reauthHeaderText}>
          <strong>{t('auth_files.reauth_title')}</strong>
          <span>
            {flowState.phase === 'starting'
              ? t('auth_files.reauth_starting')
              : flowState.phase === 'success'
                ? t('auth_files.reauth_success')
                : isPolling
                  ? t('auth_files.reauth_waiting')
                  : t('auth_files.reauth_hint')}
          </span>
        </div>

        {flowState.phase === 'idle' ? (
          <Button
            size="sm"
            className={styles.reauthPrimaryButton}
            onClick={handleStart}
            disabled={disableControls}
          >
            <IconRefreshCw size={14} aria-hidden="true" />
            {t('auth_files.reauth_action')}
          </Button>
        ) : flowState.phase !== 'success' ? (
          <button
            type="button"
            className={styles.reauthCancelButton}
            onClick={handleCancel}
            aria-label={t('common.cancel')}
            title={t('common.cancel')}
          >
            ×
          </button>
        ) : null}
      </div>

      {isPolling && authUrl && (
        <div className={styles.reauthWorkspace}>
          {isDeviceFlow && userCode ? (
            <div className={styles.reauthCodeGroup}>
              <span className={styles.reauthCodeLabel}>{t('auth_files.reauth_device_code')}</span>
              <button
                type="button"
                className={styles.reauthCode}
                onClick={handleCopyCode}
                title={
                  copiedCode === userCode
                    ? t('auth_files.reauth_copied')
                    : t('auth_files.reauth_copy_code')
                }
                aria-label={`${t('auth_files.reauth_copy_code')}: ${userCode}`}
              >
                <code>{userCode}</code>
              </button>
            </div>
          ) : (
            <p className={styles.reauthBrowserHint}>{t('auth_files.reauth_browser_hint')}</p>
          )}
          <div className={styles.reauthActions}>
            {userCode && (
              <Button variant="secondary" size="sm" onClick={handleCopyCode}>
                <IconCopy size={13} aria-hidden="true" />
                {copiedCode === userCode
                  ? t('auth_files.reauth_copied')
                  : t('auth_files.reauth_copy_code')}
              </Button>
            )}
            <Button size="sm" onClick={handleOpenAuthorization}>
              <IconExternalLink size={13} aria-hidden="true" />
              {t('auth_files.reauth_open')}
            </Button>
          </div>
        </div>
      )}

      {(flowState.phase === 'error' || flowState.phase === 'timedOut') && (
        <div className={styles.reauthResult} role="alert">
          <button
            type="button"
            className={styles.cardErrorTrigger}
            title={resultErrorDetails}
            aria-label={`${t('auth_files.reauth_error_summary')}: ${resultErrorDetails}`}
          >
            <IconAlertTriangle size={13} aria-hidden="true" />
            <span className={styles.cardErrorSummary}>{t('auth_files.reauth_error_summary')}</span>
            <span className={styles.cardErrorTooltip} role="tooltip">
              {resultErrorDetails}
            </span>
          </button>
          <Button variant="secondary" size="sm" onClick={handleStart} disabled={disableControls}>
            {t('auth_files.reauth_retry')}
          </Button>
        </div>
      )}
    </section>
  );
});

export default AuthFileReauthorizationFlow;
