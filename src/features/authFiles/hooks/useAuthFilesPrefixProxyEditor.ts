import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import {
  applyCodexAuthFileServiceTierPassthrough,
  applyCodexAuthFileWebsockets,
  normalizeExcludedModels,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
  readCodexAuthFileServiceTierPassthrough,
  readCodexAuthFileWebsockets,
} from '@/features/authFiles/constants';
import { stripAuthFileRuntimeMetadata } from '@/features/authFiles/runtimeMetadata';
import { resolveAuthFileClientProfileMetadata } from '@/features/authFiles/clientProfileMetadata';

type AuthFileHeaders = Record<string, string>;
type AuthFileHeadersErrorKey =
  | 'auth_files.headers_invalid_json'
  | 'auth_files.headers_invalid_object'
  | 'auth_files.headers_invalid_value';

const PROXY_URL_KEYS = ['proxy_url', 'proxy-url', 'proxyUrl'] as const;
const EXCLUDED_MODELS_KEYS = ['excluded_models', 'excluded-models', 'excludedModels'] as const;
const DISABLE_COOLING_KEYS = ['disable_cooling', 'disable-cooling', 'disableCooling'] as const;
const USER_AGENT_KEYS = ['user_agent', 'user-agent', 'userAgent'] as const;
const WEBSOCKETS_KEYS = ['websockets', 'websocket'] as const;
const SERVICE_TIER_PASSTHROUGH_KEYS = [
  'service_tier_passthrough',
  'service-tier-passthrough',
  'serviceTierPassthrough',
  'fast',
] as const;

export type PrefixProxyEditorField =
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'disableCooling'
  | 'userAgent'
  | 'websockets'
  | 'serviceTierPassthrough'
  | 'note'
  | 'headersText';

export type PrefixProxyEditorFieldValue = string | boolean;

export type PrefixProxyEditorState = {
  file: AuthFileItem;
  fileName: string;
  isCodexFile: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  originalText: string;
  rawText: string;
  json: Record<string, unknown> | null;
  clientProfile: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  disableCooling: string;
  userAgent: string;
  websockets: boolean;
  serviceTierPassthrough: boolean;
  note: string;
  noteTouched: boolean;
  headersText: string;
  headersTouched: boolean;
  headersError: string | null;
};

export type UseAuthFilesPrefixProxyEditorOptions = {
  disableControls: boolean;
  applyLocalFilePatch: (name: string, patch: Partial<AuthFileItem>) => void;
  refreshAuthFilesFromServer?: () => Promise<void>;
};

export type UseAuthFilesPrefixProxyEditorResult = {
  prefixProxyEditor: PrefixProxyEditorState | null;
  prefixProxyUpdatedText: string;
  prefixProxyDirty: boolean;
  openPrefixProxyEditor: (file: AuthFileItem) => Promise<void>;
  closePrefixProxyEditor: () => void;
  handlePrefixProxyChange: (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => void;
  handlePrefixProxySave: () => Promise<void>;
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOwnField = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const hasAnyOwnField = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  keys.some((key) => hasOwnField(value, key));

const hasNonCanonicalOwnField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  canonicalKey: string
): boolean => keys.some((key) => key !== canonicalKey && hasOwnField(value, key));

const deleteFields = (value: Record<string, unknown>, keys: readonly string[]): void => {
  keys.forEach((key) => {
    delete value[key];
  });
};

const readFirstDefinedField = (
  value: Record<string, unknown>,
  keys: readonly string[]
): unknown => {
  for (const key of keys) {
    if (hasOwnField(value, key)) {
      return value[key];
    }
  }
  return undefined;
};

const readStringField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  trim = false
): string => {
  const raw = readFirstDefinedField(value, keys);
  if (raw === undefined || raw === null) return '';
  const text = typeof raw === 'string' ? raw : String(raw);
  return trim ? text.trim() : text;
};

const readHeaderValue = (headersValue: unknown, headerName: string): string => {
  if (!isRecordObject(headersValue)) return '';
  const normalizedHeaderName = headerName.trim().toLowerCase();
  for (const [key, item] of Object.entries(headersValue)) {
    if (key.trim().toLowerCase() !== normalizedHeaderName || typeof item !== 'string') {
      continue;
    }
    const value = item.trim();
    if (value) return value;
  }
  return '';
};

const readProxyUrlFromJson = (value: Record<string, unknown>): string =>
  readStringField(value, PROXY_URL_KEYS);

