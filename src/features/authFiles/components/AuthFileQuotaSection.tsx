import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
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
type QuotaRecord = Record<string, unknown> & { status?: string };

const hasRenderableQuotaItems = (quota: QuotaState): quota is QuotaRecord => {
  if (!quota || typeof quota !== 'object') return false;

  return ['windows', 'groups', 'buckets', 'rows'].some((key) => {
    const value = (quota as Record<string, unknown>)[key];
    return Array.isArray(value) && value.length > 0;
  });
};

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
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
    });

    if (result.status === 'success') {
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } else if (result.status === 'error') {
      showNotification(
        t('auth_files.quota_refresh_failed', { name: file.name, message: result.message }),
        'error'
      );
    }
  }, [disableControls, file, quotaType, showNotification, t]);

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
  const [isClickSpinning, setIsClickSpinning] = useState(false);
  const isSpinning = isQuotaRefreshing || isClickSpinning;
  const buttonClassName = [className, isSpinning ? styles.quotaRefreshButtonSpinning : '']
    .filter(Boolean)
    .join(' ');
  const refreshIconClassName = [
    iconClassName,
    isSpinning ? styles.quotaRefreshIconSvgSpinning : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (!isClickSpinning || isQuotaRefreshing) return undefined;

    const timer = window.setTimeout(() => {
      setIsClickSpinning(false);
    }, 700);

    return () => window.clearTimeout(timer);
  }, [isClickSpinning, isQuotaRefreshing]);

  const handleRefreshClick = useCallback(() => {
    setIsClickSpinning(true);
    void refreshQuotaForFile();
  }, [refreshQuotaForFile]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleRefreshClick}
      disabled={!canRefreshQuota}
      className={buttonClassName}
      title={refreshLabel}
      aria-label={refreshLabel}
      aria-busy={isSpinning}
    >
      <span className={styles.quotaRefreshIcon}>
        <IconRefreshCw className={refreshIconClassName} size={iconSize} />
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
  const showCachedQuotaWhileLoading = quotaStatus === 'loading' && hasRenderableQuotaItems(quota);

  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaSectionHeader}>
        <span className={styles.quotaSectionTitle}>{t(`${config.i18nPrefix}.title`)}</span>
      </div>
      <div className={styles.quotaContent}>
        {showCachedQuotaWhileLoading ? (
          (config.renderQuotaItems(quota, t, { styles, QuotaProgressBar, item: file }) as ReactNode)
        ) : quotaStatus === 'loading' ? (
          null
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
