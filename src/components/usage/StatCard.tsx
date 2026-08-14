import { memo, type ReactNode } from 'react';
import styles from '@/pages/UsagePage.module.scss';

export interface StatCardProps {
  cardKey: string;
  label: string;
  value: ReactNode;
  meta?: ReactNode;
}

export const StatCard = memo(function StatCard({
  cardKey,
  label,
  value,
  meta,
}: StatCardProps) {
  return (
    <div key={cardKey} className={styles.statCard} data-stat-key={cardKey}>
      <div className={styles.statCardHeader}>
        <div className={styles.statLabelGroup}>
          <span className={styles.statLabel}>{label}</span>
        </div>
      </div>
      <div className={styles.statValue}>{value}</div>
      {meta && <div className={styles.statMetaRow}>{meta}</div>}
    </div>
  );
});

StatCard.displayName = 'StatCard';
