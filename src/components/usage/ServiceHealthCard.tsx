import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import {
  collectUsageDetails,
  calculateServiceHealthData,
  type ServiceHealthData,
  type StatusBlockDetail,
} from '@/utils/usage';
import type { UsagePayload } from './hooks/useUsageData';
import styles from '@/pages/UsagePage.module.scss';

// 健康度渐变锚定到语义色板（--mg-danger / --mg-warning / --mg-success-fill），
// 避免 Tailwind 默认色与暖中性界面冲突
const SUCCESS_COLOR = '#0fa64b';

const COLOR_STOPS = [
  { r: 204, g: 51, b: 43 }, // #cc332b
  { r: 217, g: 119, b: 6 }, // #d97706
  { r: 15, g: 166, b: 75 }, // #0fa64b
] as const;

const TOOLTIP_OFFSET = 8;
const TOOLTIP_SAFE_WIDTH = 180;
const TOOLTIP_SAFE_HEIGHT = 72;
const EMPTY_SERVICE_HEALTH_DATA = calculateServiceHealthData([]);

type TooltipHorizontalPosition = 'center' | 'left' | 'right';
type TooltipVerticalPosition = 'above' | 'below';

interface ActiveTooltipState {
  idx: number;
  anchorEl: HTMLDivElement;
  horizontal: TooltipHorizontalPosition;
  vertical: TooltipVerticalPosition;
  left: number;
  top: number;
  transform: string;
}

