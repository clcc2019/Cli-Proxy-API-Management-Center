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
import { IconButton } from '@/components/ui/IconButton';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { TokaMark } from '@/components/ui/TokaMark';
import { PageTransition } from '@/components/common/PageTransition';
import { MainRoutes } from '@/router/MainRoutes';
import { preloadRoute } from '@/router/routeLoaders';
import {
  IconSidebarAuthFiles,
  IconSidebarConfig,
  IconSidebarDashboard,
  IconFileText,
  IconKey,
  IconSidebarLogs,
  IconSidebarOauth,
  IconSidebarProviders,
  IconSidebarQuota,
  IconSidebarSystem,
  IconSidebarUsage,
} from '@/components/ui/icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useLanguageStore } from '@/stores/useLanguageStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';
import { isSupportedLanguage } from '@/utils/language';

const sidebarIcons: Record<string, ReactNode> = {
  dashboard: <IconSidebarDashboard size={18} />,
  apiKeys: <IconKey size={18} />,
  aiProviders: <IconSidebarProviders size={18} />,
  authFiles: <IconSidebarAuthFiles size={18} />,
  oauth: <IconSidebarOauth size={18} />,
  usage: <IconSidebarUsage size={18} />,
  requestLogs: <IconFileText size={18} />,
  derouter: <IconSidebarQuota size={18} />,
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
  menu: (
    <svg {...headerIconProps}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  ),
  close: (
    <svg {...headerIconProps}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
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

const NAVIGATION_PRELOAD_BUDGET_MS = 220;
const NAVIGATION_INTENT_DELAY_MS = 75;
const HEADER_MENU_ITEM_SELECTOR = '[role="menuitemradio"]:not(:disabled)';
const MOBILE_NAVIGATION_TOGGLE_ID = 'mobile-navigation-toggle';

type NetworkInformationLike = {
  effectiveType?: string;
  saveData?: boolean;
};

const shouldSkipIntentPreload = () => {
  if (typeof navigator === 'undefined') return false;
  const connection = (
    navigator as Navigator & {
      connection?: NetworkInformationLike;
    }
  ).connection;
  return (
    connection?.saveData === true ||
    connection?.effectiveType === '2g' ||
    connection?.effectiveType === 'slow-2g'
  );
};

const getHeaderMenuItems = (menu: HTMLDivElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLButtonElement>(HEADER_MENU_ITEM_SELECTOR) ?? []);

const getMobileNavigationToggle = () => {
  const element = document.getElementById(MOBILE_NAVIGATION_TOGGLE_ID);
  return element instanceof HTMLButtonElement ? element : null;
};

export function MainLayout() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const location = useLocation();
  const navigate = useNavigate();

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
  const [headerRefreshing, setHeaderRefreshing] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const navigationIntentRef = useRef(0);
  const navigationPreloadTimerRef = useRef<number | null>(null);

  const isLogsPage = location.pathname.startsWith('/logs');

  // Keep bottom overlays aligned with the content column. Header height is
  // intentionally CSS-owned so mobile safe areas can update without a JS
  // pixel value overriding orientation and browser-chrome changes.
  useLayoutEffect(() => {
    let frame: number | null = null;
    const updateLayoutMetrics = () => {
      const contentRect = contentRef.current?.getBoundingClientRect();
      const nextContentValue = contentRect ? `${contentRect.left + contentRect.width / 2}px` : null;

      if (
        nextContentValue &&
        document.documentElement.style.getPropertyValue('--content-center-x') !== nextContentValue
      ) {
        document.documentElement.style.setProperty('--content-center-x', nextContentValue);
      }
    };
    const scheduleLayoutMetricsUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateLayoutMetrics();
      });
    };

    updateLayoutMetrics();

    const contentResizeObserver =
      typeof ResizeObserver !== 'undefined' && contentRef.current
        ? new ResizeObserver(scheduleLayoutMetricsUpdate)
        : null;

    if (contentResizeObserver && contentRef.current) {
      contentResizeObserver.observe(contentRef.current);
    }
    window.addEventListener('resize', scheduleLayoutMetricsUpdate);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      contentResizeObserver?.disconnect();
      window.removeEventListener('resize', scheduleLayoutMetricsUpdate);
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
    if (!sidebarOpen) return;

    document.documentElement.classList.add('sidebar-open');
    document.body.classList.add('sidebar-open');
    const frame = window.requestAnimationFrame(() => {
      const currentLink = sidebarRef.current?.querySelector<HTMLAnchorElement>(
        '.nav-item[aria-current="page"], .nav-item.active'
      );
      const firstLink = sidebarRef.current?.querySelector<HTMLAnchorElement>('.nav-item');
      (currentLink ?? firstLink)?.focus({ preventScroll: true });
    });

    const handleSidebarKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSidebarOpen(false);
        window.requestAnimationFrame(() => {
          getMobileNavigationToggle()?.focus({ preventScroll: true });
        });
        return;
      }

      if (event.key !== 'Tab') return;

      const menuButton = getMobileNavigationToggle();
      const sidebarLinks = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLAnchorElement>('.sidebar-brand, .nav-item') ?? []
      );
      const firstLink = sidebarLinks[0];
      const lastLink = sidebarLinks[sidebarLinks.length - 1];
      if (!menuButton || !firstLink || !lastLink) return;

      const activeElement = document.activeElement;
      if (activeElement === menuButton) {
        event.preventDefault();
        (event.shiftKey ? lastLink : firstLink).focus();
        return;
      }
      if (event.shiftKey && activeElement === firstLink) {
        event.preventDefault();
        menuButton.focus();
        return;
      }
      if (!event.shiftKey && activeElement === lastLink) {
        event.preventDefault();
        menuButton.focus();
        return;
      }
      if (!sidebarRef.current?.contains(activeElement)) {
        event.preventDefault();
        firstLink.focus();
      }
    };

    document.addEventListener('keydown', handleSidebarKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleSidebarKeyDown);
      document.documentElement.classList.remove('sidebar-open');
      document.body.classList.remove('sidebar-open');
    };
  }, [sidebarOpen]);

  const statusClass =
    connectionStatus === 'connected'
      ? 'success'
      : connectionStatus === 'connecting'
        ? 'warning'
        : connectionStatus === 'error'
          ? 'error'
          : 'muted';

  const navGroups = useMemo(
    () => [
      {
        id: 'workspace',
        label: t('sidebar.groups.workspace'),
        items: [
          { path: '/', label: t('nav.dashboard'), icon: sidebarIcons.dashboard },
          { path: '/config', label: t('nav.config_management'), icon: sidebarIcons.config },
        ],
      },
      {
        id: 'gateway',
        label: t('sidebar.groups.gateway'),
        items: [
          { path: '/api-keys', label: t('nav.api_keys'), icon: sidebarIcons.apiKeys },
          { path: '/ai-providers', label: t('nav.ai_providers'), icon: sidebarIcons.aiProviders },
          { path: '/auth-files', label: t('nav.auth_files'), icon: sidebarIcons.authFiles },
          { path: '/oauth', label: t('nav.oauth'), icon: sidebarIcons.oauth },
        ],
      },
      {
        id: 'operations',
        label: t('sidebar.groups.operations'),
        items: [
          { path: '/usage', label: t('nav.usage_stats'), icon: sidebarIcons.usage },
          { path: '/request-logs', label: t('nav.request_logs'), icon: sidebarIcons.requestLogs },
          { path: '/derouter', label: t('nav.derouter'), icon: sidebarIcons.derouter },
          ...(config?.loggingToFile
            ? [{ path: '/logs', label: t('nav.logs'), icon: sidebarIcons.logs }]
            : []),
          { path: '/system', label: t('nav.system_info'), icon: sidebarIcons.system },
        ],
      },
    ],
    [t, config?.loggingToFile]
  );

  const navItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);

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
    if (headerRefreshing) return;

    setHeaderRefreshing(true);
    try {
      clearCache();
      const results = await Promise.allSettled([
        fetchConfig(undefined, true),
        triggerHeaderRefresh(),
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
    } finally {
      setHeaderRefreshing(false);
    }
  };

  const cancelNavigationIntent = useCallback(() => {
    if (navigationPreloadTimerRef.current === null) return;
    window.clearTimeout(navigationPreloadTimerRef.current);
    navigationPreloadTimerRef.current = null;
  }, []);

  const handleNavigationIntent = useCallback(
    (path: string) => {
      cancelNavigationIntent();
      if (shouldSkipIntentPreload()) return;

      navigationPreloadTimerRef.current = window.setTimeout(() => {
        navigationPreloadTimerRef.current = null;
        void preloadRoute(path).catch(() => {
          // Route rendering still has a Suspense fallback if an intent preload fails.
        });
      }, NAVIGATION_INTENT_DELAY_MS);
    },
    [cancelNavigationIntent]
  );

  useEffect(() => cancelNavigationIntent, [cancelNavigationIntent]);

  const handleNavigationClick = useCallback(
    (event: ReactMouseEvent<HTMLAnchorElement>, path: string) => {
      cancelNavigationIntent();
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
    [cancelNavigationIntent, location.pathname, navigate]
  );

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="top-gradient-blur" aria-hidden="true" />

      <header className="main-header">
        <IconButton
          className="sidebar-toggle-floating"
          variant="secondary"
          size="sm"
          icon={sidebarCollapsed ? headerIcons.chevronRight : headerIcons.chevronLeft}
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-expanded={!sidebarCollapsed}
          aria-controls="main-sidebar"
          title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        />

        <div className="mobile-sidebar-actions">
          <IconButton
            id={MOBILE_NAVIGATION_TOGGLE_ID}
            className="mobile-menu-btn"
            variant="ghost"
            size="sm"
            icon={sidebarOpen ? headerIcons.close : headerIcons.menu}
            onClick={() => {
              setLanguageMenuOpen(false);
              setSidebarOpen((prev) => !prev);
            }}
            aria-label={sidebarOpen ? t('common.close') : t('sidebar.toggle_mobile')}
            aria-expanded={sidebarOpen}
            aria-controls="main-sidebar"
          />
        </div>

        <div className="header-actions floating-actions">
          <div
            className="connection"
            role="status"
            aria-label={t(
              connectionStatus === 'connected'
                ? 'common.connected_status'
                : connectionStatus === 'connecting'
                  ? 'common.connecting_status'
                  : 'common.disconnected_status'
            )}
          >
            <span className={`status-badge ${statusClass}`}>
              <span className="status-label">
                {t(
                  connectionStatus === 'connected'
                    ? 'common.connected_status'
                    : connectionStatus === 'connecting'
                      ? 'common.connecting_status'
                      : 'common.disconnected_status'
                )}
              </span>
            </span>
          </div>

          <RefreshButton
            variant="ghost"
            size="sm"
            className="icon-button"
            onClick={handleRefreshAll}
            loading={headerRefreshing}
            label={t('header.refresh_all')}
            iconSize={16}
          />
          <div className={`language-menu ${languageMenuOpen ? 'open' : ''}`} ref={languageMenuRef}>
            <IconButton
              variant="ghost"
              size="sm"
              icon={headerIcons.language}
              onClick={toggleLanguageMenu}
              title={t('language.switch')}
              aria-label={t('language.switch')}
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
            />
            {languageMenuOpen && (
              <div
                className="language-menu-popover"
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
          <IconButton
            variant="ghost"
            size="sm"
            icon={headerIcons.logout}
            onClick={logout}
            title={t('header.logout')}
            aria-label={t('header.logout')}
          />
        </div>
      </header>

      <div className="main-body">
        <button
          type="button"
          className={`sidebar-backdrop ${sidebarOpen ? 'visible' : ''}`}
          onClick={() => {
            setSidebarOpen(false);
            window.requestAnimationFrame(() => {
              getMobileNavigationToggle()?.focus({ preventScroll: true });
            });
          }}
          aria-label={t('common.close')}
          aria-hidden={!sidebarOpen}
          tabIndex={sidebarOpen ? 0 : -1}
        />

        <aside
          ref={sidebarRef}
          id="main-sidebar"
          className={`sidebar ${sidebarOpen ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}
        >
          <div className="sidebar-header">
            <NavLink
              to="/"
              className="sidebar-brand"
              onClick={(event) => handleNavigationClick(event, '/')}
              onPointerEnter={() => handleNavigationIntent('/')}
              onPointerLeave={cancelNavigationIntent}
              onFocus={() => handleNavigationIntent('/')}
              onBlur={cancelNavigationIntent}
              aria-label={t('title.main')}
              title={sidebarCollapsed ? t('title.main') : undefined}
            >
              <TokaMark className="sidebar-brand-mark" aria-hidden="true" />
              <span className="sidebar-brand-copy">
                <span className="sidebar-brand-name">{t('title.main')}</span>
                <span className="sidebar-brand-caption">{t('splash.subtitle')}</span>
              </span>
            </NavLink>
          </div>

          <nav className="nav-section" aria-label={t('nav.navigation')}>
            {navGroups.map((group) => (
              <div className="nav-group" role="group" aria-label={group.label} key={group.id}>
                <span className="nav-group-label" aria-hidden="true">
                  {group.label}
                </span>
                <div className="nav-group-items">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => {
                        const active =
                          isActive || (item.path === '/' && location.pathname === '/dashboard');
                        return `nav-item ${active ? 'active' : ''}`;
                      }}
                      aria-current={
                        item.path === '/' && location.pathname === '/dashboard' ? 'page' : undefined
                      }
                      onClick={(event) => handleNavigationClick(event, item.path)}
                      onPointerEnter={() => handleNavigationIntent(item.path)}
                      onPointerLeave={cancelNavigationIntent}
                      onFocus={() => handleNavigationIntent(item.path)}
                      onBlur={cancelNavigationIntent}
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                      <span className="nav-item-current" aria-hidden="true" />
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
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
