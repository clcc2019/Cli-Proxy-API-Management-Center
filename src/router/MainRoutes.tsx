import { Navigate, useRoutes, type Location } from 'react-router-dom';
import { lazyNamed, renderLazyPage } from '@/router/lazyRoute';
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
const LazyAiProvidersOpenAIEditPage = lazyNamed(
  () => import('@/pages/AiProvidersOpenAIEditPage'),
  'AiProvidersOpenAIEditPage'
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
  { path: '/ai-providers/openai/new', element: renderLazyPage(LazyAiProvidersOpenAIEditPage) },
  { path: '/ai-providers/openai/:index', element: renderLazyPage(LazyAiProvidersOpenAIEditPage) },
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