const readPrefixFromJson = (value: Record<string, unknown>): string =>
  readStringField(value, ['prefix'], true);

const readNoteFromJson = (value: Record<string, unknown>): string =>
  readStringField(value, ['note']);

const readExcludedModelsFromJson = (value: Record<string, unknown>): string[] => {
  const raw = readFirstDefinedField(value, EXCLUDED_MODELS_KEYS);
  if (typeof raw === 'string') return parseExcludedModelsText(raw);
  return normalizeExcludedModels(raw);
};

const readDisableCoolingFromJson = (value: Record<string, unknown>): boolean | undefined =>
  parseDisableCoolingValue(readFirstDefinedField(value, DISABLE_COOLING_KEYS));

const readUserAgentFromJson = (value: Record<string, unknown>): string =>
  readStringField(value, USER_AGENT_KEYS, true) || readHeaderValue(value.headers, 'User-Agent');

const readWebsocketsFromJson = (value: Record<string, unknown>): boolean | undefined =>
  parseDisableCoolingValue(readFirstDefinedField(value, WEBSOCKETS_KEYS));

const readServiceTierPassthroughFromJson = (value: Record<string, unknown>): boolean | undefined =>
  parseDisableCoolingValue(readFirstDefinedField(value, SERVICE_TIER_PASSTHROUGH_KEYS));

const applyBackendFieldFallbacks = (
  json: Record<string, unknown>,
  fileRecord: Record<string, unknown>,
  isCodexFile: boolean
): Record<string, unknown> => {
  const next = { ...json };

  const prefix = readPrefixFromJson(fileRecord);
  if (!hasOwnField(next, 'prefix') && prefix) {
    next.prefix = prefix;
  }

  const proxyUrl = readProxyUrlFromJson(fileRecord);
  if (!hasAnyOwnField(next, PROXY_URL_KEYS) && proxyUrl) {
    next.proxy_url = proxyUrl;
  }

  const priority = parsePriorityValue(fileRecord.priority);
  if (!hasOwnField(next, 'priority') && priority !== undefined) {
    next.priority = priority;
  }

  const excludedModels = readExcludedModelsFromJson(fileRecord);
  if (!hasAnyOwnField(next, EXCLUDED_MODELS_KEYS) && excludedModels.length > 0) {
    next.excluded_models = excludedModels;
  }

  const disableCooling = readDisableCoolingFromJson(fileRecord);
  if (!hasAnyOwnField(next, DISABLE_COOLING_KEYS) && disableCooling !== undefined) {
    next.disable_cooling = disableCooling;
  }

  const userAgent = readUserAgentFromJson(fileRecord);
  if (!hasAnyOwnField(next, USER_AGENT_KEYS) && userAgent) {
    next.user_agent = userAgent;
  }

  const note = readNoteFromJson(fileRecord);
  if (!hasOwnField(next, 'note') && note) {
    next.note = note;
  }

  if (isCodexFile) {
    const websockets = readWebsocketsFromJson(next) ?? readWebsocketsFromJson(fileRecord) ?? false;
    delete next.websocket;
    next.websockets = websockets;
    const serviceTierPassthrough =
      readServiceTierPassthroughFromJson(next) ??
      readServiceTierPassthroughFromJson(fileRecord) ??
      false;
    delete next['service-tier-passthrough'];
    delete next.serviceTierPassthrough;
    delete next.fast;
    next.service_tier_passthrough = serviceTierPassthrough;
  }

  return next;
};

const normalizeAuthFileKind = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const resolveIsCodexFile = (file: AuthFileItem): boolean => {
  const normalizedType = normalizeAuthFileKind(file.type);
  const normalizedProvider = normalizeAuthFileKind(file.provider);
  return normalizedType === 'codex' || normalizedProvider === 'codex';
};

const createEditorState = (file: AuthFileItem): PrefixProxyEditorState => ({
  file,
  fileName: file.name,
  isCodexFile: resolveIsCodexFile(file),
  loading: true,
  saving: false,
  error: null,
  originalText: '',
  rawText: '',
  json: null,
  clientProfile: null,
  prefix: '',
  proxyUrl: '',
  priority: '',
  excludedModelsText: '',
  disableCooling: '',
  userAgent: '',
  websockets: false,
  serviceTierPassthrough: false,
  note: '',
  noteTouched: false,
  headersText: '',
  headersTouched: false,
  headersError: null,
});

