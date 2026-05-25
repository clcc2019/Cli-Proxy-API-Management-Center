import {
  type ChangeEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconCheck,
  IconFilterAll,
  IconInbox,
  IconRefreshCw,
  IconSearch,
  IconX,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore, useNotificationStore, useConfigStore, useThemeStore } from '@/stores';
import { useUsageData } from '@/components/usage';
import {
  useRequestEventRows,
  type RequestEventRow,
} from '@/components/usage/hooks/useRequestEventRows';
import {
  getTypeColor,
  normalizeProviderKey,
} from '@/features/authFiles/constants';
import { copyToClipboard } from '@/utils/clipboard';
import {
  formatDurationMs,
  formatUsd,
  LATENCY_SOURCE_FIELD,
} from '@/utils/usage';
import styles from './RequestLogsPage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

type StatusFilter = 'all' | 'success' | 'failed';

const SKELETON_COUNT = 6;
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const RELATIVE_TICK_MS = 60_000;

type LatencyTone = 'normal' | 'slow' | 'verySlow';

const getLatencyTone = (latencyMs: number): LatencyTone => {
  if (latencyMs <= 30_000) return 'normal';
  if (latencyMs <= 60_000) return 'slow';
  return 'verySlow';
};

const LATENCY_TONE_CLASS: Record<LatencyTone, string> = {
  normal: '',
  slow: styles.eventLatencySlow,
  verySlow: styles.eventLatencyVerySlow,
};

interface RelativeLabels {
  justNow: string;
  sec: string;
  min: string;
  hour: string;
  day: string;
}

interface TokenLabels {
  in: string;
  out: string;
  reasoning: string;
  cached: string;
}

function formatRelative(
  now: number,
  ms: number,
  isZh: boolean,
  fallback: string,
  labels: RelativeLabels
): string {
  if (!ms) return fallback;
  const diff = Math.max(0, Math.floor((now - ms) / 1000));
  if (diff < 5) return labels.justNow;
  if (diff < 60) return isZh ? `${diff}${labels.sec}前` : `${diff}${labels.sec} ago`;
  if (diff < 3600) {
    const v = Math.floor(diff / 60);
    return isZh ? `${v}${labels.min}前` : `${v}${labels.min} ago`;
  }
  if (diff < 86_400) {
    const v = Math.floor(diff / 3600);
    return isZh ? `${v}${labels.hour}前` : `${v}${labels.hour} ago`;
  }
  const days = Math.floor(diff / 86_400);
  if (days <= 30) {
    return isZh ? `${days}${labels.day}前` : `${days}${labels.day} ago`;
  }
  return fallback;
}

/**
 * Hoisted timer source so every row subscribes to a single interval.
 * Avoids N intervals or a top-level state update that re-renders the whole list.
 */
const relativeTimeSubscribers = new Set<(now: number) => void>();
let relativeTimerId: number | null = null;

function ensureRelativeTimer() {
  if (relativeTimerId !== null) return;
  if (typeof window === 'undefined') return;
  relativeTimerId = window.setInterval(() => {
    const now = Date.now();
    relativeTimeSubscribers.forEach((fn) => fn(now));
  }, RELATIVE_TICK_MS);
}

function teardownRelativeTimer() {
  if (relativeTimeSubscribers.size > 0) return;
  if (relativeTimerId !== null) {
    window.clearInterval(relativeTimerId);
    relativeTimerId = null;
  }
}

interface RelativeTimeProps {
  timestampMs: number;
  fallback: string;
  isZh: boolean;
  labels: RelativeLabels;
  className?: string;
}

const RelativeTime = memo(function RelativeTime({
  timestampMs,
  fallback,
  isZh,
  labels,
  className,
}: RelativeTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const subscriber = (next: number) => setNow(next);
    relativeTimeSubscribers.add(subscriber);
    ensureRelativeTimer();
    return () => {
      relativeTimeSubscribers.delete(subscriber);
      teardownRelativeTimer();
    };
  }, []);

  const text = formatRelative(now, timestampMs, isZh, fallback, labels);
  return <span className={className}>{text}</span>;
});

interface RequestEventRowItemProps {
  row: RequestEventRow;
  hasLatencyData: boolean;
  latencyHint: string;
  resolvedTheme: 'light' | 'dark';
  onCopyError: (errorMessage: string, fallback: string) => void;
  errorEmptyLabel: string;
  errorCopyHint: string;
  successLabel: string;
  failureLabel: string;
  reasoningLabel: string;
  authShortLabel: string;
  tokenLabels: TokenLabels;
  isZh: boolean;
  relativeLabels: RelativeLabels;
}

