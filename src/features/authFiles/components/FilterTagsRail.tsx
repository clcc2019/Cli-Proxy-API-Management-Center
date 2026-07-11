import { memo, useCallback, useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFilterAll } from '@/components/ui/icons';
import {
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import styles from '@/pages/AuthFilesPage.module.scss';

const ALL_FILTER_STYLE = {
  '--filter-color': 'var(--text-primary)',
  '--filter-surface': 'var(--bg-tertiary)',
} as CSSProperties;

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

const areFilterTypesEqual = (left: string[], right: string[]) => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((type, index) => type === right[index]);
};

const areDisplayedTypeCountsEqual = (
  types: string[],
  left: Record<string, number>,
  right: Record<string, number>
) => types.every((type) => (left[type] ?? 0) === (right[type] ?? 0));

const areFilterTagsRailPropsEqual = (prev: FilterTagsRailProps, next: FilterTagsRailProps) =>
  prev.activeFilter === next.activeFilter &&
  prev.resolvedTheme === next.resolvedTheme &&
  prev.onSelect === next.onSelect &&
  areFilterTypesEqual(prev.types, next.types) &&
  areDisplayedTypeCountsEqual(next.types, prev.typeCounts, next.typeCounts);

export const FilterTagsRail = memo(function FilterTagsRail({
  types,
  activeFilter,
  typeCounts,
  resolvedTheme,
  onSelect,
}: FilterTagsRailProps) {
  const { t } = useTranslation();
  const activeTextColor = resolvedTheme === 'dark' ? '#111827' : '#ffffff';

  // 按 type 预计算稳定的 label/icon/color/style，避免每次渲染对每个 tag
  // 重新构造对象/调用查找，否则 FilterTagButton 的 style prop 引用每次都变 → memo 失效。
  const tags = useMemo(
    () =>
      types.map((type) => {
        if (type === 'all') {
          return {
            type,
            label: getTypeLabel(t, type),
            iconSrc: null,
            style: ALL_FILTER_STYLE,
          };
        }
        const color = getTypeColor(type, resolvedTheme);
        return {
          type,
          label: getTypeLabel(t, type),
          iconSrc: getAuthFileIcon(type, resolvedTheme),
          style: {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': activeTextColor,
          } as CSSProperties,
        };
      }),
    [types, resolvedTheme, t, activeTextColor]
  );

  return (
    <div className={styles.filterRail}>
      <div className={styles.filterTags}>
        {tags.map((tag) => (
          <FilterTagButton
            key={tag.type}
            type={tag.type}
            label={tag.label}
            iconSrc={tag.iconSrc}
            count={typeCounts[tag.type] ?? 0}
            active={activeFilter === tag.type}
            style={tag.style}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}, areFilterTagsRailPropsEqual);

FilterTagsRail.displayName = 'FilterTagsRail';
