import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { authFilesApi } from '@/services/api/authFiles';
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
import { downloadBlob } from '@/utils/download';
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
  modelReasoningEffort: string;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  totalTokens: number;
  totalCost: number;
};

type CredentialTooltipState = {
  content: string;
  left: number;
  top: number;
  placement: 'above' | 'below';
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

const encodeCsv = (value: string | number): string => {
  const text = String(value ?? '');
  const trimmedLeft = text.replace(/^\s+/, '');
  const safeText = trimmedLeft && /^[=+\-@]/.test(trimmedLeft) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export function RequestEventsDetailsCard({
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
  const latencyHint = t('usage_stats.latency_unit_hint', {
    field: LATENCY_SOURCE_FIELD,
    unit: t('usage_stats.duration_unit_ms'),
  });

  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(new Map());
  const [credentialTooltip, setCredentialTooltip] = useState<CredentialTooltipState | null>(null);

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

  const sortedDetails = useMemo(
    () =>
      collectUsageDetails(usage)
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
        }),
    [usage]
  );

  const rows = useMemo<RequestEventRow[]>(() => {
    const details = sortedDetails.slice(0, REQUEST_EVENTS_RETAIN_LIMIT);

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
  }, [authFileMap, i18n.language, modelPrices, sortedDetails, sourceInfoMap]);

  const hasLimitedRows = sortedDetails.length > rows.length;

  const hasLatencyData = useMemo(() => rows.some((row) => row.latencyMs !== null), [rows]);

  const handleExportCsv = () => {
    if (!rows.length) return;

    const csvHeader = [
      'timestamp',
      'model',
      'source',
      'source_raw',
      'auth_index',
      'api_key',
      'result',
      'model_reasoning_effort',
      ...(hasLatencyData ? ['latency_ms'] : []),
      'input_tokens',
      'output_tokens',
      'reasoning_tokens',
      'cached_tokens',
      'total_tokens',
      'total_cost',
    ];

    const csvRows = rows.map((row) =>
      [
        row.timestamp,
        row.model,
        row.source,
        row.sourceRaw,
        row.authIndex,
        row.apiKey,
        row.failed ? 'failed' : 'success',
        row.modelReasoningEffort,
        ...(hasLatencyData ? [row.latencyMs ?? ''] : []),
        row.inputTokens,
        row.outputTokens,
        row.reasoningTokens,
        row.cachedTokens,
        row.totalTokens,
        row.totalCost,
      ]
        .map((value) => encodeCsv(value))
        .join(',')
    );

    const content = [csvHeader.join(','), ...csvRows].join('\n');
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.csv`,
      blob: new Blob([content], { type: 'text/csv;charset=utf-8' }),
    });
  };

  const handleExportJson = () => {
    if (!rows.length) return;

    const payload = rows.map((row) => ({
      timestamp: row.timestamp,
      model: row.model,
      source: row.source,
      source_raw: row.sourceRaw,
      auth_index: row.authIndex,
      api_key: row.apiKey,
      failed: row.failed,
      model_reasoning_effort: row.modelReasoningEffort === '-' ? '' : row.modelReasoningEffort,
      ...(hasLatencyData && row.latencyMs !== null ? { latency_ms: row.latencyMs } : {}),
      tokens: {
        input_tokens: row.inputTokens,
        output_tokens: row.outputTokens,
        reasoning_tokens: row.reasoningTokens,
        cached_tokens: row.cachedTokens,
        total_tokens: row.totalTokens,
      },
      total_cost: row.totalCost,
    }));

    const content = JSON.stringify(payload, null, 2);
    const fileTime = new Date().toISOString().replace(/[:.]/g, '-');
    downloadBlob({
      filename: `usage-events-${fileTime}.json`,
      blob: new Blob([content], { type: 'application/json;charset=utf-8' }),
    });
  };

  const getCredentialTitle = (row: RequestEventRow) =>
    [
      `${t('usage_stats.request_events_source')}: ${row.source}`,
      row.sourceRaw && row.sourceRaw !== '-' && row.sourceRaw !== row.source
        ? `${t('usage_stats.request_events_source')}(raw): ${row.sourceRaw}`
        : '',
      row.sourceType ? `类型: ${row.sourceType}` : '',
      `${t('usage_stats.request_events_auth_index')}: ${row.authIndex}`,
      `${t('usage_stats.request_events_api_key')}: ${row.apiKey || '-'}`,
    ]
      .filter(Boolean)
      .join('\n');

  const showCredentialTooltip = (event: MouseEvent<HTMLElement>, row: RequestEventRow) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = Math.min(560, Math.max(260, window.innerWidth - 32));
    const left = Math.min(
      Math.max(rect.left + rect.width / 2, 16 + tooltipWidth / 2),
      window.innerWidth - 16 - tooltipWidth / 2
    );
    const placement = rect.top > 132 ? 'above' : 'below';
    const top = placement === 'above' ? rect.top : rect.bottom;

    setCredentialTooltip({
      content: getCredentialTitle(row),
      left,
      top,
      placement,
    });
  };

  const tooltipNode = credentialTooltip ? (
    <div
      className={`${styles.requestEventsCredentialTooltip} ${
        credentialTooltip.placement === 'below' ? styles.requestEventsCredentialTooltipBelow : ''
      }`}
      style={{
        left: credentialTooltip.left,
        top: credentialTooltip.top,
      }}
    >
      {credentialTooltip.content}
    </div>
  ) : null;

  return (
    <>
      <Card
        title={t('usage_stats.request_events_title')}
        className={styles.requestEventsCard}
        density="compact"
        extra={
          <div className={styles.requestEventsActions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
            >
              {t('usage_stats.export_csv')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportJson}
              disabled={rows.length === 0}
            >
              {t('usage_stats.export_json')}
            </Button>
          </div>
        }
      >
        {loading && rows.length === 0 ? (
          <div className={styles.hint}>{t('common.loading')}</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={t('usage_stats.request_events_empty_title')}
            description={t('usage_stats.request_events_empty_desc')}
          />
        ) : (
          <>
            <div className={styles.requestEventsMeta}>
              <span>{t('usage_stats.request_events_count', { count: rows.length })}</span>
              <span className={styles.requestEventsMetaHints}>
                {hasLimitedRows && (
                  <span className={styles.requestEventsLimitHint}>
                    {t('usage_stats.request_events_limit_hint', {
                      shown: rows.length,
                      total: sortedDetails.length,
                    })}
                  </span>
                )}
                {hasLatencyData && (
                  <span className={styles.requestEventsLimitHint}>{latencyHint}</span>
                )}
              </span>
            </div>

            <div className={styles.requestEventsTableWrapper}>
              <table className={styles.table}>
                <colgroup>
                  <col className={styles.requestEventsTimeColumn} />
                  <col className={styles.requestEventsModelColumn} />
                  <col className={styles.requestEventsCredentialColumn} />
                  <col className={styles.requestEventsResultColumn} />
                  <col className={styles.requestEventsEffortColumn} />
                  {hasLatencyData && <col className={styles.requestEventsLatencyColumn} />}
                  <col className={styles.requestEventsTokensColumn} />
                  <col className={styles.requestEventsCostColumn} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t('usage_stats.request_events_timestamp')}</th>
                    <th>{t('usage_stats.model_name')}</th>
                    <th>{t('usage_stats.credential_name')}</th>
                    <th>{t('usage_stats.request_events_result')}</th>
                    <th>{t('usage_stats.request_events_reasoning_effort')}</th>
                    {hasLatencyData && <th title={latencyHint}>{t('usage_stats.time')}</th>}
                    <th>{t('usage_stats.total_tokens')}</th>
                    <th>{t('usage_stats.total_cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td title={row.timestamp} className={styles.requestEventsTimestamp}>
                        {row.timestampLabel}
                      </td>
                      <td className={`${styles.modelCell} ${styles.requestEventsModelCell}`}>
                        {row.model}
                      </td>
                      <td
                        className={styles.requestEventsCredentialCell}
                        title={getCredentialTitle(row)}
                        onMouseEnter={(event) => showCredentialTooltip(event, row)}
                        onMouseLeave={() => setCredentialTooltip(null)}
                      >
                        <span className={styles.requestEventsCredentialStack}>
                          <span className={styles.requestEventsCredentialName}>{row.source}</span>
                          <span className={styles.requestEventsCredentialMeta}>
                            {row.sourceType && (
                              <span className={styles.credentialType}>{row.sourceType}</span>
                            )}
                            <span
                              title={`${t('usage_stats.request_events_auth_index')}: ${row.authIndex}`}
                            >
                              #{row.authIndex}
                            </span>
                            <span
                              title={`${t('usage_stats.request_events_api_key')}: ${row.apiKey || '-'}`}
                            >
                              {row.apiKeyMasked}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            row.failed
                              ? styles.requestEventsResultFailed
                              : styles.requestEventsResultSuccess
                          }
                        >
                          {row.failed ? t('stats.failure') : t('stats.success')}
                        </span>
                      </td>
                      <td className={styles.requestEventsEffortCell}>{row.modelReasoningEffort}</td>
                      {hasLatencyData && (
                        <td className={styles.durationCell}>{formatDurationMs(row.latencyMs)}</td>
                      )}
                      <td className={styles.requestEventsTokensCell}>
                        <span className={styles.requestEventsTokensStack}>
                          <span className={styles.requestEventsTokenTotal}>
                            {row.totalTokens.toLocaleString()}
                          </span>
                          <span className={styles.requestEventsTokenBreakdown}>
                            <span title={t('usage_stats.input_tokens')}>
                              入 {row.inputTokens.toLocaleString()}
                            </span>
                            <span title={t('usage_stats.output_tokens')}>
                              出 {row.outputTokens.toLocaleString()}
                            </span>
                            <span title={t('usage_stats.reasoning_tokens')}>
                              思 {row.reasoningTokens.toLocaleString()}
                            </span>
                            <span title={t('usage_stats.cached_tokens')}>
                              缓 {row.cachedTokens.toLocaleString()}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className={styles.requestEventsCostCell}>
                        {row.totalCost > 0 ? formatUsd(row.totalCost) : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      {tooltipNode && createPortal(tooltipNode, document.body)}
    </>
  );
}
