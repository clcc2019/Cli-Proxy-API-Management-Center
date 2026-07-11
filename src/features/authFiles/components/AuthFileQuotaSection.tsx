import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore, useQuotaStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem, CodexQuotaState, CodexRateLimitResetConsumePayload } from '@/types';
import { normalizeAuthIndex } from '@/utils/usage';
import { resolveQuotaErrorMessage, type QuotaProviderType } from '@/features/authFiles/constants';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import { getAuthFileQuotaConfig, refreshAuthFileQuota } from '@/features/authFiles/quotaRefresh';
import styles from '@/pages/AuthFilesPage.module.scss';

type QuotaState = { status?: string; error?: string; errorStatus?: number } | undefined;

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
};

type AuthFileQuotaRefreshButtonProps = AuthFileQuotaSectionProps & {
  className?: string;
  iconClassName?: string;
  iconSize?: number;
};

const readResetCreditCount = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
};

const resolveResetCreditCountFromConsume = (
  payload: CodexRateLimitResetConsumePayload
): number | null => {
  const direct = readResetCreditCount(payload.available_count ?? payload.availableCount);
  if (direct !== null) return direct;
  const credits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  if (credits && typeof credits === 'object') {
    return readResetCreditCount(credits.available_count ?? credits.availableCount);
  }
  return null;
};

const resolveConsumeCode = (payload: CodexRateLimitResetConsumePayload): string => {
  const code = payload.code ?? payload.consume?.code ?? '';
  return String(code).trim();
};

const resolveAuthFileSnapshot = (
  file: AuthFileItem,
  payload: CodexRateLimitResetConsumePayload
): AuthFileItem | null => {
  const snapshot = payload.auth_file ?? payload.authFile;
  return snapshot && typeof snapshot === 'object'
    ? ({ ...file, ...snapshot, name: file.name } as AuthFileItem)
    : null;
};

function useAuthFileQuotaRefresh(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const quota = useQuotaStore((state) => {
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    return state.kimiQuota[file.name] as QuotaState;
  });

  const refreshQuotaForFile = useCallback(async () => {
    const result = await refreshAuthFileQuota({
      file,
      quotaType,
      disableControls,
      t,
      onAuthFileUpdated: props.onAuthFileUpdated,
    });

    if (result.status === 'success') {
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } else if (result.status === 'error') {
      showNotification(
        t('auth_files.quota_refresh_failed', { name: file.name, message: result.message }),
        'error'
      );
    }
  }, [disableControls, file, props.onAuthFileUpdated, quotaType, showNotification, t]);

  const quotaStatus = quota?.status ?? 'idle';
  const isQuotaRefreshing = quotaStatus === 'loading';
  const canRefreshQuota = !disableControls && !file.disabled;
  const config = getAuthFileQuotaConfig(quotaType) as unknown as { i18nPrefix: string };

  return {
    canRefreshQuota,
    isQuotaRefreshing,
    quota,
    quotaStatus,
    refreshQuotaForFile,
    refreshLabel: t(`${config.i18nPrefix}.refresh_button`),
  };
}

export const AuthFileQuotaRefreshButton = memo(function AuthFileQuotaRefreshButton(
  props: AuthFileQuotaRefreshButtonProps
) {
  const { className, iconClassName, iconSize = 14 } = props;
  const { canRefreshQuota, isQuotaRefreshing, refreshQuotaForFile, refreshLabel } =
    useAuthFileQuotaRefresh(props);
  const buttonClassName = [className, isQuotaRefreshing ? styles.quotaRefreshButtonSpinning : '']
    .filter(Boolean)
    .join(' ');
  const refreshIconWrapperClassName = [
    styles.quotaRefreshIcon,
    isQuotaRefreshing ? styles.quotaRefreshIconSpinning : '',
  ]
    .filter(Boolean)
    .join(' ');
  const refreshSpinnerClassName = [
    styles.quotaButtonSpinner,
    isQuotaRefreshing ? styles.quotaButtonSpinnerSpinning : '',
    iconClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const handleRefreshClick = useCallback(() => {
    void refreshQuotaForFile();
  }, [refreshQuotaForFile]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleRefreshClick}
      disabled={!canRefreshQuota || isQuotaRefreshing}
      className={buttonClassName}
      title={refreshLabel}
      aria-label={refreshLabel}
      aria-busy={isQuotaRefreshing}
    >
      <span className={refreshIconWrapperClassName}>
        <span
          className={refreshSpinnerClassName}
          style={{ width: iconSize, height: iconSize }}
          aria-hidden="true"
        />
      </span>
    </Button>
  );
});

