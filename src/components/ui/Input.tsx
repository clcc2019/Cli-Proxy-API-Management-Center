import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

type InputDensity = 'sm' | 'md';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  rightElement?: ReactNode;
  leftElement?: ReactNode;
  /** 尺寸密度；避免与原生 <input size> 冲突，改名为 density */
  density?: InputDensity;
  /** 占满父宽度（默认 true） */
  fullWidth?: boolean;
}

export function Input({
  label,
  hint,
  error,
  rightElement,
  leftElement,
  density = 'md',
  fullWidth = true,
  className = '',
  id,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  ...rest
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, errorId, hintId].filter(Boolean).join(' ') || undefined;
  const invalid = error ? true : ariaInvalid;

  const controlClasses = ['input-control'];
  if (density === 'sm') controlClasses.push('input-control-sm');
  if (leftElement) controlClasses.push('input-control-with-left');
  if (rightElement) controlClasses.push('input-control-with-right');
  if (!fullWidth) controlClasses.push('input-control-inline');

  return (
    <div className="form-group">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className={controlClasses.join(' ')}>
        {leftElement && (
          <span className="input-affix input-affix-left" aria-hidden="true">
            {leftElement}
          </span>
        )}
        <input
          {...rest}
          id={inputId}
          className={`input ${className}`.trim()}
          aria-invalid={invalid}
          aria-describedby={describedBy}
        />
        {rightElement && (
          <span className="input-affix input-affix-right" aria-hidden="true">
            {rightElement}
          </span>
        )}
      </div>
      {hint && (
        <div id={hintId} className="hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="error-box" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
