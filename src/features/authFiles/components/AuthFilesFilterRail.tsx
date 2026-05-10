import { memo, type CSSProperties } from 'react';
import { TFunction } from 'i18next';
import { IconFilterAll } from '@/components/ui/icons';
import { cx } from '@/utils/cx';
import {
  getAuthFileIcon,
  getTypeColor,
  getTypeLabel,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import styles from '@/pages/AuthFilesPage.module.scss';

export interface AuthFilesFilterRailProps {
  types: string[];
  activeType: string;
  typeCounts: Record<string, number>;
  resolvedTheme: ResolvedTheme;
  t: TFunction;
  onChange: (type: string) => void;
}

/**
 * Provider-type filter tags for AuthFilesPage.
 * Memoized so the (potentially wide) tag bar does not re-render when the
 * parent state (search query, pagination, etc.) changes.
 */
function AuthFilesFilterRailImpl({
  types,
  activeType,
  typeCounts,
  resolvedTheme,
  t,
  onChange,
}: AuthFilesFilterRailProps) {
  return (
    <div className={styles.filterRail}>
      <div className={styles.filterTags}>
        {types.map((type) => {
          const isActive = activeType === type;
          const iconSrc = getAuthFileIcon(type, resolvedTheme);
          const color =
            type === 'all'
              ? { bg: 'var(--surface-3)', text: 'var(--text-primary)' }
              : getTypeColor(type, resolvedTheme);
          const buttonStyle = {
            '--filter-color': color.text,
            '--filter-surface': color.bg,
            '--filter-active-text': resolvedTheme === 'dark' ? '#111827' : '#ffffff',
          } as CSSProperties;

          return (
            <button
              key={type}
              type="button"
              className={cx(styles.filterTag, isActive && styles.filterTagActive)}
              style={buttonStyle}
              onClick={() => onChange(type)}
              aria-pressed={isActive}
            >
              <span className={styles.filterTagLabel}>
                {type === 'all' ? (
                  <span className={cx(styles.filterTagIconWrap, styles.filterAllIconWrap)}>
                    <IconFilterAll className={styles.filterAllIcon} size={16} />
                  </span>
                ) : (
                  <span className={styles.filterTagIconWrap}>
                    {iconSrc ? (
                      <img src={iconSrc} alt="" className={styles.filterTagIcon} />
                    ) : (
                      <span className={styles.filterTagIconFallback}>
                        {getTypeLabel(t, type).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </span>
                )}
                <span className={styles.filterTagText}>{getTypeLabel(t, type)}</span>
              </span>
              <span className={styles.filterTagCount}>{typeCounts[type] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const AuthFilesFilterRail = memo(AuthFilesFilterRailImpl);
