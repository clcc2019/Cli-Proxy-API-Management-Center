import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { EmptyState } from '@/components/ui/EmptyState';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconDollarSign,
  IconSatellite,
  IconTrendingUp,
} from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import {
  derouterApi,
  type DeRouterAccount,
  type DeRouterContainer,
  type DeRouterEarnings,
} from '@/services/api/derouter';
import { useAuthStore } from '@/stores/useAuthStore';
import type { ApiError } from '@/types';
import { getErrorMessageOr } from '@/utils/error';
import styles from './DeRouterPage.module.scss';

const AUTO_REFRESH_INTERVAL_MS = 30_000;
const METRIC_ANIMATION_DURATION_MS = 240;
const EMPTY_CONTAINERS: DeRouterContainer[] = [];

type EndpointIssue = {
  status?: number;
  message: string;
};

type PageSnapshot = {
  containers: DeRouterContainer[];
  earnings: DeRouterEarnings | null;
  containersIssue: EndpointIssue | null;
  earningsIssue: EndpointIssue | null;
  updatedAt: Date;
};

type StatusTone = 'success' | 'warning' | 'danger' | 'muted';

const KNOWN_STATUSES = new Set([
  'running',
  'active',
  'online',
  'healthy',
  'ready',
  'connected',
  'pending',
  'authenticating',
  'starting',
  'initializing',
  'processing',
  'stopped',
  'inactive',
  'offline',
  'error',
  'failed',
  'banned',
  'expired',
  'unhealthy',
]);

const getIssue = (error: unknown, fallback: string): EndpointIssue => ({
  status: (error as ApiError | undefined)?.status,
  message: getErrorMessageOr(error, fallback),
});

const normalizeStatus = (status?: string) => status?.trim().toLowerCase() || 'unknown';

const getStatusTone = (status?: string): StatusTone => {
  const normalized = normalizeStatus(status);
  if (['running', 'active', 'online', 'healthy', 'ready', 'connected'].includes(normalized)) {
    return 'success';
  }
  if (
    ['pending', 'authenticating', 'starting', 'initializing', 'processing'].includes(normalized)
  ) {
    return 'warning';
  }
  if (['error', 'failed', 'banned', 'expired', 'unhealthy'].includes(normalized)) {
    return 'danger';
  }
  return 'muted';
};

const isActiveAccount = (account: DeRouterAccount) => {
  if (account.banned || account.expired) return false;
  return ['active', 'running', 'online', 'healthy', 'ready'].includes(
    normalizeStatus(account.status)
  );
};

const getStatusLabel = (status: string | undefined, t: TFunction) => {
  const normalized = normalizeStatus(status);
  return KNOWN_STATUSES.has(normalized)
    ? t(`derouter.status.${normalized}`)
    : status || t('derouter.status.unknown');
};

const getAuthModeLabel = (authMode: string | undefined, fallback: string) => {
  if (!authMode) return fallback;
  const labels: Record<string, string> = {
    codex: 'Codex',
    'claude-oauth': 'Claude OAuth',
    'claude-worker-jwt': 'Claude SessionKey',
    'api-key': 'API Key',
  };
  return labels[authMode.toLowerCase()] ?? authMode;
};

function MetricSkeleton() {
  return (
    <div className={styles.metricSkeleton} aria-hidden="true">
      <span />
      <strong />
      <small />
    </div>
  );
}

type AnimatedMetricValueProps = {
  value: number | null;
  format: (value: number) => string;
  reduceMotion: boolean;
};

function AnimatedMetricValue({ value, format, reduceMotion }: AnimatedMetricValueProps) {
  const [displayedValue, setDisplayedValue] = useState<number | null>(() =>
    value === null ? null : reduceMotion ? value : 0
  );
  const displayedValueRef = useRef(displayedValue ?? 0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (value === null) {
      displayedValueRef.current = 0;
      setDisplayedValue(null);
      return undefined;
    }

    if (reduceMotion || !Number.isFinite(value)) {
      displayedValueRef.current = value;
      setDisplayedValue(value);
      return undefined;
    }

    const startValue = displayedValueRef.current;
    const delta = value - startValue;
    if (Math.abs(delta) < Number.EPSILON) {
      setDisplayedValue(value);
      return undefined;
    }

    let startedAt: number | null = null;
    const renderFrame = (timestamp: number) => {
      startedAt ??= timestamp;
      const progress = Math.min((timestamp - startedAt) / METRIC_ANIMATION_DURATION_MS, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = startValue + delta * easedProgress;

      displayedValueRef.current = nextValue;
      setDisplayedValue(nextValue);

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(renderFrame);
      } else {
        displayedValueRef.current = value;
        animationFrameRef.current = null;
        setDisplayedValue(value);
      }
    };

    animationFrameRef.current = window.requestAnimationFrame(renderFrame);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [reduceMotion, value]);

  const finalText = value === null ? null : format(value);
  return (
    <strong className={styles.metricValue} aria-label={finalText ?? undefined}>
      <span className={styles.metricNumber} aria-hidden={finalText ? true : undefined}>
        {displayedValue === null ? '--' : format(displayedValue)}
      </span>
    </strong>
  );
}

