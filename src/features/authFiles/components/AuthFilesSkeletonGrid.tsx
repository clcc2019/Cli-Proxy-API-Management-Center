import { memo, useMemo } from 'react';
import styles from '@/pages/AuthFilesPage.module.scss';

const AUTH_FILE_SKELETON_MAX = 12;

export type AuthFilesSkeletonGridProps = {
  count: number;
  quotaManaged: boolean;
  loadingLabel: string;
};

export const AuthFilesSkeletonGrid = memo(function AuthFilesSkeletonGrid({
  count,
  quotaManaged,
  loadingLabel,
}: AuthFilesSkeletonGridProps) {
  const items = useMemo(
    () => Array.from({ length: Math.min(Math.max(count, 3), AUTH_FILE_SKELETON_MAX) }),
    [count]
  );

  return (
    <>
      <span className={styles.visuallyHidden} role="status" aria-busy="true">
        {loadingLabel}
      </span>
      <div
        className={`${styles.fileGrid} ${quotaManaged ? styles.fileGridQuotaManaged : ''} ${styles.skeletonGrid}`}
        aria-hidden="true"
      >
        {items.map((_, index) => (
          <div key={index} className={styles.fileCardSkeleton}>
            <div className={styles.skeletonHeader}>
              <span className={`${styles.skeletonBlock} ${styles.skeletonAvatar}`} />
              <span className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
              <span className={`${styles.skeletonBlock} ${styles.skeletonBadge}`} />
            </div>
            <div className={styles.skeletonMeta}>
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
            </div>
            <div className={styles.skeletonStats}>
              {Array.from({ length: 4 }).map((__, statIndex) => (
                <span key={statIndex} className={styles.skeletonBlock} />
              ))}
            </div>
            <div className={styles.skeletonActions}>
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
              <span className={styles.skeletonBlock} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

AuthFilesSkeletonGrid.displayName = 'AuthFilesSkeletonGrid';
