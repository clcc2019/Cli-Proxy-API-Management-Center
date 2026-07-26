import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { useNotificationStore, useThemeStore } from '@/stores';
import type { ProviderKeyConfig } from '@/types';
import {
  formatDurationMs,
  formatUsd,
  getLatencyTone,
  LATENCY_SOURCE_FIELD,
  type LatencyTone,
  type ModelPrice,
} from '@/utils/usage';
import {
  useRequestEventRows,
  REQUEST_EVENT_ROWS_LIMIT,
} from './hooks/useRequestEventRows';
import {
  buildRequestEventTokenLabels,
  copyRequestEventErrorMessage,
  formatRequestEventTokenBreakdown,
  getRequestEventCredentialTypeStyle,
  hasRequestEventValue,
} from './hooks/requestEventFormat';
import styles from '@/pages/UsagePage.module.scss';

const SKELETON_ROW_COUNT = 5;

const LATENCY_TONE_CLASS: Record<LatencyTone, string> = {
  normal: styles.latencyCapsuleNormal,
  slow: styles.latencyCapsuleSlow,
  verySlow: styles.latencyCapsuleVerySlow,
};

export interface RequestEventsDetailsCardProps {
  usage: unknown;
  loading: boolean;
  modelPrices: Record<string, ModelPrice>;
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
}

