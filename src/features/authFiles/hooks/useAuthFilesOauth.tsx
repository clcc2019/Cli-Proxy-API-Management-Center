import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { OAuthModelAliasEntry, OAuthReasoningEffort } from '@/types';

type UnsupportedError = 'unsupported' | null;
const OAUTH_RULES_STALE_TIME_MS = 5 * 60 * 1000;

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

const areRecordKeysEqual = <T,>(left: Record<string, T>, right: Record<string, T>): boolean => {
  if (left === right) return true;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => key in right);
};

const areExcludedRecordsEqual = (
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean => {
  if (!areRecordKeysEqual(left, right)) return false;
  return Object.keys(left).every((key) => areStringArraysEqual(left[key] ?? [], right[key] ?? []));
};

const areReasoningEffortsEqual = (
  left?: OAuthReasoningEffort,
  right?: OAuthReasoningEffort
): boolean => {
  if (left === right) return true;
  const leftKeys = Object.keys(left ?? {});
  const rightKeys = Object.keys(right ?? {});
  return (
    leftKeys.length === rightKeys.length && leftKeys.every((key) => left?.[key] === right?.[key])
  );
};

const areModelAliasEntriesEqual = (
  left: OAuthModelAliasEntry[],
  right: OAuthModelAliasEntry[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      entry.name === other?.name &&
      entry.alias === other.alias &&
      entry.fork === other.fork &&
      areReasoningEffortsEqual(entry.reasoningEffort, other.reasoningEffort)
    );
  });
};

const areModelAliasRecordsEqual = (
  left: Record<string, OAuthModelAliasEntry[]>,
  right: Record<string, OAuthModelAliasEntry[]>
): boolean => {
  if (!areRecordKeysEqual(left, right)) return false;
  return Object.keys(left).every((key) =>
    areModelAliasEntriesEqual(left[key] ?? [], right[key] ?? [])
  );
};

export type UseAuthFilesOauthResult = {
  excluded: Record<string, string[]>;
  excludedError: UnsupportedError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  modelAliasError: UnsupportedError;
  loadExcluded: (force?: boolean) => Promise<void>;
  loadModelAlias: (force?: boolean) => Promise<void>;
};

/**
 * OAuth model rules are managed as a single provider-level workflow. The list only
 * needs lightweight summaries; model definitions are fetched on demand in the editor.
 */
