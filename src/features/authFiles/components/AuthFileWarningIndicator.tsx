import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import styles from '@/pages/AuthFilesPage.module.scss';

type AuthFileWarningIndicatorProps = {
  message: string;
};

export function AuthFileWarningIndicator(props: AuthFileWarningIndicatorProps) {
  const { message } = props;
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visibleOpen = isCurrentLayer && open;

  useEffect(() => {
    if (!visibleOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [visibleOpen]);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isCurrentLayer && event.pointerType === 'mouse') {
        setOpen(true);
      }
    },
    [isCurrentLayer]
  );

  const handlePointerLeave = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      setOpen(false);
    }
  }, []);

  const handleClick = useCallback(() => {
    if (!isCurrentLayer) return;
    setOpen((current) => !current);
  }, [isCurrentLayer]);

  return (
    <div
      ref={containerRef}
      className={styles.cardWarningIndicator}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <button
        type="button"
        className={styles.cardWarningButton}
        aria-label={`${t('auth_files.health_status_warning')}: ${message}`}
        title={t('auth_files.health_status_warning')}
        onClick={handleClick}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <span className={styles.cardWarningButtonMark}>!</span>
      </button>
      {visibleOpen && (
        <div className={styles.cardWarningTooltip} role="tooltip">
          {message}
        </div>
      )}
    </div>
  );
}
