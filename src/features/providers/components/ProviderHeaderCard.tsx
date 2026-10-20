import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { IconPlus } from '@/components/ui/icons';
import styles from './ProviderHeaderCard.module.scss';

interface ProviderHeaderCardProps {
  isNewDisabled?: boolean;
  onNew: () => void;
}

export const ProviderHeaderCard = memo(function ProviderHeaderCard({
  isNewDisabled = false,
  onNew,
}: ProviderHeaderCardProps) {
  const { t } = useTranslation();

  return (
    <header className={styles.header}>
      <div className={styles.identity}>
        <h1 id="providers-page-title" className={styles.title}>
          {t('providersPage.header.title')}
        </h1>
      </div>

      <div className={styles.actions}>
        <Button size="sm" onClick={onNew} disabled={isNewDisabled} className={styles.actionButton}>
          <IconPlus size={15} />
          {t('providersPage.actions.new')}
        </Button>
      </div>
    </header>
  );
});
