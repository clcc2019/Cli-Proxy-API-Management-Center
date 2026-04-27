import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthFileItem } from '@/types';
import { resolveQuotaErrorMessage, type QuotaProviderType } from '@/features/authFiles/constants';
import { useAuthFileQuotaRefresh } from '@/features/authFiles/hooks/useAuthFileQuotaRefresh';
import { QuotaProgressBar } from '@/features/authFiles/components/QuotaProgressBar';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
};

export function AuthFileQuotaSection(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const { config, quota, quotaStatus, canRefreshQuota, refreshQuotaForFile } =
    useAuthFileQuotaRefresh(file, quotaType, disableControls);

  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );

  return (
    <div className={styles.quotaSection}>
      {quotaStatus === 'loading' ? (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.loading`)}</div>
      ) : quotaStatus === 'idle' ? (
        <button
          type="button"
          className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
          onClick={() => void refreshQuotaForFile()}
          disabled={!canRefreshQuota}
        >
          {t('auth_files.quota_not_loaded')}
        </button>
      ) : quotaStatus === 'error' ? (
        <div className={styles.quotaError}>
          {t(`${config.i18nPrefix}.load_failed`, {
            message: quotaErrorMessage,
          })}
        </div>
      ) : quota ? (
        (config.renderQuotaItems(quota, t, { styles, QuotaProgressBar }) as ReactNode)
      ) : (
        <div className={styles.quotaMessage}>{t(`${config.i18nPrefix}.idle`)}</div>
      )}
    </div>
  );
}
