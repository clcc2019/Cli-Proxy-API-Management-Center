import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  IconCheck,
  IconFilterAll,
  IconInbox,
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

const getLatencyTone = (
  latencyMs: number
): 'normal' | 'slow' | 'verySlow' => {
  if (latencyMs <= 30_000) return 'normal';
  if (latencyMs <= 60_000) return 'slow';
  return 'verySlow';
};

const LATENCY_TONE_CLASS: Record<'normal' | 'slow' | 'verySlow', string> = {
  normal: '',
  slow: styles.eventLatencySlow,
  verySlow: styles.eventLatencyVerySlow,
};

function formatRelative(
  now: number,
  ms: number,
  locale: string,
  fallback: string,
  labels: { justNow: string; sec: string; min: string; hour: string; day: string }
): string {
  if (!ms) return fallback;
  const isZh = typeof locale === 'string' && locale.toLowerCase().startsWith('zh');
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

interface RequestEventRowItemProps {
  row: RequestEventRow;
  hasLatencyData: boolean;
  latencyHint: string;
  resolvedTheme: 'light' | 'dark';
  nowMs: number;
  onCopyError: (errorMessage: string, fallback: string) => void;
  errorEmptyLabel: string;
  errorCopyHint: string;
  successLabel: string;
  failureLabel: string;
  reasoningLabel: string;
  authShortLabel: string;
  tokenLabels: {
    in: string;
    out: string;
    reasoning: string;
    cached: string;
  };
  locale: string;
  relativeLabels: {
    justNow: string;
    sec: string;
    min: string;
    hour: string;
    day: string;
  };
}

function RequestEventRowItem({
  row,
  hasLatencyData,
  latencyHint,
  resolvedTheme,
  nowMs,
  onCopyError,
  errorEmptyLabel,
  errorCopyHint,
  successLabel,
  failureLabel,
  reasoningLabel,
  authShortLabel,
  tokenLabels,
  locale,
  relativeLabels,
}: RequestEventRowItemProps) {
  const tokenParts: { label: string; value: number }[] = [];
  if (row.inputTokens > 0)
    tokenParts.push({ label: tokenLabels.in, value: row.inputTokens });
  if (row.outputTokens > 0)
    tokenParts.push({ label: tokenLabels.out, value: row.outputTokens });
  if (row.reasoningTokens > 0)
    tokenParts.push({ label: tokenLabels.reasoning, value: row.reasoningTokens });
  if (row.cachedTokens > 0)
    tokenParts.push({ label: tokenLabels.cached, value: row.cachedTokens });

  const hasReasoning =
    row.modelReasoningEffort && row.modelReasoningEffort !== '-';
  const hasAuthIndex = row.authIndex && row.authIndex !== '-';
  const hasApiKey = row.apiKeyMasked && row.apiKeyMasked !== '-';
  const typeColor = row.sourceType
    ? getTypeColor(normalizeProviderKey(row.sourceType), resolvedTheme)
    : null;
  const relative = formatRelative(
    nowMs,
    row.timestampMs,
    locale,
    row.timestampLabel,
    relativeLabels
  );

  return (
    <div
      className={[
        styles.eventRow,
        row.failed ? styles.eventRowFailed : styles.eventRowSuccess,
      ].join(' ')}
    >
      <span className={styles.eventStripe} aria-hidden="true" />

      <div className={styles.eventTime}>
        <span className={styles.eventTimePrimary} title={row.timestampLabel}>
          {row.timeOfDay || row.timestampLabel}
        </span>
        <span className={styles.eventTimeSecondary}>{relative}</span>
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
          {row.sourceType && typeColor && (
            <span
              className={styles.eventCredentialType}
              style={{
                background: typeColor.bg,
                color: typeColor.text,
                borderColor: typeColor.bg,
              }}
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
            className={[
              styles.eventStatusBadge,
              styles.eventStatusBadgeFailed,
            ].join(' ')}
            title={
              row.errorMessage
                ? `${errorCopyHint}\n${row.errorMessage}`
                : errorEmptyLabel
            }
            onClick={() =>
              onCopyError(row.errorMessage, errorEmptyLabel)
            }
            disabled={!row.errorMessage}
          >
            <IconX size={12} aria-hidden="true" />
            {failureLabel}
          </button>
        ) : (
          <span
            className={[
              styles.eventStatusBadge,
              styles.eventStatusBadgeSuccess,
            ].join(' ')}
          >
            <IconCheck size={12} aria-hidden="true" />
            {successLabel}
          </span>
        )}
        {hasLatencyData && row.latencyMs !== null && (
          <span
            className={[
              styles.eventLatency,
              LATENCY_TONE_CLASS[getLatencyTone(row.latencyMs)],
            ]
              .filter(Boolean)
              .join(' ')}
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
        className={[
          styles.eventCost,
          row.totalCost > 0 ? '' : styles.eventCostMuted,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {row.totalCost > 0 ? formatUsd(row.totalCost) : '--'}
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className={styles.skeletonGrid} role="status" aria-busy="true">
      {Array.from({ length: SKELETON_COUNT }).map((_, idx) => (
        <div key={idx} className={styles.skeletonRow}>
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
}

export function RequestLogsPage() {
  const { t, i18n } = useTranslation();
  const config = useConfigStore((state) => state.config);
  const showNotification = useNotificationStore(
    (state) => state.showNotification
  );
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const { usage, loading, error, modelPrices, loadUsage } =
    useUsageData();

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

  const [searchInput, setSearchInput] = useState('');
  const deferredSearch = useDeferredValue(searchInput.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const stats = useMemo(() => {
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
    return rows.filter((row) => {
      if (statusFilter === 'success' && row.failed) return false;
      if (statusFilter === 'failed' && !row.failed) return false;
      if (deferredSearch) {
        const haystack = [
          row.model,
          row.source,
          row.sourceType,
          row.sourceRaw,
          row.authIndex,
          row.apiKeyMasked,
          row.errorMessage,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(deferredSearch)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, deferredSearch]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

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

  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

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

  const tokenLabels = {
    in: t('usage_stats.request_events_token_in'),
    out: t('usage_stats.request_events_token_out'),
    reasoning: t('usage_stats.request_events_token_reasoning'),
    cached: t('usage_stats.request_events_token_cached'),
  };

  const relativeLabels = {
    justNow: t('usage_stats.request_events_relative_just_now', {
      defaultValue: 'just now',
    }),
    sec: t('usage_stats.request_events_relative_sec', { defaultValue: 's' }),
    min: t('usage_stats.request_events_relative_min', { defaultValue: 'm' }),
    hour: t('usage_stats.request_events_relative_hour', { defaultValue: 'h' }),
    day: t('usage_stats.request_events_relative_day', { defaultValue: 'd' }),
  };

  const showInitialLoadingOverlay = loading && !usage;
  const showSkeleton = loading && rows.length === 0;
  const showEmptyAll = !loading && rows.length === 0;
  const showEmptyFiltered = !showEmptyAll && filteredRows.length === 0;

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

      {/* Filter / search */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIconLeading} aria-hidden="true">
            <IconSearch size={14} />
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('usage_stats.request_events_search_placeholder', {
              defaultValue: 'Search by model, credential, key, or error',
            })}
            className={styles.searchInput}
            aria-label={t('usage_stats.request_events_search_placeholder', {
              defaultValue: 'Search request events',
            })}
          />
          {searchInput && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearchInput('')}
              aria-label={t('common.cancel')}
              title={t('common.cancel')}
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        <div
          className={styles.statusFilter}
          role="tablist"
          aria-label={t('usage_stats.request_events_col_status')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'all'}
            className={[
              styles.statusFilterButton,
              statusFilter === 'all' ? styles.statusFilterButtonActive : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setStatusFilter('all')}
          >
            <IconFilterAll size={12} aria-hidden="true" />
            {t('usage_stats.request_events_filter_all', {
              defaultValue: 'All',
            })}
            <span className={styles.statusFilterCount}>{stats.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'success'}
            className={[
              styles.statusFilterButton,
              styles.statusFilterSuccess,
              statusFilter === 'success'
                ? styles.statusFilterButtonActive
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setStatusFilter('success')}
            disabled={stats.success === 0}
          >
            <IconCheck size={12} aria-hidden="true" />
            {t('stats.success')}
            <span className={styles.statusFilterCount}>{stats.success}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={statusFilter === 'failed'}
            className={[
              styles.statusFilterButton,
              styles.statusFilterFailed,
              statusFilter === 'failed'
                ? styles.statusFilterButtonActive
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setStatusFilter('failed')}
            disabled={stats.failed === 0}
          >
            <IconX size={12} aria-hidden="true" />
            {t('stats.failure')}
            <span className={styles.statusFilterCount}>{stats.failed}</span>
          </button>
        </div>

        <span className={styles.resultMeta}>
          {t('usage_stats.request_events_result_count', {
            defaultValue: '{{shown}} / {{total}} events',
            shown: filteredRows.length,
            total: stats.total,
          })}
        </span>
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
            <IconSearch size={22} />
          </span>
          <span className={styles.emptyStateTitle}>
            {t('usage_stats.request_events_no_result_title')}
          </span>
          <p className={styles.emptyStateDesc}>
            {t('usage_stats.request_events_no_result_desc')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput('');
              setStatusFilter('all');
            }}
          >
            {t('logs.clear_filters', { defaultValue: 'Clear filters' })}
          </Button>
        </div>
      ) : (
        <div>
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
                nowMs={nowMs}
                onCopyError={handleCopyError}
                errorEmptyLabel={t(
                  'usage_stats.request_events_error_empty'
                )}
                errorCopyHint={t(
                  'usage_stats.request_events_error_copy_hint'
                )}
                successLabel={t('stats.success')}
                failureLabel={t('stats.failure')}
                reasoningLabel={t(
                  'usage_stats.request_events_reasoning_label'
                )}
                authShortLabel={t('usage_stats.request_events_auth_short')}
                tokenLabels={tokenLabels}
                locale={i18n.language}
                relativeLabels={relativeLabels}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
