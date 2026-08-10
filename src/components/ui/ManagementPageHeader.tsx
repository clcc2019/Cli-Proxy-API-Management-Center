import type { ReactNode } from 'react';
import styles from './ManagementPageHeader.module.scss';

interface ManagementPageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  count?: ReactNode;
  countAriaLabel?: string;
  context?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleId?: string;
}

export function ManagementPageHeader({
  title,
  description,
  count,
  countAriaLabel,
  context,
  actions,
  className = '',
  titleId,
}: ManagementPageHeaderProps) {
  return (
    <header className={`${styles.header} ${className}`.trim()}>
      <div className={styles.identity}>
        {context ? <div className={styles.context}>{context}</div> : null}
        <div className={styles.titleRow}>
          <h1 id={titleId} className={styles.title}>
            {title}
          </h1>
          {count !== undefined ? (
            <span className={styles.count} role="status" aria-label={countAriaLabel}>
              {count}
            </span>
          ) : null}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
