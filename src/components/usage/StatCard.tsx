import { memo, type CSSProperties, type ReactNode } from 'react';
import styles from '@/pages/UsagePage.module.scss';

export interface StatCardProps {
  cardKey: string;
  label: string;
  icon: ReactNode;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  value: ReactNode;
  meta?: ReactNode;
}

// 单张统计卡片：独立 memo，loading 变化只影响父级传入的 value/meta 文案，
// 不会因为其它卡片的 metrics 变化而重渲染。accent 系列样式对象在此 memo 化，
// 避免每次渲染重建内联 style 引用。
export const StatCard = memo(function StatCard({
  cardKey,
  label,
  icon,
  accent,
  accentSoft,
  accentBorder,
  value,
  meta,
}: StatCardProps) {
  const cardStyle = {
    '--accent': accent,
    '--accent-soft': accentSoft,
    '--accent-border': accentBorder,
  } as CSSProperties;

  return (
    <div key={cardKey} className={styles.statCard} style={cardStyle}>
      <div className={styles.statCardHeader}>
        <div className={styles.statLabelGroup}>
          <span className={styles.statLabel}>{label}</span>
        </div>
        <span className={styles.statIconBadge}>{icon}</span>
      </div>
      <div className={styles.statValue}>{value}</div>
      {meta && <div className={styles.statMetaRow}>{meta}</div>}
    </div>
  );
});

StatCard.displayName = 'StatCard';
