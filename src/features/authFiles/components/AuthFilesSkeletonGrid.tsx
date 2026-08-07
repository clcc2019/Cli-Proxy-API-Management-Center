import { memo, useMemo } from 'react';
import styles from '@/pages/AuthFilesPage.module.scss';
import refreshStyles from '@/pages/AuthFilesPageRefresh.module.scss';

const AUTH_FILE_SKELETON_MAX = 12;

type AuthFilesSkeletonGridProps = {
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
        className={`${styles.fileGrid} ${refreshStyles.cardGrid} ${styles.skeletonGrid} ${refreshStyles.loadingGrid} ${quotaManaged ? styles.fileGridQuotaManaged : ''}`}
        aria-hidden="true"
      >
        {items.map((_, index) => (
          <div
            key={index}
            className={`${styles.fileCardSkeleton} ${refreshStyles.loadingCard} ${quotaManaged ? refreshStyles.loadingCardQuota : ''}`}
          >
            <div className={refreshStyles.loadingHeader}>
              <span className={`${styles.skeletonBlock} ${refreshStyles.loadingCheckbox}`} />
              <div className={refreshStyles.loadingIdentity}>
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingProvider}`} />
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingName}`} />
              </div>
              <span className={`${styles.skeletonBlock} ${refreshStyles.loadingPriority}`} />
            </div>

            <div className={refreshStyles.loadingMetrics}>
              <div className={refreshStyles.loadingMetricHeader}>
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingMetricLabel}`} />
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingMetricValue}`} />
              </div>
              <span className={`${styles.skeletonBlock} ${refreshStyles.loadingStatusBar}`} />
              <div className={refreshStyles.loadingMetricStats}>
                {Array.from({ length: 3 }).map((__, statIndex) => (
                  <span key={statIndex} className={styles.skeletonBlock} />
                ))}
              </div>

              {quotaManaged && (
                <div className={refreshStyles.loadingQuota}>
                  <div className={refreshStyles.loadingMetricHeader}>
                    <span
                      className={`${styles.skeletonBlock} ${refreshStyles.loadingMetricLabel}`}
                    />
                    <span
                      className={`${styles.skeletonBlock} ${refreshStyles.loadingMetricValue}`}
                    />
                  </div>
                  <span className={`${styles.skeletonBlock} ${refreshStyles.loadingQuotaBar}`} />
                  <div className={refreshStyles.loadingQuotaStats}>
                    <span className={styles.skeletonBlock} />
                    <span className={styles.skeletonBlock} />
                  </div>
                </div>
              )}
            </div>

            <div className={refreshStyles.loadingFooter}>
              <div className={refreshStyles.loadingFooterLeft}>
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingToggle}`} />
                <div className={refreshStyles.loadingActions}>
                  {Array.from({ length: 5 }).map((__, actionIndex) => (
                    <span key={actionIndex} className={styles.skeletonBlock} />
                  ))}
                </div>
              </div>
              {quotaManaged && (
                <span className={`${styles.skeletonBlock} ${refreshStyles.loadingRefresh}`} />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

AuthFilesSkeletonGrid.displayName = 'AuthFilesSkeletonGrid';
