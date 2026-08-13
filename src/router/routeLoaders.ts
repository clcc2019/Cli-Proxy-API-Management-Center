const loadDashboardPage = () => import('@/pages/DashboardPage');
const loadApiKeysPage = () => import('@/pages/ApiKeysPage');
const loadAiProvidersPage = () => import('@/pages/AiProvidersPage');
const loadAuthFilesPage = () => import('@/pages/AuthFilesPage');
const loadOAuthPage = () => import('@/pages/OAuthPage');
const loadUsagePage = () => import('@/pages/UsagePage');
const loadConfigPage = () => import('@/pages/ConfigPage');
const loadLogsPage = () => import('@/pages/LogsPage');
const loadSystemPage = () => import('@/pages/SystemPage');
const loadRequestLogsPage = () => import('@/pages/RequestLogsPage');
const loadDeRouterPage = () => import('@/pages/DeRouterPage');

type RouteLoader = () => Promise<Record<string, unknown>>;

const ROUTE_LOADERS: Array<{ path: string; loader: RouteLoader }> = [
  { path: '/dashboard', loader: loadDashboardPage },
  { path: '/', loader: loadDashboardPage },
  { path: '/config', loader: loadConfigPage },
  { path: '/api-keys', loader: loadApiKeysPage },
  { path: '/ai-providers', loader: loadAiProvidersPage },
  { path: '/auth-files', loader: loadAuthFilesPage },
  { path: '/oauth', loader: loadOAuthPage },
  { path: '/usage', loader: loadUsagePage },
  { path: '/request-logs', loader: loadRequestLogsPage },
  { path: '/derouter', loader: loadDeRouterPage },
  { path: '/logs', loader: loadLogsPage },
  { path: '/system', loader: loadSystemPage },
];

const preloadRequests = new Map<RouteLoader, Promise<Record<string, unknown>>>();

const preloadLoader = (loader: RouteLoader): Promise<void> => {
  let request = preloadRequests.get(loader);
  if (!request) {
    request = loader().catch((error) => {
      preloadRequests.delete(loader);
      throw error;
    });
    preloadRequests.set(loader, request);
  }
  return request.then(() => undefined);
};

export function preloadRoute(pathname: string): Promise<void> {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const match = ROUTE_LOADERS.find(
    ({ path }) => normalized === path || (path !== '/' && normalized.startsWith(`${path}/`))
  );
  return match ? preloadLoader(match.loader) : Promise.resolve();
}

export {
  loadApiKeysPage,
  loadAiProvidersPage,
  loadAuthFilesPage,
  loadConfigPage,
  loadDashboardPage,
  loadDeRouterPage,
  loadLogsPage,
  loadOAuthPage,
  loadRequestLogsPage,
  loadSystemPage,
  loadUsagePage,
};
