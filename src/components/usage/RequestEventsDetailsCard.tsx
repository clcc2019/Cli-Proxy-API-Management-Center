import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFilesApi } from '@/services/api/authFiles';
import { getTypeColor, normalizeProviderKey } from '@/features/authFiles/constants';
import { useNotificationStore, useThemeStore } from '@/stores';
import type { GeminiKeyConfig, ProviderKeyConfig, OpenAIProviderConfig } from '@/types';
import type { AuthFileItem } from '@/types/authFile';
import type { CredentialInfo } from '@/types/sourceInfo';
import { maskApiKey } from '@/utils/format';
import { parseTimestampMs } from '@/utils/timestamp';
import { buildSourceInfoMap, resolveSourceDisplay } from '@/utils/sourceResolver';
import {
  calculateCost,
  collectUsageDetails,
  extractLatencyMs,
  extractTotalTokens,
  formatUsd,
  formatDurationMs,
  LATENCY_SOURCE_FIELD,
  type ModelPrice,
  normalizeAuthIndex,
} from '@/utils/usage';
import { copyToClipboard } from '@/utils/clipboard';
import styles from '@/pages/UsagePage.module.scss';

const REQUEST_EVENTS_RETAIN_LIMIT = 100;

type RequestEventRow = {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  model: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
  apiKey: string;
  apiKeyMasked: string;
  failed: boolean;
  errorMessage: string;
  modelReasoningEffort: string;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  totalCost: number;
};

