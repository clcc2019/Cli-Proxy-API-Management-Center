import {
  type ChangeEvent,
  type ReactNode,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
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
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { useAuthStore, useNotificationStore, useConfigStore, useThemeStore } from '@/stores';
import { useUsageData } from '@/components/usage';
import {
  REQUEST_EVENT_ROWS_LIMIT,
  useRequestEventRows,
  type RequestEventRow,
} from '@/components/usage/hooks/useRequestEventRows';
import {
  buildRequestEventTokenLabels,
  copyRequestEventErrorMessage,
  getRequestEventCredentialTypeStyle,
  hasRequestEventValue,
  type RequestEventTokenLabels,
} from '@/components/usage/hooks/requestEventFormat';
import {
  formatDurationMs,
  formatUsd,
  getLatencyTone,
  LATENCY_SOURCE_FIELD,
  type LatencyTone,
} from '@/utils/usage';
import styles from './RequestLogsPage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

type StatusFilter = 'all' | 'success' | 'failed';

const SKELETON_COUNT = 6;
const AUTO_REFRESH_INTERVAL_MS = 15_000;
const RELATIVE_TICK_MS = 60_000;

const LATENCY_TONE_CLASS: Record<LatencyTone, string> = {
  normal: '',
  slow: styles.eventLatencySlow,
  verySlow: styles.eventLatencyVerySlow,
};
const FILTER_ALL_ICON = <IconFilterAll size={12} aria-hidden="true" />;
const FILTER_SUCCESS_ICON = <IconCheck size={12} aria-hidden="true" />;
const FILTER_FAILED_ICON = <IconX size={12} aria-hidden="true" />;

interface RelativeLabels {
  justNow: string;
  sec: string;
  min: string;
  hour: string;
  day: string;
}

interface StatusFilterButtonProps {
  active: boolean;
  count: number;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  toneClassName?: string;
  onClick: () => void;
}

const StatusFilterButton = memo(function StatusFilterButton({
  active,
  count,
  disabled = false,
  icon,
  label,
  toneClassName,
  onClick,
}: StatusFilterButtonProps) {
  const className = [
    styles.statusFilterButton,
    toneClassName,
    active ? styles.statusFilterButtonActive : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={className}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      <span className={styles.statusFilterText}>{label}</span>
      <span className={styles.statusFilterCount}>{count}</span>
    </button>
  );
});

interface RequestEventsEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

const RequestEventsEmptyState = memo(function RequestEventsEmptyState({
  title,
  description,
  action,
}: RequestEventsEmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyStateIcon} aria-hidden="true">
        <IconInbox size={22} />
      </span>
      <span className={styles.emptyStateTitle}>{title}</span>
      <p className={styles.emptyStateDesc}>{description}</p>
      {action}
    </div>
  );
});

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

type RequestEventLabels = {
  authShort: string;
  clearFilters: string;
  columns: {
    cost: string;
    credential: string;
    model: string;
    status: string;
    time: string;
    tokens: string;
  };
  empty: {
    title: string;
    description: string;
  };
  errorCopyHint: string;
  errorEmpty: string;
  filterAll: string;
  noResult: {
    title: string;
    description: string;
  };
  reasoning: string;
  refresh: string;
  refreshing: string;
  success: string;
  failure: string;
};

interface RequestEventRowItemProps {
  row: RequestEventRow;
  hasLatencyData: boolean;
  latencyHint: string;
  resolvedTheme: 'light' | 'dark';
  onCopyError: (errorMessage: string, fallback: string) => void;
  labels: RequestEventLabels;
  tokenLabels: RequestEventTokenLabels;
  isZh: boolean;
  relativeLabels: RelativeLabels;
}