function RequestEventsSkeleton() {
  return (
    <div
      className={styles.requestEventsSkeleton}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }).map((_, idx) => (
        <div key={idx} className={styles.requestEventsSkeletonRow}>
          <div>
            <div className={styles.requestEventsSkeletonBlock} />
            <div
              className={`${styles.requestEventsSkeletonBlock} ${styles.requestEventsSkeletonBlockTiny}`}
            />
          </div>
          <div>
            <div
              className={`${styles.requestEventsSkeletonBlock} ${styles.requestEventsSkeletonBlockShort}`}
            />
          </div>
          <div>
            <div className={styles.requestEventsSkeletonBlock} />
            <div
              className={`${styles.requestEventsSkeletonBlock} ${styles.requestEventsSkeletonBlockTiny}`}
            />
          </div>
          <div>
            <div
              className={`${styles.requestEventsSkeletonBlock} ${styles.requestEventsSkeletonBlockShort}`}
            />
          </div>
          <div>
            <div className={styles.requestEventsSkeletonBlock} />
          </div>
          <div>
            <div
              className={`${styles.requestEventsSkeletonBlock} ${styles.requestEventsSkeletonBlockShort}`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const RequestEventsDetailsCard = memo(function RequestEventsDetailsCard({
  usage,
  loading,
  modelPrices,
  claudeConfigs,
  codexConfigs,
}: RequestEventsDetailsCardProps) {
  const { t } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore(
    (state) => state.showNotification
  );

  const { rows, hasLatencyData } = useRequestEventRows({
    usage,
    modelPrices,
    claudeConfigs,
    codexConfigs,
  });

  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });
  const tokenLabels = useMemo(
    () => buildRequestEventTokenLabels(t),
    [t]
  );

  const handleCopyError = useCallback(
    async (errorMessage: string) => {
      await copyRequestEventErrorMessage({ errorMessage, t, showNotification });
    },
    [showNotification, t]
  );

  return (
    <Card flush>
      {loading && rows.length === 0 ? (
        <RequestEventsSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('usage_stats.request_events_empty_title')}
          description={t('usage_stats.request_events_empty_desc')}
        />
      ) : (
        <>
          <div className={styles.requestEventsMeta}>
            <span>
              {t('usage_stats.request_events_count', { count: rows.length })}
            </span>
            {hasLatencyData && (
              <span className={styles.requestEventsLimitHint}>
                {latencyHint}
              </span>
            )}
          </div>

          <div className={styles.requestEventsTableWrapper}>
            <table className={styles.table}>
              <caption className={styles.visuallyHidden}>
                {t('usage_stats.request_events_title')}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{t('usage_stats.request_events_col_time')}</th>
                  <th scope="col">{t('usage_stats.request_events_col_model')}</th>
                  <th scope="col">{t('usage_stats.request_events_col_credential')}</th>
                  <th scope="col" title={hasLatencyData ? latencyHint : undefined}>
                    {t('usage_stats.request_events_col_status')}
                  </th>
                  <th scope="col">{t('usage_stats.request_events_col_tokens')}</th>
                  <th scope="col">{t('usage_stats.request_events_col_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tokenBreakdown = formatRequestEventTokenBreakdown(
                    row.tokenParts,
                    tokenLabels
                  );
                  const hasReasoning = hasRequestEventValue(row.modelReasoningEffort);
                  const hasAuthIndex = hasRequestEventValue(row.authIndex);
                  const hasApiKey = hasRequestEventValue(row.apiKeyMasked);
                  const credentialTypeStyle = getRequestEventCredentialTypeStyle(
                    row.sourceType,
                    resolvedTheme as 'light' | 'dark'
                  );

                  return (
                    <tr
                      key={row.id}
                      className={
                        row.failed ? styles.requestEventsRowFailed : undefined
                      }
                    >
                      <td
                        className={styles.requestEventsTimestamp}
                        title={row.timestamp}
                      >
                        <div className={styles.cellPrimary}>
                          {row.timestampLabel}
                        </div>
                      </td>
                      <td className={styles.modelCell}>
                        <div className={styles.cellPrimary}>{row.model}</div>
                        {hasReasoning && (
                          <div className={styles.cellSecondary}>
                            <span className={styles.reasoningTag}>
                              {t('usage_stats.request_events_reasoning_label')}
                              {' · '}
                              {row.modelReasoningEffort}
                            </span>
                          </div>
                        )}
                      </td>
                      <td
                        className={styles.requestEventsCredentialCell}
                        title={row.source}
                      >
                        <div className={styles.cellPrimary}>
                          <span className={styles.credentialName}>
                            {row.source}
                          </span>
                          {row.sourceType && credentialTypeStyle && (
                            <span
                              className={styles.credentialType}
                              style={credentialTypeStyle}
                            >
                              {row.sourceType}
                            </span>
                          )}
                        </div>
                        {(hasAuthIndex || hasApiKey) && (
                          <div className={styles.cellSecondary}>
                            {hasAuthIndex && (
                              <span title={row.authIndex}>
                                {t('usage_stats.request_events_auth_short')}{' '}
                                #{row.authIndex}
                              </span>
                            )}
                            {hasAuthIndex && hasApiKey && (
                              <span aria-hidden="true"> · </span>
                            )}
                            {hasApiKey && (
                              <span
                                className={styles.credentialKey}
                                title={row.apiKeyMasked}
                              >
                                {row.apiKeyMasked}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className={styles.requestEventsStatusCell}>
                        <div className={styles.cellPrimary}>
                          {row.failed ? (
                            <button
                              type="button"
                              className={`${styles.requestEventsResultFailed} ${styles.requestEventsResultButton}`}
                              title={
                                row.errorMessage
                                  ? `${t('usage_stats.request_events_error_copy_hint')}\n${row.errorMessage}`
                                  : t('usage_stats.request_events_error_empty')
                              }
                              onClick={() =>
                                void handleCopyError(
                                  row.errorMessage ||
                                    t('usage_stats.request_events_error_empty')
                                )
                              }
                              disabled={!row.errorMessage}
                            >
                              {t('stats.failure')}
                            </button>
                          ) : (
                            <span className={styles.requestEventsResultSuccess}>
                              {t('stats.success')}
                            </span>
                          )}
                          {hasLatencyData && row.latencyMs !== null && (
                            <span
                              className={`${styles.latencyCapsule} ${LATENCY_TONE_CLASS[getLatencyTone(row.latencyMs)]}`}
                              title={latencyHint}
                            >
                              <span
                                className={styles.latencyDot}
                                aria-hidden="true"
                              />
                              {formatDurationMs(row.latencyMs)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.requestEventsTokenCell}>
                        <div className={styles.cellPrimary}>
                          {row.totalTokens.toLocaleString()}
                        </div>
                        {tokenBreakdown && (
                          <div className={styles.cellSecondary}>
                            {tokenBreakdown}
                          </div>
                        )}
                      </td>
                      <td className={styles.requestEventsCostCell}>
                        {row.totalCost > 0 ? formatUsd(row.totalCost) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length >= REQUEST_EVENT_ROWS_LIMIT && (
            <div className={styles.requestEventsLimitHint}>
              {t('usage_stats.request_events_limit_hint', {
                shown: rows.length,
                total: rows.length,
              })}
            </div>
          )}
        </>
      )}
    </Card>
  );
});

RequestEventsDetailsCard.displayName = 'RequestEventsDetailsCard';
