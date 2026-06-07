import { Suspense, lazy, type ComponentType } from 'react';
import { Navigate, useRoutes, type Location } from 'react-router-dom';
import { PageLoadFallback } from '@/components/common/PageLoadFallback';
import {
  loadApiKeysPage,
  loadAiProvidersPage,
  loadAuthFilesPage,
  loadConfigPage,
  loadDashboardPage,
  loadRequestLogsPage,
  loadSystemPage,
  loadUsagePage,
} from './routeLoaders';

function lazyNamed<TModule extends Record<string, unknown>>(
  loader: () => Promise<TModule>,
  exportName: keyof TModule
) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[exportName] as ComponentType };
  });
}

function renderLazyPage(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoadFallback />}>
      <Component />
    </Suspense>
  );
}

const LazyDashboardPage = lazyNamed(loadDashboardPage, 'DashboardPage');
const LazyApiKeysPage = lazyNamed(loadApiKeysPage, 'ApiKeysPage');
const LazyAiProvidersPage = lazyNamed(loadAiProvidersPage, 'AiProvidersPage');
const LazyAiProvidersClaudeEditLayout = lazyNamed(
  () => import('@/pages/AiProvidersClaudeEditLayout'),
  'AiProvidersClaudeEditLayout'
);
const LazyAiProvidersClaudeEditPage = lazyNamed(
  () => import('@/pages/AiProvidersClaudeEditPage'),
  'AiProvidersClaudeEditPage'
);
const LazyAiProvidersClaudeModelsPage = lazyNamed(
  () => import('@/pages/AiProvidersClaudeModelsPage'),
  'AiProvidersClaudeModelsPage'
);
const LazyAiProvidersCodexEditPage = lazyNamed(
  () => import('@/pages/AiProvidersCodexEditPage'),
  'AiProvidersCodexEditPage'
);
const LazyAuthFilesPage = lazyNamed(loadAuthFilesPage, 'AuthFilesPage');
const LazyAuthFilesOAuthExcludedEditPage = lazyNamed(
  () => import('@/pages/AuthFilesOAuthExcludedEditPage'),
  'AuthFilesOAuthExcludedEditPage'
);
const LazyAuthFilesOAuthModelAliasEditPage = lazyNamed(
  () => import('@/pages/AuthFilesOAuthModelAliasEditPage'),
  'AuthFilesOAuthModelAliasEditPage'
);
const LazyOAuthPage = lazyNamed(() => import('@/pages/OAuthPage'), 'OAuthPage');
const LazyRequestLogsPage = lazyNamed(loadRequestLogsPage, 'RequestLogsPage');
const LazyUsagePage = lazyNamed(loadUsagePage, 'UsagePage');
const LazyConfigPage = lazyNamed(loadConfigPage, 'ConfigPage');
const LazyLogsPage = lazyNamed(() => import('@/pages/LogsPage'), 'LogsPage');
const LazySystemPage = lazyNamed(loadSystemPage, 'SystemPage');

const mainRoutes = [
  { path: '/', element: renderLazyPage(LazyDashboardPage) },
  { path: '/dashboard', element: renderLazyPage(LazyDashboardPage) },
  { path: '/settings', element: <Navigate to="/config" replace /> },
  { path: '/api-keys', element: renderLazyPage(LazyApiKeysPage) },
  { path: '/ai-providers/codex/new', element: renderLazyPage(LazyAiProvidersCodexEditPage) },
  { path: '/ai-providers/codex/:index', element: renderLazyPage(LazyAiProvidersCodexEditPage) },
  {
    path: '/ai-providers/claude/new',
    element: renderLazyPage(LazyAiProvidersClaudeEditLayout),
    children: [
      { index: true, element: renderLazyPage(LazyAiProvidersClaudeEditPage) },
      { path: 'models', element: renderLazyPage(LazyAiProvidersClaudeModelsPage) },
    ],
  },
  {
    path: '/ai-providers/claude/:index',
    element: renderLazyPage(LazyAiProvidersClaudeEditLayout),
    children: [
      { index: true, element: renderLazyPage(LazyAiProvidersClaudeEditPage) },
      { path: 'models', element: renderLazyPage(LazyAiProvidersClaudeModelsPage) },
    ],
  },
  { path: '/ai-providers', element: renderLazyPage(LazyAiProvidersPage) },
  { path: '/ai-providers/*', element: renderLazyPage(LazyAiProvidersPage) },
  { path: '/auth-files', element: renderLazyPage(LazyAuthFilesPage) },
  { path: '/auth-files/oauth-excluded', element: renderLazyPage(LazyAuthFilesOAuthExcludedEditPage) },
  { path: '/auth-files/oauth-model-alias', element: renderLazyPage(LazyAuthFilesOAuthModelAliasEditPage) },
  { path: '/oauth', element: renderLazyPage(LazyOAuthPage) },
  { path: '/usage', element: renderLazyPage(LazyUsagePage) },
  { path: '/request-logs', element: renderLazyPage(LazyRequestLogsPage) },
  { path: '/config', element: renderLazyPage(LazyConfigPage) },
  { path: '/logs', element: renderLazyPage(LazyLogsPage) },
  { path: '/system', element: renderLazyPage(LazySystemPage) },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  return useRoutes(mainRoutes, location);
}