function rateToColor(rate: number): string {
  const t = Math.max(0, Math.min(1, rate));
  const segment = t < 0.5 ? 0 : 1;
  const localT = segment === 0 ? t * 2 : (t - 0.5) * 2;
  const from = COLOR_STOPS[segment];
  const to = COLOR_STOPS[segment + 1];
  const r = Math.round(from.r + (to.r - from.r) * localT);
  const g = Math.round(from.g + (to.g - from.g) * localT);
  const b = Math.round(from.b + (to.b - from.b) * localT);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${h}:${m}`;
}

export interface ServiceHealthCardProps {
  usage: UsagePayload | null;
  loading: boolean;
}

export function ServiceHealthCard({ usage, loading }: ServiceHealthCardProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipState | null>(null);
  const activeTooltipRef = useRef<ActiveTooltipState | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tooltipPositionFrameRef = useRef<number | null>(null);
  const hasActiveTooltip = isCurrentLayer && activeTooltip !== null;

  useEffect(() => {
    activeTooltipRef.current = isCurrentLayer ? activeTooltip : null;
  }, [activeTooltip, isCurrentLayer]);

  const healthData: ServiceHealthData = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_SERVICE_HEALTH_DATA;
    const details = usage ? collectUsageDetails(usage) : [];
    return calculateServiceHealthData(details);
  }, [isCurrentLayer, usage]);

  const hasData = healthData.totalSuccess + healthData.totalFailure > 0;

  useEffect(() => {
    if (!hasActiveTooltip) return;
    const handler = (e: PointerEvent) => {
      if (gridRef.current && !gridRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [hasActiveTooltip]);

  const buildTooltipState = useCallback(
    (idx: number, anchorEl: HTMLDivElement | null): ActiveTooltipState | null => {
      if (!anchorEl || !anchorEl.isConnected) {
        return null;
      }

      const rect = anchorEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;

      let horizontal: TooltipHorizontalPosition = 'center';
      let left = centerX;

      if (centerX <= TOOLTIP_SAFE_WIDTH / 2) {
        horizontal = 'left';
        left = rect.left;
      } else if (centerX >= window.innerWidth - TOOLTIP_SAFE_WIDTH / 2) {
        horizontal = 'right';
        left = rect.right;
      }

      const vertical: TooltipVerticalPosition = rect.top <= TOOLTIP_SAFE_HEIGHT ? 'below' : 'above';
      const top = vertical === 'below' ? rect.bottom + TOOLTIP_OFFSET : rect.top - TOOLTIP_OFFSET;
      const translateX = horizontal === 'center' ? '-50%' : horizontal === 'right' ? '-100%' : '0';
      const translateY = vertical === 'below' ? '0' : '-100%';

      return {
        idx,
        anchorEl,
        horizontal,
        vertical,
        left: Math.round(left),
        top: Math.round(top),
        transform: `translate(${translateX}, ${translateY})`,
      };
    },
    []
  );

  useEffect(() => {
    if (!hasActiveTooltip) return;

    const updateTooltipPosition = () => {
      if (tooltipPositionFrameRef.current !== null) return;
      tooltipPositionFrameRef.current = window.requestAnimationFrame(() => {
        tooltipPositionFrameRef.current = null;
        const currentTooltip = activeTooltipRef.current;
        if (!currentTooltip) return;
        if (!document.body.contains(currentTooltip.anchorEl)) {
          setActiveTooltip(null);
          return;
        }
        setActiveTooltip(buildTooltipState(currentTooltip.idx, currentTooltip.anchorEl));
      });
    };

    window.addEventListener('resize', updateTooltipPosition);
    window.addEventListener('scroll', updateTooltipPosition, true);
    return () => {
      window.removeEventListener('resize', updateTooltipPosition);
      window.removeEventListener('scroll', updateTooltipPosition, true);
      if (tooltipPositionFrameRef.current !== null) {
        window.cancelAnimationFrame(tooltipPositionFrameRef.current);
        tooltipPositionFrameRef.current = null;
      }
    };
  }, [buildTooltipState, hasActiveTooltip]);

  const openTooltip = useCallback(
    (idx: number, anchorEl: HTMLDivElement) => {
      if (!isCurrentLayer) return;
      setActiveTooltip(buildTooltipState(idx, anchorEl));
    },
    [buildTooltipState, isCurrentLayer]
  );

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      if (e.pointerType === 'mouse') {
        openTooltip(idx, e.currentTarget);
      }
    },
    [openTooltip]
  );

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip(null);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
      if (!isCurrentLayer) return;
      if (e.pointerType === 'touch') {
        e.preventDefault();
        const anchorEl = e.currentTarget;
        setActiveTooltip((prev) => (prev?.idx === idx ? null : buildTooltipState(idx, anchorEl)));
      }
    },
    [buildTooltipState, isCurrentLayer]
  );

  const renderTooltip = (detail: StatusBlockDetail, tooltipState: ActiveTooltipState) => {
    const total = detail.success + detail.failure;
    const posClass =
      tooltipState.horizontal === 'left'
        ? styles.healthTooltipLeft
        : tooltipState.horizontal === 'right'
          ? styles.healthTooltipRight
          : '';
    const vertClass = tooltipState.vertical === 'below' ? styles.healthTooltipBelow : '';
    const timeRange = `${formatDateTime(detail.startTime)} – ${formatDateTime(detail.endTime)}`;
    const tooltip = (
      <div
        className={`${styles.healthTooltip} ${posClass} ${vertClass}`}
        style={{
          position: 'fixed',
          left: `${tooltipState.left}px`,
          top: `${tooltipState.top}px`,
          bottom: 'auto',
          right: 'auto',
          transform: tooltipState.transform,
        }}
      >
        <span className={styles.healthTooltipTime}>{timeRange}</span>
        {total > 0 ? (
          <span className={styles.healthTooltipStats}>
            <span className={styles.healthTooltipSuccess}>
              {t('status_bar.success_short')} {detail.success}
            </span>
            <span className={styles.healthTooltipFailure}>
              {t('status_bar.failure_short')} {detail.failure}
            </span>
            <span className={styles.healthTooltipRate}>({(detail.rate * 100).toFixed(1)}%)</span>
          </span>
        ) : (
          <span className={styles.healthTooltipStats}>{t('status_bar.no_requests')}</span>
        )}
      </div>
    );

    return typeof document === 'undefined' ? tooltip : createPortal(tooltip, document.body);
  };

  const rateClass = !hasData
    ? ''
    : healthData.successRate >= 90
      ? styles.healthRateHigh
      : healthData.successRate >= 50
        ? styles.healthRateMedium
        : styles.healthRateLow;

  return (
    <div className={styles.healthCard}>
      <div className={styles.healthHeader}>
        <h3 className={styles.healthTitle}>{t('service_health.title')}</h3>
        <div className={styles.healthMeta}>
          <span className={styles.healthWindow}>{t('service_health.window')}</span>
          <span className={`${styles.healthRate} ${rateClass}`}>
            {loading ? '--' : hasData ? `${healthData.successRate.toFixed(1)}%` : '--'}
          </span>
        </div>
      </div>
      <div className={styles.healthGridScroller}>
        <div className={styles.healthGrid} ref={gridRef}>
          {healthData.blockDetails.map((detail, idx) => {
            const isIdle = detail.rate === -1;
            const blockStyle = isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) };
            const isActive = isCurrentLayer && activeTooltip?.idx === idx;

            return (
              <div
                key={idx}
                className={`${styles.healthBlockWrapper} ${isActive ? styles.healthBlockActive : ''}`}
                onPointerEnter={(e) => handlePointerEnter(e, idx)}
                onPointerLeave={handlePointerLeave}
                onPointerDown={(e) => handlePointerDown(e, idx)}
              >
                <div
                  className={`${styles.healthBlock} ${isIdle ? styles.healthBlockIdle : ''}`}
                  style={blockStyle}
                />
                {isActive && activeTooltip && renderTooltip(detail, activeTooltip)}
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.healthLegend}>
        <span className={styles.healthLegendLabel}>{t('service_health.oldest')}</span>
        <div className={styles.healthLegendColors}>
          <div className={`${styles.healthLegendBlock} ${styles.healthBlockIdle}`} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: '#cc332b' }} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: '#d97706' }} />
          <div className={styles.healthLegendBlock} style={{ backgroundColor: SUCCESS_COLOR }} />
        </div>
        <span className={styles.healthLegendLabel}>{t('service_health.newest')}</span>
      </div>
    </div>
  );
}
