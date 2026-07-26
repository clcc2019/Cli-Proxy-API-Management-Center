/**
 * LogRow
 *
 * 日志列表的单行。日志缓冲最多 10000 行，可见窗口在滚动加载时反复变化，
 * 因此这里用 memo 包裹，并要求父组件传入引用稳定的 handler
 * （见 LogsPage 中的 useEventCallback），否则 memo 会被每次渲染新建的
 * 内联箭头函数击穿。
 */

import { memo } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { ParsedLogLine } from '../hooks/logTypes';

type LogRowStyles = Record<string, string>;

export interface LogRowProps {
  line: ParsedLogLine;
  canTraceRequest: boolean;
  copyHint: string;
  traceLabel: string;
  styles: LogRowStyles;
  onCopy: (raw: string) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>, raw: string) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, requestId?: string) => void;
  onPointerUp: () => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onTrace: (line: ParsedLogLine) => void;
}

const resolveStatusClass = (statusCode: number, styles: LogRowStyles): string => {
  if (statusCode >= 200 && statusCode < 300) return styles.statusSuccess;
  if (statusCode >= 300 && statusCode < 400) return styles.statusInfo;
  if (statusCode >= 400 && statusCode < 500) return styles.statusWarn;
  return styles.statusError;
};

const resolveLevelClass = (level: ParsedLogLine['level'], styles: LogRowStyles): string => {
  switch (level) {
    case 'info':
      return styles.levelInfo;
    case 'warn':
      return styles.levelWarn;
    case 'error':
    case 'fatal':
      return styles.levelError;
    case 'debug':
      return styles.levelDebug;
    case 'trace':
      return styles.levelTrace;
    default:
      return '';
  }
};

export const LogRow = memo(function LogRow({
  line,
  canTraceRequest,
  copyHint,
  traceLabel,
  styles,
  onCopy,
  onKeyDown,
  onPointerDown,
  onPointerUp,
  onPointerMove,
  onTrace,
}: LogRowProps) {
  const hasMeta = Boolean(
    line.level ||
      line.method ||
      typeof line.statusCode === 'number' ||
      line.path ||
      line.source ||
      line.requestId ||
      line.latency ||
      line.ip ||
      canTraceRequest
  );

  const rowClassNames = [styles.logRow];
  if (line.level === 'warn') rowClassNames.push(styles.rowWarn);
  if (line.level === 'error' || line.level === 'fatal') rowClassNames.push(styles.rowError);

  return (
    <div
      className={rowClassNames.join(' ')}
      tabIndex={0}
      aria-label={copyHint}
      onDoubleClick={() => onCopy(line.raw)}
      onKeyDown={(event) => onKeyDown(event, line.raw)}
      onPointerDown={(event) => onPointerDown(event, line.requestId)}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerMove={onPointerMove}
      title={copyHint}
    >
      <div className={styles.timestamp}>{line.timestamp || ''}</div>
      <div className={styles.rowMain}>
        {hasMeta && (
          <div className={styles.rowMeta}>
            {line.level && (
              <span className={[styles.badge, resolveLevelClass(line.level, styles)].join(' ')}>
                {line.level.toUpperCase()}
              </span>
            )}

            {line.method && (
              <span className={[styles.badge, styles.methodBadge].join(' ')}>{line.method}</span>
            )}

            {typeof line.statusCode === 'number' && (
              <span
                className={[
                  styles.badge,
                  styles.statusBadge,
                  resolveStatusClass(line.statusCode, styles),
                ].join(' ')}
              >
                {line.statusCode}
              </span>
            )}

            {line.path && (
              <span className={styles.path} title={line.path}>
                {line.path}
              </span>
            )}

            {line.source && (
              <span className={styles.source} title={line.source}>
                {line.source}
              </span>
            )}

            {line.requestId && (
              <span
                className={[styles.badge, styles.requestIdBadge].join(' ')}
                title={line.requestId}
              >
                {line.requestId}
              </span>
            )}

            {line.latency && <span className={styles.pill}>{line.latency}</span>}
            {line.ip && <span className={styles.pill}>{line.ip}</span>}

            {canTraceRequest && (
              <button
                type="button"
                className={styles.traceButton}
                onClick={(event) => {
                  event.stopPropagation();
                  onPointerUp();
                  onTrace(line);
                }}
                title={traceLabel}
              >
                {traceLabel}
              </button>
            )}
          </div>
        )}

        {line.message && <div className={styles.message}>{line.message}</div>}
      </div>
    </div>
  );
});
