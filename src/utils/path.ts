/** Returns the final segment from either POSIX or Windows-style paths. */
export const getPathBasename = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
};
