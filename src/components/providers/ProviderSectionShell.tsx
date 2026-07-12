import { memo, type ReactNode } from 'react';
import styles from '@/pages/AiProvidersPage.module.scss';

interface ProviderSectionShellProps {
  title: ReactNode;
  count: number;
  action: ReactNode;
  children: ReactNode;
}

export const ProviderSectionShell = memo(function ProviderSectionShell({
  title,
  count,
  action,
  children,
}: ProviderSectionShellProps) {
  return (
    <section className={styles.providerSectionShell}>
      <header className={styles.providerSectionHeader}>
        <div className={styles.providerSectionTitleGroup}>
          <div className={styles.providerSectionTitle}>{title}</div>
          <span className={styles.providerSectionCount}>{count}</span>
        </div>
        <div className={styles.providerSectionAction}>{action}</div>
      </header>
      <div className={styles.providerSectionBody}>{children}</div>
    </section>
  );
});

ProviderSectionShell.displayName = 'ProviderSectionShell';
