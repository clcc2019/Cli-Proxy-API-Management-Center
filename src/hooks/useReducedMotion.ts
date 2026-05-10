/**
 * 读取 `prefers-reduced-motion` 用户偏好。
 * 统一复用，避免在多个组件重复写 `useMediaQuery('(prefers-reduced-motion: reduce)')`
 * 导致每个组件都维护一份媒体查询监听。
 */

import { useMediaQuery } from './useMediaQuery';

export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
