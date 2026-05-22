import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useNotificationStore, useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  resolveQuotaErrorMessage,
  type QuotaProviderType
} from '@/features/authFiles/constants';
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

function useAuthFileQuotaRefresh(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const quota = useQuotaStore((state) => {
    if (quotaType === 'antigravity') return state.antigravityQuota[file.name] as QuotaState;
    if (quotaType === 'claude') return state.claudeQuota[file.name] as QuotaState;
    if (quotaType === 'codex') return state.codexQuota[file.name] as QuotaState;
    if (quotaType === 'kiro') return state.kiroQuota[file.name] as QuotaState;
    if (quotaType === 'kimi') return state.kimiQuota[file.name] as QuotaState;
    return state.geminiCliQuota[file.name] as QuotaState;
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
    refreshLabel: t(`${config.i18nPrefix}.refresh_button`)
  };
}

export function AuthFileQuotaRefreshButton(props: AuthFileQuotaRefreshButtonProps) {
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
        <span className={refreshSpinnerClassName} style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
      </span>
    </Button>
  );
}

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType } = props;
  const { t } = useTranslation();
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
  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaSectionHeader}>
        <span className={styles.quotaSectionTitle}>{t(`${config.i18nPrefix}.title`)}</span>
      </div>
      <div className={styles.quotaContent}>
        {quotaStatus === 'loading' ? (
          <div className={styles.quotaLoadingState} aria-live="polite">
            <LoadingSpinner size={16} />
            <span>{t(`${config.i18nPrefix}.loading`)}</span>
          </div>
        ) : quotaStatus === 'idle' ? (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={() => void refreshQuotaForFile()}
            disabled={!canRefreshQuota}
            title={refreshLabel}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        ) : quotaStatus === 'error' ? (
          <div className={styles.quotaError}>
            {t(`${config.i18nPrefix}.load_failed`, {
              message: quotaErrorMessage,
            })}
          </div>
        ) : quota ? (
          (config.renderQuotaItems(quota, t, { styles, QuotaProgressBar, item: file }) as ReactNode)
        ) : (
          <button
            type="button"
            className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
            onClick={() => void refreshQuotaForFile()}
            disabled={!canRefreshQuota}
            title={refreshLabel}
          >
            {t(`${config.i18nPrefix}.idle`)}
          </button>
        )}
      </div>
    </div>
  );
}
