import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiKeysCardEditor } from '@/components/config/VisualConfigEditorBlocks';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { apiKeysApi } from '@/services/api/apiKeys';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ClientApiKeyConfig } from '@/types/config';
import { makeClientId, type VisualApiKeyEntry } from '@/types/visualConfig';
import { hasClientApiKeyQuota, serializeClientApiKeyQuota } from '@/utils/clientApiKeyQuota';
import editorStyles from '@/components/config/VisualConfigEditor.module.scss';
import styles from './ConfigPage.module.scss';

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
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const clearConfigCache = useConfigStore((state) => state.clearCache);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [apiKeys, setApiKeys] = useState<VisualApiKeyEntry[]>([]);
  const [baselineApiKeys, setBaselineApiKeys] = useState<VisualApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isDirty = useMemo(
    () => fingerprintApiKeys(apiKeys) !== fingerprintApiKeys(baselineApiKeys),
    [apiKeys, baselineApiKeys]
  );
  const disableControls = connectionStatus !== 'connected';
  const restrictedCount = apiKeys.filter(
    (entry) => entry.allowedModels.length > 0 || entry.excludedModels.length > 0
  ).length;
  const quotaCount = apiKeys.filter((entry) => hasClientApiKeyQuota(entry.quota)).length;
  const disabledCount = apiKeys.filter((entry) => entry.disabled).length;

  useUnsavedChangesGuard({
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
    setLoading(true);
    setError('');
    try {
      const list = await apiKeysApi.list();
      const visualKeys = toVisualApiKeys(list);
      setApiKeys(visualKeys);
      setBaselineApiKeys(visualKeys);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('api_keys.load_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadApiKeys();
  }, [loadApiKeys]);

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
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('api_keys.title')}</h1>

        <div className={styles.pageMeta}>
          <div className={`${styles.statusBadge} ${statusClassName}`}>{statusText}</div>
          <div className={styles.tabBar}>
            <button
              type="button"
              className={styles.tabItem}
              onClick={handleReload}
              disabled={loading || saving}
            >
              {t('common.refresh')}
            </button>
            <button
              type="button"
              className={`${styles.tabItem} ${isDirty ? styles.tabActive : ''}`}
              onClick={() => void handleSave()}
              disabled={disableControls || loading || saving || !isDirty}
            >
              {saving ? t('config_management.status_saving') : t('common.save')}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.workspaceShell}>
        <div className={styles.content}>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div id="api-keys" className={editorStyles.sectionStack}>
            <div className={`${editorStyles.subsection} ${styles.apiKeysSummary}`}>
              <div className={editorStyles.subsectionHeader}>
                <h3 className={editorStyles.subsectionTitle}>
                  {t('api_keys.configured_count', { count: apiKeys.length })}
                </h3>
                <p className={editorStyles.subsectionDescription}>
                  {t('api_keys.restricted_count', {
                    count: restrictedCount,
                    restricted: restrictedCount,
                    quota: quotaCount,
                    disabled: disabledCount,
                  })}
                </p>
              </div>
            </div>
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
