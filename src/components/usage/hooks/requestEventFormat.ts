import type { CSSProperties } from 'react';
import type { TFunction } from 'i18next';
import { getTypeColor, normalizeProviderKey } from '@/features/authFiles/constants';
import { copyToClipboard } from '@/utils/clipboard';
import type { RequestEventTokenKind, RequestEventTokenPart } from './useRequestEventRows';

export type RequestEventTokenLabels = Record<RequestEventTokenKind, string>;
type RequestEventTheme = 'light' | 'dark';

type RequestEventCopyNotification = (message: string, type: 'success' | 'error') => void;

interface CopyRequestEventErrorOptions {
  errorMessage: string;
  fallback?: string;
  t: TFunction;
  showNotification: RequestEventCopyNotification;
}

export const buildRequestEventTokenLabels = (t: TFunction): RequestEventTokenLabels => ({
  in: t('usage_stats.request_events_token_in'),
  out: t('usage_stats.request_events_token_out'),
  reasoning: t('usage_stats.request_events_token_reasoning'),
  cached: t('usage_stats.request_events_token_cached'),
});

export const hasRequestEventValue = (value: string): boolean => Boolean(value && value !== '-');

export const getRequestEventCredentialTypeStyle = (
  sourceType: string,
  resolvedTheme: RequestEventTheme
): CSSProperties | undefined => {
  if (!sourceType) return undefined;

  const typeColor = getTypeColor(normalizeProviderKey(sourceType), resolvedTheme);
  if (!typeColor) return undefined;

  return {
    background: typeColor.bg,
    color: typeColor.text,
    borderColor: typeColor.bg,
  };
};

export const formatRequestEventTokenBreakdown = (
  tokenParts: RequestEventTokenPart[],
  tokenLabels: RequestEventTokenLabels
): string =>
  tokenParts
    .map((part) => `${tokenLabels[part.kind]} ${part.value.toLocaleString()}`)
    .join(' · ');

export const copyRequestEventErrorMessage = async ({
  errorMessage,
  fallback = '',
  t,
  showNotification,
}: CopyRequestEventErrorOptions): Promise<void> => {
  const text = (errorMessage || fallback).trim();
  if (!text) return;

  const ok = await copyToClipboard(text);
  showNotification(
    ok
      ? t('usage_stats.request_events_error_copy_success')
      : t('usage_stats.request_events_error_copy_failed'),
    ok ? 'success' : 'error'
  );
};
