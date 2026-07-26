import { memo, useId, useMemo } from 'react';
import type { SparklineBundle } from './hooks/sparklineTypes';

export interface SvgSparklineProps {
  sparkline: SparklineBundle;
  className?: string;
}

const WIDTH = 120;
const HEIGHT = 40;
const PADDING_X = 2;
const PADDING_Y = 4;

const buildPath = (points: Array<[number, number]>) => {
  if (points.length === 0) return '';
  return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
};

export const SvgSparkline = memo(function SvgSparkline({
  sparkline,
  className,
}: SvgSparklineProps) {
  const gradientId = `sparkline-gradient-${useId().replace(/:/g, '')}`;
  const dataset = sparkline.data.datasets[0];
  const values = dataset.data;

  const { areaPath, linePath } = useMemo(() => {
    if (!values.length) {
      return { areaPath: '', linePath: '' };
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const chartWidth = WIDTH - PADDING_X * 2;
    const chartHeight = HEIGHT - PADDING_Y * 2;
    const step = values.length > 1 ? chartWidth / (values.length - 1) : chartWidth;
    const points = values.map((value, index) => {
      const x = PADDING_X + index * step;
      const y = PADDING_Y + chartHeight - ((value - min) / range) * chartHeight;
      return [x, y] as [number, number];
    });
    const line = buildPath(points);
    const first = points[0];
    const last = points[points.length - 1];
    const baseline = HEIGHT - PADDING_Y;

    return {
      linePath: line,
      areaPath: `${line} L ${last[0]} ${baseline} L ${first[0]} ${baseline} Z`,
    };
  }, [values]);

  if (!linePath) return null;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={dataset.borderColor} stopOpacity="0.22" />
          <stop offset="62%" stopColor={dataset.borderColor} stopOpacity="0.08" />
          <stop offset="100%" stopColor={dataset.borderColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={dataset.borderColor}
        strokeWidth={dataset.borderWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
});

SvgSparkline.displayName = 'SvgSparkline';