export const extractAuthFileAccessToken = (metadata: Record<string, unknown> | null): string => {
  if (!metadata) return '';

  const topLevelCandidates = [metadata.accessToken, metadata.access_token];
  for (const candidate of topLevelCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  const tokenValue = metadata.token;
  if (typeof tokenValue === 'string' && tokenValue.trim()) {
    return tokenValue.trim();
  }
  if (!isRecordObject(tokenValue)) {
    return '';
  }

  const nestedCandidates = [tokenValue.accessToken, tokenValue.access_token];
  for (const candidate of nestedCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
};

const validateHeadersValue = (value: unknown): AuthFileHeadersErrorKey | null => {
  if (!isRecordObject(value)) {
    return 'auth_files.headers_invalid_object';
  }
  return Object.values(value).every((item) => typeof item === 'string')
    ? null
    : 'auth_files.headers_invalid_value';
};

const parseHeadersText = (
  text: string
): { value: AuthFileHeaders | null; errorKey: AuthFileHeadersErrorKey | null } => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { value: null, errorKey: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { value: null, errorKey: 'auth_files.headers_invalid_json' };
  }

  const errorKey = validateHeadersValue(parsed);
  if (errorKey) {
    return { value: null, errorKey };
  }

  return { value: parsed as AuthFileHeaders, errorKey: null };
};

const readHeadersFromJson = (value: unknown): AuthFileHeaders => {
  if (!isRecordObject(value)) {
    return {};
  }

  return Object.entries(value).reduce<AuthFileHeaders>((result, [key, item]) => {
    if (typeof item !== 'string') {
      return result;
    }
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return result;
    }
    result[normalizedKey] = item;
    return result;
  }, {});
};

const areStringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

const buildPrefixProxyUpdatedText = (
  editor: PrefixProxyEditorState | null,
  resolveHeadersError: (key: AuthFileHeadersErrorKey) => string
): string => {
  if (!editor?.json) return editor?.rawText ?? '';

  const next: Record<string, unknown> = { ...editor.json };
  if ('prefix' in next || editor.prefix.trim()) {
    next.prefix = editor.prefix;
  }
  if (hasAnyOwnField(next, PROXY_URL_KEYS) || editor.proxyUrl.trim()) {
    const proxyUrl = editor.proxyUrl.trim();
    deleteFields(next, PROXY_URL_KEYS);
    if (proxyUrl) {
      next.proxy_url = proxyUrl;
    }
  }

  const parsedPriority = parsePriorityValue(editor.priority);
  if (parsedPriority !== undefined) {
    next.priority = parsedPriority;
  } else if ('priority' in next) {
    delete next.priority;
  }

  const excludedModels = parseExcludedModelsText(editor.excludedModelsText);
  deleteFields(
    next,
    EXCLUDED_MODELS_KEYS.filter((key) => key !== 'excluded_models')
  );
  if (excludedModels.length > 0) {
    next.excluded_models = excludedModels;
  } else if (hasAnyOwnField(next, EXCLUDED_MODELS_KEYS)) {
    delete next.excluded_models;
  }

  const parsedDisableCooling = parseDisableCoolingValue(editor.disableCooling);
  deleteFields(
    next,
    DISABLE_COOLING_KEYS.filter((key) => key !== 'disable_cooling')
  );
  if (parsedDisableCooling !== undefined) {
    next.disable_cooling = parsedDisableCooling;
  } else if (hasAnyOwnField(next, DISABLE_COOLING_KEYS)) {
    delete next.disable_cooling;
  }

  const trimmedUserAgent = editor.userAgent.trim();
  if (trimmedUserAgent) {
    next.user_agent = trimmedUserAgent;
    deleteFields(
      next,
      USER_AGENT_KEYS.filter((key) => key !== 'user_agent')
    );
  } else {
    deleteFields(next, USER_AGENT_KEYS);
  }

  if (editor.noteTouched) {
    const noteValue = editor.note.trim();
    if (noteValue) {
      next.note = editor.note;
    } else if ('note' in next) {
      delete next.note;
    }
  }

  if (editor.headersTouched) {
    const { value: parsedHeaders, errorKey } = parseHeadersText(editor.headersText);
    if (errorKey) {
      throw new Error(resolveHeadersError(errorKey));
    }
    if (parsedHeaders) {
      next.headers = parsedHeaders;
    } else {
      delete next.headers;
    }
  }

  if (!editor.isCodexFile) {
    return JSON.stringify(next);
  }

  return JSON.stringify(
    applyCodexAuthFileServiceTierPassthrough(
      applyCodexAuthFileWebsockets(next, editor.websockets),
      editor.serviceTierPassthrough
    )
  );
};

