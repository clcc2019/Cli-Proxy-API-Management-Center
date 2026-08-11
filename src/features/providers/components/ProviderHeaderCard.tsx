import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { IconPlus } from '@/components/ui/icons';
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
    <header className={styles.card}>
      <div className={styles.identity}>
        <h1 id="providers-page-title" className={styles.title}>
          {t('providersPage.header.title')}
        </h1>
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

      <div className={styles.actions}>
        <RefreshButton
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={isFetching}
          loading={isFetching}
          label={t('providersPage.actions.refresh')}
          iconSize={15}
          className={styles.actionButton}
        >
          {t('providersPage.actions.refresh')}
        </RefreshButton>
        <Button size="sm" onClick={onNew} disabled={isNewDisabled} className={styles.actionButton}>
          <IconPlus size={15} />
          {t('providersPage.actions.new')}
        </Button>
      </div>
    </header>
  );
});
