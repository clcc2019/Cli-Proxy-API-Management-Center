import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { PROVIDER_LOGOS } from '../brandLogos';
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
          const total = group.resources.length;
          const activeCount = group.resources.filter((resource) => !resource.disabled).length;
          const logo = PROVIDER_LOGOS[group.id];
          return (
            <button
              key={group.id}
              type="button"
              className={`${styles.item} ${active ? styles.active : ''}`}
              onClick={() => onSelect(group.id)}
              aria-pressed={active}
            >
              <img
                src={logo.src}
                alt=""
                aria-hidden="true"
                className={`${styles.logo} ${logo.transparent ? styles.logoTransparent : ''} ${logo.darkSrc ? styles.logoThemeLight : ''}`}
              />
              {logo.darkSrc ? (
                <img
                  src={logo.darkSrc}
                  alt=""
                  aria-hidden="true"
                  className={`${styles.logo} ${styles.logoTransparent} ${styles.logoThemeDark}`}
                />
              ) : null}
              <span className={styles.itemText}>
                <span className={styles.itemTitle}>
                  {t(`providersPage.providerNames.${group.id}`)}
                </span>
                <span className={styles.itemSubtitle}>
                  {t('providersPage.categories.activeCount', { active: activeCount, total })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
