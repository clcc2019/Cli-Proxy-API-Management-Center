import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { IconInbox, IconPlus, IconSearch, IconX } from '@/components/ui/icons';
import { PROVIDER_LOGOS } from '../brandLogos';
import type { ProviderGroup, ProviderResource, ProviderSortBy, SortDir } from '../types';
import { ProviderResourceTable } from './ProviderResourceTable';
import { ProviderResourceToolbar } from './ProviderResourceToolbar';
import styles from './ProviderResourcePanel.module.scss';

export interface ProviderPanelControls {
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  onSortBy: (value: ProviderSortBy) => void;
  onSortDir: (value: SortDir) => void;
  availableModels: ReadonlyArray<string>;
  selectedModels: ReadonlySet<string>;
  onSelectedModelsChange: (next: Set<string>) => void;
}

interface ProviderResourcePanelProps {
  group: ProviderGroup;
  filter: string;
  onFilterChange: (value: string) => void;
  filteredResources: ProviderResource[];
  disableMutations?: boolean;
  toolbarControls: ProviderPanelControls;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
  onCreate: () => void;
}

export const ProviderResourcePanel = memo(function ProviderResourcePanel({
  group,
  filter,
  onFilterChange,
  filteredResources,
  disableMutations,
  toolbarControls,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
  onCreate,
}: ProviderResourcePanelProps) {
  const { t } = useTranslation();
  const logo = PROVIDER_LOGOS[group.id];
  const lightLogoClassName = `${styles.logo} ${logo.darkSrc ? styles.logoThemeLight : ''}`;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.titleArea}>
            <div className={styles.titleRow}>
              <img src={logo.src} alt="" aria-hidden="true" className={lightLogoClassName} />
              {logo.darkSrc ? (
                <img
                  src={logo.darkSrc}
                  alt=""
                  aria-hidden="true"
                  className={`${styles.logo} ${styles.logoThemeDark}`}
                />
              ) : null}
              <h2 className={styles.title}>{t(`providersPage.providerNames.${group.id}`)}</h2>
            </div>
            <p className={styles.description}>
              {t('providersPage.table.description', {
                route: t(`providersPage.providerNames.${group.id}`),
              })}
            </p>
          </div>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              className={styles.searchInput}
              value={filter}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={t('providersPage.table.filterPlaceholder')}
              aria-label={t('providersPage.table.filterLabel')}
            />
            {filter ? (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => onFilterChange('')}
                aria-label={t('common.clear')}
                title={t('common.clear')}
              >
                <IconX size={14} />
              </button>
            ) : null}
          </div>
        </div>
        <div className={styles.headerToolbarRow}>
          <span className={styles.resultCount}>
            {t('providersPage.table.resultCount', {
              visible: filteredResources.length,
              total: group.resources.length,
            })}
          </span>
          <ProviderResourceToolbar
            key={group.id}
            sortBy={toolbarControls.sortBy}
            sortDir={toolbarControls.sortDir}
            onSortBy={toolbarControls.onSortBy}
            onSortDir={toolbarControls.onSortDir}
            availableModels={toolbarControls.availableModels}
            selectedModels={toolbarControls.selectedModels}
            onSelectedModelsChange={toolbarControls.onSelectedModelsChange}
          />
        </div>
      </div>

      {filteredResources.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <IconInbox size={21} />
          </span>
          <div className={styles.emptyCopy}>
            <strong>{t('providersPage.table.emptyTitle')}</strong>
            <p>{t('providersPage.table.empty')}</p>
          </div>
          <div className={styles.emptyAction}>
            <button
              type="button"
              className={styles.emptyActionButton}
              onClick={onCreate}
              disabled={disableMutations}
            >
              <IconPlus size={16} />
              <span>{t('providersPage.actions.new')}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.tableFrame}>
          <ProviderResourceTable
            resources={filteredResources}
            disableMutations={disableMutations}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleDisabled={onToggleDisabled}
          />
        </div>
      )}
    </section>
  );
});
