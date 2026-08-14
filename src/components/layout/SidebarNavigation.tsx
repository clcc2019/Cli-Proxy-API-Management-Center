import { forwardRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui/IconButton';
import { TokaMark } from '@/components/ui/TokaMark';
import { IconChevronLeft } from '@/components/ui/icons';

export type SidebarNavigationItem = {
  path: string;
  label: string;
  icon: ReactNode;
};

export type SidebarNavigationGroup = {
  id: string;
  label: string;
  items: SidebarNavigationItem[];
};

type SidebarNavigationProps = {
  groups: SidebarNavigationGroup[];
  currentPathname: string;
  open: boolean;
  collapsed: boolean;
  brandName: string;
  navigationLabel: string;
  collapseLabel: string;
  expandLabel: string;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, path: string) => void;
  onNavigationIntent: (path: string) => void;
  onCancelNavigationIntent: () => void;
  onToggleCollapsed: () => void;
};

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return trimmed === '/dashboard' ? '/' : trimmed;
};

const isNavigationItemCurrent = (currentPathname: string, itemPath: string) => {
  const current = normalizePathname(currentPathname);
  if (itemPath === '/') return current === '/';
  return current === itemPath || current.startsWith(`${itemPath}/`);
};

export const SidebarNavigation = forwardRef<HTMLElement, SidebarNavigationProps>(
  function SidebarNavigation(
    {
      groups,
      currentPathname,
      open,
      collapsed,
      brandName,
      navigationLabel,
      collapseLabel,
      expandLabel,
      onNavigate,
      onNavigationIntent,
      onCancelNavigationIntent,
      onToggleCollapsed,
    },
    ref
  ) {
    const sidebarClassName = ['sidebar', open ? 'open' : '', collapsed ? 'collapsed' : '']
      .filter(Boolean)
      .join(' ');

    return (
      <aside ref={ref} id="main-sidebar" className={sidebarClassName} aria-label={navigationLabel}>
        <div className="sidebar-header">
          <Link
            to="/"
            className="sidebar-brand"
            onClick={(event) => onNavigate(event, '/')}
            onPointerEnter={() => onNavigationIntent('/')}
            onPointerLeave={onCancelNavigationIntent}
            onFocus={() => onNavigationIntent('/')}
            onBlur={onCancelNavigationIntent}
            aria-label={brandName}
            title={brandName}
          >
            <TokaMark className="sidebar-brand-mark" aria-hidden="true" />
            <span className="sidebar-brand-copy">
              <span className="sidebar-brand-name">{brandName}</span>
            </span>
          </Link>
        </div>

        <nav className="nav-section" aria-label={navigationLabel}>
          {groups.map((group) => {
            const labelId = `sidebar-group-${group.id}`;

            return (
              <div className="nav-group" role="group" aria-labelledby={labelId} key={group.id}>
                <span className="nav-group-label" id={labelId}>
                  {group.label}
                </span>
                <div className="nav-group-items">
                  {group.items.map((item) => {
                    const isCurrent = isNavigationItemCurrent(currentPathname, item.path);

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`nav-item ${isCurrent ? 'active' : ''}`}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={(event) => onNavigate(event, item.path)}
                        onPointerEnter={() => onNavigationIntent(item.path)}
                        onPointerLeave={onCancelNavigationIntent}
                        onFocus={() => onNavigationIntent(item.path)}
                        onBlur={onCancelNavigationIntent}
                        title={item.label}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="nav-label">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <IconButton
            className={`sidebar-collapse-button ${collapsed ? 'is-collapsed' : ''}`}
            variant="ghost"
            size="sm"
            icon={<IconChevronLeft size={18} />}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? expandLabel : collapseLabel}
            aria-expanded={!collapsed}
            aria-controls="main-sidebar"
          />
        </div>
      </aside>
    );
  }
);

SidebarNavigation.displayName = 'SidebarNavigation';
