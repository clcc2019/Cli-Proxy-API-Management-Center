import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { IconPlus, IconRefreshCw } from '@/components/ui/icons';
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
      <ManagementPageHeader
        context={t('providersPage.header.eyebrow')}
        title={t('providersPage.header.title')}
        description={t('providersPage.header.description')}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
              loading={isFetching}
            >
              <IconRefreshCw size={16} />
              <span>
                {isFetching
                  ? t('providersPage.actions.syncing')
                  : t('providersPage.actions.refresh')}
              </span>
            </Button>
            <Button size="sm" onClick={onNew} disabled={isNewDisabled}>
              <IconPlus size={16} />
              <span>{t('providersPage.actions.new')}</span>
            </Button>
          </>
        }
      />

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
