import { lazy, memo, Suspense } from 'react';
import { useQuotaStore } from '@/stores';
import type { AuthFileItem } from '@/types';

export type AuthFileReauthorizationProps = {
  file: AuthFileItem;
  disableControls: boolean;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
};

const AuthFileReauthorizationFlow = lazy(() => import('./AuthFileReauthorizationFlow'));

const AUTH_FAILURE_PATTERN =
  /(?:\b40[13]\b|unauthori[sz]ed|invalid[_\s-]?(?:grant|token|credential)|(?:token|credential|authentication|oauth).{0,32}(?:expired|invalid|revoked|missing|failed|failure)|(?:expired|invalid|revoked|failed|failure).{0,32}(?:token|credential|authentication|oauth)|authentication\s+(?:is\s+)?required|login\s+required|re-?auth(?:entication)?\s+required)/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const containsAuthFailure = (value: unknown, depth = 0): boolean => {
  if (typeof value === 'number') return value === 401 || value === 403;
  if (typeof value === 'string') return AUTH_FAILURE_PATTERN.test(value);
  if (!isRecord(value) || depth >= 3) return false;

  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (
      ['status', 'status_code', 'statuscode', 'http_status', 'httpstatus', 'code'].includes(
        normalizedKey
      ) &&
      (nested === 401 || nested === 403 || nested === '401' || nested === '403')
    ) {
      return true;
    }
    return containsAuthFailure(nested, depth + 1);
  });
};

const isCodexAuthFile = (file: AuthFileItem): boolean =>
  [file.type, file.provider, file.source]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.trim().toLowerCase() === 'codex');

const shouldOfferAuthFileReauthorization = (
  file: AuthFileItem,
  quotaErrorStatus?: number,
  quotaError?: string
): boolean => {
  if (!isCodexAuthFile(file)) return false;
  if (quotaErrorStatus === 401 || quotaErrorStatus === 403) return true;

  return [
    file.status,
    file.status_message,
    file.statusMessage,
    file.last_error,
    file.lastError,
    file.cliproxy_runtime_state,
    file.runtime_state,
    file.runtimeState,
    quotaError,
  ].some((value) => containsAuthFailure(value));
};

export const AuthFileReauthorization = memo(function AuthFileReauthorization(
  props: AuthFileReauthorizationProps
) {
  const quotaState = useQuotaStore((state) => state.codexQuota[props.file.name]);

  if (!shouldOfferAuthFileReauthorization(props.file, quotaState?.errorStatus, quotaState?.error)) {
    return null;
  }
  return (
    <Suspense fallback={null}>
      <AuthFileReauthorizationFlow {...props} />
    </Suspense>
  );
});
