import type { PropsWithChildren } from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { IconRefreshCw } from '@/components/ui/icons';
import styles from './AuthFilesRefreshButton.module.scss';

export type AuthFilesRefreshButtonProps = PropsWithChildren<
  Omit<ButtonProps, 'loading' | 'aria-busy'> & {
    refreshing: boolean;
    label: string;
    iconSize?: number;
    iconClassName?: string;
  }
>;

export type AuthFilesRefreshIndicatorProps = {
  refreshing: boolean;
  iconSize?: number;
  iconClassName?: string;
};

export function AuthFilesRefreshIndicator({
  refreshing,
  iconSize = 16,
  iconClassName = '',
}: AuthFilesRefreshIndicatorProps) {
  const iconClasses = [styles.icon, iconClassName, refreshing ? styles.iconSpinning : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={styles.indicator} aria-hidden="true">
      <IconRefreshCw className={iconClasses} size={iconSize} />
    </span>
  );
}

export function AuthFilesRefreshButton({
  refreshing,
  label,
  iconSize = 16,
  iconClassName = '',
  className = '',
  disabled,
  title,
  children,
  'aria-label': ariaLabel,
  ...buttonProps
}: AuthFilesRefreshButtonProps) {
  return (
    <Button
      {...buttonProps}
      className={[styles.button, className].filter(Boolean).join(' ')}
      disabled={disabled || refreshing}
      aria-busy={refreshing || undefined}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
    >
      <AuthFilesRefreshIndicator
        refreshing={refreshing}
        iconSize={iconSize}
        iconClassName={iconClassName}
      />
      {children}
    </Button>
  );
}
