import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { IconChevronDown, IconChevronUp, IconSlidersHorizontal } from '@/components/ui/icons';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { AnchoredPopover } from '@/components/ui/AnchoredPopover';
import type { ProviderSortBy, SortDir } from '../types';
import styles from './ProviderResourceToolbar.module.scss';

interface ProviderResourceToolbarProps {
  sortBy: ProviderSortBy;
  sortDir: SortDir;
  onSortBy: (value: ProviderSortBy) => void;
  onSortDir: (value: SortDir) => void;
  availableModels: ReadonlyArray<string>;
  selectedModels: ReadonlySet<string>;
  onSelectedModelsChange: (next: Set<string>) => void;
}

interface ProviderModelFilterItemProps {
  name: string;
  selected: boolean;
  onToggle: (name: string) => void;
}

const ProviderModelFilterItem = memo(function ProviderModelFilterItem({
  name,
  selected,
  onToggle,
}: ProviderModelFilterItemProps) {
  return (
    <li className={styles.filterItem}>
      <SelectionCheckbox
        checked={selected}
        onChange={() => onToggle(name)}
        label={<span className={styles.filterItemLabel}>{name}</span>}
      />
    </li>
  );
});

export const ProviderResourceToolbar = memo(function ProviderResourceToolbar({
  sortBy,
  sortDir,
  onSortBy,
  onSortDir,
  availableModels,
  selectedModels,
  onSelectedModelsChange,
}: ProviderResourceToolbarProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [filterOpen, setFilterOpen] = useState(false);
  const visibleFilterOpen = isCurrentLayer && filterOpen;

  const sortOptions = useMemo(
    () => [
      { value: 'name', label: t('providersPage.toolbar.sort.name') },
      { value: 'priority', label: t('providersPage.toolbar.sort.priority') },
      {
        value: 'recent-success',
        label: t('providersPage.toolbar.sort.recentSuccess'),
      },
    ],
    [t]
  );

  const toggleModel = useCallback(
    (name: string) => {
      if (!isCurrentLayer) return;
      const next = new Set(selectedModels);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      onSelectedModelsChange(next);
    },
    [isCurrentLayer, onSelectedModelsChange, selectedModels]
  );

  const selectAll = useCallback(() => {
    if (!isCurrentLayer) return;
    onSelectedModelsChange(new Set(availableModels));
  }, [availableModels, isCurrentLayer, onSelectedModelsChange]);

  const clearAll = useCallback(() => {
    if (!isCurrentLayer) return;
    onSelectedModelsChange(new Set());
  }, [isCurrentLayer, onSelectedModelsChange]);

  const filterLabel =
    selectedModels.size === 0
      ? t('providersPage.toolbar.filter.allModels')
      : t('providersPage.toolbar.filter.selectedModels', {
          selected: selectedModels.size,
          total: availableModels.length,
        });

  return (
    <div className={styles.root}>
      <div className={styles.sortGroup}>
        <Select
          value={sortBy}
          options={sortOptions}
          onChange={(value) => onSortBy(value as ProviderSortBy)}
          ariaLabel={t('providersPage.toolbar.sortBy')}
          className={styles.sortSelect}
          dropdownClassName={styles.sortDropdown}
          fullWidth={false}
        />
        <button
          type="button"
          className={styles.dirBtn}
          onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          aria-label={
            sortDir === 'asc'
              ? t('providersPage.toolbar.sort.directionAsc')
              : t('providersPage.toolbar.sort.directionDesc')
          }
          title={
            sortDir === 'asc'
              ? t('providersPage.toolbar.sort.directionAsc')
              : t('providersPage.toolbar.sort.directionDesc')
          }
        >
          {sortDir === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
        </button>
      </div>

      <AnchoredPopover
        open={visibleFilterOpen}
        onOpenChange={(nextOpen) => {
          if (isCurrentLayer) setFilterOpen(nextOpen);
        }}
        width={280}
        maxHeight={340}
        ariaLabel={filterLabel}
        wrapperClassName={styles.filterGroup}
        className={styles.filterPanel}
        trigger={
          <button
            type="button"
            className={`${styles.filterTrigger} ${
              selectedModels.size > 0 ? styles.filterTriggerActive : ''
            }`}
            disabled={availableModels.length === 0}
            aria-haspopup="dialog"
            aria-expanded={visibleFilterOpen}
            aria-label={filterLabel}
          >
            <IconSlidersHorizontal size={14} />
            <span>{filterLabel}</span>
            <IconChevronDown size={12} />
          </button>
        }
      >
        <div className={styles.filterToolbar}>
          <button
            type="button"
            className={styles.filterToolbarBtn}
            onClick={selectAll}
            disabled={availableModels.length === 0}
          >
            {t('providersPage.toolbar.filter.selectAll')}
          </button>
          <button
            type="button"
            className={styles.filterToolbarBtn}
            onClick={clearAll}
            disabled={selectedModels.size === 0}
          >
            {t('providersPage.toolbar.filter.clear')}
          </button>
        </div>
        {availableModels.length === 0 ? (
          <div className={styles.filterEmpty}>{t('providersPage.toolbar.filter.empty')}</div>
        ) : (
          <ul className={styles.filterList}>
            {availableModels.map((name) => (
              <ProviderModelFilterItem
                key={name}
                name={name}
                selected={selectedModels.has(name)}
                onToggle={toggleModel}
              />
            ))}
          </ul>
        )}
      </AnchoredPopover>
    </div>
  );
});
