import { forwardRef, type ReactNode } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import styles from './ProviderEditShell.module.scss';

export type ProviderEditShellProps = {
  title: ReactNode;
  leadingIcon?: ReactNode;
  onBack?: () => void;
  floatingAction?: ReactNode;
  isLoading?: boolean;
  loadingLabel?: ReactNode;
  className?: string;
  contentClassName?: string;
  width?: number | string;
  children?: ReactNode;
};

export const ProviderEditShell = forwardRef<HTMLDivElement, ProviderEditShellProps>(
  function ProviderEditShell(
    {
      title,
      leadingIcon,
      onBack,
      floatingAction,
      isLoading = false,
      loadingLabel = 'Loading...',
      className = '',
      contentClassName = '',
      width = 720,
      children,
    },
    ref
  ) {
    const modalClassName = [styles.modal, className].filter(Boolean).join(' ');
    const bodyClassName = [styles.body, contentClassName].filter(Boolean).join(' ');

    const resolvedTitle = leadingIcon ? (
      <div className={styles.titleRow}>
        <span className={styles.titleAvatar}>{leadingIcon}</span>
        <span className={styles.titleText}>{title}</span>
      </div>
    ) : (
      <span className={styles.titleText}>{title}</span>
    );

    const footer = floatingAction ? <div className={styles.footer}>{floatingAction}</div> : null;

    return (
      <Modal
        open
        onClose={onBack ?? (() => undefined)}
        title={resolvedTitle}
        footer={footer}
        width={width}
        className={modalClassName}
      >
        <div ref={ref} className={bodyClassName}>
          {isLoading ? (
            <div className={styles.loadingState} role="status" aria-busy="true">
              <LoadingSpinner size={16} />
              <span>{loadingLabel}</span>
            </div>
          ) : (
            children
          )}
        </div>
      </Modal>
    );
  }
);
