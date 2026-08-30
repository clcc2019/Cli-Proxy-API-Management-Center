import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { IconFilterAll } from '@/components/ui/icons';
import type { ResolvedTheme } from '@/types';
import { getAuthFileIcon, getTypeColor, getTypeLabel } from '@/features/authFiles/constants';
import refreshStyles from '@/pages/AuthFilesPageRefresh.module.scss';

const ALL_FILTER_STYLE = {
  '--filter-color': 'var(--mg-text)',
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
      className={`${refreshStyles.providerTab} ${active ? refreshStyles.providerTabActive : ''}`}
      style={style}
      // 选中态此前仅靠配色与 2px 下划线表达，读屏器无法感知当前筛选项。
      aria-pressed={active}
      onClick={handleClick}
    >
      <span className={refreshStyles.providerTabLabel}>
        {type === 'all' ? (
          <span className={refreshStyles.providerTabIconBox} aria-hidden="true">
            <IconFilterAll className={refreshStyles.providerTabIcon} size={15} />
          </span>
        ) : (
          <span className={refreshStyles.providerTabIconBox} aria-hidden="true">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt=""
                width={18}
                height={18}
                loading="lazy"
                fetchPriority="low"
                decoding="async"
                className={refreshStyles.providerTabIcon}
              />
            ) : (
              <span className={refreshStyles.providerTabFallback}>
                {label.slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        )}
        <span className={refreshStyles.providerTabText}>{label}</span>
      </span>
      <span className={refreshStyles.providerTabCount}>{count}</span>
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
  const railRef = useRef<HTMLElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

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
          } as CSSProperties,
        };
      }),
    [types, resolvedTheme, t]
  );

  useEffect(() => {
    const rail = railRef.current;
    const scroller = tagsRef.current;
    if (!rail || !scroller) return undefined;

    let frameId = 0;
    const updateScrollEdges = () => {
      frameId = 0;
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      rail.dataset.canScrollBack = String(scroller.scrollLeft > 2);
      rail.dataset.canScrollForward = String(scroller.scrollLeft < maxScrollLeft - 2);
    };
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateScrollEdges);
    };

    updateScrollEdges();
    scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate);
    resizeObserver?.observe(scroller);
    if (scroller.firstElementChild) resizeObserver?.observe(scroller.firstElementChild);

    return () => {
      scroller.removeEventListener('scroll', scheduleUpdate);
      resizeObserver?.disconnect();
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [tags]);

  return (
    <nav
      ref={railRef}
      className={refreshStyles.providerRail}
      aria-label={t('auth_files.provider_filter_label')}
    >
      <div ref={tagsRef} className={refreshStyles.providerTags}>
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
    </nav>
  );
}, areFilterTagsRailPropsEqual);

FilterTagsRail.displayName = 'FilterTagsRail';
