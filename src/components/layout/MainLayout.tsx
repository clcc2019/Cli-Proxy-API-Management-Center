import {
  ReactNode,
  SVGProps,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { PageTransition } from '@/components/common/PageTransition';
import { MainRoutes } from '@/router/MainRoutes';
import { preloadLikelyRoutes, preloadRoute } from '@/router/routeLoaders';
import {
  IconSidebarAuthFiles,
  IconSidebarConfig,
  IconSidebarDashboard,
  IconFileText,
  IconKey,
  IconSidebarLogs,
  IconSidebarOauth,
  IconSidebarProviders,
  IconSidebarSystem,
  IconSidebarUsage,
} from '@/components/ui/icons';
import { INLINE_LOGO_JPEG } from '@/assets/logoInline';
import { useAuthStore, useConfigStore, useLanguageStore, useNotificationStore } from '@/stores';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';
import { scheduleIdleTask } from '@/utils/scheduleIdleTask';

const sidebarIcons: Record<string, ReactNode> = {
  dashboard: <IconSidebarDashboard size={18} />,
  apiKeys: <IconKey size={18} />,
  aiProviders: <IconSidebarProviders size={18} />,
  authFiles: <IconSidebarAuthFiles size={18} />,
  oauth: <IconSidebarOauth size={18} />,
  usage: <IconSidebarUsage size={18} />,
  requestLogs: <IconFileText size={18} />,
  config: <IconSidebarConfig size={18} />,
  logs: <IconSidebarLogs size={18} />,
  system: <IconSidebarSystem size={18} />,
};

// Header action icons - smaller size for header buttons
const headerIconProps: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
  focusable: 'false',
};

