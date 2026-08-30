import type { ChangeEvent, ReactNode } from 'react';
import styles from './ToggleSwitch.module.scss';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
  ariaBusy?: boolean;
  disabled?: boolean;
  labelPosition?: 'left' | 'right';
  labelInside?: boolean;
  className?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  ariaLabel,
  ariaBusy = false,
  disabled = false,
  labelPosition = 'right',
  labelInside = false,
  className: customClassName = ''
}: ToggleSwitchProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  const className = [
    styles.root,
    labelPosition === 'left' ? styles.labelLeft : '',
    labelInside ? styles.labelInside : '',
    disabled ? styles.disabled : '',
    customClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <label className={className}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-checked={checked}
        aria-busy={ariaBusy || undefined}
      />
      <span className={styles.track}>
        {labelInside && label && <span className={styles.trackLabel}>{label}</span>}
        <span className={styles.thumb} />
      </span>
      {!labelInside && label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
