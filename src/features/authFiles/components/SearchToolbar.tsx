import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconSearch,
  IconSlidersHorizontal,
  IconLayoutDashboard,
  IconCheck,
  IconX,
} from '@/components/ui/icons';
import styles from '@/pages/AuthFilesPage.module.scss';

export interface SortOption {
  value: string;
  label: string;
}

export interface SearchToolbarProps {
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointer = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (event.target instanceof Node && wrapperRef.current.contains(event.target)) return;
      onOpenChange(false);
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapperRef} className={styles.searchToolbarPopoverWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.searchToolbarIconButton} ${open ? styles.searchToolbarIconButtonActive : ''}`}
        onClick={() => onOpenChange(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={
          triggerSummary ? `${ariaLabel}: ${triggerSummary}` : ariaLabel
        }
        title={triggerSummary ? `${triggerLabel} · ${triggerSummary}` : triggerLabel}
      >
        {triggerIcon}
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={triggerLabel}
          className={styles.searchToolbarPopover}
        >
          {children}
        </div>
      )}
    </div>
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

  // Keep the draft in sync if pageSize is updated externally.
  useEffect(() => {
    setPageSizeDraft(String(pageSize));
  }, [pageSize]);

  const handleSearchInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange(event.target.value);
    },
    [onSearchChange]
  );

  const handleSearchClear = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  const handleSortPick = useCallback(
    (value: string) => {
      onSortChange(value);
      setSortOpen(false);
    },
    [onSortChange]
  );

  const commitPageSizeDraft = useCallback(() => {
    const parsed = Math.round(Number(pageSizeDraft));
    if (!Number.isFinite(parsed)) {
      setPageSizeDraft(String(pageSize));
      return;
    }
    const clamped = Math.min(pageSizeMax, Math.max(pageSizeMin, parsed));
    onPageSizeChange(clamped);
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
      onPageSizeChange(value);
      setPageSizeDraft(String(value));
      setPageSizeOpen(false);
    },
    [onPageSizeChange]
  );

  const sortSummary = useMemo(
    () => sortOptions.find((option) => option.value === sortValue)?.label ?? sortValue,
    [sortOptions, sortValue]
  );

  return (
    <div className={styles.searchToolbar}>
      <div className={styles.searchToolbarField}>
        <IconSearch size={16} className={styles.searchToolbarFieldIcon} aria-hidden="true" />
        <input
          type="search"
          className={styles.searchToolbarInput}
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
            className={styles.searchToolbarFieldClear}
            onClick={handleSearchClear}
            aria-label={t('common.clear', { defaultValue: 'Clear' })}
            title={t('common.clear', { defaultValue: 'Clear' })}
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      <PopoverButton
        open={sortOpen}
        onOpenChange={setSortOpen}
        ariaLabel={sortLabel}
        triggerLabel={sortLabel}
        triggerSummary={sortSummary}
        triggerIcon={<IconSlidersHorizontal size={16} aria-hidden="true" />}
      >
        <div className={styles.searchToolbarPopoverHeader}>{sortLabel}</div>
        <ul className={styles.searchToolbarOptionList} role="listbox" aria-label={sortLabel}>
          {sortOptions.map((option) => {
            const active = option.value === sortValue;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  className={`${styles.searchToolbarOption} ${active ? styles.searchToolbarOptionActive : ''}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => handleSortPick(option.value)}
                >
                  <span>{option.label}</span>
                  {active && <IconCheck size={14} aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverButton>

      <PopoverButton
        open={pageSizeOpen}
        onOpenChange={setPageSizeOpen}
        ariaLabel={pageSizeLabel}
        triggerLabel={pageSizeLabel}
        triggerSummary={`${pageSize}/${t('auth_files.page_size_unit', { defaultValue: '页' })}`}
        triggerIcon={<IconLayoutDashboard size={16} aria-hidden="true" />}
      >
        <div className={styles.searchToolbarPopoverHeader}>{pageSizeLabel}</div>
        <div className={styles.searchToolbarPresetGrid} role="group" aria-label={pageSizeLabel}>
          {pageSizePresets.map((preset) => {
            const active = preset === pageSize;
            return (
              <button
                key={preset}
                type="button"
                className={`${styles.searchToolbarPreset} ${active ? styles.searchToolbarPresetActive : ''}`}
                onClick={() => handlePageSizePreset(preset)}
                aria-pressed={active}
              >
                {preset}
              </button>
            );
          })}
        </div>
        <label className={styles.searchToolbarCustom}>
          <span className={styles.searchToolbarCustomLabel}>
            {t('auth_files.page_size_custom', { defaultValue: '自定义' })}
          </span>
          <input
            type="number"
            min={pageSizeMin}
            max={pageSizeMax}
            step={1}
            value={pageSizeDraft}
            onChange={(event) => setPageSizeDraft(event.target.value)}
            onBlur={commitPageSizeDraft}
            onKeyDown={handlePageSizeKeyDown}
            className={styles.searchToolbarCustomInput}
            aria-label={pageSizeLabel}
          />
        </label>
      </PopoverButton>
    </div>
  );
});

SearchToolbar.displayName = 'SearchToolbar';
