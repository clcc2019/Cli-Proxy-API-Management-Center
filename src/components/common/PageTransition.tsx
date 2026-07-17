import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, type Location } from 'react-router-dom';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  PAGE_TRANSITION_LAYER_CONTEXT_VALUES,
  PageTransitionLayerContext,
  type LayerStatus,
} from './PageTransitionLayer';
import './PageTransition.scss';

interface PageTransitionProps {
  render: (location: Location) => ReactNode;
  getRouteOrder?: (pathname: string) => number | null;
  getTransitionVariant?: (fromPathname: string, toPathname: string) => TransitionVariant;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
}

const VERTICAL_TRANSITION_DURATION_MS = 260;
const VERTICAL_TRAVEL_DISTANCE = 28;
const IOS_TRANSITION_DURATION_MS = 320;
const IOS_ENTER_FROM_X_PERCENT = 100;
const IOS_EXIT_TO_X_PERCENT_FORWARD = -30;
const IOS_EXIT_TO_X_PERCENT_BACKWARD = 100;
const IOS_ENTER_FROM_X_PERCENT_BACKWARD = -30;
const IOS_EXIT_DIM_OPACITY = 0.72;
const IOS_SHADOW_VALUE = '-14px 0 24px rgba(0, 0, 0, 0.16)';
const VERTICAL_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const IOS_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const ANIMATION_COMPLETION_GRACE_MS = 120;

const clearLayerStyles = (element: HTMLElement | null) => {
  if (!element) return;
  element.style.removeProperty('transform');
  element.style.removeProperty('opacity');
  element.style.removeProperty('visibility');
  element.style.removeProperty('box-shadow');
};

const animateLayer = (
  element: HTMLElement | null,
  keyframes: Keyframe[],
  duration: number,
  easing: string
): Animation | null => {
  if (!element || typeof element.animate !== 'function') return null;
  return element.animate(keyframes, {
    duration,
    easing,
    fill: 'both',
  });
};

type Layer = {
  key: string;
  location: Location;
  status: LayerStatus;
};

type TransitionDirection = 'forward' | 'backward';

type TransitionVariant = 'vertical' | 'ios' | 'none';

const getLocationLayerKey = (location: Location) =>
  `${location.key}:${location.pathname}${location.search}`;

