import type { PropsWithChildren } from 'react';
import { Button, type ButtonProps } from './Button';
import { IconRefreshCw } from './icons';

export type RefreshButtonProps = PropsWithChildren<
  Omit<ButtonProps, 'loading'> & {
    loading: boolean;
    label: string;
    iconSize?: number;
    iconClassName?: string;
  }
>;

/**
 * Shared refresh action. Its busy state deliberately delegates to Button so
 * every refresh uses the same spinner, disabled state and aria-busy behavior
 * as primary save actions.
 */
export function RefreshButton({
  loading,
  label,
  iconSize = 16,
  iconClassName = '',
  className = '',
  disabled,
  title,
  children,
  'aria-label': ariaLabel,
  ...buttonProps
}: RefreshButtonProps) {
  const hasLabelContent = children !== null && children !== undefined && children !== false;
  const content = loading ? (
    hasLabelContent ? (
      children
    ) : undefined
  ) : (
    <>
      <IconRefreshCw className={iconClassName} size={iconSize} aria-hidden="true" />
      {children}
    </>
  );

  return (
    <Button
      {...buttonProps}
      className={className}
      loading={loading}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
    >
      {content}
    </Button>
  );
}