const buildLoadedPrefixProxyEditorState = (
  file: AuthFileItem,
  rawText: string,
  t: TFunction,
  previous?: PrefixProxyEditorState | null
): PrefixProxyEditorState => {
  const base = createEditorState(file);
  base.loading = false;
  base.saving = previous?.saving ?? false;

  const trimmed = rawText.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return {
      ...base,
      error: t('auth_files.prefix_proxy_invalid_json'),
      rawText: trimmed,
      originalText: trimmed,
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ...base,
      error: t('auth_files.prefix_proxy_invalid_json'),
      rawText: trimmed,
      originalText: trimmed,
    };
  }

  const parsedRecord = parsed as Record<string, unknown>;
  const fileRecord = file as Record<string, unknown>;
  const clientProfileFromFile = resolveAuthFileClientProfileMetadata(fileRecord);
  const clientProfileFromJson = resolveAuthFileClientProfileMetadata(parsedRecord);
  const clientProfile =
    clientProfileFromFile && clientProfileFromJson
      ? { ...clientProfileFromFile, ...clientProfileFromJson }
      : (clientProfileFromJson ?? clientProfileFromFile);

  let json = stripAuthFileRuntimeMetadata(parsedRecord);
  json = applyBackendFieldFallbacks(json, fileRecord, base.isCodexFile);

  const originalText = JSON.stringify(json);
  const derivedPriority = parsePriorityValue(json.priority ?? fileRecord.priority);
  const derivedProxyUrl = readProxyUrlFromJson(json) || readProxyUrlFromJson(fileRecord);
  const derivedDisableCooling =
    readDisableCoolingFromJson(json) ?? readDisableCoolingFromJson(fileRecord);
  const derivedHeaders = json.headers !== undefined ? JSON.stringify(json.headers, null, 2) : '';
  const derivedHeadersError = derivedHeaders
    ? (() => {
        const { errorKey } = parseHeadersText(derivedHeaders);
        return errorKey ? t(errorKey) : null;
      })()
    : null;
  const derivedState = {
    prefix: readPrefixFromJson(json),
    proxyUrl: derivedProxyUrl,
    priority: derivedPriority !== undefined ? String(derivedPriority) : '',
    excludedModelsText: readExcludedModelsFromJson(json).join('\n'),
    disableCooling:
      derivedDisableCooling === undefined ? '' : derivedDisableCooling ? 'true' : 'false',
    userAgent: readUserAgentFromJson(json),
    websockets: readCodexAuthFileWebsockets(json),
    serviceTierPassthrough: readCodexAuthFileServiceTierPassthrough(json),
    note: readNoteFromJson(json),
    noteTouched: false,
    headersText: derivedHeaders,
    headersTouched: false,
    headersError: derivedHeadersError,
  };

  if (!previous || previous.fileName !== file.name) {
    return {
      ...base,
      originalText,
      rawText: originalText,
      json,
      clientProfile,
      ...derivedState,
    };
  }

  return {
    ...base,
    originalText,
    rawText: originalText,
    json,
    clientProfile,
    prefix: previous.prefix,
    proxyUrl: previous.proxyUrl,
    priority: previous.priority,
    excludedModelsText: previous.excludedModelsText,
    disableCooling: previous.disableCooling,
    userAgent: previous.userAgent,
    websockets: previous.websockets,
    serviceTierPassthrough: previous.serviceTierPassthrough,
    note: previous.note,
    noteTouched: previous.noteTouched,
    headersText: previous.headersText,
    headersTouched: previous.headersTouched,
    headersError: previous.headersTouched ? previous.headersError : derivedHeadersError,
  };
};

