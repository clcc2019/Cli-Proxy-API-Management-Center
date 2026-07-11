interface UsageExportPayloadLike {
  exported_at?: unknown;
}

interface UsageImportResultLike {
  added?: unknown;
  skipped?: unknown;
  total_requests?: unknown;
  failed_requests?: unknown;
}

export const appendErrorMessage = (baseMessage: string, error: unknown): string => {
  const message = error instanceof Error ? error.message : '';
  return `${baseMessage}${message ? `: ${message}` : ''}`;
};

const normalizeCount = (value: unknown): number => {
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
};

export const buildUsageImportMessageOptions = (result: UsageImportResultLike | null | undefined) => ({
  added: normalizeCount(result?.added),
  skipped: normalizeCount(result?.skipped),
  total: normalizeCount(result?.total_requests),
  failed: normalizeCount(result?.failed_requests),
});

export const buildUsageExportFilename = (
  prefix: string,
  payload?: UsageExportPayloadLike | null
): string => {
  const exportedAt =
    typeof payload?.exported_at === 'string' ? new Date(payload.exported_at) : new Date();
  const safeTimestamp = Number.isNaN(exportedAt.getTime())
    ? new Date().toISOString()
    : exportedAt.toISOString();

  return `${prefix}-${safeTimestamp.replace(/[:.]/g, '-')}.json`;
};

export const createJsonExportBlob = (data: unknown): Blob =>
  new Blob([JSON.stringify(data ?? {}, null, 2)], { type: 'application/json' });

export const readJsonFile = async (file: File): Promise<unknown> => {
  const text = await file.text();
  return JSON.parse(text);
};
