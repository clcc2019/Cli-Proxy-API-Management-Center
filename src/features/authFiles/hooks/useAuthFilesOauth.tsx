import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { OAuthModelAliasEntry, OAuthReasoningEffort } from '@/types';

type UnsupportedError = 'unsupported' | null;

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
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left?.[key] === right?.[key])
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
  loadExcluded: () => Promise<void>;
  loadModelAlias: () => Promise<void>;
};

/**
 * OAuth model rules are managed as a single provider-level workflow. The list only
 * needs lightweight summaries; model definitions are fetched on demand in the editor.
 */
export function useAuthFilesOauth(): UseAuthFilesOauthResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedError, setExcludedError] = useState<UnsupportedError>(null);
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [modelAliasError, setModelAliasError] = useState<UnsupportedError>(null);
  const excludedUnsupportedRef = useRef(false);
  const aliasesUnsupportedRef = useRef(false);
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

  const loadExcluded = useCallback(async () => {
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
  }, [showNotification, t]);

  const loadModelAlias = useCallback(async () => {
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
  }, [showNotification, t]);

  return {
    excluded,
    excludedError,
    modelAlias,
    modelAliasError,
    loadExcluded,
    loadModelAlias,
  };
}