export interface RequestEventsDetailsCardProps {
  usage: unknown;
  loading: boolean;
  modelPrices: Record<string, ModelPrice>;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const getLatencyTone = (latencyMs: number): 'normal' | 'slow' | 'verySlow' => {
  if (latencyMs <= 30_000) return 'normal';
  if (latencyMs <= 60_000) return 'slow';
  return 'verySlow';
};

const LATENCY_TONE_CLASS: Record<'normal' | 'slow' | 'verySlow', string> = {
  normal: styles.latencyCapsuleNormal,
  slow: styles.latencyCapsuleSlow,
  verySlow: styles.latencyCapsuleVerySlow,
};

const SKELETON_ROW_COUNT = 5;

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
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
}: RequestEventsDetailsCardProps) {
  const { t, i18n } = useTranslation();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res) ? res : (res as { files?: AuthFileItem[] })?.files;
        if (!Array.isArray(files)) return;
        const map = new Map<string, CredentialInfo>();
        files.forEach((file) => {
          const key = normalizeAuthIndex(file['auth_index'] ?? file.authIndex);
          if (!key) return;
          map.set(key, {
            name: file.name || key,
            type: (file.type || file.provider || '').toString(),
          });
        });
        setAuthFileMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const sourceInfoMap = useMemo(
    () =>
      buildSourceInfoMap({
        geminiApiKeys: geminiKeys,
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
        vertexApiKeys: vertexConfigs,
        openaiCompatibility: openaiProviders,
      }),
    [claudeConfigs, codexConfigs, geminiKeys, openaiProviders, vertexConfigs]
  );

  const rows = useMemo<RequestEventRow[]>(() => {
    const details = collectUsageDetails(usage)
      .slice()
      .sort((a, b) => {
        const leftTimestampMs =
          typeof a.__timestampMs === 'number' && a.__timestampMs > 0
            ? a.__timestampMs
            : parseTimestampMs(a.timestamp);
        const rightTimestampMs =
          typeof b.__timestampMs === 'number' && b.__timestampMs > 0
            ? b.__timestampMs
            : parseTimestampMs(b.timestamp);
        return (
          (Number.isNaN(rightTimestampMs) ? 0 : rightTimestampMs) -
          (Number.isNaN(leftTimestampMs) ? 0 : leftTimestampMs)
        );
      })
      .slice(0, REQUEST_EVENTS_RETAIN_LIMIT);

    return details.map((detail, index) => {
      const timestamp = detail.timestamp;
      const timestampMs =
        typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
          ? detail.__timestampMs
          : parseTimestampMs(timestamp);
      const date = Number.isNaN(timestampMs) ? null : new Date(timestampMs);
      const sourceRaw = String(detail.source ?? '').trim();
      const authIndexRaw = detail.auth_index as unknown;
      const authIndex =
        authIndexRaw === null || authIndexRaw === undefined || authIndexRaw === ''
          ? '-'
          : String(authIndexRaw);
      const apiKey = String(detail.api_key ?? '').trim();
      const sourceInfo = resolveSourceDisplay(sourceRaw, authIndexRaw, sourceInfoMap, authFileMap);
      const source = sourceInfo.displayName;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const modelReasoningEffort =
        typeof detail.model_reasoning_effort === 'string' && detail.model_reasoning_effort.trim()
          ? detail.model_reasoning_effort.trim()
          : '-';
      const inputTokens = Math.max(toNumber(detail.tokens?.input_tokens), 0);
      const outputTokens = Math.max(toNumber(detail.tokens?.output_tokens), 0);
      const reasoningTokens = Math.max(toNumber(detail.tokens?.reasoning_tokens), 0);
      const cachedTokens = Math.max(
        Math.max(toNumber(detail.tokens?.cached_tokens), 0),
        Math.max(toNumber(detail.tokens?.cache_tokens), 0)
      );
      const totalTokens = Math.max(
        toNumber(detail.tokens?.total_tokens),
        extractTotalTokens(detail)
      );
      const latencyMs = extractLatencyMs(detail);
      const totalCost = calculateCost(detail, modelPrices);
      const errorMessage =
        detail.failed === true && typeof detail.error_message === 'string'
          ? detail.error_message.trim()
          : '';

      return {
        id: `${timestamp}-${model}-${sourceRaw || source}-${authIndex}-${index}`,
        timestamp,
        timestampMs: Number.isNaN(timestampMs) ? 0 : timestampMs,
        timestampLabel: date ? date.toLocaleString(i18n.language) : timestamp || '-',
        model,
        sourceRaw: sourceRaw || '-',
        source,
        sourceType,
        authIndex,
        apiKey,
        apiKeyMasked: apiKey ? maskApiKey(apiKey) : '-',
        failed: detail.failed === true,
        errorMessage,
        modelReasoningEffort,
        latencyMs,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens,
        totalCost,
      };
    });
  }, [authFileMap, i18n.language, modelPrices, sourceInfoMap, usage]);

  const hasLatencyData = useMemo(() => rows.some((row) => row.latencyMs !== null), [rows]);

  const handleCopyError = useCallback(
    async (errorMessage: string) => {
      const text = errorMessage.trim();
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

  return (
    <Card title={t('usage_stats.request_events_title')}>
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
            <span>{t('usage_stats.request_events_count', { count: rows.length })}</span>
            {hasLatencyData && <span className={styles.requestEventsLimitHint}>{latencyHint}</span>}
          </div>

          <div className={styles.requestEventsTableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('usage_stats.request_events_col_time')}</th>
                  <th>{t('usage_stats.request_events_col_model')}</th>
                  <th>{t('usage_stats.request_events_col_credential')}</th>
                  <th title={hasLatencyData ? latencyHint : undefined}>
                    {t('usage_stats.request_events_col_status')}
                  </th>
                  <th>{t('usage_stats.request_events_col_tokens')}</th>
                  <th>{t('usage_stats.request_events_col_cost')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tokenParts: string[] = [];
                  if (row.inputTokens > 0) {
                    tokenParts.push(
                      `${t('usage_stats.request_events_token_in')} ${row.inputTokens.toLocaleString()}`
                    );
                  }
                  if (row.outputTokens > 0) {
                    tokenParts.push(
                      `${t('usage_stats.request_events_token_out')} ${row.outputTokens.toLocaleString()}`
                    );
                  }
                  if (row.reasoningTokens > 0) {
                    tokenParts.push(
                      `${t('usage_stats.request_events_token_reasoning')} ${row.reasoningTokens.toLocaleString()}`
                    );
                  }
                  if (row.cachedTokens > 0) {
                    tokenParts.push(
                      `${t('usage_stats.request_events_token_cached')} ${row.cachedTokens.toLocaleString()}`
                    );
                  }

                  const hasReasoning =
                    row.modelReasoningEffort && row.modelReasoningEffort !== '-';
                  const hasAuthIndex = row.authIndex && row.authIndex !== '-';
                  const hasApiKey = row.apiKeyMasked && row.apiKeyMasked !== '-';

                  return (
                    <tr
                      key={row.id}
                      className={row.failed ? styles.requestEventsRowFailed : undefined}
                    >
                      <td className={styles.requestEventsTimestamp} title={row.timestamp}>
                        <div className={styles.cellPrimary}>{row.timestampLabel}</div>
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
                      <td className={styles.requestEventsCredentialCell} title={row.source}>
                        <div className={styles.cellPrimary}>
                          <span className={styles.credentialName}>{row.source}</span>
                          {row.sourceType &&
                            (() => {
                              const typeColor = getTypeColor(
                                normalizeProviderKey(row.sourceType),
                                resolvedTheme
                              );
                              return (
                                <span
                                  className={styles.credentialType}
                                  style={{
                                    background: typeColor.bg,
                                    color: typeColor.text,
                                    borderColor: typeColor.bg,
                                  }}
                                >
                                  {row.sourceType}
                                </span>
                              );
                            })()}
                        </div>
                        {(hasAuthIndex || hasApiKey) && (
                          <div className={styles.cellSecondary}>
                            {hasAuthIndex && (
                              <span title={row.authIndex}>
                                {t('usage_stats.request_events_auth_short')} #{row.authIndex}
                              </span>
                            )}
                            {hasAuthIndex && hasApiKey && <span aria-hidden="true"> · </span>}
                            {hasApiKey && (
                              <span className={styles.credentialKey} title={row.apiKeyMasked}>
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
                              <span className={styles.latencyDot} aria-hidden="true" />
                              {formatDurationMs(row.latencyMs)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.requestEventsTokenCell}>
                        <div className={styles.cellPrimary}>
                          {row.totalTokens.toLocaleString()}
                        </div>
                        {tokenParts.length > 0 && (
                          <div className={styles.cellSecondary}>{tokenParts.join(' · ')}</div>
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
        </>
      )}
    </Card>
  );
});

RequestEventsDetailsCard.displayName = 'RequestEventsDetailsCard';
