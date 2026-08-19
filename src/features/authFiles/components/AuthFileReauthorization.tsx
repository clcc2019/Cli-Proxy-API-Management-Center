import { memo, useCallback, useState } from 'react';
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
import { useOAuthFlow, type OAuthFlowState } from '@/features/oauthLogin/useOAuthFlow';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import styles from '@/pages/AuthFilesPageRefresh.module.scss';

type AuthFileReauthorizationProps = {
  file: AuthFileItem;
  disableControls: boolean;
};

const AUTH_FAILURE_PATTERN =
  /(?:\b40[13]\b|unauthori[sz]ed|invalid[_\s-]?(?:grant|token|credential)|(?:token|credential|authentication|oauth).{0,32}(?:expired|invalid|revoked|missing|failed|failure)|(?:expired|invalid|revoked|failed|failure).{0,32}(?:token|credential|authentication|oauth)|authentication\s+(?:is\s+)?required|login\s+required|re-?auth(?:entication)?\s+required)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const containsAuthFailure = (value: unknown, depth = 0): boolean => {
  if (typeof value === 'number') return value === 401 || value === 403;
  if (typeof value === 'string') return AUTH_FAILURE_PATTERN.test(value);
  if (!isRecord(value) || depth >= 3) return false;

  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (
      ['status', 'status_code', 'statuscode', 'http_status', 'httpstatus', 'code'].includes(
        normalizedKey
      ) &&
      (nested === 401 || nested === 403 || nested === '401' || nested === '403')
    ) {
      return true;
    }
    return containsAuthFailure(nested, depth + 1);
  });
};

const isCodexAuthFile = (file: AuthFileItem): boolean =>
  [file.type, file.provider, file.source]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.trim().toLowerCase() === 'codex');

const shouldOfferAuthFileReauthorization = (
  file: AuthFileItem,
  quotaErrorStatus?: number,
  quotaError?: string
): boolean => {
  if (!isCodexAuthFile(file)) return false;
  if (quotaErrorStatus === 401 || quotaErrorStatus === 403) return true;

  return [
    file.status,
    file.status_message,
    file.statusMessage,
    file.last_error,
    file.lastError,
    file.cliproxy_runtime_state,
    file.runtime_state,
    file.runtimeState,
    quotaError,
  ].some((value) => containsAuthFailure(value));
};

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
  disableControls,
}: AuthFileReauthorizationProps) {
  const { t } = useTranslation();
  const { getState, start, cancel } = useOAuthFlow();
  const flowState = getState('codex');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  const handleStart = useCallback(() => {
    void start('codex');
  }, [start]);

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
            <span className={styles.cardErrorSummary}>
              {t('auth_files.reauth_error_summary')}
            </span>
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

export const AuthFileReauthorization = memo(function AuthFileReauthorization(
  props: AuthFileReauthorizationProps
) {
  const quotaState = useQuotaStore((state) => state.codexQuota[props.file.name]);

  if (!shouldOfferAuthFileReauthorization(props.file, quotaState?.errorStatus, quotaState?.error)) {
    return null;
  }
  return <AuthFileReauthorizationFlow {...props} />;
});
