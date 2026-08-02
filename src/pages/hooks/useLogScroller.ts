import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction, UIEvent } from 'react';
import type { LogState } from './logTypes';

const LOAD_MORE_LINES = 200;
const LOAD_MORE_THRESHOLD_PX = 72;

export const isNearBottom = (node: HTMLDivElement | null) => {
  if (!node) return true;
  const threshold = 24;
  return node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
};

interface UseLogScrollerOptions {
  logState: LogState;
  setLogState: Dispatch<SetStateAction<LogState>>;
  logViewerRef: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  loading: boolean;
  isSearching: boolean;
  filteredLineCount: number;
  hasStructuredFilters: boolean;
  showRawLogs: boolean;
}

interface UseLogScrollerReturn {
  canLoadMore: boolean;
  handleLogScroll: (e: UIEvent<HTMLDivElement>) => void;
  scrollToBottom: () => void;
  requestScrollToBottom: () => void;
}

export function useLogScroller(options: UseLogScrollerOptions): UseLogScrollerReturn {
  const {
    logState,
    setLogState,
    logViewerRef,
    enabled = true,
    loading,
    isSearching,
    filteredLineCount,
    hasStructuredFilters,
    showRawLogs,
  } = options;

  const pendingScrollToBottomRef = useRef(false);
  const pendingPrependScrollRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const tryAutoLoadMoreRef = useRef<() => void>(() => undefined);

  const canLoadMore = enabled && !isSearching && logState.visibleFrom > 0;

  const scrollToBottom = useCallback(() => {
    const node = logViewerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [logViewerRef]);

  const requestScrollToBottom = useCallback(() => {
    pendingScrollToBottomRef.current = true;
  }, []);

  const prependVisibleLines = useCallback(() => {
    if (!enabled) return;
    const node = logViewerRef.current;
    if (!node) return;
    if (pendingPrependScrollRef.current) return;
    if (isSearching) return;

    setLogState((prev) => {
      if (prev.visibleFrom <= 0) {
        return prev;
      }

      pendingPrependScrollRef.current = {
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
      };

      return {
        ...prev,
        visibleFrom: Math.max(prev.visibleFrom - LOAD_MORE_LINES, 0),
      };
    });
  }, [enabled, isSearching, logViewerRef, setLogState]);

  const handleLogScroll = useCallback(
    (_e: UIEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const node = logViewerRef.current;
      if (!node) return;
      if (isSearching) return;
      if (!canLoadMore) return;
      if (pendingPrependScrollRef.current) return;
      if (node.scrollTop > LOAD_MORE_THRESHOLD_PX) return;

      prependVisibleLines();
    },
    [canLoadMore, enabled, isSearching, logViewerRef, prependVisibleLines]
  );

  useLayoutEffect(() => {
    if (!enabled) return;
    const node = logViewerRef.current;
    const pending = pendingPrependScrollRef.current;
    if (!node || !pending) return;

    const delta = node.scrollHeight - pending.scrollHeight;
    node.scrollTop = pending.scrollTop + delta;
    pendingPrependScrollRef.current = null;
  }, [enabled, logState.visibleFrom, logViewerRef]);

  const tryAutoLoadMoreUntilScrollable = useCallback(() => {
    const node = logViewerRef.current;
    if (!node) return;
    if (!canLoadMore) return;
    if (isSearching) return;
    if (pendingPrependScrollRef.current) return;

    const hasVerticalOverflow = node.scrollHeight > node.clientHeight + 1;
    if (hasVerticalOverflow) return;

    prependVisibleLines();
  }, [canLoadMore, isSearching, logViewerRef, prependVisibleLines]);

  useLayoutEffect(() => {
    tryAutoLoadMoreRef.current = tryAutoLoadMoreUntilScrollable;
  }, [tryAutoLoadMoreUntilScrollable]);

  const handleResize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      tryAutoLoadMoreRef.current();
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (loading) return;
    const node = logViewerRef.current;
    if (!node) return;

    const raf = window.requestAnimationFrame(() => {
      tryAutoLoadMoreUntilScrollable();
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [
    enabled,
    filteredLineCount,
    hasStructuredFilters,
    loading,
    logState.visibleFrom,
    logViewerRef,
    showRawLogs,
    tryAutoLoadMoreUntilScrollable,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [enabled, handleResize]);

  useEffect(() => {
    if (!enabled) return;
    if (!pendingScrollToBottomRef.current) return;
    if (loading) return;
    if (!logViewerRef.current) return;

    scrollToBottom();
    pendingScrollToBottomRef.current = false;
  }, [enabled, loading, logState.buffer, logState.visibleFrom, logViewerRef, scrollToBottom]);

  return {
    canLoadMore,
    handleLogScroll,
    scrollToBottom,
    requestScrollToBottom,
  };
}