const buildPrefixProxyPatchPayload = (
  editor: PrefixProxyEditorState,
  resolveHeadersError: (key: AuthFileHeadersErrorKey) => string
) => {
  const payload: Parameters<typeof authFilesApi.patchFields>[0] = {
    name: editor.fileName,
  };
  const source = editor.json ?? {};
  const sourcePriority = parsePriorityValue(source.priority);
  const nextPriority = parsePriorityValue(editor.priority);
  const sourceProxyUrl = readProxyUrlFromJson(source);

  if (editor.prefix !== (typeof source.prefix === 'string' ? source.prefix : '')) {
    payload.prefix = editor.prefix;
  }
  if (
    editor.proxyUrl !== sourceProxyUrl ||
    hasNonCanonicalOwnField(source, PROXY_URL_KEYS, 'proxy_url')
  ) {
    payload.proxy_url = editor.proxyUrl;
  }
  if (nextPriority !== sourcePriority) {
    payload.priority = nextPriority ?? null;
  }

  const sourceExcludedModels = readExcludedModelsFromJson(source);
  const nextExcludedModels = parseExcludedModelsText(editor.excludedModelsText);
  if (
    !areStringArraysEqual(sourceExcludedModels, nextExcludedModels) ||
    hasNonCanonicalOwnField(source, EXCLUDED_MODELS_KEYS, 'excluded_models')
  ) {
    payload.excluded_models = nextExcludedModels;
  }

  const sourceDisableCooling = readDisableCoolingFromJson(source);
  const nextDisableCooling = parseDisableCoolingValue(editor.disableCooling);
  if (
    sourceDisableCooling !== nextDisableCooling ||
    hasNonCanonicalOwnField(source, DISABLE_COOLING_KEYS, 'disable_cooling')
  ) {
    payload.disable_cooling = nextDisableCooling ?? null;
  }

  const sourceUserAgent = readUserAgentFromJson(source);
  if (
    editor.userAgent !== sourceUserAgent ||
    hasNonCanonicalOwnField(source, USER_AGENT_KEYS, 'user_agent')
  ) {
    payload.user_agent = editor.userAgent;
  }

  if (editor.isCodexFile) {
    const sourceWebsockets = readCodexAuthFileWebsockets(source);
    if (editor.websockets !== sourceWebsockets) {
      payload.websockets = editor.websockets;
    }
    const sourceServiceTierPassthrough = readCodexAuthFileServiceTierPassthrough(source);
    if (
      editor.serviceTierPassthrough !== sourceServiceTierPassthrough ||
      hasNonCanonicalOwnField(source, SERVICE_TIER_PASSTHROUGH_KEYS, 'service_tier_passthrough')
    ) {
      payload.service_tier_passthrough = editor.serviceTierPassthrough;
    }
  }

  if (editor.noteTouched) {
    const sourceNote = typeof source.note === 'string' ? source.note : '';
    if (editor.note !== sourceNote) {
      payload.note = editor.note;
    }
  }

  if (editor.headersTouched) {
    const { value: nextHeaders, errorKey } = parseHeadersText(editor.headersText);
    if (errorKey) {
      throw new Error(resolveHeadersError(errorKey));
    }

    const sourceHeaders = readHeadersFromJson(source.headers);
    const headerPatch: AuthFileHeaders = {};
    const normalizedNextHeaders = nextHeaders ?? {};

    Object.entries(normalizedNextHeaders).forEach(([key, value]) => {
      if (sourceHeaders[key] !== value) {
        headerPatch[key] = value;
      }
    });

    Object.keys(sourceHeaders).forEach((key) => {
      if (!(key in normalizedNextHeaders)) {
        headerPatch[key] = '';
      }
    });

    if (Object.keys(headerPatch).length > 0) {
      payload.headers = headerPatch;
    }
  }

  return payload;
};

const buildLocalPatchedAuthFile = (
  editor: PrefixProxyEditorState,
  remoteFile?: AuthFileItem
): Partial<AuthFileItem> => {
  const nextTimestamp =
    remoteFile?.modtime ??
    remoteFile?.updated_at ??
    remoteFile?.modified ??
    new Date().toISOString();
  const parsedModified = Date.parse(String(nextTimestamp));

  return {
    ...remoteFile,
    prefix: editor.prefix,
    proxy_url: editor.proxyUrl,
    priority: parsePriorityValue(editor.priority),
    note: editor.note.trim(),
    user_agent: editor.userAgent.trim(),
    excluded_models: parseExcludedModelsText(editor.excludedModelsText),
    disable_cooling: parseDisableCoolingValue(editor.disableCooling),
    websockets: editor.isCodexFile ? editor.websockets : remoteFile?.websockets,
    service_tier_passthrough: editor.isCodexFile
      ? editor.serviceTierPassthrough
      : remoteFile?.service_tier_passthrough,
    modtime: nextTimestamp,
    updated_at: remoteFile?.updated_at ?? nextTimestamp,
    modified:
      typeof remoteFile?.modified === 'number'
        ? remoteFile.modified
        : Number.isNaN(parsedModified)
          ? Date.now()
          : parsedModified,
  };
};

