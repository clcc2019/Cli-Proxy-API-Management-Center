import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { IconCheckCircle2, IconDollarSign, IconKey, IconShield } from '@/components/ui/icons';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { apiKeysApi } from '@/services/api/apiKeys';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ClientApiKeyConfig } from '@/types/config';
import { makeClientId, type VisualApiKeyEntry } from '@/types/visualConfig';
import { hasClientApiKeyQuota, serializeClientApiKeyQuota } from '@/utils/clientApiKeyQuota';
import styles from './ApiKeysPage.module.scss';

const normalizeModelPatterns = (patterns: string[] | undefined): string[] =>
  Array.from(new Set((patterns ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)));

const toVisualApiKeys = (keys: ClientApiKeyConfig[]): VisualApiKeyEntry[] =>
  keys.map((entry) => ({
    id: makeClientId(),
    apiKey: entry.apiKey,
    note: typeof entry.note === 'string' ? entry.note : '',
    disabled: Boolean(entry.disabled),
    allowedModels: normalizeModelPatterns(entry.allowedModels),
    excludedModels: normalizeModelPatterns(entry.excludedModels),
    ...(hasClientApiKeyQuota(entry.quota) ? { quota: entry.quota } : {}),
  }));

const toClientApiKeys = (keys: VisualApiKeyEntry[]): ClientApiKeyConfig[] =>
  keys
    .map((entry) => {
      const apiKey = entry.apiKey.trim();
      if (!apiKey) return null;

      const note = (entry.note ?? '').trim();
      const allowedModels = normalizeModelPatterns(entry.allowedModels);
      const excludedModels = normalizeModelPatterns(entry.excludedModels);
      const quota = serializeClientApiKeyQuota(entry.quota);
      return {
        apiKey,
        ...(note ? { note } : {}),
        ...(entry.disabled ? { disabled: true } : {}),
        ...(allowedModels.length ? { allowedModels } : {}),
        ...(excludedModels.length ? { excludedModels } : {}),
        ...(quota ? { quota } : {}),
      };
    })
    .filter(Boolean) as ClientApiKeyConfig[];

const fingerprintApiKeys = (keys: VisualApiKeyEntry[]): string =>
  JSON.stringify(toClientApiKeys(keys));

