/**
 * Chart.js configuration utilities for usage statistics
 * Extracted from UsagePage.tsx for reusability
 */

import type { ChartOptions, ScriptableContext } from 'chart.js';

export type UsageChartMetric = 'requests' | 'tokens';

export const USAGE_CHART_COLORS = {
  requests: '#8b8680',
  tokens: '#6d6760',
  rpm: '#75827c',
  tpm: '#c65f3d',
  cost: '#b7791f',
  latency: '#77726d',
  success: '#16a34a',
  failure: '#c53a32',
  neutral: '#a29c95',
  cyan: '#1f6170',
  pink: '#b76b61',
} as const;

const REQUEST_SERIES_COLORS = [
  USAGE_CHART_COLORS.requests,
  USAGE_CHART_COLORS.tokens,
  USAGE_CHART_COLORS.tpm,
  USAGE_CHART_COLORS.cost,
  USAGE_CHART_COLORS.cyan,
  USAGE_CHART_COLORS.failure,
  USAGE_CHART_COLORS.pink,
];

const TOKEN_SERIES_COLORS = [
  USAGE_CHART_COLORS.tokens,
  USAGE_CHART_COLORS.requests,
  USAGE_CHART_COLORS.tpm,
  USAGE_CHART_COLORS.cost,
  USAGE_CHART_COLORS.cyan,
  USAGE_CHART_COLORS.failure,
  USAGE_CHART_COLORS.pink,
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.trim().replace('#', '');
  if (normalized.length !== 6) {
    return null;
  }

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  return { r, g, b };
};

export const withUsageColorAlpha = (hex: string, alpha: number) => {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }

  const clamped = clamp(alpha, 0, 1);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
};

export const getUsageSeriesColor = (metric: UsageChartMetric, index: number) => {
  const palette = metric === 'tokens' ? TOKEN_SERIES_COLORS : REQUEST_SERIES_COLORS;
  return palette[index % palette.length];
};

export const buildUsageAreaGradient = (
  context: ScriptableContext<'line'>,
  baseHex: string,
  fallback = withUsageColorAlpha(baseHex, 0.14)
) => {
  const chart = context.chart;
  const area = chart.chartArea;
  if (!area) {
    return fallback;
  }

  const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  gradient.addColorStop(0, withUsageColorAlpha(baseHex, 0.24));
  gradient.addColorStop(0.62, withUsageColorAlpha(baseHex, 0.09));
  gradient.addColorStop(1, withUsageColorAlpha(baseHex, 0));
  return gradient;
};

export interface ChartConfigOptions {
  period: 'hour' | 'day';
  labels: string[];
  isDark: boolean;
  isMobile: boolean;
}

/**
 * Build chart options with theme and responsive awareness
 */
export function buildChartOptions({
  period,
  labels,
  isDark,
  isMobile,
}: ChartConfigOptions): ChartOptions<'line'> {
  const isDenseSeries = labels.length > (isMobile ? 36 : 72);
  const pointRadius = 0;
  const tickFontSize = isMobile ? 10 : 11;
  const maxTickLabelCount = isMobile ? (period === 'hour' ? 7 : 5) : period === 'hour' ? 10 : 8;
  const shouldDecimate = labels.length > (isMobile ? 80 : 120);
  // 亮色侧使用暖灰（与 --mg-text-muted/--mg-text-tertiary 同族），避免冷色 slate 破坏暖中性画布
  const yGridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(171, 170, 168, 0.28)';
  const tickColor = isDark ? 'rgba(255, 255, 255, 0.66)' : 'rgba(128, 127, 124, 0.9)';
  const tooltipBg = isDark ? 'rgba(17, 24, 39, 0.92)' : 'rgba(255, 255, 255, 0.98)';
  const tooltipTitle = isDark ? '#ffffff' : '#2c2a25';
  const tooltipBody = isDark ? 'rgba(255, 255, 255, 0.86)' : '#565551';
  const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(171, 170, 168, 0.35)';

  return {
    responsive: true,
    maintainAspectRatio: false,
    normalized: true,
    animation: isDenseSeries
      ? false
      : {
          duration: 220,
          easing: 'easeOutQuart',
        },
    interaction: {
      mode: 'index',
      intersect: false,
    },
    layout: {
      padding: {
        top: 10,
        right: 8,
        bottom: 2,
        left: 4,
      },
    },
    plugins: {
      legend: { display: false },
      decimation: {
        enabled: shouldDecimate,
        algorithm: 'min-max',
        threshold: isMobile ? 80 : 120,
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitle,
        bodyColor: tooltipBody,
        borderColor: tooltipBorder,
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        caretPadding: 10,
        boxPadding: 4,
        displayColors: true,
        usePointStyle: true,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
          drawTicks: false,
          tickLength: 0,
        },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { size: tickFontSize, weight: 500 },
          padding: 8,
          sampleSize: Math.max(maxTickLabelCount, 4),
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: maxTickLabelCount,
          callback: (value) => {
            const index = typeof value === 'number' ? value : Number(value);
            const raw =
              Number.isFinite(index) && labels[index]
                ? labels[index]
                : typeof value === 'string'
                  ? value
                  : '';

            if (period === 'hour') {
              const [md, time] = raw.split(' ');
              if (!time) return raw;
              if (time.startsWith('00:')) {
                return md ? [md, time] : time;
              }
              return time;
            }

            if (isMobile) {
              const parts = raw.split('-');
              if (parts.length === 3) {
                return `${parts[1]}-${parts[2]}`;
              }
            }
            return raw;
          },
        },
      },
      y: {
        beginAtZero: true,
        grace: '6%',
        grid: {
          color: yGridColor,
          drawTicks: false,
          tickLength: 0,
        },
        border: { display: false },
        ticks: {
          color: tickColor,
          font: { size: tickFontSize, weight: 500 },
          padding: 10,
        },
      },
    },
    elements: {
      line: {
        tension: 0.3,
        borderWidth: isMobile ? 2 : 2.2,
        borderCapStyle: 'round',
        borderJoinStyle: 'round',
        cubicInterpolationMode: 'monotone',
      },
      point: {
        borderWidth: 2,
        radius: pointRadius,
        hoverRadius: isDenseSeries ? 4 : 5,
        hoverBorderWidth: 2.5,
        hitRadius: isDenseSeries ? 10 : 16,
      },
    },
  };
}

/**
 * Calculate minimum chart width for hourly data on mobile devices
 */
export function getHourChartMinWidth(labelCount: number, isMobile: boolean): string | undefined {
  if (!isMobile || labelCount <= 0) return undefined;
  const perPoint = 56;
  const minWidth = Math.min(labelCount * perPoint, 3000);
  return `${minWidth}px`;
}
