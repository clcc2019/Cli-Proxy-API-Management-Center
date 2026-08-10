import type { ReactNode } from 'react';
import styles from './ManagementToolbar.module.scss';

interface ManagementToolbarProps {
  primary: ReactNode;
  secondary?: ReactNode;
  actions?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

export function ManagementToolbar({
  primary,
  secondary,
  actions,
  className = '',
  ariaLabel,
}: ManagementToolbarProps) {
  return (
    <div className={`${styles.toolbar} ${className}`.trim()} role="toolbar" aria-label={ariaLabel}>
      <div className={styles.primary}>{primary}</div>
      {secondary ? <div className={styles.secondary}>{secondary}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