export function PageTransition({
  render,
  getRouteOrder,
  getTransitionVariant,
  scrollContainerRef,
}: PageTransitionProps) {
  const location = useLocation();
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const currentLayerRef = useRef<HTMLDivElement>(null);
  const exitingLayerRef = useRef<HTMLDivElement>(null);
  const transitionDirectionRef = useRef<TransitionDirection>('forward');
  const transitionVariantRef = useRef<TransitionVariant>('vertical');
  const exitScrollOffsetRef = useRef(0);
  const enterScrollOffsetRef = useRef(0);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const nextLayersRef = useRef<Layer[] | null>(null);

  const [isAnimating, setIsAnimating] = useState(false);
  const [layers, setLayers] = useState<Layer[]>(() => [
    {
      key: getLocationLayerKey(location),
      location,
      status: 'current',
    },
  ]);
  const locationLayerKey = getLocationLayerKey(location);
  const currentLayer =
    layers.find((layer) => layer.status === 'current') ?? layers[layers.length - 1];
  const currentLayerKey = currentLayer?.key ?? locationLayerKey;
  const currentLayerPathname = currentLayer?.location.pathname;

  const resolveScrollContainer = useCallback(() => {
    if (scrollContainerRef?.current) return scrollContainerRef.current;
    if (typeof document === 'undefined') return null;
    return document.scrollingElement as HTMLElement | null;
  }, [scrollContainerRef]);

  useLayoutEffect(() => {
    if (isAnimating) return;
    // Same-screen query/hash updates are supplied directly to render below and need no animation.
    if (currentLayerPathname === location.pathname) return;
    if (locationLayerKey === currentLayerKey) return;
    const scrollContainer = resolveScrollContainer();
    const exitScrollOffset = scrollContainer?.scrollTop ?? 0;
    exitScrollOffsetRef.current = exitScrollOffset;
    scrollPositionsRef.current.set(currentLayerKey, exitScrollOffset);

    enterScrollOffsetRef.current = scrollPositionsRef.current.get(locationLayerKey) ?? 0;
    const resolveOrderIndex = (pathname?: string) => {
      if (!getRouteOrder || !pathname) return null;
      const index = getRouteOrder(pathname);
      return typeof index === 'number' && index >= 0 ? index : null;
    };
    const fromIndex = resolveOrderIndex(currentLayerPathname);
    const toIndex = resolveOrderIndex(location.pathname);
    const nextVariant: TransitionVariant = getTransitionVariant
      ? getTransitionVariant(currentLayerPathname ?? '', location.pathname)
      : 'vertical';

    let nextDirection: TransitionDirection =
      fromIndex === null || toIndex === null || fromIndex === toIndex
        ? 'forward'
        : toIndex > fromIndex
          ? 'forward'
          : 'backward';

    // When using iOS-style stacking, history POP within the same "section" can have equal route order.
    // In that case, prefer treating navigation to an existing layer as a backward (pop) transition.
    if (nextVariant === 'ios' && layers.some((layer) => layer.key === locationLayerKey)) {
      nextDirection = 'backward';
    }

    transitionDirectionRef.current = nextDirection;
    transitionVariantRef.current = nextVariant;

    const shouldSkipExitLayer = (() => {
      if (nextVariant !== 'ios' || nextDirection !== 'backward') return false;
      const normalizeSegments = (pathname: string) =>
        pathname
          .split('/')
          .filter(Boolean)
          .filter((segment) => segment.length > 0);
      const fromSegments = normalizeSegments(currentLayerPathname ?? '');
      const toSegments = normalizeSegments(location.pathname);
      if (!fromSegments.length || !toSegments.length) return false;
      return fromSegments[0] === toSegments[0] && toSegments.length === 1;
    })();

    setLayers((prev) => {
      const variant = transitionVariantRef.current;
      const direction = transitionDirectionRef.current;
      const previousCurrentIndex = prev.findIndex((layer) => layer.status === 'current');
      const resolvedCurrentIndex =
        previousCurrentIndex >= 0 ? previousCurrentIndex : prev.length - 1;
      const previousCurrent = prev[resolvedCurrentIndex];
      const previousStack: Layer[] = prev
        .filter((_, idx) => idx !== resolvedCurrentIndex)
        .map((layer): Layer => ({ ...layer, status: 'stacked' }));

      const nextCurrent: Layer = { key: locationLayerKey, location, status: 'current' };

      if (!previousCurrent) {
        nextLayersRef.current = [nextCurrent];
        return [nextCurrent];
      }

      if (variant === 'none') {
        nextLayersRef.current = null;
        return [nextCurrent];
      }

      if (variant === 'ios') {
        if (direction === 'forward') {
          const exitingLayer: Layer = { ...previousCurrent, status: 'exiting' };
          const stackedLayer: Layer = { ...previousCurrent, status: 'stacked' };

          nextLayersRef.current = [...previousStack, stackedLayer, nextCurrent];
          return [...previousStack, exitingLayer, nextCurrent];
        }

        const targetIndex = prev.findIndex((layer) => layer.key === locationLayerKey);
        if (targetIndex !== -1) {
          const targetStack: Layer[] = prev.slice(0, targetIndex + 1).map((layer, idx): Layer => {
            const isTarget = idx === targetIndex;
            return {
              ...layer,
              location: isTarget ? location : layer.location,
              status: isTarget ? 'current' : 'stacked',
            };
          });

          if (shouldSkipExitLayer) {
            nextLayersRef.current = targetStack;
            return targetStack;
          }

          const exitingLayer: Layer = { ...previousCurrent, status: 'exiting' };
          nextLayersRef.current = targetStack;
          return [...targetStack, exitingLayer];
        }
      }

      if (shouldSkipExitLayer) {
        nextLayersRef.current = [nextCurrent];
        return [nextCurrent];
      }

      const exitingLayer: Layer = { ...previousCurrent, status: 'exiting' };

      nextLayersRef.current = [nextCurrent];
      return [exitingLayer, nextCurrent];
    });
    if (nextVariant !== 'none') {
      setIsAnimating(true);
    }
  }, [
    isAnimating,
    location,
    locationLayerKey,
    currentLayerKey,
    currentLayerPathname,
    getRouteOrder,
    getTransitionVariant,
    resolveScrollContainer,
    layers,
  ]);

  // 使用浏览器原生 Web Animations API，把整页位移和透明度交给合成线程处理。
  // 同时设置兜底计时器，避免浏览器丢失 finished 回调后页面一直停留在过渡态。
  useLayoutEffect(() => {
    if (!isAnimating) return;

    if (!currentLayerRef.current) return;

    const currentLayerEl = currentLayerRef.current;
    const exitingLayerEl = exitingLayerRef.current;
    const transitionVariant = transitionVariantRef.current;

    clearLayerStyles(currentLayerEl);
    clearLayerStyles(exitingLayerEl);

    const scrollContainer = resolveScrollContainer();
    const exitScrollOffset = exitScrollOffsetRef.current;
    const enterScrollOffset = enterScrollOffsetRef.current;
    if (scrollContainer && exitScrollOffset !== enterScrollOffset) {
      scrollContainer.scrollTo({ top: enterScrollOffset, left: 0, behavior: 'auto' });
    }

    const transitionDirection = transitionDirectionRef.current;
    const isForward = transitionDirection === 'forward';
    const enterFromY = isForward ? VERTICAL_TRAVEL_DISTANCE : -VERTICAL_TRAVEL_DISTANCE;
    const exitToY = isForward ? -VERTICAL_TRAVEL_DISTANCE : VERTICAL_TRAVEL_DISTANCE;
    const exitBaseY = enterScrollOffset - exitScrollOffset;
    const activeAnimations: Animation[] = [];
    let cancelled = false;
    let completed = false;
    let completionTimer: number | null = null;
    const completeTransition = () => {
      if (completed) return;
      completed = true;

      if (completionTimer !== null) {
        window.clearTimeout(completionTimer);
        completionTimer = null;
      }

      const nextLayers = nextLayersRef.current;
      nextLayersRef.current = null;
      setLayers((prev) => nextLayers ?? prev.filter((layer) => layer.status !== 'exiting'));
      setIsAnimating(false);

      clearLayerStyles(currentLayerEl);
      clearLayerStyles(exitingLayerEl);
    };

    if (prefersReducedMotion) {
      completeTransition();
      return;
    }

    if (transitionVariant === 'ios') {
      const exitToXPercent = isForward
        ? IOS_EXIT_TO_X_PERCENT_FORWARD
        : IOS_EXIT_TO_X_PERCENT_BACKWARD;
      const enterFromXPercent = isForward
        ? IOS_ENTER_FROM_X_PERCENT
        : IOS_ENTER_FROM_X_PERCENT_BACKWARD;

      const topLayerEl = isForward ? currentLayerEl : exitingLayerEl;
      if (topLayerEl) {
        topLayerEl.style.boxShadow = IOS_SHADOW_VALUE;
      }

      if (exitingLayerEl) {
        const exitAnimation = animateLayer(
          exitingLayerEl,
          [
            {
              transform: `translate3d(0%, ${exitBaseY}px, 0)`,
              opacity: 1,
              visibility: 'visible',
            },
            {
              transform: `translate3d(${exitToXPercent}%, ${exitBaseY}px, 0)`,
              opacity: isForward ? IOS_EXIT_DIM_OPACITY : 1,
              visibility: 'visible',
            },
          ],
          IOS_TRANSITION_DURATION_MS,
          IOS_EASING
        );
        if (exitAnimation) activeAnimations.push(exitAnimation);
      }

      const enterAnimation = animateLayer(
        currentLayerEl,
        [
          {
            transform: `translate3d(${enterFromXPercent}%, 0, 0)`,
            opacity: 1,
            visibility: 'visible',
          },
          { transform: 'translate3d(0, 0, 0)', opacity: 1, visibility: 'visible' },
        ],
        IOS_TRANSITION_DURATION_MS,
        IOS_EASING
      );
      if (enterAnimation) activeAnimations.push(enterAnimation);
    } else {
      // Exit animation: fade out with slight movement (runs simultaneously)
      if (exitingLayerEl) {
        const exitAnimation = animateLayer(
          exitingLayerEl,
          [
            {
              transform: `translate3d(0, ${exitBaseY}px, 0)`,
              opacity: 1,
              visibility: 'visible',
            },
            {
              transform: `translate3d(0, ${exitBaseY + exitToY}px, 0)`,
              opacity: 0,
              visibility: 'visible',
            },
          ],
          VERTICAL_TRANSITION_DURATION_MS,
          VERTICAL_EASING
        );
        if (exitAnimation) activeAnimations.push(exitAnimation);
      }

      // Enter animation: fade in with slight movement (runs simultaneously)
      const enterAnimation = animateLayer(
        currentLayerEl,
        [
          {
            transform: `translate3d(0, ${enterFromY}px, 0)`,
            opacity: 0,
            visibility: 'visible',
          },
          { transform: 'translate3d(0, 0, 0)', opacity: 1, visibility: 'visible' },
        ],
        VERTICAL_TRANSITION_DURATION_MS,
        VERTICAL_EASING
      );
      if (enterAnimation) activeAnimations.push(enterAnimation);
    }

    if (!activeAnimations.length) {
      completeTransition();
    } else {
      const maxDuration =
        transitionVariant === 'ios' ? IOS_TRANSITION_DURATION_MS : VERTICAL_TRANSITION_DURATION_MS;
      completionTimer = window.setTimeout(
        completeTransition,
        maxDuration + ANIMATION_COMPLETION_GRACE_MS
      );

      void Promise.allSettled(activeAnimations.map((animation) => animation.finished)).then(() => {
        if (cancelled) return;
        completeTransition();
      });
    }

    return () => {
      cancelled = true;
      if (completionTimer !== null) {
        window.clearTimeout(completionTimer);
      }
      activeAnimations.forEach((animation) => animation.cancel());
    };
  }, [isAnimating, prefersReducedMotion, resolveScrollContainer]);

  return (
    <div className={`page-transition${isAnimating ? ' page-transition--animating' : ''}`}>
      {(() => {
        const currentIndex = layers.findIndex((layer) => layer.status === 'current');
        const resolvedCurrentIndex = currentIndex === -1 ? layers.length - 1 : currentIndex;
        const keepStackedIndex = layers
          .slice(0, resolvedCurrentIndex)
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .find(({ layer }) => layer.status === 'stacked')?.index;

        return layers.map((layer, index) => {
          const shouldKeepStacked = layer.status === 'stacked' && index === keepStackedIndex;
          const renderLocation =
            layer.status === 'current' && layer.location.pathname === location.pathname
              ? location
              : layer.location;
          return (
            <div
              key={layer.key}
              className={[
                'page-transition__layer',
                layer.status === 'exiting' ? 'page-transition__layer--exit' : '',
                layer.status === 'stacked' ? 'page-transition__layer--stacked' : '',
                shouldKeepStacked ? 'page-transition__layer--stacked-keep' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden={layer.status !== 'current'}
              inert={layer.status !== 'current'}
              ref={
                layer.status === 'exiting'
                  ? exitingLayerRef
                  : layer.status === 'current'
                    ? currentLayerRef
                    : undefined
              }
            >
              <PageTransitionLayerContext.Provider
                value={PAGE_TRANSITION_LAYER_CONTEXT_VALUES[layer.status]}
              >
                {render(renderLocation)}
              </PageTransitionLayerContext.Provider>
            </div>
          );
        });
      })()}
    </div>
  );
}
