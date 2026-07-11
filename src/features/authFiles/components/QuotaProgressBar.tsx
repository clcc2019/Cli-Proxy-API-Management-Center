import { memo, useMemo } from 'react';
import { getQuotaProgressLevel, normalizeQuotaProgressPercent } from '@/utils/quota';
import styles from '@/pages/AuthFilesPage.module.scss';

export type QuotaProgressBarProps = {
  percent: number | null;
  highThreshold?: number;
  mediumThreshold?: number;
  ariaLabel?: string;
  ariaValueText?: string;
};

export const QuotaProgressBar = memo(function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold,
  ariaLabel,
  ariaValueText,
}: QuotaProgressBarProps) {
  const normalized = normalizeQuotaProgressPercent(percent);
  const progressLevel = getQuotaProgressLevel(percent, highThreshold, mediumThreshold);
  const fillClass =
    progressLevel === 'high'
      ? styles.quotaBarFillHigh
      : progressLevel === 'medium' || progressLevel === 'unknown'
        ? styles.quotaBarFillMedium
        : styles.quotaBarFillLow;
  const widthPercent = Math.round(normalized ?? 0);
  const ariaValue = normalized === null ? undefined : Math.round(normalized);
  const fillStyle = useMemo(
    () => ({
      width: `${widthPercent}%`,
      minWidth: widthPercent > 0 ? 4 : 0,
    }),
    [widthPercent]
  );

  return (
    <div
      className={styles.quotaBar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ariaValue}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
    >
      <div className={`${styles.quotaBarFill} ${fillClass}`} style={fillStyle} />
    </div>
  );
});
