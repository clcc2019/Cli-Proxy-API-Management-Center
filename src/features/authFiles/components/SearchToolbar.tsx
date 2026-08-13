import { memo, useCallback, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconSearch,
  IconSlidersHorizontal,
  IconLayoutDashboard,
  IconCheck,
  IconX,
} from '@/components/ui/icons';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { AnchoredPopover } from '@/components/ui/AnchoredPopover';
import refreshStyles from '@/pages/AuthFilesPageRefresh.module.scss';

interface SortOption {
  value: string;
  label: string;
}

interface SearchToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;

  sortValue: string;
  sortOptions: SortOption[];
  onSortChange: (value: string) => void;
  sortLabel: string;

  pageSize: number;
  pageSizePresets: number[];
  pageSizeMin: number;
  pageSizeMax: number;
  onPageSizeChange: (value: number) => void;
  pageSizeLabel: string;
}

interface PopoverButtonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ariaLabel: string;
  triggerLabel: string;
  triggerIcon: React.ReactNode;
  triggerSummary?: string;
  children: React.ReactNode;
}

const PopoverButton = memo(function PopoverButton({
  open,
  onOpenChange,
  ariaLabel,
  triggerLabel,
  triggerIcon,
  triggerSummary,
  children,
}: PopoverButtonProps) {
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const visibleOpen = isCurrentLayer && open;

  return (
    <AnchoredPopover
      open={visibleOpen}
      onOpenChange={(nextOpen) => {
        if (isCurrentLayer) onOpenChange(nextOpen);
      }}
      ariaLabel={triggerLabel}
      className={refreshStyles.controlPopover}
      trigger={
        <button
          type="button"
          className={`${refreshStyles.controlButton} ${visibleOpen ? refreshStyles.controlButtonActive : ''}`}
          aria-haspopup="dialog"
          aria-label={triggerSummary ? `${ariaLabel}: ${triggerSummary}` : ariaLabel}
          title={triggerSummary ? `${triggerLabel}: ${triggerSummary}` : triggerLabel}
        >
          {triggerIcon}
          <span className={refreshStyles.controlButtonText}>{triggerLabel}</span>
        </button>
      }
    >
      {children}
    </AnchoredPopover>
  );
});

PopoverButton.displayName = 'PopoverButton';

