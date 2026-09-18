import { isMap, parseDocument } from 'yaml';
import type { AuthFileItem } from '@/types';
import { getPathBasename } from '@/utils/path';

const CODEX_TURN_STATE_TICKET_PATH = ['codex', 'openai-codex-ticket'] as const;

export type CodexTurnStateTicketConfig = {
  enabled: boolean;
  authFiles: string[];
  enabledForFile: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readBoolean = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return false;
};

const normalizeSelector = (value: unknown): string => String(value ?? '').trim();

const readAuthFileSelectors = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const selectors: string[] = [];

  values.forEach((item) => {
    const selector = normalizeSelector(item);
    if (!selector || seen.has(selector)) return;
    seen.add(selector);
    selectors.push(selector);
  });

  return selectors;
};

const normalizePath = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!normalized) return '';
  const parts = normalized.split('/');
  const result: string[] = [];
  parts.forEach((part: string) => {
    if (!part || part === '.') return;
    if (part === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') result.pop();
      else result.push(part);
      return;
    }
    result.push(part);
  });
  const prefix = normalized.startsWith('/') ? '/' : '';
  return `${prefix}${result.join('/')}`;
};

const getAuthFilePathCandidates = (file: AuthFileItem): string[] => {
  const values = [file.name, file.path, file.file_name, file.fileName];
  const candidates: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const candidate = normalizeSelector(value);
    if (!candidate) return;
    const normalized = normalizePath(candidate);
    const basename = getPathBasename(candidate);
    [candidate, normalized, basename].forEach((item) => {
      if (!item || seen.has(item)) return;
      seen.add(item);
      candidates.push(item);
    });
  });

  return candidates;
};

export const isCodexAuthFile = (file: AuthFileItem): boolean => {
  const type = String(file.type ?? '')
    .trim()
    .toLowerCase();
  const provider = String(file.provider ?? '')
    .trim()
    .toLowerCase();
  return type === 'codex' || provider === 'codex';
};

export const authFileMatchesCodexTurnStateTicketSelector = (
  file: AuthFileItem,
  selector: string
): boolean => {
  const normalizedSelector = normalizeSelector(selector);
  if (!normalizedSelector) return false;

  const id = normalizeSelector(file.id);
  if (id && id === normalizedSelector) return true;

  const selectorPath = normalizePath(normalizedSelector);
  const selectorBasename = getPathBasename(normalizedSelector);
  return getAuthFilePathCandidates(file).some(
    (candidate) =>
      candidate === normalizedSelector ||
      candidate === selectorPath ||
      candidate === selectorBasename ||
      getPathBasename(candidate) === selectorBasename
  );
};

export const selectCodexTurnStateTicketAuthFileSelector = (file: AuthFileItem): string => {
  const id = normalizeSelector(file.id);
  if (id) return id;
  return (
    normalizeSelector(file.name) ||
    normalizeSelector(file.path) ||
    normalizeSelector(file.file_name) ||
    normalizeSelector(file.fileName)
  );
};

const parseYamlConfig = (yamlContent: string) => {
  const document = parseDocument(yamlContent);
  if (document.errors.length > 0) {
    throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
  }
  return document;
};

export const readCodexTurnStateTicketConfig = (
  yamlContent: string,
  file: AuthFileItem
): CodexTurnStateTicketConfig => {
  const document = parseYamlConfig(yamlContent);
  const parsed = document.toJSON() as unknown;
  const codex = isRecord(parsed) ? parsed.codex : undefined;
  const ticket = isRecord(codex) ? codex['openai-codex-ticket'] : undefined;
  const enabled = isRecord(ticket) ? readBoolean(ticket.enabled) : false;
  const authFiles = isRecord(ticket) ? readAuthFileSelectors(ticket['auth-files']) : [];

  return {
    enabled,
    authFiles,
    enabledForFile:
      enabled &&
      (authFiles.length === 0 ||
        authFiles.some((selector) => authFileMatchesCodexTurnStateTicketSelector(file, selector))),
  };
};

const ensureMapInDocument = (
  document: ReturnType<typeof parseDocument>,
  path: readonly string[]
): void => {
  if (isMap(document.getIn(path, true))) return;
  document.setIn(path, document.createNode({}));
};

export const writeCodexTurnStateTicketConfig = (
  yamlContent: string,
  enabled: boolean,
  authFiles: string[]
): string => {
  const document = parseYamlConfig(yamlContent);
  if (!isMap(document.contents)) {
    document.contents = document.createNode({}) as unknown as typeof document.contents;
  }

  ensureMapInDocument(document, ['codex']);
  ensureMapInDocument(document, [...CODEX_TURN_STATE_TICKET_PATH]);
  document.setIn([...CODEX_TURN_STATE_TICKET_PATH, 'enabled'], enabled);
  document.setIn(
    [...CODEX_TURN_STATE_TICKET_PATH, 'auth-files'],
    document.createNode(readAuthFileSelectors(authFiles))
  );

  return document.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
};
