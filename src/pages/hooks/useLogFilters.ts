import { useEffect, useMemo, useState } from 'react';
import type { HttpMethod, ParsedLogLine, StatusGroup } from './logTypes';
import { resolveStatusGroup } from './logTypes';

const PATH_FILTER_LIMIT = 12;

interface UseLogFiltersOptions {
  parsedLines: ParsedLogLine[];
}

interface UseLogFiltersReturn {
  methodFilters: HttpMethod[];
  statusFilters: StatusGroup[];
  pathFilters: string[];
  methodFilterSet: Set<HttpMethod>;
  statusFilterSet: Set<StatusGroup>;
  pathFilterSet: Set<string>;
  hasStructuredFilters: boolean;
  methodCounts: Partial<Record<HttpMethod, number>>;
  statusCounts: Partial<Record<StatusGroup, number>>;
  pathOptions: Array<{ path: string; count: number }>;
  toggleMethodFilter: (method: HttpMethod) => void;
  toggleStatusFilter: (group: StatusGroup) => void;
  togglePathFilter: (path: string) => void;
  clearStructuredFilters: () => void;
}

export function useLogFilters(options: UseLogFiltersOptions): UseLogFiltersReturn {
  const { parsedLines } = options;

  const [methodFilters, setMethodFilters] = useState<HttpMethod[]>([]);
  const [statusFilters, setStatusFilters] = useState<StatusGroup[]>([]);
  const [pathFilters, setPathFilters] = useState<string[]>([]);

  const methodFilterSet = useMemo(() => new Set(methodFilters), [methodFilters]);
  const statusFilterSet = useMemo(() => new Set(statusFilters), [statusFilters]);
  const pathFilterSet = useMemo(() => new Set(pathFilters), [pathFilters]);
  const hasStructuredFilters =
    methodFilters.length > 0 || statusFilters.length > 0 || pathFilters.length > 0;

  const { methodCounts, statusCounts, pathOptions } = useMemo(() => {
    const nextMethodCounts: Partial<Record<HttpMethod, number>> = {};
    const nextStatusCounts: Partial<Record<StatusGroup, number>> = {};
    const pathCounts = new Map<string, number>();

    parsedLines.forEach((line) => {
      if (line.method) {
        nextMethodCounts[line.method] = (nextMethodCounts[line.method] ?? 0) + 1;
      }

      const statusGroup = resolveStatusGroup(line.statusCode);
      if (statusGroup) {
        nextStatusCounts[statusGroup] = (nextStatusCounts[statusGroup] ?? 0) + 1;
      }

      if (line.path) {
        pathCounts.set(line.path, (pathCounts.get(line.path) ?? 0) + 1);
      }
    });

    const nextPathOptions = Array.from(pathCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, PATH_FILTER_LIMIT)
      .map(([path, count]) => ({ path, count }));

    return {
      methodCounts: nextMethodCounts,
      statusCounts: nextStatusCounts,
      pathOptions: nextPathOptions,
    };
  }, [parsedLines]);

  useEffect(() => {
    const validPathSet = new Set(pathOptions.map((item) => item.path));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPathFilters((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.filter((path) => validPathSet.has(path));
      return next.length === prev.length ? prev : next;
    });
  }, [pathOptions]);

  const toggleMethodFilter = (method: HttpMethod) => {
    setMethodFilters((prev) =>
      prev.includes(method) ? prev.filter((item) => item !== method) : [...prev, method]
    );
  };

  const toggleStatusFilter = (group: StatusGroup) => {
    setStatusFilters((prev) =>
      prev.includes(group) ? prev.filter((item) => item !== group) : [...prev, group]
    );
  };

  const togglePathFilter = (path: string) => {
    setPathFilters((prev) =>
      prev.includes(path) ? prev.filter((item) => item !== path) : [...prev, path]
    );
  };

  const clearStructuredFilters = () => {
    setMethodFilters([]);
    setStatusFilters([]);
    setPathFilters([]);
  };

  return {
    methodFilters,
    statusFilters,
    pathFilters,
    methodFilterSet,
    statusFilterSet,
    pathFilterSet,
    hasStructuredFilters,
    methodCounts,
    statusCounts,
    pathOptions,
    toggleMethodFilter,
    toggleStatusFilter,
    togglePathFilter,
    clearStructuredFilters,
  };
}