export function useAuthFilesOauth(scopeKey = ''): UseAuthFilesOauthResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<UnsupportedError>(null);
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [modelAliasError, setModelAliasError] = useState<UnsupportedError>(null);
  const excludedUnsupportedRef = useRef(false);
  const excludedUnsupportedScopeRef = useRef('');
  const excludedLoadedScopeRef = useRef('');
  const excludedLoadedAtRef = useRef(0);
  const aliasesUnsupportedRef = useRef(false);
  const aliasesUnsupportedScopeRef = useRef('');
  const aliasesLoadedScopeRef = useRef('');
  const aliasesLoadedAtRef = useRef(0);
  const mountedRef = useRef(true);
  const excludedLoadSequenceRef = useRef(0);
  const aliasesLoadSequenceRef = useRef(0);
  const excludedInFlightRef = useRef<Promise<void> | null>(null);
  const aliasesInFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      excludedLoadSequenceRef.current += 1;
      aliasesLoadSequenceRef.current += 1;
    };
  }, []);

  const loadExcluded = useCallback(async (force = false) => {
    if (
      !force &&
      excludedLoadedScopeRef.current === scopeKey &&
      Date.now() - excludedLoadedAtRef.current < OAUTH_RULES_STALE_TIME_MS
    ) {
      return;
    }
    if (
      !force &&
      excludedUnsupportedRef.current &&
      excludedUnsupportedScopeRef.current === scopeKey
    ) {
      return;
    }
    if (force || excludedUnsupportedRef.current) {
      excludedUnsupportedRef.current = false;
      excludedUnsupportedScopeRef.current = '';
    }
    if (excludedInFlightRef.current) {
      await excludedInFlightRef.current;
      return;
    }

    const requestSequence = excludedLoadSequenceRef.current + 1;
    excludedLoadSequenceRef.current = requestSequence;
    const request = (async () => {
      try {
        const response = await authFilesApi.getOauthExcludedModels();
        if (!mountedRef.current || excludedLoadSequenceRef.current !== requestSequence) return;
        excludedUnsupportedRef.current = false;
        excludedUnsupportedScopeRef.current = '';
        excludedLoadedScopeRef.current = scopeKey;
        excludedLoadedAtRef.current = Date.now();
        const nextExcluded = response ?? {};
        setExcluded((previous) =>
          areExcludedRecordsEqual(previous, nextExcluded) ? previous : nextExcluded
        );
        setExcludedError(null);
      } catch (error: unknown) {
        if (!mountedRef.current || excludedLoadSequenceRef.current !== requestSequence) return;
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : undefined;
        if (status !== 404) return;

        setExcluded((previous) => (Object.keys(previous).length === 0 ? previous : {}));
        setExcludedError('unsupported');
        excludedUnsupportedScopeRef.current = scopeKey;
        excludedLoadedScopeRef.current = '';
        excludedLoadedAtRef.current = 0;
        if (!excludedUnsupportedRef.current) {
          excludedUnsupportedRef.current = true;
          showNotification(t('oauth_excluded.upgrade_required'), 'warning');
        }
      }
    })();

    excludedInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (excludedInFlightRef.current === request) excludedInFlightRef.current = null;
    }
  }, [scopeKey, showNotification, t]);

  const loadModelAlias = useCallback(async (force = false) => {
    if (
      !force &&
      aliasesLoadedScopeRef.current === scopeKey &&
      Date.now() - aliasesLoadedAtRef.current < OAUTH_RULES_STALE_TIME_MS
    ) {
      return;
    }
    if (!force && aliasesUnsupportedRef.current && aliasesUnsupportedScopeRef.current === scopeKey) {
      return;
    }
    if (force || aliasesUnsupportedRef.current) {
      aliasesUnsupportedRef.current = false;
      aliasesUnsupportedScopeRef.current = '';
    }
    if (aliasesInFlightRef.current) {
      await aliasesInFlightRef.current;
      return;
    }

    const requestSequence = aliasesLoadSequenceRef.current + 1;
    aliasesLoadSequenceRef.current = requestSequence;
    const request = (async () => {
      try {
        const response = await authFilesApi.getOauthModelAlias();
        if (!mountedRef.current || aliasesLoadSequenceRef.current !== requestSequence) return;
        aliasesUnsupportedRef.current = false;
        aliasesUnsupportedScopeRef.current = '';
        aliasesLoadedScopeRef.current = scopeKey;
        aliasesLoadedAtRef.current = Date.now();
        const nextModelAlias = response ?? {};
        setModelAlias((previous) =>
          areModelAliasRecordsEqual(previous, nextModelAlias) ? previous : nextModelAlias
        );
        setModelAliasError(null);
      } catch (error: unknown) {
        if (!mountedRef.current || aliasesLoadSequenceRef.current !== requestSequence) return;
        const status =
          typeof error === 'object' && error !== null && 'status' in error
            ? (error as { status?: unknown }).status
            : undefined;
        if (status !== 404) return;

        setModelAlias((previous) => (Object.keys(previous).length === 0 ? previous : {}));
        setModelAliasError('unsupported');
        aliasesUnsupportedScopeRef.current = scopeKey;
        aliasesLoadedScopeRef.current = '';
        aliasesLoadedAtRef.current = 0;
        if (!aliasesUnsupportedRef.current) {
          aliasesUnsupportedRef.current = true;
          showNotification(t('oauth_model_alias.upgrade_required'), 'warning');
        }
      }
    })();

    aliasesInFlightRef.current = request;
    try {
      await request;
    } finally {
      if (aliasesInFlightRef.current === request) aliasesInFlightRef.current = null;
    }
  }, [scopeKey, showNotification, t]);

  return {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    loadExcluded,
    loadModelAlias,
  };
}
