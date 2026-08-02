import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
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
  dropdownClassName?: string;
  portal?: boolean;
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  id?: string;
  rightElement?: ReactNode;
}

const VIEWPORT_MARGIN = 8;
const DROPDOWN_OFFSET = 6;
const DROPDOWN_MAX_HEIGHT = 200;
const DROPDOWN_Z_INDEX = 2010;
const EMPTY_AUTOCOMPLETE_OPTIONS: Array<{ value: string; label: string }> = [];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveDropdownStyle = (element: HTMLElement): CSSProperties => {
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.min(rect.width, Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2));
  const left = clamp(
    rect.left,
    VIEWPORT_MARGIN,
    Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
  );
  const spaceBelow = viewportHeight - rect.bottom - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const spaceAbove = rect.top - VIEWPORT_MARGIN - DROPDOWN_OFFSET;
  const direction = spaceBelow >= DROPDOWN_MAX_HEIGHT || spaceBelow >= spaceAbove ? 'down' : 'up';
  const maxHeight = Math.max(
    0,
    Math.min(DROPDOWN_MAX_HEIGHT, direction === 'down' ? spaceBelow : spaceAbove)
  );

  return direction === 'down'
    ? {
        position: 'fixed',
        top: rect.bottom + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      }
    : {
        position: 'fixed',
        bottom: viewportHeight - rect.top + DROPDOWN_OFFSET,
        left,
        width,
        maxHeight,
        zIndex: DROPDOWN_Z_INDEX,
      };
};

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
  dropdownClassName = '',
  portal = false,
  wrapperClassName = '',
  wrapperStyle,
  id,
  rightElement,
}: AutocompleteInputProps) {
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties | null>(null);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const normalizedOptions = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTOCOMPLETE_OPTIONS;
    return options.map((opt) =>
      typeof opt === 'string'
        ? { value: opt, label: opt }
        : { value: opt.value, label: opt.label || opt.value }
    );
  }, [isCurrentLayer, options]);

  const filteredOptions = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_AUTOCOMPLETE_OPTIONS;
    const normalizedValue = value.toLowerCase();
    return normalizedOptions.filter(
      (opt) =>
        opt.value.toLowerCase().includes(normalizedValue) ||
        (opt.label && opt.label.toLowerCase().includes(normalizedValue))
    );
  }, [isCurrentLayer, normalizedOptions, value]);
  const dropdownId = `${inputId}-options`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const toggleLabel = label || placeholder || 'Options';
  const boundedHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < filteredOptions.length ? highlightedIndex : -1;
  const isExpanded = isCurrentLayer && isOpen && filteredOptions.length > 0 && !disabled;
  const activeOptionId =
    isExpanded && boundedHighlightedIndex >= 0
      ? `${dropdownId}-option-${boundedHighlightedIndex}`
      : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  useEffect(() => {
    if (!isCurrentLayer || !isOpen || disabled) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [disabled, isCurrentLayer, isOpen]);

  const updateDropdownStyle = useCallback(() => {
    if (!inputRef.current || typeof window === 'undefined') return;
    setDropdownStyle(resolveDropdownStyle(inputRef.current));
  }, []);

  const scheduleDropdownStyleUpdate = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      updateDropdownStyle();
    });
  }, [updateDropdownStyle]);

  useLayoutEffect(() => {
    if (!portal || !isExpanded) {
      if (rafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    updateDropdownStyle();

    const handleViewportChange = () => scheduleDropdownStyleUpdate();
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && inputRef.current
        ? new ResizeObserver(() => scheduleDropdownStyleUpdate())
        : null;

    if (resizeObserver && inputRef.current) resizeObserver.observe(inputRef.current);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      resizeObserver?.disconnect();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isExpanded, portal, scheduleDropdownStyleUpdate, updateDropdownStyle]);

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

  const dropdown =
    isExpanded && (!portal || dropdownStyle) ? (
      <div
        ref={dropdownRef}
        id={dropdownId}
        className={`autocomplete-dropdown ${dropdownClassName}`.trim()}
        role="listbox"
        aria-label={toggleLabel}
        style={
          portal
            ? {
                ...dropdownStyle,
                boxSizing: 'border-box',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                overflowY: 'auto',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }
            : {
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
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              }
        }
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
    ) : null;

  return (
    <div className={`form-group ${wrapperClassName}`} ref={containerRef} style={wrapperStyle}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
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

        {dropdown &&
          (portal && typeof document !== 'undefined'
            ? createPortal(dropdown, document.body)
            : dropdown)}
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
