import type { OAuthReasoningEffort } from '@/types';

type ReasoningEffortParseError =
  | { kind: 'invalid-line'; line: number }
  | { kind: 'duplicate-source'; source: string };

export type ReasoningEffortParseResult = {
  value?: OAuthReasoningEffort;
  error?: ReasoningEffortParseError;
};

const createReasoningEffort = (): OAuthReasoningEffort =>
  Object.create(null) as OAuthReasoningEffort;

const hasReasoningEffort = (value: OAuthReasoningEffort, source: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, source);

export function normalizeOAuthReasoningEffort(value: unknown): OAuthReasoningEffort | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const normalized = createReasoningEffort();
  Object.entries(value as Record<string, unknown>).forEach(([rawSource, rawTarget]) => {
    const source = rawSource.trim().toLowerCase();
    const target = String(rawTarget ?? '').trim().toLowerCase();
    if (!source || !target || hasReasoningEffort(normalized, source)) return;
    normalized[source] = target;
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function formatOAuthReasoningEffort(value?: OAuthReasoningEffort): string {
  if (!value) return '';
  return Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, target]) => `${source}: ${target}`)
    .join('\n');
}

export function parseOAuthReasoningEffortText(text: string): ReasoningEffortParseResult {
  const normalized = createReasoningEffort();

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    const equalsIndex = line.indexOf('=');
    const separatorIndex =
      colonIndex === -1
        ? equalsIndex
        : equalsIndex === -1
          ? colonIndex
          : Math.min(colonIndex, equalsIndex);

    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      return { error: { kind: 'invalid-line', line: index + 1 } };
    }

    const source = line.slice(0, separatorIndex).trim().toLowerCase();
    const target = line.slice(separatorIndex + 1).trim().toLowerCase();
    if (!source || !target) {
      return { error: { kind: 'invalid-line', line: index + 1 } };
    }
    if (hasReasoningEffort(normalized, source)) {
      return { error: { kind: 'duplicate-source', source } };
    }
    normalized[source] = target;
  }

  return Object.keys(normalized).length > 0 ? { value: normalized } : {};
}