function ContainerSkeleton() {
  return (
    <div className={styles.containerSkeleton} aria-hidden="true">
      <div className={styles.skeletonIdentity}>
        <span className={styles.skeletonIcon} />
        <div>
          <strong />
          <small />
        </div>
      </div>
      <div className={styles.skeletonCells}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function DeRouterPage() {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [refreshingData, setRefreshingData] = useState(false);
  const snapshotRef = useRef<PageSnapshot | null>(null);
  const requestVersionRef = useRef(0);
  const isCurrentLayerRef = useRef(isCurrentLayer);

  useLayoutEffect(() => {
    isCurrentLayerRef.current = isCurrentLayer;
  }, [isCurrentLayer]);

  const loadData = useCallback(
    async (silent = false) => {
      if (!isCurrentLayerRef.current || connectionStatus !== 'connected') return;
      const requestVersion = (requestVersionRef.current += 1);
      setRefreshingData(Boolean(snapshotRef.current) && !silent);

      const [containersResult, earningsResult] = await Promise.allSettled([
        derouterApi.getContainers(),
        derouterApi.getEarnings(),
      ]);

      if (requestVersionRef.current !== requestVersion || !isCurrentLayerRef.current) return;

      const nextContainersIssue =
        containersResult.status === 'rejected'
          ? getIssue(containersResult.reason, t('derouter.errors.containers'))
          : null;
      const nextEarningsIssue =
        earningsResult.status === 'rejected'
          ? getIssue(earningsResult.reason, t('derouter.errors.earnings'))
          : null;

      const current = snapshotRef.current;
      const nextSnapshot: PageSnapshot = {
        containers:
          containersResult.status === 'fulfilled'
            ? containersResult.value
            : (current?.containers ?? EMPTY_CONTAINERS),
        earnings:
          earningsResult.status === 'fulfilled'
            ? earningsResult.value
            : (current?.earnings ?? null),
        containersIssue: nextContainersIssue,
        earningsIssue: nextEarningsIssue,
        updatedAt: new Date(),
      };
      snapshotRef.current = nextSnapshot;
      setSnapshot(nextSnapshot);
      setRefreshingData(false);
    },
    [connectionStatus, t]
  );

  const terminalEndpointFailure = useMemo(() => {
    const issues = [snapshot?.containersIssue, snapshot?.earningsIssue].filter(
      (issue): issue is EndpointIssue => Boolean(issue)
    );
    return (
      issues.length === 2 && issues.every((issue) => [401, 404, 503].includes(issue.status ?? 0))
    );
  }, [snapshot]);

  useEffect(() => {
    requestVersionRef.current += 1;
    if (!isCurrentLayer) return undefined;

    if (connectionStatus !== 'connected') {
      return undefined;
    }

    const taskId = window.setTimeout(() => void loadData(), 0);
    return () => {
      window.clearTimeout(taskId);
      requestVersionRef.current += 1;
    };
  }, [connectionStatus, isCurrentLayer, loadData]);

  useHeaderRefresh(loadData, isCurrentLayer && connectionStatus === 'connected');
  useVisibleInterval(() => void loadData(true), AUTO_REFRESH_INTERVAL_MS, {
    enabled: isCurrentLayer && connectionStatus === 'connected' && !terminalEndpointFailure,
    minRefreshGapMs: AUTO_REFRESH_INTERVAL_MS / 2,
  });

  const containers = snapshot?.containers ?? EMPTY_CONTAINERS;
  const earnings = snapshot?.earnings;
  const loading = !snapshot && connectionStatus === 'connected' && !refreshingData;
  const refreshing = refreshingData && Boolean(snapshot) && !loading;
  const summary = useMemo(() => {
    let running = 0;
    let accounts = 0;
    let activeAccounts = 0;
    let totalTasks = 0;

    containers.forEach((container) => {
      if (normalizeStatus(container.status) === 'running') running += 1;
      accounts += container.accountCount ?? container.accounts.length;
      activeAccounts += container.accounts.filter(isActiveAccount).length;
      totalTasks += container.totalTasks ?? 0;
    });

    return { running, accounts, activeAccounts, totalTasks };
  }, [containers]);

  const endpointIssues = [snapshot?.containersIssue, snapshot?.earningsIssue].filter(
    (issue): issue is EndpointIssue => Boolean(issue)
  );
  const hasUnavailableConfig = endpointIssues.some((issue) => issue.status === 503);
  const hasUnsupportedBackend = endpointIssues.some((issue) => issue.status === 404);
  const totalFailure = endpointIssues.length === 2 && containers.length === 0 && !earnings;
  const updatedText = snapshot?.updatedAt
    ? new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(snapshot.updatedAt)
    : '';

  const formatMoney = useCallback(
    (value: number) =>
      new Intl.NumberFormat(i18n.language, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(value),
    [i18n.language]
  );

  const formatCount = useCallback(
    (value: number) => new Intl.NumberFormat(i18n.language).format(value),
    [i18n.language]
  );

  const handleRefresh = useCallback(() => void loadData(), [loadData]);
  const retryAction = (
    <RefreshButton
      variant="secondary"
      size="sm"
      onClick={handleRefresh}
      disabled={refreshing || connectionStatus !== 'connected'}
      loading={refreshing}
      label={t('common.refresh')}
      iconSize={15}
      className={styles.refreshButton}
    >
      {t('common.refresh')}
    </RefreshButton>
  );

  return (
    <div className={styles.page}>
      <ManagementPageHeader
        title={t('derouter.title')}
        description={t('derouter.description')}
        count={containers.length}
        countAriaLabel={t('derouter.container_count', { count: containers.length })}
        actions={
          <div className={styles.headerActions}>
            {updatedText && (
              <span className={styles.updatedAt} aria-live="polite">
                {t('derouter.updated_at', { time: updatedText })}
              </span>
            )}
            <RefreshButton
              variant="secondary"
              size="sm"
              className={styles.refreshButton}
              onClick={handleRefresh}
              disabled={refreshing || loading || connectionStatus !== 'connected'}
              loading={refreshing}
              label={t('common.refresh')}
              iconSize={15}
            >
              {t('common.refresh')}
            </RefreshButton>
          </div>
        }
      />

      {connectionStatus !== 'connected' && (
        <div className={styles.notice} data-tone="warning" role="status">
          <IconAlertTriangle size={17} />
          <div>
            <strong>{t('derouter.disconnected_title')}</strong>
            <span>{t('derouter.disconnected_description')}</span>
          </div>
        </div>
      )}

      {endpointIssues.length > 0 && !totalFailure && (
        <div className={styles.notice} data-tone="warning" role="status">
          <IconAlertTriangle size={17} />
          <div>
            <strong>{t('derouter.partial_title')}</strong>
            <span>{endpointIssues.map((issue) => issue.message).join(' · ')}</span>
          </div>
        </div>
      )}

      <section className={styles.metricsPanel} aria-label={t('derouter.metrics.label')}>
        {loading ? (
          Array.from({ length: 4 }, (_, index) => <MetricSkeleton key={index} />)
        ) : (
          <>
            <div className={styles.metricItem} data-tone="success">
              <span className={styles.metricIcon}>
                <IconDollarSign size={18} />
              </span>
              <span className={styles.metricLabel}>{t('derouter.metrics.today')}</span>
              <AnimatedMetricValue
                value={earnings ? earnings.today : null}
                format={formatMoney}
                reduceMotion={reduceMotion}
              />
              <span className={styles.metricHint}>
                {t('derouter.metrics.tasks', { count: earnings?.todayTasks ?? 0 })}
              </span>
            </div>
            <div className={styles.metricItem} data-tone="growth">
              <span className={styles.metricIcon}>
                <IconTrendingUp size={18} />
              </span>
              <span className={styles.metricLabel}>{t('derouter.metrics.week')}</span>
              <AnimatedMetricValue
                value={earnings ? earnings.week : null}
                format={formatMoney}
                reduceMotion={reduceMotion}
              />
              <span className={styles.metricHint}>
                {t('derouter.metrics.tasks', { count: earnings?.weekTasks ?? 0 })}
              </span>
            </div>
            <div className={styles.metricItem} data-tone="info">
              <span className={styles.metricIcon}>
                <IconDollarSign size={18} />
              </span>
              <span className={styles.metricLabel}>{t('derouter.metrics.all_time')}</span>
              <AnimatedMetricValue
                value={earnings ? earnings.allTime : null}
                format={formatMoney}
                reduceMotion={reduceMotion}
              />
              <span className={styles.metricHint}>
                {t('derouter.metrics.tasks', { count: earnings?.allTimeTasks ?? 0 })}
              </span>
            </div>
            <div className={styles.metricItem} data-tone="neutral">
              <span className={styles.metricIcon}>
                <IconSatellite size={18} />
              </span>
              <span className={styles.metricLabel}>{t('derouter.metrics.requests')}</span>
              <AnimatedMetricValue
                value={
                  earnings || containers.length > 0
                    ? (earnings?.requestsAll ?? summary.totalTasks)
                    : null
                }
                format={formatCount}
                reduceMotion={reduceMotion}
              />
              <span className={styles.metricHint}>
                {t('derouter.metrics.running', {
                  running: summary.running,
                  total: containers.length,
                })}
              </span>
            </div>
          </>
        )}
      </section>

      <section className={styles.containersPanel} aria-labelledby="derouter-containers-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.panelEyebrow}>{t('derouter.containers.eyebrow')}</span>
            <h2 id="derouter-containers-title">{t('derouter.containers.title')}</h2>
          </div>
          <div className={styles.panelSummary}>
            <span>
              <strong>{summary.running}</strong> {t('derouter.containers.running')}
            </span>
            <span>
              <strong>{summary.activeAccounts}</strong> / {summary.accounts}{' '}
              {t('derouter.containers.accounts')}
            </span>
          </div>
        </div>

        {loading ? (
          <div className={styles.containerList} aria-busy="true" aria-label={t('common.loading')}>
            {Array.from({ length: 3 }, (_, index) => (
              <ContainerSkeleton key={index} />
            ))}
          </div>
        ) : connectionStatus !== 'connected' ? (
          <EmptyState
            title={t('derouter.disconnected_title')}
            description={t('derouter.disconnected_description')}
          />
        ) : totalFailure ? (
          <EmptyState
            title={
              hasUnavailableConfig
                ? t('derouter.not_configured_title')
                : hasUnsupportedBackend
                  ? t('derouter.unsupported_title')
                  : t('derouter.load_failed_title')
            }
            description={
              hasUnavailableConfig
                ? t('derouter.not_configured_description')
                : hasUnsupportedBackend
                  ? t('derouter.unsupported_description')
                  : endpointIssues.map((issue) => issue.message).join(' · ')
            }
            action={retryAction}
          />
        ) : containers.length === 0 ? (
          <EmptyState
            title={t('derouter.empty_title')}
            description={t('derouter.empty_description')}
            action={retryAction}
          />
        ) : (
          <div className={styles.containerList} aria-live="polite">
            {containers.map((container) => {
              const tone = getStatusTone(container.status);
              const activeAccounts = container.accounts.filter(isActiveAccount).length;
              const accountCount = container.accountCount ?? container.accounts.length;
              const displayName = container.displayName || container.id.split('-')[0];

              return (
                <article className={styles.containerRow} key={container.id}>
                  <div className={styles.containerIdentity}>
                    <span className={styles.containerIcon} data-tone={tone}>
                      {tone === 'success' ? (
                        <IconCheckCircle2 size={18} />
                      ) : tone === 'danger' ? (
                        <IconAlertTriangle size={18} />
                      ) : (
                        <IconSatellite size={18} />
                      )}
                    </span>
                    <div className={styles.containerNameGroup}>
                      <div className={styles.containerNameRow}>
                        <h3>{displayName}</h3>
                        <span className={styles.statusBadge} data-tone={tone}>
                          <span aria-hidden="true" />
                          {getStatusLabel(container.status, t)}
                        </span>
                      </div>
                      <code title={container.id}>{container.id}</code>
                    </div>
                  </div>

                  <dl className={styles.containerFacts}>
                    <div>
                      <dt>{t('derouter.containers.auth_mode')}</dt>
                      <dd>{getAuthModeLabel(container.authMode, t('common.not_set'))}</dd>
                    </div>
                    <div>
                      <dt>{t('derouter.containers.region')}</dt>
                      <dd>{container.proxyRegion?.toUpperCase() || t('common.not_set')}</dd>
                    </div>
                    <div>
                      <dt>{t('derouter.containers.account_count')}</dt>
                      <dd>
                        {activeAccounts} / {accountCount}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('derouter.containers.tasks')}</dt>
                      <dd>{formatCount(container.totalTasks ?? 0)}</dd>
                    </div>
                    <div>
                      <dt>{t('derouter.containers.reputation')}</dt>
                      <dd>
                        {container.reputation === undefined
                          ? '--'
                          : formatCount(container.reputation)}
                      </dd>
                    </div>
                  </dl>

                  {container.accounts.length > 0 && (
                    <div className={styles.accountStrip}>
                      {container.accounts.map((account) => {
                        const accountStatus = account.banned
                          ? 'banned'
                          : account.expired
                            ? 'expired'
                            : account.status;
                        const accountTone: StatusTone = getStatusTone(accountStatus);
                        return (
                          <span className={styles.accountItem} key={account.id}>
                            <span
                              className={styles.accountDot}
                              data-tone={accountTone}
                              aria-hidden="true"
                            />
                            <span className={styles.accountName}>
                              {account.displayName || account.email || account.id.split('-')[0]}
                            </span>
                            {account.plan && <small>{account.plan}</small>}
                            <small className={styles.accountStatus} data-tone={accountTone}>
                              {getStatusLabel(accountStatus, t)}
                            </small>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
