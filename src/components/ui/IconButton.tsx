import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

interface IconButtonProps extends Omit<ButtonProps, 'children' | 'aria-label'> {
  icon: ReactNode;
  'aria-label': string;
}

export function IconButton({ icon, className = '', title, ...props }: IconButtonProps) {
  const label = props['aria-label'];
  return (
    <Button
      {...props}
      className={`icon-button ${className}`.trim()}
      title={title ?? label}
      aria-label={label}
    >
      {icon}
    </Button>
  );
}
