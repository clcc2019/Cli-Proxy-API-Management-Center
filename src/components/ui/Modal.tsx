import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useReducedMotion } from '@/hooks';
import { IconX } from './icons';

interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number | string;
  className?: string;
  fullScreenOnMobile?: boolean;
  closeDisabled?: boolean;
  ariaDescribedBy?: string;
}

const CLOSE_ANIMATION_FALLBACK_MS = 230;
const MODAL_LOCK_CLASS = 'modal-open';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
let activeModalCount = 0;

const scrollLockSnapshot = {
  scrollY: 0,
  contentScrollTop: 0,
  contentEl: null as HTMLElement | null,
  bodyPosition: '',
  bodyTop: '',
  bodyLeft: '',
  bodyRight: '',
  bodyWidth: '',
  bodyOverflow: '',
  htmlOverflow: '',
};

const resolveContentScrollContainer = () => {
  if (typeof document === 'undefined') return null;
  const contentEl = document.querySelector('.content');
  return contentEl instanceof HTMLElement ? contentEl : null;
};

const lockScroll = () => {
  if (typeof document === 'undefined') return;
  if (activeModalCount === 0) {
    const body = document.body;
    const html = document.documentElement;
    const contentEl = resolveContentScrollContainer();

    scrollLockSnapshot.scrollY = window.scrollY || window.pageYOffset || html.scrollTop || 0;
    scrollLockSnapshot.contentEl = contentEl;
    scrollLockSnapshot.contentScrollTop = contentEl?.scrollTop ?? 0;
    scrollLockSnapshot.bodyPosition = body.style.position;
    scrollLockSnapshot.bodyTop = body.style.top;
    scrollLockSnapshot.bodyLeft = body.style.left;
    scrollLockSnapshot.bodyRight = body.style.right;
    scrollLockSnapshot.bodyWidth = body.style.width;
    scrollLockSnapshot.bodyOverflow = body.style.overflow;
    scrollLockSnapshot.htmlOverflow = html.style.overflow;

    body.classList.add(MODAL_LOCK_CLASS);
    html.classList.add(MODAL_LOCK_CLASS);

    body.style.position = 'fixed';
    body.style.top = `-${scrollLockSnapshot.scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
  }
  activeModalCount += 1;
};

const unlockScroll = () => {
  if (typeof document === 'undefined') return;
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    const body = document.body;
    const html = document.documentElement;
    const scrollY = scrollLockSnapshot.scrollY;
    const contentScrollTop = scrollLockSnapshot.contentScrollTop;
    const contentEl = scrollLockSnapshot.contentEl;

    body.classList.remove(MODAL_LOCK_CLASS);
    html.classList.remove(MODAL_LOCK_CLASS);

    body.style.position = scrollLockSnapshot.bodyPosition;
    body.style.top = scrollLockSnapshot.bodyTop;
    body.style.left = scrollLockSnapshot.bodyLeft;
    body.style.right = scrollLockSnapshot.bodyRight;
    body.style.width = scrollLockSnapshot.bodyWidth;
    body.style.overflow = scrollLockSnapshot.bodyOverflow;
    html.style.overflow = scrollLockSnapshot.htmlOverflow;

    if (contentEl) {
      contentEl.scrollTo({ top: contentScrollTop, left: 0, behavior: 'auto' });
    }
    window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });

    scrollLockSnapshot.scrollY = 0;
    scrollLockSnapshot.contentScrollTop = 0;
    scrollLockSnapshot.contentEl = null;
  }
};

export function Modal({
  open,
  title,
  onClose,
  footer,
  width = 520,
  className,
  fullScreenOnMobile = false,
  closeDisabled = false,
  ariaDescribedBy,
  children,
}: PropsWithChildren<ModalProps>) {
  const { t } = useTranslation();
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const isClosingRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const notifyParentAfterCloseRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const restorePreviouslyFocused = useCallback(() => {
    const element = previouslyFocusedRef.current;
    previouslyFocusedRef.current = null;
    if (element?.isConnected && !element.closest('[inert]')) {
      element.focus();
    }
  }, []);

  const getFocusableElements = useCallback(() => {
    if (!modalRef.current) return [] as HTMLElement[];
    return Array.from(modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1
    );
  }, []);

  const completeClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const notifyParent = notifyParentAfterCloseRef.current;
    notifyParentAfterCloseRef.current = false;
    isClosingRef.current = false;
    setIsVisible(false);
    setIsClosing(false);
    if (notifyParent) onClose();
  }, [onClose]);

  const startClose = useCallback(
    (notifyParent: boolean) => {
      if (isClosingRef.current || closeTimerRef.current !== null) return;
      notifyParentAfterCloseRef.current ||= notifyParent;
      if (prefersReducedMotion) {
        completeClose();
        return;
      }
      isClosingRef.current = true;
      setIsClosing(true);
      closeTimerRef.current = window.setTimeout(completeClose, CLOSE_ANIMATION_FALLBACK_MS);
    },
    [completeClose, prefersReducedMotion]
  );

  useEffect(() => {
    let cancelled = false;

    if (open) {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      notifyParentAfterCloseRef.current = false;
      isClosingRef.current = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setIsVisible(true);
        setIsClosing(false);
      });
    } else if (isVisible) {
      queueMicrotask(() => {
        if (cancelled) return;
        startClose(false);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [open, isVisible, startClose]);

  const handleClose = useCallback(() => {
    startClose(true);
  }, [startClose]);

  const handleOverlayAnimationEnd = useCallback(
    (event: ReactAnimationEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target || !isClosing) return;
      completeClose();
    },
    [completeClose, isClosing]
  );

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      restorePreviouslyFocused();
    };
  }, [restorePreviouslyFocused]);

  const shouldLockScroll = open || isVisible;

  useEffect(() => {
    if (!shouldLockScroll) return;
    lockScroll();
    return () => unlockScroll();
  }, [shouldLockScroll]);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      const firstFocusable = getFocusableElements()[0];
      (firstFocusable ?? closeButtonRef.current ?? modalRef.current)?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [getFocusableElements, open]);

  useEffect(() => {
    if (open || isVisible) return;
    restorePreviouslyFocused();
  }, [isVisible, open, restorePreviouslyFocused]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (closeDisabled) return;
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === modalRef.current) {
          event.preventDefault();
          lastElement.focus();
        }
        return;
      }

      if (activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, getFocusableElements, handleClose, open]);

  if (!open && !isVisible) return null;

  const overlayClass = [
    'modal-overlay',
    isClosing ? 'modal-overlay-closing' : 'modal-overlay-entering',
    fullScreenOnMobile ? 'modal-overlay-fullscreen-mobile' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const modalClass = [
    'modal',
    isClosing ? 'modal-closing' : 'modal-entering',
    fullScreenOnMobile ? 'modal-fullscreen-mobile' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const modalContent = (
    <div className={overlayClass} onAnimationEnd={handleOverlayAnimationEnd}>
      <div
        ref={modalRef}
        className={modalClass}
        style={{ width, maxWidth: '100%' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
      >
        <button
          ref={closeButtonRef}
          type="button"
          className="modal-close-floating"
          onClick={closeDisabled ? undefined : handleClose}
          aria-label={t('common.close')}
          disabled={closeDisabled}
        >
          <IconX size={20} />
        </button>
        <div className="modal-header">
          <div className="modal-title" id={title ? titleId : undefined}>
            {title}
          </div>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
