import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api/authFiles';
import type {
  GeminiKeyConfig,
  ProviderKeyConfig,
  OpenAIProviderConfig,
} from '@/types';
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
  normalizeAuthIndex,
} from '@/utils/usage';

/** Maximum number of recent request events to retain & render. */
export const REQUEST_EVENT_ROWS_LIMIT = 30;

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
  totalTokens: number;
  totalCost: number;
}

export interface UseRequestEventRowsOptions {
  usage: unknown;
  modelPrices: Record<string, ModelPrice>;
  geminiKeys: GeminiKeyConfig[];
  claudeConfigs: ProviderKeyConfig[];
  codexConfigs: ProviderKeyConfig[];
  vertexConfigs: ProviderKeyConfig[];
  openaiProviders: OpenAIProviderConfig[];
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

/**
 * Build normalized request event rows from a raw usage payload.
 * Resolves credential display names against config + auth-files API.
 */
export function useRequestEventRows({
  usage,
  modelPrices,
  geminiKeys,
  claudeConfigs,
  codexConfigs,
  vertexConfigs,
  openaiProviders,
}: UseRequestEventRowsOptions): UseRequestEventRowsReturn {
  const { i18n } = useTranslation();
  const [authFileMap, setAuthFileMap] = useState<Map<string, CredentialInfo>>(
    new Map()
  );

  useEffect(() => {
    let cancelled = false;
    authFilesApi
      .list()
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
        const left =
          typeof a.__timestampMs === 'number' && a.__timestampMs > 0
            ? a.__timestampMs
            : parseTimestampMs(a.timestamp);
        const right =
          typeof b.__timestampMs === 'number' && b.__timestampMs > 0
            ? b.__timestampMs
            : parseTimestampMs(b.timestamp);
        return (
          (Number.isNaN(right) ? 0 : right) - (Number.isNaN(left) ? 0 : left)
        );
      })
      .slice(0, REQUEST_EVENT_ROWS_LIMIT);

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
