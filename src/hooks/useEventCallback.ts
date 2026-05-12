/**
 * useEventCallback
 *
 * 返回一个稳定的函数引用，同时在每次渲染时指向最新的 handler 实现，
 * 从而避免 `useCallback([])` 在闭包中捕获到旧的 state / props。
 *
 * 典型用途：把回调传给 `React.memo` 包裹的子组件时，既希望子组件不因
 * 回调引用变化而重新渲染，又希望回调内部能读到最新的外部状态。
 */

import { useCallback, useLayoutEffect, useRef } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEventCallback<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef<T>(fn);

  // 使用 useLayoutEffect 确保在 DOM 更新之前就同步最新的回调，
  // 避免事件处理过程中读到上一次渲染的 handler。
  useLayoutEffect(() => {
    ref.current = fn;
  });

  const stable = useCallback((...args: Parameters<T>): ReturnType<T> => {
    return ref.current(...args);
  }, []);

  return stable as T;
}

