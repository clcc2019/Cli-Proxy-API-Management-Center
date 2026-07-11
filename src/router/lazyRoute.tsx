import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { PageLoadFallback } from '@/components/common/PageLoadFallback';

export const defaultRouteFallback = <PageLoadFallback />;
export const fullScreenRouteFallback = <PageLoadFallback fullScreen />;

export function lazyNamed<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType };
  });
}

export function renderLazyPage(
  Component: ComponentType,
  fallback: ReactNode = defaultRouteFallback
) {
  return (
    <Suspense fallback={fallback}>
      <Component />
    </Suspense>
  );
}
