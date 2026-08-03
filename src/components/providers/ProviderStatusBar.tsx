import {
  memo,
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import type { StatusBarData, StatusBlockDetail } from '@/utils/usage';
import defaultStyles from '@/pages/AiProvidersPage.module.scss';

/**
 * 根据成功率 (0–1) 在三个色标之间做 RGB 线性插值
 * 0 → 红 (#c53a32)  →  0.5 → 琥珀 (#d68b16)  →  1 → 纯绿 (#16a34a)
 */
const COLOR_STOPS = [
  { r: 197, g: 58, b: 50 }, // #c53a32
  { r: 214, g: 139, b: 22 }, // #d68b16
  { r: 22, g: 163, b: 74 }, // #16a34a
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
  /**
   * 列表卡片有大量同构的状态条时，将 20 个可聚焦 block 合并为一个时间线控件。
   * 视觉、鼠标提示和方向键浏览保持不变；供应商详情页仍使用逐块交互。
   */
  interactionMode?: 'individual' | 'summary';
}

type StatusBlockView = {
  detail: StatusBlockDetail;
  blockClassName: string;
  blockStyle: CSSProperties | undefined;
  tooltipPositionClass: string;
  // 读屏用的 aria-label 随 blockItems 一起缓存：它需要两次 new Date() 与一次 t()，
  // 而每张卡片有 20 个块，逐次渲染重算会在整页刷新时产生上千次多余的日期构造。
  label: string;
};

const EMPTY_STATUS_BLOCK_ITEMS: StatusBlockView[] = [];

interface StatusBlockItemProps {
  item: StatusBlockView;
  index: number;
  active: boolean;
  tabbable: boolean;
  label: string;
  wrapperClassName: string;
  activeWrapperClassName: string;
  onPointerEnter: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFocus: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onBlur: (event: ReactFocusEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  renderTooltip: (item: StatusBlockView) => ReactNode;
}

const StatusBlockItem = memo(function StatusBlockItem({
  item,
  index,
  active,
  tabbable,
  label,
  wrapperClassName,
  activeWrapperClassName,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  onKeyDown,
  renderTooltip,
}: StatusBlockItemProps) {
  return (
    // tooltip 里的成功/失败/速率是这段数据的唯一呈现，因此每个 block 必须
    // 可聚焦并带 aria-label。用 roving tabindex（组内只有一个 tab 停靠点，
    // 方向键移动）避免几十个 block 塞满 Tab 序列。
    <div
      className={`${wrapperClassName} ${active ? activeWrapperClassName : ''}`}
      data-index={index}
      role="button"
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      aria-expanded={active}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerDown={onPointerDown}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      <div className={item.blockClassName} style={item.blockStyle} />
      {active && renderTooltip(item)}
    </div>
  );
});

interface SummaryStatusBlockItemProps {
  item: StatusBlockView;
  index: number;
  active: boolean;
  wrapperClassName: string;
  activeWrapperClassName: string;
  renderTooltip: (item: StatusBlockView) => ReactNode;
}

// Summary 模式把 hover 事件收敛到父容器，但状态切换仍只影响当前和上一个 block。
// 行级 memo 避免鼠标跨 block 移动时重新协调整条 20 段状态时间线。
const SummaryStatusBlockItem = memo(function SummaryStatusBlockItem({
  item,
  index,
  active,
  wrapperClassName,
  activeWrapperClassName,
  renderTooltip,
}: SummaryStatusBlockItemProps) {
  return (
    <div
      className={`${wrapperClassName} ${active ? activeWrapperClassName : ''}`}
      data-status-block-index={index}
      aria-hidden="true"
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
  interactionMode = 'individual',
}: ProviderStatusBarProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const s = (stylesProp || defaultStyles) as StylesModule;
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  // roving tabindex 的当前停靠点
  const [focusedIndex, setFocusedIndex] = useState(0);
  const blocksRef = useRef<HTMLDivElement>(null);
  // summary 模式只需要在进入新 block 时更新 tooltip；记录当前 block，
  // 避免 pointerover 在 block 内部冒泡时重复触发 state updater。
  const summaryPointerIndexRef = useRef<number | null>(null);

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
    if (!isCurrentLayer || activeTooltip === null) return;
    const handler = (e: PointerEvent) => {
      if (blocksRef.current && !blocksRef.current.contains(e.target as Node)) {
        summaryPointerIndexRef.current = null;
        setActiveTooltip(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [activeTooltip, isCurrentLayer]);

  const getBlockIndex = useCallback((target: EventTarget & HTMLDivElement): number | null => {
    const index = Number(target.dataset.index);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }, []);

  const getSummaryBlockIndex = useCallback((target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const block = target.closest<HTMLElement>('[data-status-block-index]');
    const index = Number(block?.dataset.statusBlockIndex);
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
      summaryPointerIndexRef.current = null;
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

  // 键盘聚焦即展示 tooltip（等价于鼠标 hover）
  const handleFocus = useCallback(
    (e: ReactFocusEvent<HTMLDivElement>) => {
      const index = getBlockIndex(e.currentTarget);
      if (index !== null) {
        setFocusedIndex(index);
        setActiveTooltip((prev) => (prev === index ? prev : index));
      }
    },
    [getBlockIndex]
  );

  const handleBlur = useCallback((e: ReactFocusEvent<HTMLDivElement>) => {
    // 焦点仍在同一个 block 内部时不关闭
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setActiveTooltip((prev) => (prev === null ? prev : null));
  }, []);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const total = statusData.blockDetails.length;
      if (total === 0) return;
      const current = getBlockIndex(e.currentTarget) ?? 0;
      let next: number | null = null;

      if (e.key === 'ArrowRight') next = Math.min(current + 1, total - 1);
      else if (e.key === 'ArrowLeft') next = Math.max(current - 1, 0);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = total - 1;
      else if (e.key === 'Escape') {
        setActiveTooltip(null);
        return;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveTooltip((prev) => (prev === current ? null : current));
        return;
      }

      if (next === null || next === current) return;
      e.preventDefault();
      setFocusedIndex(next);
      const container = blocksRef.current;
      const target = container?.querySelector<HTMLElement>(`[data-index="${next}"]`);
      target?.focus();
    },
    [getBlockIndex, statusData.blockDetails.length]
  );

  const handleSummaryPointerOver = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== 'mouse') return;
      const index = getSummaryBlockIndex(e.target);
      if (index === null) return;
      if (summaryPointerIndexRef.current === index) return;
      summaryPointerIndexRef.current = index;
      setFocusedIndex(index);
      setActiveTooltip(index);
    },
    [getSummaryBlockIndex]
  );

  const handleSummaryClick = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const index = getSummaryBlockIndex(e.target);
      if (index === null) return;
      setFocusedIndex(index);
      const nextActiveIndex = activeTooltip === index ? null : index;
      summaryPointerIndexRef.current = nextActiveIndex;
      setActiveTooltip(nextActiveIndex);
    },
    [activeTooltip, getSummaryBlockIndex]
  );

  const handleSummaryFocus = useCallback(() => {
    const total = statusData.blockDetails.length;
    if (total === 0) return;
    const index = Math.min(focusedIndex, total - 1);
    setFocusedIndex(index);
    setActiveTooltip((previous) => (previous === index ? previous : index));
  }, [focusedIndex, statusData.blockDetails.length]);

  const handleSummaryKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const total = statusData.blockDetails.length;
      if (total === 0) return;

      const current = Math.min(focusedIndex, total - 1);
      let next: number | null = null;

      if (e.key === 'ArrowRight') next = Math.min(current + 1, total - 1);
      else if (e.key === 'ArrowLeft') next = Math.max(current - 1, 0);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = total - 1;
      else if (e.key === 'Escape') {
        setActiveTooltip(null);
        return;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveTooltip((previous) => (previous === current ? null : current));
        return;
      }

      if (next === null || next === current) return;
      e.preventDefault();
      setFocusedIndex(next);
      setActiveTooltip((previous) => (previous === next ? previous : next));
    },
    [focusedIndex, statusData.blockDetails.length]
  );

  const blockItems = useMemo<StatusBlockView[]>(() => {
    if (!isCurrentLayer) return EMPTY_STATUS_BLOCK_ITEMS;

    const total = statusData.blockDetails.length;
    return statusData.blockDetails.map((detail, idx) => {
      const isIdle = detail.rate === -1;
      const tooltipPositionClass =
        idx <= 2 ? s.statusTooltipLeft : idx >= total - 3 ? s.statusTooltipRight : '';
      const timeRange = `${formatTime(detail.startTime)} – ${formatTime(detail.endTime)}`;
      const label =
        detail.success + detail.failure === 0
          ? `${timeRange}: ${t('status_bar.no_requests')}`
          : // 不用 success_short / failure_short：它们是 ✓ / ✗ 符号，读屏无意义
            t('status_bar.block_label', {
              range: timeRange,
              success: detail.success,
              failure: detail.failure,
              rate: (detail.rate * 100).toFixed(1),
            });

      return {
        detail,
        blockClassName: `${s.statusBlock} ${isIdle ? s.statusBlockIdle : ''}`,
        blockStyle: isIdle ? undefined : { backgroundColor: rateToColor(detail.rate) },
        tooltipPositionClass,
        label,
      };
    });
  }, [
    s.statusBlock,
    s.statusBlockIdle,
    s.statusTooltipLeft,
    s.statusTooltipRight,
    statusData.blockDetails,
    isCurrentLayer,
    t,
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

  // tooltip 内容的等价文本，供屏幕阅读器读取
  const rovingIndex = Math.min(focusedIndex, Math.max(blockItems.length - 1, 0));
  const summaryActiveItem =
    activeTooltip === null ? null : blockItems[Math.min(activeTooltip, blockItems.length - 1)];
  const summaryLabel = summaryActiveItem
    ? `${t('status_bar.label')}: ${summaryActiveItem.label}`
    : `${t('status_bar.label')}: ${rateText}`;

  return (
    <div className={s.statusBar}>
      {interactionMode === 'summary' ? (
        <div
          className={s.statusBlocks}
          ref={blocksRef}
          role="button"
          tabIndex={0}
          aria-label={summaryLabel}
          aria-expanded={activeTooltip !== null}
          onPointerOver={handleSummaryPointerOver}
          onPointerLeave={handlePointerLeave}
          onClick={handleSummaryClick}
          onFocus={handleSummaryFocus}
          onBlur={handleBlur}
          onKeyDown={handleSummaryKeyDown}
        >
          {blockItems.map((item, idx) => (
            <SummaryStatusBlockItem
              key={idx}
              item={item}
              index={idx}
              active={activeTooltip === idx}
              wrapperClassName={s.statusBlockWrapper}
              activeWrapperClassName={s.statusBlockActive}
              renderTooltip={renderTooltip}
            />
          ))}
        </div>
      ) : (
        <div className={s.statusBlocks} ref={blocksRef} role="group" aria-label={t('status_bar.label')}>
          {blockItems.map((item, idx) => (
            <StatusBlockItem
              key={idx}
              item={item}
              index={idx}
              active={activeTooltip === idx}
              tabbable={idx === rovingIndex}
              label={item.label}
              wrapperClassName={s.statusBlockWrapper}
              activeWrapperClassName={s.statusBlockActive}
              onPointerEnter={handlePointerEnter}
              onPointerLeave={handlePointerLeave}
              onPointerDown={handlePointerDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              renderTooltip={renderTooltip}
            />
          ))}
        </div>
      )}
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