const RequestEventRowItem = memo(function RequestEventRowItem({
  row,
  hasLatencyData,
  latencyHint,
  resolvedTheme,
  onCopyError,
  errorEmptyLabel,
  errorCopyHint,
  successLabel,
  failureLabel,
  reasoningLabel,
  authShortLabel,
  tokenLabels,
  isZh,
  relativeLabels,
}: RequestEventRowItemProps) {
  const tokenParts = useMemo(() => {
    const parts: { label: string; value: number }[] = [];
    if (row.inputTokens > 0)
      parts.push({ label: tokenLabels.in, value: row.inputTokens });
    if (row.outputTokens > 0)
      parts.push({ label: tokenLabels.out, value: row.outputTokens });
    if (row.reasoningTokens > 0)
      parts.push({ label: tokenLabels.reasoning, value: row.reasoningTokens });
    if (row.cachedTokens > 0)
      parts.push({ label: tokenLabels.cached, value: row.cachedTokens });
    return parts;
  }, [
    row.inputTokens,
    row.outputTokens,
    row.reasoningTokens,
    row.cachedTokens,
    tokenLabels,
  ]);

  const hasReasoning =
    row.modelReasoningEffort && row.modelReasoningEffort !== '-';
  const hasAuthIndex = row.authIndex && row.authIndex !== '-';
  const hasApiKey = row.apiKeyMasked && row.apiKeyMasked !== '-';

  const typeColor = useMemo(
    () =>
      row.sourceType
        ? getTypeColor(normalizeProviderKey(row.sourceType), resolvedTheme)
        : null,
    [row.sourceType, resolvedTheme]
  );

  const credentialTypeStyle = useMemo(
    () =>
      typeColor
        ? {
            background: typeColor.bg,
            color: typeColor.text,
            borderColor: typeColor.bg,
          }
        : undefined,
    [typeColor]
  );

  const handleCopyError = useCallback(() => {
    onCopyError(row.errorMessage, errorEmptyLabel);
  }, [onCopyError, row.errorMessage, errorEmptyLabel]);

  const rowClassName = row.failed
    ? `${styles.eventRow} ${styles.eventRowFailed}`
    : `${styles.eventRow} ${styles.eventRowSuccess}`;

  return (
    <div className={rowClassName}>
      <span className={styles.eventStripe} aria-hidden="true" />

      <div className={styles.eventTime}>
        <span className={styles.eventTimePrimary} title={row.timestampLabel}>
          {row.timeOfDay || row.timestampLabel}
        </span>
        <RelativeTime
          className={styles.eventTimeSecondary}
          timestampMs={row.timestampMs}
          fallback={row.timestampLabel}
          isZh={isZh}
          labels={relativeLabels}
        />
      </div>

      <div className={styles.eventModel}>
        <span className={styles.eventModelName} title={row.model}>
          {row.model}
        </span>
        {hasReasoning && (
          <span className={styles.eventModelMeta}>
            {reasoningLabel} · {row.modelReasoningEffort}
          </span>
        )}
      </div>

      <div className={styles.eventCredential}>
        <div className={styles.eventCredentialMain}>
          <span className={styles.eventCredentialName} title={row.source}>
            {row.source}
          </span>
          {row.sourceType && credentialTypeStyle && (
            <span
              className={styles.eventCredentialType}
              style={credentialTypeStyle}
            >
              {row.sourceType}
            </span>
          )}
        </div>
        {(hasAuthIndex || hasApiKey) && (
          <div className={styles.eventCredentialMeta}>
            {hasAuthIndex && (
              <span
                className={styles.eventCredentialMetaItem}
                title={row.authIndex}
              >
                {authShortLabel} #{row.authIndex}
              </span>
            )}
            {hasApiKey && (
              <span
                className={`${styles.eventCredentialMetaItem} ${styles.eventCredentialKey}`}
                title={row.apiKeyMasked}
              >
                {row.apiKeyMasked}
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.eventStatus}>
        {row.failed ? (
          <button
            type="button"
            className={`${styles.eventStatusBadge} ${styles.eventStatusBadgeFailed}`}
            title={
              row.errorMessage
                ? `${errorCopyHint}\n${row.errorMessage}`
                : errorEmptyLabel
            }
            onClick={handleCopyError}
            disabled={!row.errorMessage}
          >
            <IconX size={12} aria-hidden="true" />
            {failureLabel}
          </button>
        ) : (
          <span
            className={`${styles.eventStatusBadge} ${styles.eventStatusBadgeSuccess}`}
          >
            <IconCheck size={12} aria-hidden="true" />
            {successLabel}
          </span>
        )}
        {hasLatencyData && row.latencyMs !== null && (
          <span
            className={
              LATENCY_TONE_CLASS[getLatencyTone(row.latencyMs)]
                ? `${styles.eventLatency} ${LATENCY_TONE_CLASS[getLatencyTone(row.latencyMs)]}`
                : styles.eventLatency
            }
            title={latencyHint}
          >
            <span className={styles.eventLatencyDot} aria-hidden="true" />
            {formatDurationMs(row.latencyMs)}
          </span>
        )}
      </div>

      <div className={styles.eventTokens}>
        <span className={styles.eventTokensTotal}>
          {row.totalTokens.toLocaleString()}
        </span>
        {tokenParts.length > 0 && (
          <span className={styles.eventTokensBreakdown}>
            {tokenParts.map((part) => (
              <span key={part.label} className={styles.eventTokensPart}>
                <span className={styles.eventTokensPartLabel}>
                  {part.label}
                </span>
                {part.value.toLocaleString()}
              </span>
            ))}
          </span>
        )}
      </div>

      <div
        className={
          row.totalCost > 0
            ? styles.eventCost
            : `${styles.eventCost} ${styles.eventCostMuted}`
        }
      >
        {row.totalCost > 0 ? formatUsd(row.totalCost) : '--'}
      </div>
    </div>
  );
});

const SkeletonList = memo(function SkeletonList() {
  return (
    <div className={styles.skeletonGrid} role="status" aria-busy="true">
      {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
        <div
          key={idx}
          className={styles.skeletonRow}
          style={{ animationDelay: `${idx * 60}ms` }}
        >
          <div className={styles.skeletonStripe} />
          <div>
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonBlockTall}`}
              style={{ width: '70%' }}
            />
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonBlockShort}`}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonBlockTall}`}
              style={{ width: '80%' }}
            />
          </div>
          <div>
            <div className={styles.skeletonBlock} style={{ width: '70%' }} />
            <div
              className={`${styles.skeletonBlock} ${styles.skeletonBlockShort}`}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <div className={styles.skeletonBlock} style={{ width: 76 }} />
          </div>
          <div>
            <div className={styles.skeletonBlock} style={{ width: '60%' }} />
          </div>
          <div>
            <div className={styles.skeletonBlock} style={{ width: 72 }} />
          </div>
        </div>
      ))}
    </div>
  );
});

export function RequestLogsPage() {
  const { t, i18n } = useTranslation();
  const config = useConfigStore((state) => state.config);
  const showNotification = useNotificationStore(
    (state) => state.showNotification
  );
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const { usage, loading, error, modelPrices, loadUsage } = useUsageData();

  useHeaderRefresh(loadUsage);

  const { rows, hasLatencyData } = useRequestEventRows({
    usage,
    modelPrices,
    geminiKeys: config?.geminiApiKeys ?? (EMPTY_LIST as never[]),
    claudeConfigs: config?.claudeApiKeys ?? (EMPTY_LIST as never[]),
    codexConfigs: config?.codexApiKeys ?? (EMPTY_LIST as never[]),
    vertexConfigs: config?.vertexApiKeys ?? (EMPTY_LIST as never[]),
    openaiProviders: config?.openaiCompatibility ?? (EMPTY_LIST as never[]),
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const counts = useMemo(() => {
    let success = 0;
    let failed = 0;
    rows.forEach((row) => {
      if (row.failed) failed += 1;
      else success += 1;
    });
    return {
      total: rows.length,
      success,
      failed,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const baseRows =
      statusFilter === 'all'
        ? rows
        : rows.filter((row) =>
            statusFilter === 'success' ? !row.failed : row.failed
          );
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return baseRows;
    return baseRows.filter((row) =>
      [
        row.model,
        row.modelReasoningEffort,
        row.source,
        row.sourceType,
        row.authIndex,
        row.apiKeyMasked,
        row.errorMessage,
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    );
  }, [rows, searchQuery, statusFilter]);

  // 自动每 15 秒刷新一次请求详情，文档隐藏时暂停以节省资源，恢复可见后立即刷新一次
  const loadUsageRef = useRef(loadUsage);
  useEffect(() => {
    loadUsageRef.current = loadUsage;
  }, [loadUsage]);

  useEffect(() => {
    if (connectionStatus !== 'connected') return;

    const refresh = () => {
      void loadUsageRef.current?.();
    };

    let intervalId: number | null = null;

    const startInterval = () => {
      if (intervalId !== null) return;
      intervalId = window.setInterval(refresh, AUTO_REFRESH_INTERVAL_MS);
    };

    const stopInterval = () => {
      if (intervalId === null) return;
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
      } else {
        // 切回前台时立即刷新一次，再继续轮询
        refresh();
        startInterval();
      }
    };

    if (!document.hidden) {
      startInterval();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connectionStatus]);

  const latencyHint = useMemo(
    () =>
      t('usage_stats.latency_unit_hint', {
        field: LATENCY_SOURCE_FIELD,
        unit: t('usage_stats.duration_unit_ms'),
      }),
    [t]
  );

  const handleCopyError = useCallback(
    async (errorMessage: string, fallback: string) => {
      const text = (errorMessage || fallback).trim();
      if (!text) return;
      const ok = await copyToClipboard(text);
      showNotification(
        ok
          ? t('usage_stats.request_events_error_copy_success')
          : t('usage_stats.request_events_error_copy_failed'),
        ok ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const tokenLabels = useMemo<TokenLabels>(
    () => ({
      in: t('usage_stats.request_events_token_in'),
      out: t('usage_stats.request_events_token_out'),
      reasoning: t('usage_stats.request_events_token_reasoning'),
      cached: t('usage_stats.request_events_token_cached'),
    }),
    [t]
  );

  const relativeLabels = useMemo<RelativeLabels>(
    () => ({
      justNow: t('usage_stats.request_events_relative_just_now', {
        defaultValue: 'just now',
      }),
      sec: t('usage_stats.request_events_relative_sec', { defaultValue: 's' }),
      min: t('usage_stats.request_events_relative_min', { defaultValue: 'm' }),
      hour: t('usage_stats.request_events_relative_hour', { defaultValue: 'h' }),
      day: t('usage_stats.request_events_relative_day', { defaultValue: 'd' }),
    }),
    [t]
  );

  const isZh = useMemo(
    () =>
      typeof i18n.language === 'string' &&
      i18n.language.toLowerCase().startsWith('zh'),
    [i18n.language]
  );

  const errorEmptyLabel = t('usage_stats.request_events_error_empty');
  const errorCopyHint = t('usage_stats.request_events_error_copy_hint');
  const successLabel = t('stats.success');
  const failureLabel = t('stats.failure');
  const reasoningLabel = t('usage_stats.request_events_reasoning_label');
  const authShortLabel = t('usage_stats.request_events_auth_short');

  const showInitialLoadingOverlay = loading && !usage;
  const showSkeleton = loading && rows.length === 0;
  const showEmptyAll = !loading && rows.length === 0;
  const showEmptyFiltered = !showEmptyAll && filteredRows.length === 0;

  const handleSelectAll = useCallback(() => setStatusFilter('all'), []);
  const handleSelectSuccess = useCallback(
    () => setStatusFilter('success'),
    []
  );
  const handleSelectFailed = useCallback(() => setStatusFilter('failed'), []);
  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    []
  );
  const handleClearSearch = useCallback(() => setSearchQuery(''), []);
  const handleClearFilters = useCallback(() => {
    setStatusFilter('all');
    setSearchQuery('');
  }, []);
  const handleRefresh = useCallback(() => {
    void loadUsage();
  }, [loadUsage]);

  const searchPlaceholder = t('usage_stats.request_events_search_placeholder');

  return (
    <div className={styles.page}>
      {showInitialLoadingOverlay && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner
              size={20}
              className={styles.loadingOverlaySpinner}
            />
            <span className={styles.loadingOverlayText}>
              {t('common.loading')}
            </span>
          </div>
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Filters */}
      <div className={styles.toolbar}>
        <div
          className={styles.statusFilter}
          role="tablist"
          aria-label={t('usage_stats.request_events_col_status')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            className={
              statusFilter === 'all'
                ? `${styles.statusFilterButton} ${styles.statusFilterButtonActive}`
                : styles.statusFilterButton
            }
            onClick={handleSelectAll}
          >
            <IconFilterAll size={12} aria-hidden="true" />
            <span className={styles.statusFilterText}>
              {t('usage_stats.request_events_filter_all', {
                defaultValue: 'All',
              })}
            </span>
            <span className={styles.statusFilterCount}>{counts.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'success'}
            className={
              statusFilter === 'success'
                ? `${styles.statusFilterButton} ${styles.statusFilterSuccess} ${styles.statusFilterButtonActive}`
                : `${styles.statusFilterButton} ${styles.statusFilterSuccess}`
            }
            onClick={handleSelectSuccess}
            disabled={counts.success === 0}
          >
            <IconCheck size={12} aria-hidden="true" />
            <span className={styles.statusFilterText}>{successLabel}</span>
            <span className={styles.statusFilterCount}>{counts.success}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'failed'}
            className={
              statusFilter === 'failed'
                ? `${styles.statusFilterButton} ${styles.statusFilterFailed} ${styles.statusFilterButtonActive}`
                : `${styles.statusFilterButton} ${styles.statusFilterFailed}`
            }
            onClick={handleSelectFailed}
            disabled={counts.failed === 0}
          >
            <IconX size={12} aria-hidden="true" />
            <span className={styles.statusFilterText}>{failureLabel}</span>
            <span className={styles.statusFilterCount}>{counts.failed}</span>
          </button>
        </div>

        <label className={styles.searchBox}>
          <IconSearch size={14} aria-hidden="true" />
          <input
            className={styles.searchInput}
            type="search"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClearButton}
              onClick={handleClearSearch}
              aria-label={t('usage_stats.clear_filters')}
            >
              <IconX size={12} aria-hidden="true" />
            </button>
          )}
        </label>

        <div className={styles.toolbarActions}>
          <span className={styles.resultMeta}>
            {t('usage_stats.request_events_result_count', {
              defaultValue: '{{shown}} / {{total}} events',
              shown: filteredRows.length,
              total: counts.total,
            })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={loading}
          >
            <IconRefreshCw
              size={14}
              className={loading ? styles.refreshIconSpinning : undefined}
              aria-hidden="true"
            />
            {loading
              ? t('common.refreshing', { defaultValue: 'Refreshing...' })
              : t('common.refresh', { defaultValue: 'Refresh' })}
          </Button>
        </div>
      </div>

      {/* List / states */}
      {showSkeleton ? (
        <SkeletonList />
      ) : showEmptyAll ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyStateIcon} aria-hidden="true">
            <IconInbox size={22} />
          </span>
          <span className={styles.emptyStateTitle}>
            {t('usage_stats.request_events_empty_title')}
          </span>
          <p className={styles.emptyStateDesc}>
            {t('usage_stats.request_events_empty_desc')}
          </p>
        </div>
      ) : showEmptyFiltered ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyStateIcon} aria-hidden="true">
            <IconInbox size={22} />
          </span>
          <span className={styles.emptyStateTitle}>
            {t('usage_stats.request_events_no_result_title')}
          </span>
          <p className={styles.emptyStateDesc}>
            {t('usage_stats.request_events_no_result_desc')}
          </p>
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            {t('logs.clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
        </div>
      ) : (
        <div className={styles.eventTableShell}>
          <div className={styles.eventListHeader} aria-hidden="true">
            <span />
            <span>{t('usage_stats.request_events_col_time')}</span>
            <span>{t('usage_stats.request_events_col_model')}</span>
            <span>{t('usage_stats.request_events_col_credential')}</span>
            <span>{t('usage_stats.request_events_col_status')}</span>
            <span>{t('usage_stats.request_events_col_tokens')}</span>
            <span style={{ textAlign: 'right' }}>
              {t('usage_stats.request_events_col_cost')}
            </span>
          </div>
          <div className={styles.eventList}>
            {filteredRows.map((row) => (
              <RequestEventRowItem
                key={row.id}
                row={row}
                hasLatencyData={hasLatencyData}
                latencyHint={latencyHint}
                resolvedTheme={resolvedTheme}
                onCopyError={handleCopyError}
                errorEmptyLabel={errorEmptyLabel}
                errorCopyHint={errorCopyHint}
                successLabel={successLabel}
                failureLabel={failureLabel}
                reasoningLabel={reasoningLabel}
                authShortLabel={authShortLabel}
                tokenLabels={tokenLabels}
                isZh={isZh}
                relativeLabels={relativeLabels}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
