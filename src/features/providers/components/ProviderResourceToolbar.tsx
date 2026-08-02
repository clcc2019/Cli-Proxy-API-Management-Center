import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { IconChevronDown, IconChevronUp, IconSlidersHorizontal } from '@/components/ui/icons';
import { Select } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedModelsRef = useRef(selectedModels);
  const visibleFilterOpen = isCurrentLayer && filterOpen;
  selectedModelsRef.current = selectedModels;

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

  useEffect(() => {
    if (!visibleFilterOpen) return;
    const onClickOutside = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown', onClickOutside);
    return () => document.removeEventListener('pointerdown', onClickOutside);
  }, [visibleFilterOpen]);

  const toggleModel = useCallback(
    (name: string) => {
      if (!isCurrentLayer) return;
      const next = new Set(selectedModelsRef.current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      onSelectedModelsChange(next);
    },
    [isCurrentLayer, onSelectedModelsChange]
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
        <span className={styles.label}>{t('providersPage.toolbar.sortBy')}</span>
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

      <div className={styles.filterGroup} ref={containerRef}>
        <button
          type="button"
          className={styles.filterTrigger}
          onClick={() => {
            if (isCurrentLayer) setFilterOpen((v) => !v);
          }}
          disabled={availableModels.length === 0}
        >
          <IconSlidersHorizontal size={14} />
          <span>{filterLabel}</span>
          <IconChevronDown size={12} />
        </button>
        {visibleFilterOpen ? (
          <div className={styles.filterPanel}>
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
          </div>
        ) : null}
      </div>
    </div>
  );
});
