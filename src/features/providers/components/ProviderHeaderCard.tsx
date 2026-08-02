import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconLoader2, IconPlus, IconRefreshCw } from '@/components/ui/icons';
import styles from './ProviderHeaderCard.module.scss';

interface ProviderHeaderCardProps {
  totalActive: number;
  totalResources: number;
  providerFamilies: number;
  updatedAtLabel: string;
  isFetching?: boolean;
  isNewDisabled?: boolean;
  onRefresh: () => void;
  onNew: () => void;
}

export const ProviderHeaderCard = memo(function ProviderHeaderCard({
  totalActive,
  totalResources,
  providerFamilies,
  updatedAtLabel,
  isFetching = false,
  isNewDisabled = false,
  onRefresh,
  onNew,
}: ProviderHeaderCardProps) {
  const { t } = useTranslation();

  return (
    <section className={styles.card}>
      <div className={styles.row}>
        <div className={styles.titleArea}>
          <span className={styles.eyebrow}>{t('providersPage.header.eyebrow')}</span>
          <h1 className={styles.title}>{t('providersPage.header.title')}</h1>
          <p className={styles.subtitle}>{t('providersPage.header.description')}</p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnOutline}`}
            onClick={onRefresh}
            disabled={isFetching}
          >
            <span className={`${styles.btnIcon} ${isFetching ? styles.spin : ''}`}>
              {isFetching ? <IconLoader2 size={16} /> : <IconRefreshCw size={16} />}
            </span>
            <span>
              {isFetching ? t('providersPage.actions.syncing') : t('providersPage.actions.refresh')}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onNew}
            disabled={isNewDisabled}
          >
            <IconPlus size={16} />
            <span>{t('providersPage.actions.new')}</span>
          </button>
        </div>
      </div>

      <div className={styles.summaryRail}>
        <div className={styles.summaryLead}>
          <span className={styles.summaryEyebrow}>{t('providersPage.header.inventoryLabel')}</span>
          <span className={styles.summarySync}>
            <span className={styles.summaryDot} aria-hidden="true" />
            {t('providersPage.header.updatedAt', { time: updatedAtLabel })}
          </span>
        </div>
        <div className={styles.chips}>
          <span className={`${styles.chip} ${styles.chipPrimary}`}>
            <strong>{totalActive}</strong>
            <span>{t('providersPage.header.activeLabel')}</span>
          </span>
          <span className={styles.chip}>
            <strong>{totalResources}</strong>
            <span>{t('providersPage.header.totalLabel')}</span>
          </span>
          <span className={styles.chip}>
            <strong>{providerFamilies}</strong>
            <span>{t('providersPage.header.familiesLabel')}</span>
          </span>
        </div>
      </div>
    </section>
  );
});
