import { memo, type ReactNode } from 'react';
import styles from '@/pages/UsagePage.module.scss';

export interface UsageSectionIntroProps {
  title: string;
  description: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
}

export const UsageSectionIntro = memo(function UsageSectionIntro({
  title,
  description,
  eyebrow,
  action,
}: UsageSectionIntroProps) {
  return (
    <div className={styles.sectionHeader}>
      {eyebrow ? <div className={styles.sectionEyebrow}>{eyebrow}</div> : null}
      <div className={styles.sectionHeaderRow}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {action ? <div className={styles.sectionHeaderAction}>{action}</div> : null}
      </div>
      <p className={styles.sectionDescription}>{description}</p>
    </div>
  );
});

UsageSectionIntro.displayName = 'UsageSectionIntro';
