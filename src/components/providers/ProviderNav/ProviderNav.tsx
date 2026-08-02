import { CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenAI from '@/assets/icons/openai-dark.svg';
import styles from './ProviderNav.module.scss';

export type ProviderId = 'codex' | 'claude' | 'openai';

interface ProviderNavItem {
  id: ProviderId;
  label: string;
  getIcon: () => string;
}

const PROVIDERS: ProviderNavItem[] = [
  { id: 'codex', label: 'Codex', getIcon: () => iconCodex },
  { id: 'claude', label: 'Claude', getIcon: () => iconClaude },
  { id: 'openai', label: 'OpenAI', getIcon: () => iconOpenAI },
];

const HEADER_OFFSET = 24;
type ScrollContainer = HTMLElement | (Window & typeof globalThis);
type IndicatorStyle = CSSProperties & {
  '--provider-nav-indicator-x': string;
  '--provider-nav-indicator-y': string;
};

export function ProviderNav() {
  const location = useLocation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const contentScrollerRef = useRef<HTMLElement | null>(null);
  const navListRef = useRef<HTMLDivElement | null>(null);
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<ProviderId, HTMLButtonElement | null>>({
    codex: null,
    claude: null,
    openai: null,
  });
  const [indicatorRect, setIndicatorRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [indicatorTransitionsEnabled, setIndicatorTransitionsEnabled] = useState(false);
  const indicatorHasEnabledTransitionsRef = useRef(false);
  const scrollUpdateFrameRef = useRef<number | null>(null);
  const resizeUpdateFrameRef = useRef<number | null>(null);
  const activeProviderRef = useRef<ProviderId | null>(null);

  // Only show this quick-switch overlay on the AI Providers list page.
  // Note: The app uses iOS-style stacked page transitions inside `/ai-providers/*`,
  // so this component can stay mounted while the user is on an edit route.
  const normalizedPathname =
    location.pathname.length > 1 && location.pathname.endsWith('/')
      ? location.pathname.slice(0, -1)
      : location.pathname;
  const shouldShow = isCurrentLayer && normalizedPathname === '/ai-providers';

  const getHeaderHeight = useCallback(() => {
    const header = document.querySelector('.main-header') as HTMLElement | null;
    if (header) return header.getBoundingClientRect().height;

    const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-height');
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const getContentScroller = useCallback(() => {
    if (contentScrollerRef.current && document.contains(contentScrollerRef.current)) {
      return contentScrollerRef.current;
    }

    const container = document.querySelector('.content') as HTMLElement | null;
    contentScrollerRef.current = container;
    return container;
  }, []);

  const getScrollContainer = useCallback((): ScrollContainer => {
    // Mobile layout uses document scroll (layout switches at 768px); desktop uses the `.content` scroller.
    if (isMobile) return window;
    return getContentScroller() ?? window;
  }, [getContentScroller, isMobile]);

  const updateActiveProvider = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return;

    const isElementScroller = container instanceof HTMLElement;
    const headerHeight = isElementScroller ? 0 : getHeaderHeight();
    const containerTop = isElementScroller ? container.getBoundingClientRect().top : 0;
    const activationLine = containerTop + headerHeight + HEADER_OFFSET + 1;
    let currentActive: ProviderId | null = null;

    for (const provider of PROVIDERS) {
      const element = document.getElementById(`provider-${provider.id}`);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top <= activationLine) {
        currentActive = provider.id;
        continue;
      }

      if (currentActive) break;
    }

    if (!currentActive) {
      const firstVisible = PROVIDERS.find((provider) =>
        document.getElementById(`provider-${provider.id}`)
      );
      currentActive = firstVisible?.id ?? null;
    }

    setActiveProvider(currentActive);
  }, [getHeaderHeight, getScrollContainer]);

  const scheduleActiveProviderUpdate = useCallback(() => {
    if (scrollUpdateFrameRef.current !== null) {
      return;
    }

    scrollUpdateFrameRef.current = requestAnimationFrame(() => {
      scrollUpdateFrameRef.current = null;
      updateActiveProvider();
    });
  }, [updateActiveProvider]);

  useEffect(() => {
    if (!shouldShow) return;
    const contentScroller = getContentScroller();

    // Listen to both: desktop scroll happens on `.content`; mobile uses `window`.
    window.addEventListener('scroll', scheduleActiveProviderUpdate, { passive: true });
    contentScroller?.addEventListener('scroll', scheduleActiveProviderUpdate, { passive: true });
    const raf = requestAnimationFrame(scheduleActiveProviderUpdate);
    return () => {
      if (scrollUpdateFrameRef.current !== null) {
        cancelAnimationFrame(scrollUpdateFrameRef.current);
        scrollUpdateFrameRef.current = null;
      }
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', scheduleActiveProviderUpdate);
      contentScroller?.removeEventListener('scroll', scheduleActiveProviderUpdate);
    };
  }, [getContentScroller, scheduleActiveProviderUpdate, shouldShow]);

  const updateIndicator = useCallback((providerId: ProviderId | null) => {
    if (!providerId) {
      setIndicatorRect(null);
      return;
    }

    const itemEl = itemRefs.current[providerId];
    if (!itemEl) return;

    setIndicatorRect({
      x: itemEl.offsetLeft,
      y: itemEl.offsetTop,
      width: itemEl.offsetWidth,
      height: itemEl.offsetHeight,
    });

    // Avoid animating from an initial (0,0) state on first paint.
    if (!indicatorHasEnabledTransitionsRef.current) {
      indicatorHasEnabledTransitionsRef.current = true;
      requestAnimationFrame(() => setIndicatorTransitionsEnabled(true));
    }
  }, []);

  useLayoutEffect(() => {
    activeProviderRef.current = activeProvider;
    if (!shouldShow) return;
    const raf = requestAnimationFrame(() => updateIndicator(activeProvider));
    return () => cancelAnimationFrame(raf);
  }, [activeProvider, shouldShow, updateIndicator]);

  const scheduleResizeUpdate = useCallback(() => {
    if (resizeUpdateFrameRef.current !== null) return;

    resizeUpdateFrameRef.current = requestAnimationFrame(() => {
      resizeUpdateFrameRef.current = null;
      updateActiveProvider();
      updateIndicator(activeProviderRef.current);
    });
  }, [updateActiveProvider, updateIndicator]);

  // Expose overlay height to the page, so it can reserve bottom padding and avoid being covered.
  useLayoutEffect(() => {
    if (!shouldShow) return;

    const el = navContainerRef.current;
    if (!el) return;

    let frame: number | null = null;
    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--provider-nav-height', `${height}px`);
    };
    const scheduleHeightUpdate = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        updateHeight();
      });
    };

    updateHeight();
    window.addEventListener('resize', scheduleHeightUpdate);

    const ro =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleHeightUpdate);
    ro?.observe(el);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', scheduleHeightUpdate);
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      document.documentElement.style.removeProperty('--provider-nav-height');
    };
  }, [shouldShow]);

  const scrollToProvider = (providerId: ProviderId) => {
    const container = getScrollContainer();
    const element = document.getElementById(`provider-${providerId}`);
    if (!element || !container) return;
    const scrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';

    setActiveProvider(providerId);
    updateIndicator(providerId);

    // Mobile: scroll the document (header is fixed, so offset by header height).
    if (!(container instanceof HTMLElement)) {
      const headerHeight = getHeaderHeight();
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      const target = Math.max(0, elementTop - headerHeight - HEADER_OFFSET);
      window.scrollTo({ top: target, behavior: scrollBehavior });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - HEADER_OFFSET;

    container.scrollTo({ top: scrollTop, behavior: scrollBehavior });
  };

  useEffect(() => {
    if (!shouldShow) return;
    window.addEventListener('resize', scheduleResizeUpdate);
    return () => {
      window.removeEventListener('resize', scheduleResizeUpdate);
      if (resizeUpdateFrameRef.current !== null) {
        cancelAnimationFrame(resizeUpdateFrameRef.current);
        resizeUpdateFrameRef.current = null;
      }
    };
  }, [scheduleResizeUpdate, shouldShow]);

  const indicatorStyle: CSSProperties | undefined = indicatorRect
    ? ({
        '--provider-nav-indicator-x': `${indicatorRect.x}px`,
        '--provider-nav-indicator-y': `${indicatorRect.y}px`,
        width: indicatorRect.width,
        height: indicatorRect.height,
      } as IndicatorStyle)
    : undefined;

  const navContent = (
    <div className={styles.navContainer} ref={navContainerRef}>
      <div className={styles.navList} ref={navListRef}>
        <div
          className={[
            styles.indicator,
            indicatorRect ? styles.indicatorVisible : '',
            indicatorTransitionsEnabled ? '' : styles.indicatorNoTransition,
          ]
            .filter(Boolean)
            .join(' ')}
          style={indicatorStyle}
        />
        {PROVIDERS.map((provider) => {
          const isActive = activeProvider === provider.id;
          return (
            <button
              key={provider.id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              ref={(node) => {
                itemRefs.current[provider.id] = node;
              }}
              onClick={() => scrollToProvider(provider.id)}
              title={provider.label}
              type="button"
              aria-label={provider.label}
              aria-pressed={isActive}
            >
              <img src={provider.getIcon()} alt="" className={styles.icon} />
              <span className={styles.label}>{provider.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;

  if (!shouldShow) return null;

  return createPortal(navContent, document.body);
}
