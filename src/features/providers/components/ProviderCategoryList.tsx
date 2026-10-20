import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderBrand, ProviderGroup } from '../types';
import styles from './ProviderCategoryList.module.scss';

interface ProviderCategoryListProps {
  groups: ProviderGroup[];
  activeBrand: ProviderBrand;
  onSelect: (brand: ProviderBrand) => void;
}

export const ProviderCategoryList = memo(function ProviderCategoryList({
  groups,
  activeBrand,
  onSelect,
}: ProviderCategoryListProps) {
  const { t } = useTranslation();

  return (
    <nav className={styles.rail} aria-label={t('providersPage.categories.title')}>
      <div className={styles.list}>
        {groups.map((group) => {
          const active = group.id === activeBrand;
          return (
            <button
              key={group.id}
              type="button"
              className={`${styles.item} ${active ? styles.active : ''}`}
              onClick={() => onSelect(group.id)}
              aria-pressed={active}
            >
              {t(`providersPage.providerNames.${group.id}`)}
            </button>
          );
        })}
      </div>
    </nav>
  );
});
