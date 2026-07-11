import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusBarData, StatusBlockDetail } from '@/utils/usage';
import defaultStyles from '@/pages/AiProvidersPage.module.scss';

/**
 * 根据成功率 (0–1) 在三个色标之间做 RGB 线性插值
 * 0 → 红 (#ef4444)  →  0.5 → 金黄 (#facc15)  →  1 → 绿 (#22c55e)
 */
const COLOR_STOPS = [
  { r: 239, g: 68, b: 68 }, // #ef4444
  { r: 250, g: 204, b: 21 }, // #facc15
  { r: 34, g: 197, b: 94 }, // #22c55e
] as const;

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

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatSuccessRate(rate: number): string {
  const rounded = rate.toFixed(1);
  return `${rounded.endsWith('.0') ? rounded.slice(0, -2) : rounded}%`;
}

type StylesModule = Record<string, string>;

interface ProviderStatusBarProps {
  statusData: StatusBarData;
  styles?: StylesModule;
  showRateLabel?: boolean;
}

type StatusBlockView = {
  detail: StatusBlockDetail;
  blockClassName: string;
  blockStyle: CSSProperties | undefined;
  tooltipPositionClass: string;
};

interface StatusBlockItemProps {
  item: StatusBlockView;
  index: number;
  active: boolean;
  wrapperClassName: string;
  activeWrapperClassName: string;
  onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  renderTooltip: (item: StatusBlockView) => ReactNode;
}

const StatusBlockItem = memo(function StatusBlockItem({
  item,
  index,
  active,
  wrapperClassName,
  activeWrapperClassName,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  renderTooltip,
}: StatusBlockItemProps) {
  return (
    <div
      className={`${wrapperClassName} ${active ? activeWrapperClassName : ''}`}
      data-index={index}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
    >
      <div className={item.blockClassName} style={item.blockStyle} />
      {active && renderTooltip(item)}
    </div>
  );
});

function ProviderStatusBarImpl({
  statusData,
  styles: stylesProp,
  showRateLabel = false,
}: ProviderStatusBarProps) {
  const { t } = useTranslation();
  const s = (stylesProp || defaultStyles) as StylesModule;
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  const hasData = statusData.totalSuccess + statusData.totalFailure > 0;
  const rateClass = !hasData
    ? ''
    : statusData.successRate >= 90
      ? s.statusRateHigh
      : statusData.successRate >= 50
        ? s.statusRateMedium
        : s.statusRateLow;

  // 点击外部关闭 tooltip（移动端）
  useEffect(() => {
    if (activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (blocksRef.current && !blocksRef.current.contains(e.target as Node)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip]);

  const getBlockIndex = useCallback((target: EventTarget & HTMLDivElement): number | null => {
    const index = Number(target.dataset.index);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }, []);

  const handlePointerEnter = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse') {
        const index = getBlockIndex(e.currentTarget);
        if (index !== null) {
          setActiveTooltip((prev) => (prev === index ? prev : index));
        }
      }
    },
    [getBlockIndex]
  );

  const rateText = hasData ? formatSuccessRate(statusData.successRate) : '--';

  const handlePointerLeave = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      setActiveTooltip((prev) => (prev === null ? prev : null));
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch') {
        e.preventDefault();
        const index = getBlockIndex(e.currentTarget);
        if (index !== null) {
          setActiveTooltip((prev) => (prev === index ? null : index));
        }
      }
    },
    [getBlockIndex]
  );

  const blockItems = useMemo<StatusBlockView[]>(() => {
    const total = statusData.blockDetails.length;
    return statusData.blockDetails.map((detail, idx) => {
      const isIdle = detail.rate === -1;
      const tooltipPositionClass =
        idx <= 2 ? s.statusTooltipLeft : idx >= total - 3 ? s.statusTooltipRight : '';

      return {
        detail,
        blockClassName: `${s.statusBlock} ${isIdle ? s.statusBlockIdle : ''}`,
        blockStyle: isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) },
        tooltipPositionClass,
      };
    });
  }, [
    s.statusBlock,
    s.statusBlockIdle,
    s.statusTooltipLeft,
    s.statusTooltipRight,
    statusData.blockDetails,
  ]);

  const renderTooltip = useCallback(
    (item: StatusBlockView) => {
      const { detail, tooltipPositionClass } = item;
      const total = detail.success + detail.failure;
      const timeRange = `${formatTime(detail.startTime)} – ${formatTime(detail.endTime)}`;

      return (
        <div className={`${s.statusTooltip} ${tooltipPositionClass}`}>
          <span className={s.tooltipTime}>{timeRange}</span>
          {total > 0 ? (
            <span className={s.tooltipStats}>
              <span className={s.tooltipSuccess}>
                {t('status_bar.success_short')} {detail.success}
              </span>
              <span className={s.tooltipFailure}>
                {t('status_bar.failure_short')} {detail.failure}
              </span>
              <span className={s.tooltipRate}>({(detail.rate * 100).toFixed(1)}%)</span>
            </span>
          ) : (
            <span className={s.tooltipStats}>{t('status_bar.no_requests')}</span>
          )}
        </div>
      );
    },
    [
      s.statusTooltip,
      s.tooltipFailure,
      s.tooltipRate,
      s.tooltipStats,
      s.tooltipSuccess,
      s.tooltipTime,
      t,
    ]
  );

  return (
    <div className={s.statusBar}>
      <div className={s.statusBlocks} ref={blocksRef}>
        {blockItems.map((item, idx) => (
          <StatusBlockItem
            key={idx}
            item={item}
            index={idx}
            active={activeTooltip === idx}
            wrapperClassName={s.statusBlockWrapper}
            activeWrapperClassName={s.statusBlockActive}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            renderTooltip={renderTooltip}
          />
        ))}
      </div>
      <span className={`${s.statusRate} ${rateClass}`}>
        {showRateLabel ? (
          <>
            <strong>{rateText}</strong>
            <small>{t('status_bar.success_rate_label')}</small>
          </>
        ) : (
          rateText
        )}
      </span>
    </div>
  );
}

// 列表场景下大量卡片复用，memo 避免父组件重渲染时无谓重算 status blocks
export const ProviderStatusBar = memo(ProviderStatusBarImpl);
