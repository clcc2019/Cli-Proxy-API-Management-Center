/**
 * 媒体查询 Hook
 *
 * - SSR 安全：服务器端不触碰 window，默认返回 false
 * - 避免首次 effect 多余触发一次 setState（用初始同步读取）
 * - 支持老 Safari 的 addListener/removeListener
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const getInitial = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = useState<boolean>(getInitial);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const media = window.matchMedia(query);

    // 同步读取一次，防止 query 变化期间初值已错位
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }

    // Fallback for legacy Safari
    type LegacyMediaQueryList = MediaQueryList & {
      addListener: (l: (e: MediaQueryListEvent) => void) => void;
      removeListener: (l: (e: MediaQueryListEvent) => void) => void;
    };
    const legacy = media as LegacyMediaQueryList;
    legacy.addListener(listener);
    return () => legacy.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return matches;
}
