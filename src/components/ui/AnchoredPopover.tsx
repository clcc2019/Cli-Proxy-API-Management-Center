import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './AnchoredPopover.module.scss';

type PopoverRole = 'dialog' | 'menu' | 'listbox';

interface AnchoredPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  children: ReactNode;
  ariaLabel: string;
  role?: PopoverRole;
  align?: 'start' | 'end';
  width?: number;
  maxHeight?: number;
  className?: string;
  wrapperClassName?: string;
}

const VIEWPORT_MARGIN = 12;
const POPOVER_OFFSET = 7;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function AnchoredPopover({
  open,
  onOpenChange,
  trigger,
  children,
  ariaLabel,
  role = 'dialog',
  align = 'end',
  width = 248,
  maxHeight = 420,
  className = '',
  wrapperClassName = '',
}: AnchoredPopoverProps) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [triggerElement, setTriggerElement] = useState<HTMLButtonElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    const panelElement = panelRef.current;
    if (!triggerElement || !panelElement) return;

    const triggerRect = triggerElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = Math.min(width, viewportWidth - VIEWPORT_MARGIN * 2);
    const desiredLeft = align === 'start' ? triggerRect.left : triggerRect.right - panelWidth;
    const left = clamp(
      desiredLeft,
      VIEWPORT_MARGIN,
      Math.max(VIEWPORT_MARGIN, viewportWidth - panelWidth - VIEWPORT_MARGIN)
    );
    const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_MARGIN - POPOVER_OFFSET;
    const spaceAbove = triggerRect.top - VIEWPORT_MARGIN - POPOVER_OFFSET;
    const opensDown =
      spaceBelow >= Math.min(maxHeight, panelElement.scrollHeight) || spaceBelow >= spaceAbove;
    const availableHeight = Math.max(0, opensDown ? spaceBelow : spaceAbove);

    setPanelStyle({
      position: 'fixed',
      top: opensDown ? triggerRect.bottom + POPOVER_OFFSET : undefined,
      bottom: opensDown ? undefined : viewportHeight - triggerRect.top + POPOVER_OFFSET,
      left,
      width: panelWidth,
      maxHeight: Math.min(maxHeight, availableHeight),
      ['--popover-enter-y' as string]: opensDown ? '-4px' : '4px',
    });
  }, [align, maxHeight, triggerElement, width]);

  const schedulePosition = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updatePosition();
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    schedulePosition();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    return () => {
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, true);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [open, schedulePosition, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerElement?.contains(target) || panelRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onOpenChange(false);
      triggerElement?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenChange, open, triggerElement]);

  useEffect(() => {
    if (!open || !panelStyle || document.activeElement !== triggerElement) return;
    const frame = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, panelStyle, triggerElement]);

  useEffect(() => {
    if (!open) return;
    const panelElement = panelRef.current;
    return () => {
      if (panelElement?.contains(document.activeElement)) triggerElement?.focus();
    };
  }, [open, triggerElement]);

  if (!isValidElement(trigger)) return null;
  const triggerProps = trigger.props as React.ButtonHTMLAttributes<HTMLButtonElement>;
  const triggerNode = cloneElement(
    trigger as ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>,
    {
      ref: setTriggerElement,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        triggerProps.onClick?.(event);
        if (!event.defaultPrevented) onOpenChange(!open);
      },
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
    } as React.ButtonHTMLAttributes<HTMLButtonElement> & {
      ref: typeof setTriggerElement;
    }
  );

  const panel = open ? (
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={ariaLabel}
      className={`${styles.panel} ${className}`.trim()}
      style={panelStyle ?? { visibility: 'hidden' }}
    >
      {children}
    </div>
  ) : null;

  return (
    <span className={`${styles.wrapper} ${wrapperClassName}`.trim()}>
      {triggerNode}
      {panel && typeof document !== 'undefined' ? createPortal(panel, document.body) : panel}
    </span>
  );
}
