import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { IconChevronDown } from './icons';

interface AutocompleteInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[] | { value: string; label?: string }[];
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  id?: string;
  rightElement?: ReactNode;
}

export function AutocompleteInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  hint,
  error,
  className = '',
  wrapperClassName = '',
  wrapperStyle,
  id,
  rightElement,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string'
      ? { value: opt, label: opt }
      : { value: opt.value, label: opt.label || opt.value }
  );

  const filteredOptions = normalizedOptions.filter((opt) => {
    const v = value.toLowerCase();
    return (
      opt.value.toLowerCase().includes(v) ||
      (opt.label && opt.label.toLowerCase().includes(v))
    );
  });
  const dropdownId = `${inputId}-options`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const toggleLabel = label || placeholder || 'Options';
  const boundedHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < filteredOptions.length ? highlightedIndex : -1;
  const isExpanded = isOpen && filteredOptions.length > 0 && !disabled;
  const activeOptionId =
    isExpanded && boundedHighlightedIndex >= 0
      ? `${dropdownId}-option-${boundedHighlightedIndex}`
      : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isExpanded || boundedHighlightedIndex < 0) return;
    document
      .getElementById(`${dropdownId}-option-${boundedHighlightedIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [boundedHighlightedIndex, dropdownId, isExpanded]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length > 0 ? 0 : -1);
        return;
      }
      setHighlightedIndex((prev) =>
        filteredOptions.length === 0
          ? -1
          : (prev + 1 + filteredOptions.length) % filteredOptions.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(filteredOptions.length > 0 ? filteredOptions.length - 1 : -1);
        return;
      }
      setHighlightedIndex((prev) =>
        filteredOptions.length === 0
          ? -1
          : (prev - 1 + filteredOptions.length) % filteredOptions.length
      );
    } else if (e.key === 'Enter') {
      if (isOpen && boundedHighlightedIndex >= 0) {
        e.preventDefault();
        handleSelect(filteredOptions[boundedHighlightedIndex].value);
      } else if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`form-group ${wrapperClassName}`} ref={containerRef} style={wrapperStyle}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          className={`input ${className}`.trim()}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={isExpanded}
          aria-controls={dropdownId}
          aria-activedescendant={activeOptionId}
          aria-describedby={describedBy}
          aria-label={label ? undefined : toggleLabel}
          style={{ paddingRight: 32 }}
        />
        <button
          type="button"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 0,
            padding: 0,
            background: 'transparent',
            color: 'inherit',
            pointerEvents: disabled ? 'none' : 'auto',
            cursor: disabled ? 'default' : 'pointer',
            height: '100%',
          }}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          aria-label={toggleLabel}
          aria-haspopup="listbox"
          aria-expanded={isExpanded}
          aria-controls={dropdownId}
        >
          {rightElement}
          <IconChevronDown size={16} style={{ opacity: 0.5, marginLeft: 4 }} />
        </button>

        {isOpen && filteredOptions.length > 0 && !disabled && (
          <div
            id={dropdownId}
            className="autocomplete-dropdown"
            role="listbox"
            aria-label={toggleLabel}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 200,
              overflowY: 'auto',
              boxShadow:
                '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }}
          >
            {filteredOptions.map((opt, index) => (
              <button
                type="button"
                id={`${dropdownId}-option-${index}`}
                key={`${opt.value}-${index}`}
                role="option"
                aria-selected={index === boundedHighlightedIndex}
                onClick={() => handleSelect(opt.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: 0,
                  cursor: 'pointer',
                  backgroundColor:
                    index === boundedHighlightedIndex ? 'var(--bg-tertiary)' : 'transparent',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  font: 'inherit',
                  fontSize: '0.9rem',
                  textAlign: 'left',
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span style={{ fontWeight: 500 }}>{opt.value}</span>
                {opt.label && opt.label !== opt.value && (
                  <span style={{ fontSize: '0.85em', color: 'var(--text-secondary)' }}>
                    {opt.label}
                  </span>
                )}
              </button>
            ))}
          </div>
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