export const SearchToolbar = memo(function SearchToolbar({
  search,
  onSearchChange,
  searchPlaceholder,
  sortValue,
  sortOptions,
  onSortChange,
  sortLabel,
  pageSize,
  pageSizePresets,
  pageSizeMin,
  pageSizeMax,
  onPageSizeChange,
  pageSizeLabel,
}: SearchToolbarProps) {
  const { t } = useTranslation();
  const [sortOpen, setSortOpen] = useState(false);
  const [pageSizeOpen, setPageSizeOpen] = useState(false);
  const [pageSizeDraft, setPageSizeDraft] = useState(String(pageSize));

  const handleSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange]
  );

  const handleSearchClear = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  const handleSortOpenChange = useCallback((open: boolean) => {
    if (open) setPageSizeOpen(false);
    setSortOpen(open);
  }, []);

  const handlePageSizeDraftChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setPageSizeDraft(event.target.value);
  }, []);

  const handleSortPick = useCallback(
    (value: string) => {
      onSortChange(value);
      setSortOpen(false);
    },
    [onSortChange]
  );

  const handlePageSizeOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setSortOpen(false);
        setPageSizeDraft(String(pageSize));
      }
      setPageSizeOpen(open);
    },
    [pageSize]
  );

  const commitPageSizeDraft = useCallback(() => {
    const parsed = Math.round(Number(pageSizeDraft));
    if (!Number.isFinite(parsed)) {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const clamped = Math.min(pageSizeMax, Math.max(pageSizeMin, parsed));
    if (clamped !== pageSize) {
      onPageSizeChange(clamped);
    }
    setPageSizeDraft(String(clamped));
  }, [onPageSizeChange, pageSize, pageSizeDraft, pageSizeMax, pageSizeMin]);

  const handlePageSizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitPageSizeDraft();
        setPageSizeOpen(false);
      }
    },
    [commitPageSizeDraft]
  );

  const handlePageSizePreset = useCallback(
    (value: number) => {
      if (value !== pageSize) {
        onPageSizeChange(value);
      }
      setPageSizeDraft(String(value));
      setPageSizeOpen(false);
    },
    [onPageSizeChange, pageSize]
  );

  const sortSummary = useMemo(
    () => sortOptions.find((option) => option.value === sortValue)?.label ?? sortValue,
    [sortOptions, sortValue]
  );
  const pageSizeSummary = useMemo(
    () => `${pageSize}/${t('auth_files.page_size_unit')}`,
    [pageSize, t]
  );
  const sortTriggerIcon = useMemo(() => <IconSlidersHorizontal size={16} aria-hidden="true" />, []);
  const pageSizeTriggerIcon = useMemo(
    () => <IconLayoutDashboard size={16} aria-hidden="true" />,
    []
  );

  return (
    <div className={refreshStyles.searchToolbar}>
      <div className={refreshStyles.searchField}>
        <IconSearch size={16} className={refreshStyles.searchIcon} aria-hidden="true" />
        <input
          type="search"
          className={refreshStyles.searchInput}
          value={search}
          onChange={handleSearchInput}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          autoComplete="off"
          spellCheck={false}
        />
        {search && (
          <button
            type="button"
            className={refreshStyles.searchClear}
            onClick={handleSearchClear}
            aria-label={t('common.clear')}
            title={t('common.clear')}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      <PopoverButton
        open={sortOpen}
        onOpenChange={handleSortOpenChange}
        ariaLabel={sortLabel}
        triggerLabel={sortLabel}
        triggerSummary={sortSummary}
        triggerIcon={sortTriggerIcon}
      >
        {sortOpen ? (
          <>
            <div className={refreshStyles.popoverHeading}>{sortLabel}</div>
            <ul className={refreshStyles.popoverOptionList} role="listbox" aria-label={sortLabel}>
              {sortOptions.map((option) => {
                const active = option.value === sortValue;
                return (
                  <li key={option.value} role="presentation">
                    <button
                      type="button"
                      className={refreshStyles.popoverOption}
                      role="option"
                      aria-selected={active}
                      onClick={() => handleSortPick(option.value)}
                    >
                      <span>{option.label}</span>
                      <span className={refreshStyles.optionMarker} aria-hidden="true">
                        {active ? <IconCheck size={14} /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </PopoverButton>

      <PopoverButton
        open={pageSizeOpen}
        onOpenChange={handlePageSizeOpenChange}
        ariaLabel={pageSizeLabel}
        triggerLabel={pageSizeLabel}
        triggerSummary={pageSizeSummary}
        triggerIcon={pageSizeTriggerIcon}
      >
        {pageSizeOpen ? (
          <>
            <div className={refreshStyles.popoverHeading}>{pageSizeLabel}</div>
            <div className={refreshStyles.presetGrid} role="group" aria-label={pageSizeLabel}>
              {pageSizePresets.map((preset) => {
                const active = preset === pageSize;
                return (
                  <button
                    key={preset}
                    type="button"
                    className={refreshStyles.preset}
                    onClick={() => handlePageSizePreset(preset)}
                    aria-pressed={active}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
            <label className={refreshStyles.customPageSize}>
              <span className={refreshStyles.customPageSizeLabel}>
                {t('auth_files.page_size_custom')}
              </span>
              <input
                type="number"
                min={pageSizeMin}
                max={pageSizeMax}
                step={1}
                value={pageSizeDraft}
                onChange={handlePageSizeDraftChange}
                onBlur={commitPageSizeDraft}
                onKeyDown={handlePageSizeKeyDown}
                className={refreshStyles.customPageSizeInput}
                aria-label={pageSizeLabel}
              />
            </label>
          </>
        ) : null}
      </PopoverButton>
    </div>
  );
});

SearchToolbar.displayName = 'SearchToolbar';