export function useAuthFilesPrefixProxyEditor(
  options: UseAuthFilesPrefixProxyEditorOptions
): UseAuthFilesPrefixProxyEditorResult {
  const { disableControls, applyLocalFilePatch, refreshAuthFilesFromServer } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState | null>(null);
  const prefixProxyEditorRef = useRef<PrefixProxyEditorState | null>(null);

  useEffect(() => {
    prefixProxyEditorRef.current = prefixProxyEditor;
  }, [prefixProxyEditor]);

  const hasBlockingValidationError = Boolean(
    prefixProxyEditor?.headersTouched && prefixProxyEditor.headersError
  );
  const prefixProxyUpdatedText = useMemo(
    () =>
      prefixProxyEditor?.json && !hasBlockingValidationError
        ? buildPrefixProxyUpdatedText(prefixProxyEditor, (key) => t(key))
        : '',
    [hasBlockingValidationError, prefixProxyEditor, t]
  );
  const prefixProxyDirty = useMemo(
    () =>
      Boolean(prefixProxyEditor?.json) &&
      Boolean(prefixProxyEditor?.originalText) &&
      (prefixProxyUpdatedText === '' || prefixProxyUpdatedText !== prefixProxyEditor?.originalText),
    [prefixProxyEditor, prefixProxyUpdatedText]
  );

  const openPrefixProxyEditor = useCallback(
    async (file: AuthFileItem) => {
      const name = file.name;

      if (disableControls) return;
      if (prefixProxyEditorRef.current?.fileName === name) {
        setPrefixProxyEditor(null);
        return;
      }

      setPrefixProxyEditor(createEditorState(file));

      try {
        const rawText = await authFilesApi.previewText(name);
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name) return prev;
          return buildLoadedPrefixProxyEditorState(file, rawText, t);
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : t('notification.download_failed');
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name) return prev;
          return { ...prev, loading: false, error: errorMessage, rawText: '' };
        });
        showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
      }
    },
    [disableControls, showNotification, t]
  );

  const closePrefixProxyEditor = useCallback(() => {
    setPrefixProxyEditor(null);
  }, []);

  const handlePrefixProxyChange = useCallback(
    (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => {
      setPrefixProxyEditor((prev) => {
        if (!prev) return prev;
        if (field === 'prefix') return { ...prev, prefix: String(value) };
        if (field === 'proxyUrl') return { ...prev, proxyUrl: String(value) };
        if (field === 'priority') return { ...prev, priority: String(value) };
        if (field === 'excludedModelsText') {
          return { ...prev, excludedModelsText: String(value) };
        }
        if (field === 'disableCooling') return { ...prev, disableCooling: String(value) };
        if (field === 'userAgent') return { ...prev, userAgent: String(value) };
        if (field === 'serviceTierPassthrough') {
          return { ...prev, serviceTierPassthrough: Boolean(value) };
        }
        if (field === 'note') return { ...prev, note: String(value), noteTouched: true };
        if (field === 'headersText') {
          const headersText = String(value);
          const { errorKey } = parseHeadersText(headersText);
          return {
            ...prev,
            headersText,
            headersTouched: true,
            headersError: errorKey ? t(errorKey) : null,
          };
        }
        return { ...prev, websockets: Boolean(value) };
      });
    },
    [t]
  );

  const handlePrefixProxySave = useCallback(async () => {
    const current = prefixProxyEditorRef.current;
    if (!current?.json || !prefixProxyDirty) return;

    let payload: Parameters<typeof authFilesApi.patchFields>[0];
    try {
      payload = buildPrefixProxyPatchPayload(current, (key) => t(key));
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid format';
      showNotification(errorMessage, 'error');
      return;
    }

    if (Object.keys(payload).length === 1) {
      setPrefixProxyEditor(null);
      return;
    }

    const { fileName } = current;
    setPrefixProxyEditor((prev) => {
      if (!prev || prev.fileName !== fileName) return prev;
      return { ...prev, saving: true };
    });

    try {
      const response = await authFilesApi.patchFields(payload);
      applyLocalFilePatch(fileName, buildLocalPatchedAuthFile(current, response.file));
      await refreshAuthFilesFromServer?.();
      setPrefixProxyEditor(null);
      showNotification(t('auth_files.prefix_proxy_saved_success', { name: fileName }), 'success');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== fileName) return prev;
        return { ...prev, saving: false };
      });
    }
  }, [applyLocalFilePatch, prefixProxyDirty, refreshAuthFilesFromServer, showNotification, t]);

  return {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  };
}
