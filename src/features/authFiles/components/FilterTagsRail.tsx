import { memo, useCallback, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFilterAll } from '@/components/ui/icons';
import {
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import styles from '@/pages/AuthFilesPage.module.scss';

export interface FilterTagsRailProps {
  types: string[];
  activeFilter: string;
  typeCounts: Record<string, number>;
  resolvedTheme: ResolvedTheme;
  onSelect: (value: string) => void;
}

interface FilterTagButtonProps {
  type: string;
  label: string;
  iconSrc: string | null;
  count: number;
  active: boolean;
  style: CSSProperties;
  onSelect: (value: string) => void;
}

const FilterTagButton = memo(function FilterTagButton({
  type,
  label,
  iconSrc,
  count,
  active,
  style,
  onSelect,
}: FilterTagButtonProps) {
  const handleClick = useCallback(() => onSelect(type), [onSelect, type]);
  return (
    <button
      type="button"
      className={`${styles.filterTag} ${active ? styles.filterTagActive : ''}`}
      style={style}
      onClick={handleClick}
    >
      <span className={styles.filterTagLabel}>
        {type === 'all' ? (
          <span className={`${styles.filterTagIconWrap} ${styles.filterAllIconWrap}`}>
            <IconFilterAll className={styles.filterAllIcon} size={16} />
          </span>
        ) : (
          <span className={styles.filterTagIconWrap}>
            {iconSrc ? (
              <img src={iconSrc} alt="" className={styles.filterTagIcon} />
            ) : (
              <span className={styles.filterTagIconFallback}>
                {label.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        )}
        <span className={styles.filterTagText}>{label}</span>
      </span>
      <span className={styles.filterTagCount}>{count}</span>
    </button>
  );
});

FilterTagButton.displayName = 'FilterTagButton';

export const FilterTagsRail = memo(function FilterTagsRail({
  types,
  activeFilter,
  typeCounts,
  resolvedTheme,
  onSelect,
}: FilterTagsRailProps) {
  const { t } = useTranslation();
  const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#ffffff';
  return (
    <div className={styles.filterRail}>
      <div className={styles.filterTags}>
        {types.map((type) => {
          const color =
            type === 'all'
              ? { bg: 'var(--bg-tertiary)', text: 'var(--text-primary)' }
              : getTypeColor(type, resolvedTheme);
          const buttonStyle = {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': activeTextColor,
          } as CSSProperties;
          return (
            <FilterTagButton
              key={type}
              type={type}
              label={getTypeLabel(t, type)}
              iconSrc={type === 'all' ? null : getAuthFileIcon(type, resolvedTheme)}
              count={typeCounts[type] ?? 0}
              active={activeFilter === type}
              style={buttonStyle}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
});

FilterTagsRail.displayName = 'FilterTagsRail';