const headerIcons = {
  refresh: (
    <svg {...headerIconProps}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  ),
  menu: (
    <svg {...headerIconProps}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  ),
  chevronLeft: (
    <svg {...headerIconProps}>
      <path d="m14 18-6-6 6-6" />
    </svg>
  ),
  chevronRight: (
    <svg {...headerIconProps}>
      <path d="m10 6 6 6-6 6" />
    </svg>
  ),
  language: (
    <svg {...headerIconProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  ),
  logout: (
    <svg {...headerIconProps}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
};

const AUTHENTICATED_ROUTE_PRELOAD_DELAY_MS = 5000;
const ROUTE_PRELOAD_IDLE_TIMEOUT_MS = 2000;
const NAVIGATION_PRELOAD_BUDGET_MS = 220;
const HEADER_MENU_ITEM_SELECTOR = '[role="menuitemradio"]:not(:disabled)';

type NetworkAwareNavigator = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

const shouldPreloadPrimaryRoutes = () => {
  if (typeof navigator === 'undefined') {
    return true;
  }

  const connection = (navigator as NetworkAwareNavigator).connection;
  if (!connection) {
    return true;
  }

  if (connection.saveData) {
    return false;
  }

  return connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
};

function scheduleAuthenticatedRoutePreload() {
  return scheduleIdleTask(
    () => {
      if (!shouldPreloadPrimaryRoutes()) {
        return;
      }
      void preloadLikelyRoutes();
    },
    {
      delayMs: AUTHENTICATED_ROUTE_PRELOAD_DELAY_MS,
      timeoutMs: ROUTE_PRELOAD_IDLE_TIMEOUT_MS,
    }
  );
}

const getHeaderMenuItems = (menu: HTMLDivElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>(HEADER_MENU_ITEM_SELECTOR) ?? []);

export function MainLayout() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const location = useLocation();
  const navigate = useNavigate();

  const apiBase = useAuthStore((state) => state.apiBase);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const logout = useAuthStore((state) => state.logout);

  const config = useConfigStore((state) => state.config);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);

  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const navigationIntentRef = useRef(0);

  const fullBrandName = 'CLI Proxy API Management Center';
  const abbrBrandName = t('title.abbr');
  const isLogsPage = location.pathname.startsWith('/logs');
  const isAuthFilesPage =
    location.pathname === '/auth-files' || location.pathname.startsWith('/auth-files/');

  // 将顶栏高度写入 CSS 变量，确保侧栏/内容区计算一致，防止滚动时抖动
  useLayoutEffect(() => {
    const updateHeaderHeight = () => {
      const height = headerRef.current?.offsetHeight;
      if (height) {
        document.documentElement.style.setProperty('--header-height', `${height}px`);
      }
    };

    updateHeaderHeight();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && headerRef.current
        ? new ResizeObserver(updateHeaderHeight)
        : null;
    if (resizeObserver && headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  // 将主内容区的中心点写入 CSS 变量，供底部浮层（配置面板操作栏、提供商导航）对齐到内容区
  useLayoutEffect(() => {
    const updateContentCenter = () => {
      const el = contentRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      document.documentElement.style.setProperty('--content-center-x', `${centerX}px`);
    };

    updateContentCenter();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' && contentRef.current
        ? new ResizeObserver(updateContentCenter)
        : null;

    if (resizeObserver && contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }

    window.addEventListener('resize', updateContentCenter);

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', updateContentCenter);
      document.documentElement.style.removeProperty('--content-center-x');
    };
  }, []);

  const focusHeaderMenuItem = useCallback((menu: HTMLDivElement | null, direction: 1 | -1) => {
    const items = getHeaderMenuItems(menu);
    if (items.length === 0) return;

    const activeIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex =
      activeIndex === -1 ? 0 : (activeIndex + direction + items.length) % items.length;
    items[nextIndex]?.focus();
  }, []);

  const handleHeaderMenuKeyDown = useCallback(
    (
      event: ReactKeyboardEvent<HTMLDivElement>,
      menu: HTMLDivElement | null,
      closeMenu: () => void
    ) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusHeaderMenuItem(menu, 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusHeaderMenuItem(menu, -1);
        return;
      }

      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const items = getHeaderMenuItems(menu);
        const index = event.key === 'Home' ? 0 : items.length - 1;
        items[index]?.focus();
      }
    },
    [focusHeaderMenuItem]
  );

  useEffect(() => {
    if (!languageMenuOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const items = getHeaderMenuItems(languageMenuRef.current);
      const selected = items.find((item) => item.getAttribute('aria-checked') === 'true');
      (selected ?? items[0])?.focus({ preventScroll: true });
    });

    const handlePointerDown = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLanguageMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [languageMenuOpen]);

  const toggleLanguageMenu = useCallback(() => {
    setLanguageMenuOpen((prev) => !prev);
  }, []);

  const handleLanguageSelect = useCallback(
    (nextLanguage: string) => {
      if (!isSupportedLanguage(nextLanguage)) {
        return;
      }
      setLanguage(nextLanguage);
      setLanguageMenuOpen(false);
    },
    [setLanguage]
  );

  useEffect(() => {
    fetchConfig().catch(() => {
      // ignore initial failure; login flow会提示
    });
  }, [fetchConfig]);

  useEffect(() => {
    if (connectionStatus !== 'connected') {
      return undefined;
    }
    return scheduleAuthenticatedRoutePreload();
  }, [connectionStatus]);

  const statusClass =
    connectionStatus === 'connected'
      ? 'success'
      : connectionStatus === 'connecting'
        ? 'warning'
        : connectionStatus === 'error'
          ? 'error'
          : 'muted';

  const navItems = useMemo(
    () => [
      { path: '/', label: t('nav.dashboard'), icon: sidebarIcons.dashboard },
      { path: '/config', label: t('nav.config_management'), icon: sidebarIcons.config },
      { path: '/api-keys', label: t('nav.api_keys'), icon: sidebarIcons.apiKeys },
      { path: '/ai-providers', label: t('nav.ai_providers'), icon: sidebarIcons.aiProviders },
      { path: '/auth-files', label: t('nav.auth_files'), icon: sidebarIcons.authFiles },
      {
        path: '/oauth',
        label: t('nav.oauth'),
        icon: sidebarIcons.oauth,
      },
      { path: '/usage', label: t('nav.usage_stats'), icon: sidebarIcons.usage },
      { path: '/request-logs', label: t('nav.request_logs'), icon: sidebarIcons.requestLogs },
      ...(config?.loggingToFile
        ? [{ path: '/logs', label: t('nav.logs'), icon: sidebarIcons.logs }]
        : []),
      { path: '/system', label: t('nav.system_info'), icon: sidebarIcons.system },
    ],
    [t, config?.loggingToFile]
  );

  const navOrder = useMemo(() => navItems.map((item) => item.path), [navItems]);

  const getRouteOrder = useCallback(
    (pathname: string) => {
      const trimmedPath =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      const normalizedPath = trimmedPath === '/dashboard' ? '/' : trimmedPath;

      const aiProvidersIndex = navOrder.indexOf('/ai-providers');
      if (aiProvidersIndex !== -1) {
        if (normalizedPath === '/ai-providers') return aiProvidersIndex;
        if (normalizedPath.startsWith('/ai-providers/')) {
          if (normalizedPath.startsWith('/ai-providers/codex')) return aiProvidersIndex + 0.1;
          if (normalizedPath.startsWith('/ai-providers/claude')) return aiProvidersIndex + 0.2;
          return aiProvidersIndex + 0.05;
        }
      }

      const authFilesIndex = navOrder.indexOf('/auth-files');
      if (authFilesIndex !== -1) {
        if (normalizedPath === '/auth-files') return authFilesIndex;
        if (normalizedPath.startsWith('/auth-files/')) {
          if (normalizedPath.startsWith('/auth-files/oauth-excluded')) return authFilesIndex + 0.1;
          if (normalizedPath.startsWith('/auth-files/oauth-model-alias'))
            return authFilesIndex + 0.2;
          return authFilesIndex + 0.05;
        }
      }

      const exactIndex = navOrder.indexOf(normalizedPath);
      if (exactIndex !== -1) return exactIndex;
      const nestedIndex = navOrder.findIndex(
        (path) => path !== '/' && normalizedPath.startsWith(`${path}/`)
      );
      return nestedIndex === -1 ? null : nestedIndex;
    },
    [navOrder]
  );

  const getTransitionVariant = useCallback((fromPathname: string, toPathname: string) => {
    const normalize = (pathname: string) => {
      const trimmed =
        pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
      return trimmed === '/dashboard' ? '/' : trimmed;
    };

    const from = normalize(fromPathname);
    const to = normalize(toPathname);
    const isAuthFiles = (pathname: string) =>
      pathname === '/auth-files' || pathname.startsWith('/auth-files/');
    const isAiProviders = (pathname: string) =>
      pathname === '/ai-providers' || pathname.startsWith('/ai-providers/');

    if (isAuthFiles(from) && isAuthFiles(to)) return 'ios';
    if (isAiProviders(from) && isAiProviders(to)) return 'none';
    return 'vertical';
  }, []);

  const handleRefreshAll = async () => {
    clearCache();
    const results = await Promise.allSettled([
      fetchConfig(undefined, true),
      // Auth files has a dedicated, potentially expensive refresh. The global refresh
      // already updates the shared configuration, so do not run that page action again.
      isAuthFilesPage ? Promise.resolve() : triggerHeaderRefresh(),
    ]);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected && rejected.status === 'rejected') {
      const reason = rejected.reason;
      const message =
        typeof reason === 'string' ? reason : reason instanceof Error ? reason.message : '';
      showNotification(
        `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
      return;
    }
    showNotification(t('notification.data_refreshed'), 'success');
  };

  const handleNavigationIntent = useCallback((path: string) => {
    void preloadRoute(path).catch(() => {
      // Route rendering still has a Suspense fallback if an intent preload fails.
    });
  }, []);

  const handleNavigationClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, path: string) => {
      setSidebarOpen(false);

      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      const intentId = navigationIntentRef.current + 1;
      navigationIntentRef.current = intentId;
      if (location.pathname === path || (path === '/' && location.pathname === '/dashboard')) {
        return;
      }

      // Give intent preloading a short head start so Suspense rarely flashes a full-page loader.
      // The budget keeps navigation responsive on slow or offline connections.
      void Promise.race([
        preloadRoute(path).catch(() => undefined),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, NAVIGATION_PRELOAD_BUDGET_MS);
        }),
      ]).then(() => {
        if (navigationIntentRef.current !== intentId) return;
        startTransition(() => navigate(path));
      });
    },
    [location.pathname, navigate]
  );

  return (
    <div className="app-shell">
      <header className="main-header" ref={headerRef}>
        <div className="left">
          <Button
            className="mobile-menu-btn"
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label={t('sidebar.toggle_mobile')}
            aria-expanded={sidebarOpen}
            aria-controls="main-sidebar"
          >
            {headerIcons.menu}
          </Button>
          <button
            type="button"
            className="sidebar-toggle-header"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-expanded={!sidebarCollapsed}
            aria-controls="main-sidebar"
            title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            {sidebarCollapsed ? headerIcons.chevronRight : headerIcons.chevronLeft}
          </button>
          <img src={INLINE_LOGO_JPEG} alt="" aria-hidden="true" className="brand-logo" />
          {sidebarCollapsed ? (
            <button
              type="button"
              className="brand-header collapsed"
              onClick={() => setSidebarCollapsed(false)}
              title={fullBrandName}
              aria-label={t('sidebar.expand')}
              aria-controls="main-sidebar"
              aria-expanded={false}
            >
              <span className="brand-full">{fullBrandName}</span>
              <span className="brand-abbr">{abbrBrandName}</span>
            </button>
          ) : (
            <div className="brand-header expanded">
              <span className="brand-full">{fullBrandName}</span>
              <span className="brand-abbr">{abbrBrandName}</span>
            </div>
          )}
        </div>

        <div className="right">
          <div className="connection">
            <span className={`status-badge ${statusClass}`}>
              {t(
                connectionStatus === 'connected'
                  ? 'common.connected_status'
                  : connectionStatus === 'connecting'
                    ? 'common.connecting_status'
                    : 'common.disconnected_status'
              )}
            </span>
            <span className="base">{apiBase || '-'}</span>
          </div>

          <div className="header-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshAll}
              title={t('header.refresh_all')}
              aria-label={t('header.refresh_all')}
            >
              {headerIcons.refresh}
            </Button>
            <div
              className={`language-menu ${languageMenuOpen ? 'open' : ''}`}
              ref={languageMenuRef}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleLanguageMenu}
                title={t('language.switch')}
                aria-label={t('language.switch')}
                aria-haspopup="menu"
                aria-expanded={languageMenuOpen}
              >
                {headerIcons.language}
              </Button>
              {languageMenuOpen && (
                <div
                  className="notification entering language-menu-popover"
                  role="menu"
                  aria-label={t('language.switch')}
                  onKeyDown={(event) =>
                    handleHeaderMenuKeyDown(event, languageMenuRef.current, () =>
                      setLanguageMenuOpen(false)
                    )
                  }
                >
                  {LANGUAGE_ORDER.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`language-menu-option ${language === lang ? 'active' : ''}`}
                      onClick={() => handleLanguageSelect(lang)}
                      role="menuitemradio"
                      aria-checked={language === lang}
                    >
                      <span>{t(LANGUAGE_LABEL_KEYS[lang])}</span>
                      {language === lang ? <span className="language-menu-check">✓</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              title={t('header.logout')}
              aria-label={t('header.logout')}
            >
              {headerIcons.logout}
            </Button>
          </div>
        </div>
      </header>

      <div className="main-body">
        <button
          type="button"
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
          aria-label={t('common.close')}
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside
          id="main-sidebar"
          className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
          aria-label={t('nav.navigation')}
        >
          <div className="nav-section">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={(event) => handleNavigationClick(event, item.path)}
                onPointerEnter={() => handleNavigationIntent(item.path)}
                onPointerDown={() => handleNavigationIntent(item.path)}
                onFocus={() => handleNavigationIntent(item.path)}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                {!sidebarCollapsed && <span className="nav-label">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        </aside>

        <div className={`content${isLogsPage ? ' content-logs' : ''}`} ref={contentRef}>
          <main className={`main-content${isLogsPage ? ' main-content-logs' : ''}`}>
            <PageTransition
              render={(location) => <MainRoutes location={location} />}
              getRouteOrder={getRouteOrder}
              getTransitionVariant={getTransitionVariant}
              scrollContainerRef={contentRef}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
