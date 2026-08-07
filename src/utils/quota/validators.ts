/**
 * Validation and type checking functions for quota management.
 */

import type { AuthFileItem } from '@/types';
import { QUOTA_PROVIDER_TYPES, type QuotaProviderType } from './constants';

function resolveAuthProvider(file: AuthFileItem): string {
  const raw = file.provider ?? file.type ?? '';
  return String(raw).trim().toLowerCase();
}

export function isQuotaProviderType(value: string): value is QuotaProviderType {
  return QUOTA_PROVIDER_TYPES.has(value as QuotaProviderType);
}

export function resolveQuotaProviderType(file: AuthFileItem): QuotaProviderType | null {
  const provider = resolveAuthProvider(file);
  return isQuotaProviderType(provider) ? provider : null;
}

export function isRuntimeOnlyAuthFile(file: AuthFileItem): boolean {
  const raw = file['runtime_only'] ?? file.runtimeOnly;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true';
  return false;
}
