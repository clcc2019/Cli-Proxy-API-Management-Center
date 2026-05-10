import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'subtle'
  | 'danger'
  | 'danger-subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  /** 只有图标时传 true，让按钮变方形；必须搭配 aria-label */
  iconOnly?: boolean;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  iconOnly = false,
  className = '',
  disabled,
  ...rest
}: PropsWithChildren<ButtonProps>) {
  const hasChildren = children !== null && children !== undefined && children !== false;
  const classes = [
    'btn',
    `btn-${variant}`,
    size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '',
    fullWidth ? 'btn-full' : '',
    iconOnly ? 'btn-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loading && <span className="loading-spinner" aria-hidden="true" />}
      {hasChildren && (iconOnly ? children : <span>{children}</span>)}
    </button>
  );
}