const RequestEventRowItem = memo(function RequestEventRowItem({
  row,
  hasLatencyData,
  latencyHint,
  resolvedTheme,
  onCopyError,
  labels,
  tokenLabels,
  isZh,
  relativeLabels,
}: RequestEventRowItemProps) {
  const hasReasoning = hasRequestEventValue(row.modelReasoningEffort);
  const hasAuthIndex = hasRequestEventValue(row.authIndex);
  const hasApiKey = hasRequestEventValue(row.apiKeyMasked);

  const credentialTypeStyle = useMemo(
    () => getRequestEventCredentialTypeStyle(row.sourceType, resolvedTheme),
    [row.sourceType, resolvedTheme]
  );

  const handleCopyError = useCallback(() => {
    onCopyError(row.errorMessage, labels.errorEmpty);
  }, [onCopyError, row.errorMessage, labels.errorEmpty]);

  const rowClassName = row.failed
    ? `${styles.eventRow} ${styles.eventRowFailed}`
    : `${styles.eventRow} ${styles.eventRowSuccess}`;
  const latencyClassName =
    hasLatencyData && row.latencyMs !== null
      ? LATENCY_TONE_CLASS[getLatencyTone(row.latencyMs)]
      : '';

  return (
    <div className={rowClassName}>
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
            {labels.reasoning} · {row.modelReasoningEffort}
          </span>
        )}
      </div>

      <div className={styles.eventCredential}>
        <div className={styles.eventCredentialMain}>
          <span className={styles.eventCredentialName} title={row.source}>
            {row.source}
          </span>
          {row.sourceType && credentialTypeStyle && (
            <span className={styles.eventCredentialType} style={credentialTypeStyle}>
              {row.sourceType}
            </span>
          )}
        </div>
        {(hasAuthIndex || hasApiKey) && (
          <div className={styles.eventCredentialMeta}>
            {hasAuthIndex && (
              <span className={styles.eventCredentialMetaItem} title={row.authIndex}>
                {labels.authShort} #{row.authIndex}
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
              row.errorMessage ? `${labels.errorCopyHint}\n${row.errorMessage}` : labels.errorEmpty
            }
            onClick={handleCopyError}
            disabled={!row.errorMessage}
          >
            <IconX size={12} aria-hidden="true" />
            {labels.failure}
          </button>
        ) : (
          <span className={`${styles.eventStatusBadge} ${styles.eventStatusBadgeSuccess}`}>
            <IconCheck size={12} aria-hidden="true" />
            {labels.success}
          </span>
        )}
        {hasLatencyData && row.latencyMs !== null && (
          <span
            className={
              latencyClassName ? `${styles.eventLatency} ${latencyClassName}` : styles.eventLatency
            }
            title={latencyHint}
          >
            <span className={styles.eventLatencyDot} aria-hidden="true" />
            {formatDurationMs(row.latencyMs)}
          </span>
        )}
        {row.failed && row.errorMessage && (
          <button
            type="button"
            className={styles.eventErrorPreview}
            title={`${labels.errorCopyHint}\n${row.errorMessage}`}
            onClick={handleCopyError}
          >
            {row.errorMessage}
          </button>
        )}
      </div>

      <div className={styles.eventTokens}>
        <span className={styles.eventTokensTotal}>{row.totalTokens.toLocaleString()}</span>
        {row.tokenParts.length > 0 && (
          <span className={styles.eventTokensBreakdown}>
            {row.tokenParts.map((part) => (
              <span key={part.kind} className={styles.eventTokensPart}>
                <span className={styles.eventTokensPartLabel}>{tokenLabels[part.kind]}</span>
                {part.value.toLocaleString()}
              </span>
            ))}
          </span>
        )}
      </div>

      <div
        className={
          row.totalCost > 0 ? styles.eventCost : `${styles.eventCost} ${styles.eventCostMuted}`
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
        <div key={idx} className={styles.skeletonRow} style={{ animationDelay: `${idx * 60}ms` }}>
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
  const showNotification = useNotificationStore((state) => state.showNotification);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const { usage, loading, error, modelPrices, loadUsage } = useUsageData({
    detailsLimit: REQUEST_EVENT_ROWS_LIMIT,
    compactDetails: true,
    includeAggregated: false,
  });

  useHeaderRefresh(loadUsage);

  const { rows, hasLatencyData } = useRequestEventRows({
    usage,
    modelPrices,
    claudeConfigs: config?.claudeApiKeys ?? (EMPTY_LIST as never[]),
    codexConfigs: config?.codexApiKeys ?? (EMPTY_LIST as never[]),
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLocaleLowerCase());

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

  const requestSummary = useMemo(() => {
    let latencyTotal = 0;
    let latencySamples = 0;
    let totalCost = 0;

    rows.forEach((row) => {
      totalCost += row.totalCost;
      if (row.latencyMs !== null) {
        latencyTotal += row.latencyMs;
        latencySamples += 1;
      }
    });

    return {
      averageLatencyMs: latencySamples > 0 ? latencyTotal / latencySamples : null,
      totalCost,
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const baseRows =
      statusFilter === 'all'
        ? rows
        : rows.filter((row) => (statusFilter === 'success' ? !row.failed : row.failed));
    if (!deferredSearchQuery) return baseRows;
    return baseRows.filter((row) => row.searchText.includes(deferredSearchQuery));
  }, [deferredSearchQuery, rows, statusFilter]);

  useVisibleInterval(
    () => {
      void loadUsage();
    },
    AUTO_REFRESH_INTERVAL_MS,
    { enabled: connectionStatus === 'connected' }
  );

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
      await copyRequestEventErrorMessage({
        errorMessage,
        fallback,
        t,
        showNotification,
      });
    },
    [showNotification, t]
  );

  const tokenLabels = useMemo(() => buildRequestEventTokenLabels(t), [t]);

  const relativeLabels = useMemo<RelativeLabels>(
    () => ({
      justNow: t('usage_stats.request_events_relative_just_now'),
      sec: t('usage_stats.request_events_relative_sec'),
      min: t('usage_stats.request_events_relative_min'),
      hour: t('usage_stats.request_events_relative_hour'),
      day: t('usage_stats.request_events_relative_day'),
    }),
    [t]
  );

  const isZh = useMemo(
    () => typeof i18n.language === 'string' && i18n.language.toLowerCase().startsWith('zh'),
    [i18n.language]
  );

  const requestEventLabels = useMemo<RequestEventLabels>(
    () => ({
      authShort: t('usage_stats.request_events_auth_short'),
      clearFilters: t('logs.clear_filters'),
      columns: {
        cost: t('usage_stats.request_events_col_cost'),
        credential: t('usage_stats.request_events_col_credential'),
        model: t('usage_stats.request_events_col_model'),
        status: t('usage_stats.request_events_col_status'),
        time: t('usage_stats.request_events_col_time'),
        tokens: t('usage_stats.request_events_col_tokens'),
      },
      empty: {
        title: t('usage_stats.request_events_empty_title'),
        description: t('usage_stats.request_events_empty_desc'),
      },
      errorCopyHint: t('usage_stats.request_events_error_copy_hint'),
      errorEmpty: t('usage_stats.request_events_error_empty'),
      filterAll: t('usage_stats.request_events_filter_all'),
      noResult: {
        title: t('usage_stats.request_events_no_result_title'),
        description: t('usage_stats.request_events_no_result_desc'),
      },
      reasoning: t('usage_stats.request_events_reasoning_label'),
      refresh: t('common.refresh'),
      refreshing: t('common.refreshing'),
      success: t('stats.success'),
      failure: t('stats.failure'),
    }),
    [t]
  );

  const showInitialLoadingOverlay = loading && !usage;
  const showSkeleton = loading && rows.length === 0;
  const showEmptyAll = !loading && rows.length === 0;
  const showEmptyFiltered = !showEmptyAll && filteredRows.length === 0;

  const handleSelectAll = useCallback(() => setStatusFilter('all'), []);
  const handleSelectSuccess = useCallback(() => setStatusFilter('success'), []);
  const handleSelectFailed = useCallback(() => setStatusFilter('failed'), []);
  const handleSearchChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);
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
        <div className={styles.loadingOverlay} role="status" aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={20} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <header className={styles.pageHeader}>
        <span className={styles.pageEyebrow}>{t('usage_stats.request_events_eyebrow')}</span>
        <h1 className={styles.pageTitle}>{t('nav.request_logs')}</h1>
        <p className={styles.pageSubtitle}>
          {t('usage_stats.request_events_page_subtitle', {
            limit: REQUEST_EVENT_ROWS_LIMIT,
          })}
        </p>
      </header>

      <section className={styles.summaryGrid} aria-label={t('usage_stats.request_events_title')}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>{t('usage_stats.request_events_kpi_total')}</span>
          <div className={styles.summaryValueRow}>
            <strong className={styles.summaryValue}>{counts.total}</strong>
            <span className={styles.summaryUnit}>
              {t('usage_stats.request_events_kpi_total_unit')}
            </span>
          </div>
          <span className={styles.summaryHint}>
            {t('usage_stats.request_events_kpi_total_hint', {
              limit: REQUEST_EVENT_ROWS_LIMIT,
            })}
          </span>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>
            {t('usage_stats.request_events_kpi_avg_latency')}
          </span>
          <div className={styles.summaryValueRow}>
            <strong className={styles.summaryValue}>
              {requestSummary.averageLatencyMs === null
                ? '--'
                : formatDurationMs(requestSummary.averageLatencyMs)}
            </strong>
          </div>
          <span className={styles.summaryHint}>
            {requestSummary.averageLatencyMs === null
              ? t('usage_stats.request_events_kpi_avg_latency_empty')
              : latencyHint}
          </span>
        </div>

        <div className={styles.summaryItem}>
          <span className={styles.summaryLabel}>
            {t('usage_stats.request_events_kpi_total_cost')}
          </span>
          <div className={styles.summaryValueRow}>
            <strong className={styles.summaryValue}>{formatUsd(requestSummary.totalCost)}</strong>
          </div>
          <span className={styles.summaryHint} aria-hidden="true">
            &nbsp;
          </span>
        </div>
      </section>

      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className={styles.toolbar}>
        <div
          className={styles.statusFilter}
          role="tablist"
          aria-label={requestEventLabels.columns.status}
        >
          <StatusFilterButton
            active={statusFilter === 'all'}
            count={counts.total}
            icon={FILTER_ALL_ICON}
            label={requestEventLabels.filterAll}
            onClick={handleSelectAll}
          />
          <StatusFilterButton
            active={statusFilter === 'success'}
            count={counts.success}
            disabled={counts.success === 0}
            icon={FILTER_SUCCESS_ICON}
            label={requestEventLabels.success}
            toneClassName={styles.statusFilterSuccess}
            onClick={handleSelectSuccess}
          />
          <StatusFilterButton
            active={statusFilter === 'failed'}
            count={counts.failed}
            disabled={counts.failed === 0}
            icon={FILTER_FAILED_ICON}
            label={requestEventLabels.failure}
            toneClassName={styles.statusFilterFailed}
            onClick={handleSelectFailed}
          />
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
            {loading ? requestEventLabels.refreshing : requestEventLabels.refresh}
          </Button>
        </div>
      </div>

      {/* List / states */}
      {showSkeleton ? (
        <SkeletonList />
      ) : showEmptyAll ? (
        <RequestEventsEmptyState
          title={requestEventLabels.empty.title}
          description={requestEventLabels.empty.description}
        />
      ) : showEmptyFiltered ? (
        <RequestEventsEmptyState
          title={requestEventLabels.noResult.title}
          description={requestEventLabels.noResult.description}
          action={
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              {requestEventLabels.clearFilters}
            </Button>
          }
        />
      ) : (
        <div className={styles.eventTableShell}>
          <div className={styles.eventListHeader} aria-hidden="true">
            <span>{requestEventLabels.columns.time}</span>
            <span>{requestEventLabels.columns.model}</span>
            <span>{requestEventLabels.columns.credential}</span>
            <span>{requestEventLabels.columns.status}</span>
            <span>{requestEventLabels.columns.tokens}</span>
            <span style={{ textAlign: 'right' }}>{requestEventLabels.columns.cost}</span>
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
                labels={requestEventLabels}
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
