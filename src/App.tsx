import { Suspense, lazy, useEffect } from 'react';
import { Outlet, RouterProvider, createHashRouter } from 'react-router-dom';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { RouteErrorFallback } from '@/components/common/RouteErrorFallback';
import { fullScreenRouteFallback, lazyNamed, renderLazyPage } from '@/router/lazyRoute';
import { useLanguageStore } from '@/stores/useLanguageStore';

const LazyLoginPage = lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage');
const LazyMainLayout = lazyNamed(() => import('@/components/layout/MainLayout'), 'MainLayout');
// The auth guard is only needed for the protected management shell. Keeping it
// behind the route boundary keeps the auth guard itself out of the entry graph;
// the login route and the management shell load their auth code when needed.
const LazyProtectedRoute = lazy(() =>
  import('@/router/ProtectedRoute').then(({ ProtectedRoute }) => ({ default: ProtectedRoute }))
);

// 懒加载：确认弹窗只在真正弹出时才需要，静态引入会把 Modal + Button
// 拉进入口 chunk（实测约 +21KB），首屏用不到。
const LazyConfirmationModal = lazy(() =>
  import('@/components/common/ConfirmationModal').then((m) => ({ default: m.ConfirmationModal }))
);

// 挂在路由内：未保存更改守卫由 router blocker 驱动，且弹窗需要 i18n 上下文。
function ConfirmationModalHost() {
  const isOpen = useNotificationStore((state) => state.confirmation.isOpen);
  if (!isOpen) return null;
  return (
    <Suspense fallback={null}>
      <LazyConfirmationModal />
    </Suspense>
  );
}

function RootShell() {
  return (
    <>
      <Outlet />
      <ConfirmationModalHost />
    </>
  );
}

const router = createHashRouter([
  {
    element: <RootShell />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: '/login', element: renderLazyPage(LazyLoginPage, fullScreenRouteFallback) },
      {
        path: '/*',
        element: (
          <Suspense fallback={fullScreenRouteFallback}>
            <LazyProtectedRoute>
              {renderLazyPage(LazyMainLayout, fullScreenRouteFallback)}
            </LazyProtectedRoute>
          </Suspense>
        ),
      },
    ],
  },
]);

function App() {
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    document.documentElement.lang = language === 'zh-CN' ? 'zh-Hans' : language;
  }, [language]);

  return <RouterProvider router={router} />;
}

export default App;
