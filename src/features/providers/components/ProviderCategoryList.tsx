import { useTranslation } from 'react-i18next';
import { PROVIDER_LOGOS } from '../brandLogos';
import type { ProviderBrand, ProviderGroup } from '../types';
import styles from './ProviderCategoryList.module.scss';

interface ProviderCategoryListProps {
  groups: ProviderGroup[];
  activeBrand: ProviderBrand;
  onSelect: (brand: ProviderBrand) => void;
}

export function ProviderCategoryList({ groups, activeBrand, onSelect }: ProviderCategoryListProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.stack}>
      <aside className={styles.aside}>
        <p className={styles.eyebrow}>{t('providersPage.categories.title')}</p>
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
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.itemLeft}>
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
                </span>
                <span className={`${styles.badge} ${total === 0 ? styles.badgeAmber : ''}`}>
                  {total}
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
