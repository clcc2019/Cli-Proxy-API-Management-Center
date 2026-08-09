import { Suspense, lazy, useEffect } from 'react';
import { Outlet, RouterProvider, createHashRouter } from 'react-router-dom';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { ProtectedRoute } from '@/router/ProtectedRoute';
import { fullScreenRouteFallback, lazyNamed, renderLazyPage } from '@/router/lazyRoute';
import { useLanguageStore } from '@/stores/useLanguageStore';

const LazyLoginPage = lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage');
const LazyMainLayout = lazyNamed(() => import('@/components/layout/MainLayout'), 'MainLayout');

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
    children: [
      { path: '/login', element: renderLazyPage(LazyLoginPage, fullScreenRouteFallback) },
      {
        path: '/*',
        element: (
          <ProtectedRoute>{renderLazyPage(LazyMainLayout, fullScreenRouteFallback)}</ProtectedRoute>
        ),
      },
    ],
  },
]);

function App() {
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <RouterProvider router={router} />;
}

export default App;