export const AuthFileQuotaSection = memo(function AuthFileQuotaSection(
  props: AuthFileQuotaSectionProps
) {
  const { file, quotaType, disableControls, onAuthFileUpdated } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);
  const [resetCreditConsuming, setResetCreditConsuming] = useState(false);
  const { canRefreshQuota, quota, quotaStatus, refreshLabel, refreshQuotaForFile } =
    useAuthFileQuotaRefresh(props);
  const config = getAuthFileQuotaConfig(quotaType) as unknown as {
    i18nPrefix: string;
    renderQuotaItems: (quota: unknown, t: TFunction, helpers: unknown) => unknown;
  };
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const codexQuota = quotaType === 'codex' ? (quota as CodexQuotaState | undefined) : undefined;
  const resetCreditCount = codexQuota?.rateLimitResetCreditsAvailable ?? null;
  const showResetCredits = quotaType === 'codex' && quotaStatus === 'success';
  const canConsumeResetCredit =
    showResetCredits &&
    !disableControls &&
    !file.disabled &&
    !resetCreditConsuming &&
    resetCreditCount !== null &&
    resetCreditCount > 0;

  const handleConsumeResetCredit = useCallback(async () => {
    if (!canConsumeResetCredit) return;
    setResetCreditConsuming(true);
    try {
      const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex) ?? undefined;
      const payload = await authFilesApi.consumeCodexRateLimitResetCredit(file.name, authIndex);
      const code = resolveConsumeCode(payload);
      const nextCount = resolveResetCreditCountFromConsume(payload);
      if (nextCount !== null) {
        setCodexQuota((prev) => {
          const previous = prev[file.name] ?? { status: 'success', windows: [] };
          const nextStatus = previous.status === 'error' ? 'success' : previous.status;
          if (
            previous.status === nextStatus &&
            previous.rateLimitResetCreditsAvailable === nextCount
          ) {
            return prev;
          }
          return {
            ...prev,
            [file.name]: {
              ...previous,
              status: nextStatus,
              rateLimitResetCreditsAvailable: nextCount,
            },
          };
        });
      }
      const authFile = resolveAuthFileSnapshot(file, payload);
      if (authFile) {
        onAuthFileUpdated?.(authFile);
      }

      if (code === 'reset' || code === 'already_redeemed') {
        showNotification(
          t('codex_quota.reset_credit_consume_success', { count: nextCount ?? resetCreditCount }),
          'success'
        );
      } else if (code === 'no_credit') {
        showNotification(t('codex_quota.reset_credit_no_credit'), 'warning');
      } else if (code === 'nothing_to_reset') {
        showNotification(t('codex_quota.reset_credit_nothing_to_reset'), 'info');
      } else {
        showNotification(t('codex_quota.reset_credit_consume_result', { code }), 'info');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(t('codex_quota.reset_credit_consume_failed', { message }), 'error');
    } finally {
      setResetCreditConsuming(false);
    }
  }, [
    canConsumeResetCredit,
    file,
    onAuthFileUpdated,
    resetCreditCount,
    setCodexQuota,
    showNotification,
    t,
  ]);
  const handleConsumeResetCreditClick = useCallback(() => {
    void handleConsumeResetCredit();
  }, [handleConsumeResetCredit]);
  const handleRefreshClick = useCallback(() => {
    void refreshQuotaForFile();
  }, [refreshQuotaForFile]);
  const quotaRenderHelpers = useMemo(() => ({ styles, QuotaProgressBar, item: file }), [file]);
  const renderedQuotaItems = useMemo(
    () => (quota ? (config.renderQuotaItems(quota, t, quotaRenderHelpers) as ReactNode) : null),
    [config, quota, quotaRenderHelpers, t]
  );

  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaSectionHeader}>
        <span className={styles.quotaSectionTitle}>{t(`${config.i18nPrefix}.title`)}</span>
        {showResetCredits && (
          <div className={styles.codexResetCredits}>
            <div className={styles.codexResetCreditsText}>
              <span className={styles.codexPlanLabel}>{t('codex_quota.reset_credit_label')}</span>
              <span className={styles.codexPlanValue}>
                {resetCreditCount === null
                  ? t('codex_quota.reset_credit_unknown')
                  : t('codex_quota.reset_credit_count', { count: resetCreditCount })}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConsumeResetCreditClick}
              disabled={!canConsumeResetCredit}
              className={styles.codexResetCreditButton}
              title={t('codex_quota.reset_credit_consume_button')}
              aria-label={t('codex_quota.reset_credit_consume_button')}
              aria-busy={resetCreditConsuming}
            >
              {resetCreditConsuming ? (
                <LoadingSpinner size={12} />
              ) : (
                t('codex_quota.reset_credit_consume_button')
              )}
            </Button>
          </div>
        )}
      </div>
      <div className={styles.quotaContent}>
        {quotaStatus === 'loading' ? (
          <div className={styles.quotaLoadingState} role="status" aria-busy="true">
            <LoadingSpinner size={16} />
            <span>{t(`${config.i18nPrefix}.loading`)}</span>
          </div>
        ) : quotaStatus === 'idle' ? (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={handleRefreshClick}
            disabled={!canRefreshQuota}
            title={refreshLabel}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        ) : quotaStatus === 'error' ? (
          <div className={styles.quotaError} role="alert">
            {t(`${config.i18nPrefix}.load_failed`, {
              message: quotaErrorMessage,
            })}
          </div>
        ) : quota ? (
          renderedQuotaItems
        ) : (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={handleRefreshClick}
            disabled={!canRefreshQuota}
            title={refreshLabel}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        )}
      </div>
    </div>
  );
});
