import { useEffect } from 'react';
import { Outlet, RouterProvider, createHashRouter } from 'react-router-dom';
import { ProtectedRoute } from '@/router/ProtectedRoute';
import { fullScreenRouteFallback, lazyNamed, renderLazyPage } from '@/router/lazyRoute';
import { useLanguageStore, useThemeStore } from '@/stores';

const LazyLoginPage = lazyNamed(() => import('@/pages/LoginPage'), 'LoginPage');
const LazyMainLayout = lazyNamed(() => import('@/components/layout/MainLayout'), 'MainLayout');

function RootShell() {
  return <Outlet />;
}

const router = createHashRouter([
  {
    element: <RootShell />,
    children: [
      { path: '/login', element: renderLazyPage(LazyLoginPage, fullScreenRouteFallback) },
      {
        path: '/*',
        element: (
          <ProtectedRoute>
            {renderLazyPage(LazyMainLayout, fullScreenRouteFallback)}
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

function App() {
  const initializeTheme = useThemeStore((state) => state.initializeTheme);
  const language = useLanguageStore((state) => state.language);

  useEffect(() => {
    const cleanupTheme = initializeTheme();
    return cleanupTheme;
  }, [initializeTheme]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return <RouterProvider router={router} />;
}

export default App;
