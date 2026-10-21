import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { IconCheckCircle2 } from '@/components/ui/icons';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { apiKeysApi } from '@/services/api/apiKeys';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ClientApiKeyConfig } from '@/types/config';
import { makeClientId, type VisualApiKeyEntry } from '@/types/visualConfig';
import { hasClientApiKeyQuota, serializeClientApiKeyQuota } from '@/utils/clientApiKeyQuota';
import styles from './ApiKeysPage.module.scss';

const ApiKeysCardEditor = lazy(() =>
  import('@/components/config/VisualConfigEditorBlocks').then((module) => ({
    default: module.ApiKeysCardEditor,
  }))
);

const normalizeModelPatterns = (patterns: string[] | undefined): string[] =>
  Array.from(new Set((patterns ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)));

const normalizeAuthFiles = (files: string[] | undefined): string[] =>
  Array.from(new Set((files ?? []).map((item) => String(item ?? '').trim()).filter(Boolean)));

const toVisualApiKeys = (keys: ClientApiKeyConfig[]): VisualApiKeyEntry[] =>
  keys.map((entry) => ({
    id: makeClientId(),
    apiKey: entry.apiKey,
    note: typeof entry.note === 'string' ? entry.note : '',
    disabled: Boolean(entry.disabled),
    disableModelAlias: Boolean(entry.disableModelAlias),
    allowedModels: normalizeModelPatterns(entry.allowedModels),
    excludedModels: normalizeModelPatterns(entry.excludedModels),
    authFiles: normalizeAuthFiles(entry.authFiles),
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
      const authFiles = normalizeAuthFiles(entry.authFiles);
      const quota = serializeClientApiKeyQuota(entry.quota);
      return {
        apiKey,
        ...(note ? { note } : {}),
        ...(entry.disabled ? { disabled: true } : {}),
        ...(entry.disableModelAlias ? { disableModelAlias: true } : {}),
        ...(allowedModels.length ? { allowedModels } : {}),
        ...(excludedModels.length ? { excludedModels } : {}),
        ...(authFiles.length ? { authFiles } : {}),
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
    : disableControls
      ? styles.disconnected
      : isDirty
        ? styles.modified
        : !loading && !saving
          ? styles.saved
          : '';

  return (
    <div className={styles.container}>
      <ManagementPageHeader
        title={t('api_keys.title')}
        description={t('api_keys.page_description')}
        count={apiKeys.length}
        countAriaLabel={t('api_keys.configured_count', { count: apiKeys.length })}
        actions={
          <div className={styles.pageHeaderAside}>
            <div className={`${styles.statusBadge} ${statusClassName}`}>
              <span className={styles.statusDot} aria-hidden="true" />
              {statusText}
            </div>
            <RefreshButton
              variant="secondary"
              size="sm"
              className={styles.refreshButton}
              onClick={handleReload}
              disabled={loading || saving}
              loading={loading}
              label={t('common.refresh')}
              iconSize={15}
            >
              {t('common.refresh')}
            </RefreshButton>
            <Button
              size="sm"
              className={`${styles.saveButton} ${isDirty ? styles.saveButtonReady : ''}`}
              onClick={() => void handleSave()}
              disabled={disableControls || loading || saving || !isDirty}
            >
              <IconCheckCircle2 size={15} aria-hidden="true" />
              {saving ? t('config_management.status_saving') : t('common.save')}
            </Button>
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
            <Suspense fallback={<div className={styles.editorFallback} aria-hidden="true" />}>
              <ApiKeysCardEditor
                value={apiKeys}
                disabled={disableControls || loading || saving}
                onChange={setApiKeys}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
