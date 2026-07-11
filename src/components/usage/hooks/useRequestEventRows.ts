import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api/authFiles';
import type { ProviderKeyConfig } from '@/types';
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
  type ModelPrice,
  type UsageDetail,
  normalizeAuthIndex,
} from '@/utils/usage';

/** Maximum number of recent request events to retain & render. */
export const REQUEST_EVENT_ROWS_LIMIT = 30;

export type RequestEventTokenKind = 'in' | 'out' | 'reasoning' | 'cached';

export interface RequestEventTokenPart {
  kind: RequestEventTokenKind;
  value: number;
}

export interface RequestEventRow {
  id: string;
  timestamp: string;
  timestampMs: number;
  timestampLabel: string;
  timeOfDay: string;
  model: string;
  modelReasoningEffort: string;
  sourceRaw: string;
  source: string;
  sourceType: string;
  authIndex: string;
  apiKey: string;
  apiKeyMasked: string;
  failed: boolean;
  errorMessage: string;
  latencyMs: number | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  tokenParts: RequestEventTokenPart[];
  totalTokens: number;
  totalCost: number;
}

export interface UseRequestEventRowsOptions {
  usage: unknown;
  modelPrices: Record<string, ModelPrice>;
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
}

export interface UseRequestEventRowsReturn {
  rows: RequestEventRow[];
  hasLatencyData: boolean;
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
};

const buildRequestEventTokenParts = ({
  inputTokens,
  outputTokens,
  reasoningTokens,
  cachedTokens,
}: {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
}): RequestEventTokenPart[] => {
  const parts: RequestEventTokenPart[] = [];
  if (inputTokens > 0) parts.push({ kind: 'in', value: inputTokens });
  if (outputTokens > 0) parts.push({ kind: 'out', value: outputTokens });
  if (reasoningTokens > 0) parts.push({ kind: 'reasoning', value: reasoningTokens });
  if (cachedTokens > 0) parts.push({ kind: 'cached', value: cachedTokens });
  return parts;
};

const formatTimeOfDay = (date: Date | null, locale: string): string => {
  if (!date) return '';
  try {
    return date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return date.toLocaleTimeString();
  }
};

const getDetailTimestampMs = (detail: UsageDetail): number => {
  const timestampMs =
    typeof detail.__timestampMs === 'number' && detail.__timestampMs > 0
      ? detail.__timestampMs
      : parseTimestampMs(detail.timestamp);
  return Number.isNaN(timestampMs) ? 0 : timestampMs;
};

const selectRecentUsageDetails = (
  details: UsageDetail[],
  limit: number
): UsageDetail[] => {
  if (limit <= 0) return [];
  // The endpoint may already return a globally bounded recent set, but callers
  // still need a deterministic newest-first order for rendering.
  if (details.length <= limit) {
    return details
      .map((detail, order) => ({
        detail,
        timestampMs: getDetailTimestampMs(detail),
        order,
      }))
      .sort(
        (left, right) =>
          right.timestampMs - left.timestampMs || left.order - right.order
      )
      .map((entry) => entry.detail);
  }

  const selected: { detail: UsageDetail; timestampMs: number; order: number }[] = [];
  details.forEach((detail, order) => {
    const timestampMs = getDetailTimestampMs(detail);
    const insertIndex = selected.findIndex(
      (entry) =>
        timestampMs > entry.timestampMs ||
        (timestampMs === entry.timestampMs && order < entry.order)
    );

    if (insertIndex === -1) {
      if (selected.length < limit) {
        selected.push({ detail, timestampMs, order });
      }
      return;
    }

    selected.splice(insertIndex, 0, { detail, timestampMs, order });
    if (selected.length > limit) {
      selected.pop();
    }
  });

  return selected.map((entry) => entry.detail);
};

/**
 * Build normalized request event rows from a raw usage payload.
 * Resolves credential display names against config + auth-files API.
 */
export function useRequestEventRows({
  usage,
  modelPrices,
  claudeConfigs,
  codexConfigs,
}: UseRequestEventRowsOptions): UseRequestEventRowsReturn {
  const { i18n } = useTranslation();
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(
    new Map()
  );

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list({ codexSubscription: 'skip', summary: true })
      .then((res) => {
        if (cancelled) return;
        const files = Array.isArray(res)
          ? res
          : (res as { files?: AuthFileItem[] })?.files;
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
        claudeApiKeys: claudeConfigs,
        codexApiKeys: codexConfigs,
      }),
    [claudeConfigs, codexConfigs]
  );

  const rows = useMemo<RequestEventRow[]>(() => {
    const details = selectRecentUsageDetails(
      collectUsageDetails(usage),
      REQUEST_EVENT_ROWS_LIMIT
    );

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
      const sourceInfo = resolveSourceDisplay(
        sourceRaw,
        authIndexRaw,
        sourceInfoMap,
        authFileMap
      );
      const source = sourceInfo.displayName;
      const sourceType = sourceInfo.type;
      const model = String(detail.__modelName ?? '').trim() || '-';
      const modelReasoningEffort =
        typeof detail.model_reasoning_effort === 'string' &&
        detail.model_reasoning_effort.trim()
          ? detail.model_reasoning_effort.trim()
          : '-';
      const inputTokens = Math.max(toNumber(detail.tokens?.input_tokens), 0);
      const outputTokens = Math.max(toNumber(detail.tokens?.output_tokens), 0);
      const reasoningTokens = Math.max(
        toNumber(detail.tokens?.reasoning_tokens),
        0
      );
      const cachedTokens = Math.max(
        Math.max(toNumber(detail.tokens?.cached_tokens), 0),
        Math.max(toNumber(detail.tokens?.cache_tokens), 0)
      );
      const totalTokens = Math.max(
        toNumber(detail.tokens?.total_tokens),
        extractTotalTokens(detail)
      );
      const tokenParts = buildRequestEventTokenParts({
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });
      const latencyMs = extractLatencyMs(detail);
      const totalCost = calculateCost(detail, modelPrices);
      const errorMessage =
        detail.failed === true && typeof detail.error_message === 'string'
          ? detail.error_message.trim()
          : '';
      const safeTimestampMs = Number.isNaN(timestampMs) ? 0 : timestampMs;

      return {
        id: `${timestamp}-${model}-${sourceRaw || source}-${authIndex}-${index}`,
        timestamp,
        timestampMs: safeTimestampMs,
        timestampLabel: date
          ? date.toLocaleString(i18n.language)
          : timestamp || '-',
        timeOfDay: formatTimeOfDay(date, i18n.language),
        model,
        modelReasoningEffort,
        sourceRaw: sourceRaw || '-',
        source,
        sourceType,
        authIndex,
        apiKey,
        apiKeyMasked: apiKey ? maskApiKey(apiKey) : '-',
        failed: detail.failed === true,
        errorMessage,
        latencyMs,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        tokenParts,
        totalTokens,
        totalCost,
      };
    });
  }, [authFileMap, i18n.language, modelPrices, sourceInfoMap, usage]);

  const hasLatencyData = useMemo(
    () => rows.some((row) => row.latencyMs !== null),
    [rows]
  );

  return { rows, hasLatencyData };
}
