import { Navigate, useRoutes, type Location } from 'react-router-dom';
import { lazyNamed, renderLazyPage } from '@/router/lazyRoute';
import {
  loadApiKeysPage,
  loadAiProvidersPage,
  loadAuthFilesPage,
  loadConfigPage,
  loadDashboardPage,
  loadLogsPage,
  loadOAuthPage,
  loadRequestLogsPage,
  loadSystemPage,
  loadUsagePage,
  loadPricingPage,
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
const LazyAuthFilesOAuthModelRulesPage = lazyNamed(
  () => import('@/pages/AuthFilesOAuthModelRulesPage'),
  'AuthFilesOAuthModelRulesPage'
);
const LazyOAuthPage = lazyNamed(loadOAuthPage, 'OAuthPage');
const LazyRequestLogsPage = lazyNamed(loadRequestLogsPage, 'RequestLogsPage');
const LazyUsagePage = lazyNamed(loadUsagePage, 'UsagePage');
const LazyPricingPage = lazyNamed(loadPricingPage, 'PricingPage');
const LazyConfigPage = lazyNamed(loadConfigPage, 'ConfigPage');
const LazyLogsPage = lazyNamed(loadLogsPage, 'LogsPage');
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
  {
    path: '/auth-files/oauth-model-rules',
    element: renderLazyPage(LazyAuthFilesOAuthModelRulesPage),
  },
  {
    path: '/auth-files/oauth-excluded',
    element: renderLazyPage(LazyAuthFilesOAuthModelRulesPage),
  },
  {
    path: '/auth-files/oauth-model-alias',
    element: renderLazyPage(LazyAuthFilesOAuthModelRulesPage),
  },
  { path: '/oauth', element: renderLazyPage(LazyOAuthPage) },
  { path: '/usage', element: renderLazyPage(LazyUsagePage) },
  { path: '/pricing', element: renderLazyPage(LazyPricingPage) },
  { path: '/request-logs', element: renderLazyPage(LazyRequestLogsPage) },
  { path: '/config', element: renderLazyPage(LazyConfigPage) },
  { path: '/logs', element: renderLazyPage(LazyLogsPage) },
  { path: '/system', element: renderLazyPage(LazySystemPage) },
  { path: '*', element: <Navigate to="/" replace /> },
];

export function MainRoutes({ location }: { location?: Location }) {
  return useRoutes(mainRoutes, location);
}
