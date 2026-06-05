/**
 * Quota management page - coordinates the three quota sections.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { authFilesApi, configFileApi } from '@/services/api';
import type { AuthFilesListCodexSubscriptionMode } from '@/services/api/authFiles';
import {
  QuotaSection,
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  KIMI_CONFIG,
} from '@/components/quota';
import type { AuthFileItem } from '@/types';
import styles from './QuotaPage.module.scss';

export function QuotaPage() {
  const { t } = useTranslation();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const disableControls = connectionStatus !== 'connected';

  const loadConfig = useCallback(async () => {
    try {
      await configFileApi.fetchConfigYaml();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
      setError((prev) => prev || errorMessage);
    }
  }, [t]);

  const loadFiles = useCallback(
    async (codexSubscription: AuthFilesListCodexSubscriptionMode = 'cache', silent = false) => {
      if (!silent) {
        setLoading(true);
        setError('');
      }
      try {
        const data = await authFilesApi.list({ codexSubscription, summary: true });
        setFiles(data?.files || []);
      } catch (err: unknown) {
        if (silent) return;
        const errorMessage = err instanceof Error ? err.message : t('notification.refresh_failed');
        setError(errorMessage);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [t]
  );

  const applyAuthFileUpdates = useCallback(
    (updates: AuthFileItem[]) => {
      if (updates.length === 0) return;
      const updatesByName = updates.reduce<Map<string, AuthFileItem>>((map, file) => {
        const name = String(file.name ?? '').trim();
        if (name) map.set(name, file);
        return map;
      }, new Map());
      if (updatesByName.size === 0) return;
      setFiles((prev) =>
        prev.map((file) => {
          const updated = updatesByName.get(file.name);
          return updated ? { ...file, ...updated, name: file.name } : file;
        })
      );
      void loadFiles('cache', true);
    },
    [loadFiles]
  );

  const handleHeaderRefresh = useCallback(async () => {
    await Promise.all([loadConfig(), loadFiles('cache')]);
  }, [loadConfig, loadFiles]);

  useHeaderRefresh(handleHeaderRefresh);

  useEffect(() => {
    loadFiles();
    loadConfig();
  }, [loadFiles, loadConfig]);

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('quota_management.title')}</h1>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <QuotaSection
        config={CLAUDE_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onAuthFilesUpdated={applyAuthFileUpdates}
      />
      <QuotaSection
        config={CODEX_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onAuthFilesUpdated={applyAuthFileUpdates}
      />
      <QuotaSection
        config={KIMI_CONFIG}
        files={files}
        loading={loading}
        disabled={disableControls}
        onAuthFilesUpdated={applyAuthFileUpdates}
      />
    </div>
  );
}
