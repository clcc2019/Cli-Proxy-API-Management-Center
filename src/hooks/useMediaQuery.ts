/**
 * 媒体查询 Hook
 *
 * - SSR 安全：服务器端不触碰 window，默认返回 false
 * - 避免首次 effect 多余触发一次 setState（用初始同步读取）
 * - 支持老 Safari 的 addListener/removeListener
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';

const getServerSnapshot = () => false;

export function useMediaQuery(query: string): boolean {
  const media = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null;
    }
    return window.matchMedia(query);
  }, [query]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!media) return () => undefined;

      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onStoreChange);
        return () => media.removeEventListener('change', onStoreChange);
      }

      // Fallback for legacy Safari.
      type LegacyMediaQueryList = MediaQueryList & {
        addListener: (listener: () => void) => void;
        removeListener: (listener: () => void) => void;
      };
      const legacy = media as LegacyMediaQueryList;
      legacy.addListener(onStoreChange);
      return () => legacy.removeListener(onStoreChange);
    },
    [media]
  );

  const getSnapshot = useCallback(() => media?.matches ?? false, [media]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
