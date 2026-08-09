import { memo, useMemo } from 'react';
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
      <span className={refreshStyles.visuallyHidden} role="status" aria-busy="true">
        {loadingLabel}
      </span>
      <div
        className={`${refreshStyles.cardGrid} ${refreshStyles.loadingGrid} ${quotaManaged ? refreshStyles.cardGridQuotaManaged : ''}`}
        aria-hidden="true"
      >
        {items.map((_, index) => (
          <div
            key={index}
            className={`${refreshStyles.loadingCard} ${quotaManaged ? refreshStyles.loadingCardQuota : ''}`}
          >
            <div className={refreshStyles.loadingHeader}>
              <span className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingCheckbox}`} />
              <div className={refreshStyles.loadingIdentity}>
                <span className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingProvider}`} />
                <span className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingName}`} />
              </div>
              <span className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingPriority}`} />
            </div>

            <div className={refreshStyles.loadingMetrics}>
              <div className={refreshStyles.loadingMetricHeader}>
                <span
                  className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingMetricLabel}`}
                />
                <span
                  className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingMetricValue}`}
                />
              </div>
              <span
                className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingStatusBar}`}
              />
              <div className={refreshStyles.loadingMetricStats}>
                {Array.from({ length: 3 }).map((__, statIndex) => (
                  <span key={statIndex} className={refreshStyles.skeletonBlock} />
                ))}
              </div>

              {quotaManaged && (
                <div className={refreshStyles.loadingQuota}>
                  <div className={refreshStyles.loadingMetricHeader}>
                    <span
                      className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingMetricLabel}`}
                    />
                    <span
                      className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingMetricValue}`}
                    />
                  </div>
                  <span
                    className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingQuotaBar}`}
                  />
                  <div className={refreshStyles.loadingQuotaStats}>
                    <span className={refreshStyles.skeletonBlock} />
                    <span className={refreshStyles.skeletonBlock} />
                  </div>
                </div>
              )}
            </div>

            <div className={refreshStyles.loadingFooter}>
              <div className={refreshStyles.loadingFooterLeft}>
                <span
                  className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingToggle}`}
                />
                <div className={refreshStyles.loadingActions}>
                  {Array.from({ length: 5 }).map((__, actionIndex) => (
                    <span key={actionIndex} className={refreshStyles.skeletonBlock} />
                  ))}
                </div>
              </div>
              {quotaManaged && (
                <span
                  className={`${refreshStyles.skeletonBlock} ${refreshStyles.loadingRefresh}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
});

AuthFilesSkeletonGrid.displayName = 'AuthFilesSkeletonGrid';
