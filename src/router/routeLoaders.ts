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
  { path: '/logs', loader: loadLogsPage },
  { path: '/system', loader: loadSystemPage },
];

// 登录后只在空闲期预热最常访问、体积较小的页面。图表、认证文件等重型页面
// 改为用户悬停/聚焦导航时按意图预加载，避免一次性解析全部路由造成主线程尖峰。
const IDLE_ROUTE_LOADERS: RouteLoader[] = [loadConfigPage, loadApiKeysPage];

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

export function preloadLikelyRoutes() {
  return Promise.allSettled(IDLE_ROUTE_LOADERS.map(preloadLoader)).then(() => undefined);
}

export {
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
};