export function ApiKeysPage() {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [apiKeys, setApiKeys] = useState<VisualApiKeyEntry[]>([]);
  const [baselineApiKeys, setBaselineApiKeys] = useState<VisualApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const loadRequestVersionRef = useRef(0);
  const isCurrentLayerRef = useRef(isCurrentLayer);

  useLayoutEffect(() => {
    isCurrentLayerRef.current = isCurrentLayer;
  }, [isCurrentLayer]);

  const apiKeysFingerprint = useMemo(() => fingerprintApiKeys(apiKeys), [apiKeys]);
  const baselineApiKeysFingerprint = useMemo(
    () => fingerprintApiKeys(baselineApiKeys),
    [baselineApiKeys]
  );
  const isDirty = apiKeysFingerprint !== baselineApiKeysFingerprint;
  const disableControls = connectionStatus !== 'connected';
  const { restrictedCount, quotaCount, disabledCount } = useMemo(
    () =>
      apiKeys.reduce(
        (counts, entry) => {
          if (entry.allowedModels.length > 0 || entry.excludedModels.length > 0) {
            counts.restrictedCount += 1;
          }
          if (hasClientApiKeyQuota(entry.quota)) counts.quotaCount += 1;
          if (entry.disabled) counts.disabledCount += 1;
          return counts;
        },
        { restrictedCount: 0, quotaCount: 0, disabledCount: 0 }
      ),
    [apiKeys]
  );

  useUnsavedChangesGuard({
    enabled: isCurrentLayer,
    shouldBlock: isDirty && !saving,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const loadApiKeys = useCallback(async () => {
    if (!isCurrentLayerRef.current) return;

    const requestVersion = (loadRequestVersionRef.current += 1);
    setLoading(true);
    setError('');
    try {
      const list = await apiKeysApi.list();
      if (loadRequestVersionRef.current !== requestVersion || !isCurrentLayerRef.current) {
        return;
      }
      const visualKeys = toVisualApiKeys(list);
      setApiKeys(visualKeys);
      setBaselineApiKeys(visualKeys);
    } catch (err: unknown) {
      if (loadRequestVersionRef.current !== requestVersion || !isCurrentLayerRef.current) {
        return;
      }
      const message = err instanceof Error ? err.message : t('api_keys.load_failed');
      setError(message);
    } finally {
      if (loadRequestVersionRef.current === requestVersion && isCurrentLayerRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    loadRequestVersionRef.current += 1;
    if (!isCurrentLayer) return undefined;

    const taskId = window.setTimeout(() => {
      void loadApiKeys();
    }, 0);

    return () => window.clearTimeout(taskId);
  }, [isCurrentLayer, loadApiKeys]);

  const refreshConfigStore = useCallback(async () => {
    clearConfigCache();
    await fetchConfig(undefined, true);
  }, [clearConfigCache, fetchConfig]);

  const handleSave = useCallback(async () => {
    if (!isDirty || disableControls) return;

    setSaving(true);
    try {
      await apiKeysApi.replace(toClientApiKeys(apiKeys));
      await refreshConfigStore();

      const latest = toVisualApiKeys(await apiKeysApi.list());
      setApiKeys(latest);
      setBaselineApiKeys(latest);
      showNotification(t('api_keys.save_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.save_failed')}${message ? `: ${message}` : ''}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [apiKeys, disableControls, isDirty, refreshConfigStore, showNotification, t]);

  const handleReload = useCallback(() => {
    if (!isDirty) {
      void loadApiKeys();
      return;
    }

    showConfirmation({
      title: t('common.unsaved_changes_title'),
      message: t('api_keys.reload_confirm_message'),
      confirmText: t('common.refresh'),
      cancelText: t('common.cancel'),
      variant: 'danger',
      onConfirm: async () => {
        await loadApiKeys();
      },
    });
  }, [isDirty, loadApiKeys, showConfirmation, t]);

  const statusText = (() => {
    if (disableControls) return t('config_management.status_disconnected');
    if (loading) return t('config_management.status_loading');
    if (error) return t('config_management.status_load_failed');
    if (saving) return t('config_management.status_saving');
    if (isDirty) return t('config_management.status_dirty');
    return t('config_management.status_loaded');
  })();
  const statusClassName = error
    ? styles.error
    : isDirty
      ? styles.modified
      : !loading && !saving
        ? styles.saved
        : '';

  return (
    <div className={styles.container}>
      <ManagementPageHeader
        context={t('api_keys.page_eyebrow')}
        title={t('api_keys.title')}
        description={t('api_keys.page_description')}
        actions={
          <div className={styles.pageHeaderAside}>
            <div className={`${styles.statusBadge} ${statusClassName}`}>
              <span className={styles.statusDot} aria-hidden="true" />
              {statusText}
            </div>
            <div className={styles.tabBar}>
              <RefreshButton
                variant="ghost"
                size="sm"
                className={styles.tabItem}
                onClick={handleReload}
                disabled={loading || saving}
                loading={loading}
                label={t('common.refresh')}
                iconSize={15}
              >
                {t('common.refresh')}
              </RefreshButton>
              <button
                type="button"
                className={`${styles.tabItem} ${isDirty ? styles.tabActive : ''}`}
                onClick={() => void handleSave()}
                disabled={disableControls || loading || saving || !isDirty}
              >
                <IconCheckCircle2 size={15} aria-hidden="true" />
                {saving ? t('config_management.status_saving') : t('common.save')}
              </button>
            </div>
          </div>
        }
      />

      <div className={styles.workspaceShell}>
        <div className={styles.content}>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div id="api-keys" className={styles.pageContent}>
            <section className={styles.overviewPanel} aria-labelledby="api-keys-overview-title">
              <div className={styles.overviewCopy}>
                <span className={styles.sectionEyebrow}>{t('api_keys.page_eyebrow')}</span>
                <h2 id="api-keys-overview-title" className={styles.overviewTitle}>
                  {t('api_keys.section_title')}
                </h2>
                <p className={styles.overviewDescription}>{t('api_keys.section_description')}</p>
                <p className={styles.overviewMeta}>
                  {t('api_keys.restricted_count', {
                    restricted: restrictedCount,
                    quota: quotaCount,
                    disabled: disabledCount,
                  })}
                </p>
              </div>

              <div className={styles.metricGrid} aria-label={t('api_keys.metrics_label')}>
                <div className={styles.metricItem}>
                  <span
                    className={`${styles.metricIcon} ${styles.metricIconKey}`}
                    aria-hidden="true"
                  >
                    <IconKey size={17} />
                  </span>
                  <div>
                    <strong className={styles.metricValue}>{apiKeys.length}</strong>
                    <span className={styles.metricLabel}>{t('api_keys.metric_total')}</span>
                  </div>
                </div>
                <div className={styles.metricItem}>
                  <span
                    className={`${styles.metricIcon} ${styles.metricIconSuccess}`}
                    aria-hidden="true"
                  >
                    <IconCheckCircle2 size={17} />
                  </span>
                  <div>
                    <strong className={styles.metricValue}>{apiKeys.length - disabledCount}</strong>
                    <span className={styles.metricLabel}>{t('api_keys.metric_active')}</span>
                  </div>
                </div>
                <div className={styles.metricItem}>
                  <span
                    className={`${styles.metricIcon} ${styles.metricIconRules}`}
                    aria-hidden="true"
                  >
                    <IconShield size={17} />
                  </span>
                  <div>
                    <strong className={styles.metricValue}>{restrictedCount}</strong>
                    <span className={styles.metricLabel}>{t('api_keys.metric_restricted')}</span>
                  </div>
                </div>
                <div className={styles.metricItem}>
                  <span
                    className={`${styles.metricIcon} ${styles.metricIconQuota}`}
                    aria-hidden="true"
                  >
                    <IconDollarSign size={17} />
                  </span>
                  <div>
                    <strong className={styles.metricValue}>{quotaCount}</strong>
                    <span className={styles.metricLabel}>{t('api_keys.metric_quota')}</span>
                  </div>
                </div>
              </div>
            </section>

            <ApiKeysCardEditor
              value={apiKeys}
              disabled={disableControls || loading || saving}
              onChange={setApiKeys}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
