import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ClaudeSection,
  CodexSection,
  ProviderNav,
  useProviderStats,
} from '@/components/providers';
import {
  hasDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '@/components/providers/utils';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useEventCallback } from '@/hooks/useEventCallback';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { ProviderKeyConfig } from '@/types';
import { indexUsageDetailsBySource } from '@/utils/usageIndex';
import styles from './AiProvidersPage.module.scss';

const getPriorityValue = (priority: number | null | undefined) =>
  Number.isFinite(priority) ? Number(priority) : 0;

const sortToggleableProviderConfigs = <
  T extends { priority?: number | null; excludedModels?: string[] },
>(
  items: T[]
) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftEnabled = !hasDisableAllModelsRule(left.item.excludedModels);
      const rightEnabled = !hasDisableAllModelsRule(right.item.excludedModels);
      if (leftEnabled !== rightEnabled) {
        return leftEnabled ? -1 : 1;
      }

      const priorityDiff =
        getPriorityValue(right.item.priority) - getPriorityValue(left.item.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return left.index - right.index;
    })
    .map(({ item }) => item);

const normalizeOptionalString = (value: string | null | undefined) => (value ?? '').trim();

const findProviderKeyConfigIndex = <
  T extends { apiKey: string; baseUrl?: string; prefix?: string },
>(
  items: T[],
  target: T
) => {
  const referenceIndex = items.indexOf(target);
  if (referenceIndex >= 0) return referenceIndex;

  const apiKey = normalizeOptionalString(target.apiKey);
  const baseUrl = normalizeOptionalString(target.baseUrl);
  const prefix = normalizeOptionalString(target.prefix);

  const exactIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.apiKey) === apiKey &&
      normalizeOptionalString(item.baseUrl) === baseUrl &&
      normalizeOptionalString(item.prefix) === prefix
  );
  if (exactIndex >= 0) return exactIndex;

  const apiAndUrlIndex = items.findIndex(
    (item) =>
      normalizeOptionalString(item.apiKey) === apiKey &&
      normalizeOptionalString(item.baseUrl) === baseUrl
  );
  if (apiAndUrlIndex >= 0) return apiAndUrlIndex;

  return items.findIndex((item) => normalizeOptionalString(item.apiKey) === apiKey);
};

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const configCodexApiKeys = useConfigStore((state) => state.config?.codexApiKeys);
  const configClaudeApiKeys = useConfigStore((state) => state.config?.claudeApiKeys);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const hasMounted = useRef(false);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(
    () => sortToggleableProviderConfigs(configCodexApiKeys || [])
  );
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>(
    () => sortToggleableProviderConfigs(configClaudeApiKeys || [])
  );
  const [switchingKeys, setSwitchingKeys] = useState<Set<string>>(() => new Set());

  const beginSwitching = useCallback((key: string) => {
    setSwitchingKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const endSwitching = useCallback((key: string) => {
    setSwitchingKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const disableControls = connectionStatus !== 'connected';
  const isSwitching = switchingKeys.size > 0;

  const switchingByProvider = useMemo(() => {
    const codex = new Set<string>();
    const claude = new Set<string>();
    switchingKeys.forEach((key) => {
      if (key.startsWith('codex:')) codex.add(key.slice('codex:'.length));
      else if (key.startsWith('claude:')) claude.add(key.slice('claude:'.length));
    });
    return { codex, claude };
  }, [switchingKeys]);

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useProviderStats({
    enabled: isCurrentLayer,
  });
  const usageDetailsBySource = useMemo(
    () => indexUsageDetailsBySource(usageDetails),
    [usageDetails]
  );

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return '';
  };

  const loadConfigs = useCallback(async () => {
    const hasValidCache = isCacheValid();
    if (!hasValidCache) {
      setLoading(true);
    }
    setError('');
    try {
      const data = await fetchConfig();
      setCodexConfigs(sortToggleableProviderConfigs(data?.codexApiKeys || []));
      setClaudeConfigs(sortToggleableProviderConfigs(data?.claudeApiKeys || []));
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [fetchConfig, isCacheValid, t]);

  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;
    loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadKeyStats().catch(() => {});
  }, [isCurrentLayer, loadKeyStats]);

  useEffect(() => {
    if (configCodexApiKeys) setCodexConfigs(sortToggleableProviderConfigs(configCodexApiKeys));
    if (configClaudeApiKeys) setClaudeConfigs(sortToggleableProviderConfigs(configClaudeApiKeys));
  }, [configCodexApiKeys, configClaudeApiKeys]);

  useHeaderRefresh(refreshKeyStats, isCurrentLayer);

  const openEditor = useCallback(
    (path: string) => {
      navigate(path, { state: { fromAiProviders: true } });
    },
    [navigate]
  );

  const openProviderKeyEditor = useCallback(
    (provider: 'codex' | 'claude', displayIndex: number) => {
      const displayItems = provider === 'codex' ? codexConfigs : claudeConfigs;
      const rawItems = provider === 'codex' ? configCodexApiKeys : configClaudeApiKeys;
      const current = displayItems[displayIndex];
      const rawIndex = current
        ? findProviderKeyConfigIndex(rawItems || displayItems, current)
        : -1;

      openEditor(`/ai-providers/${provider}/${rawIndex >= 0 ? rawIndex : displayIndex}`);
    },
    [claudeConfigs, codexConfigs, configClaudeApiKeys, configCodexApiKeys, openEditor]
  );

  const setConfigEnabled = async (
    provider: 'codex' | 'claude',
    index: number,
    enabled: boolean
  ) => {
    const source = provider === 'codex' ? codexConfigs : claudeConfigs;
    const current = source[index];
    if (!current) return;

    const switchingKey = `${provider}:${current.apiKey}:${current.baseUrl ?? ''}:${current.prefix ?? ''}`;
    if (switchingKeys.has(switchingKey)) return;
    beginSwitching(switchingKey);

    const previousList = source;
    const nextExcluded = enabled
      ? withoutDisableAllModelsRule(current.excludedModels)
      : withDisableAllModelsRule(current.excludedModels);
    const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
    const nextList = sortToggleableProviderConfigs(
      previousList.map((item) =>
        item.apiKey === current.apiKey &&
        (item.baseUrl ?? '') === (current.baseUrl ?? '') &&
        (item.prefix ?? '') === (current.prefix ?? '')
          ? nextItem
          : item
      )
    );

    if (provider === 'codex') {
      setCodexConfigs(nextList);
      updateConfigValue('codex-api-key', nextList);
      clearCache('codex-api-key');
    } else {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else {
        await providersApi.saveClaudeConfigs(nextList);
      }
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (provider === 'codex') {
        setCodexConfigs(previousList);
        updateConfigValue('codex-api-key', previousList);
        clearCache('codex-api-key');
      } else {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      endSwitching(switchingKey);
    }
  };

  const deleteProviderEntry = async (type: 'codex' | 'claude', index: number) => {
    const source = type === 'codex' ? codexConfigs : claudeConfigs;
    const entry = source[index];
    if (!entry) return;
    try {
      if (type === 'codex') {
        await providersApi.deleteCodexConfig(entry.apiKey, entry.baseUrl);
        const next = sortToggleableProviderConfigs(codexConfigs.filter((_, idx) => idx !== index));
        setCodexConfigs(next);
        updateConfigValue('codex-api-key', next);
        clearCache('codex-api-key');
        showNotification(t('notification.codex_config_deleted'), 'success');
      } else {
        await providersApi.deleteClaudeConfig(entry.apiKey, entry.baseUrl);
        const next = sortToggleableProviderConfigs(claudeConfigs.filter((_, idx) => idx !== index));
        setClaudeConfigs(next);
        updateConfigValue('claude-api-key', next);
        clearCache('claude-api-key');
        showNotification(t('notification.claude_config_deleted'), 'success');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
    }
  };

  const handleCodexAdd = useEventCallback(() => openEditor('/ai-providers/codex/new'));
  const handleCodexEdit = useEventCallback((index: number) =>
    openProviderKeyEditor('codex', index)
  );
  const handleCodexDelete = useEventCallback((index: number) => {
    void deleteProviderEntry('codex', index);
  });
  const handleCodexToggle = useEventCallback((index: number, enabled: boolean) => {
    void setConfigEnabled('codex', index, enabled);
  });

  const handleClaudeAdd = useEventCallback(() => openEditor('/ai-providers/claude/new'));
  const handleClaudeEdit = useEventCallback((index: number) =>
    openProviderKeyEditor('claude', index)
  );
  const handleClaudeDelete = useEventCallback((index: number) => {
    void deleteProviderEntry('claude', index);
  });
  const handleClaudeToggle = useEventCallback((index: number, enabled: boolean) => {
    void setConfigEnabled('claude', index, enabled);
  });

  return (
    <div className={styles.container}>
      <section className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{t('ai_providers.title')}</h1>
        <div className={styles.statusBadge}>
          {t(
            connectionStatus === 'connected'
              ? 'common.connected_status'
              : connectionStatus === 'connecting'
                ? 'common.connecting_status'
                : 'common.disconnected_status'
          )}
        </div>
      </section>

      <div className={styles.content}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        <div id="provider-codex" className={styles.providerSectionAnchor}>
          <CodexSection
            configs={codexConfigs}
            keyStats={keyStats}
            usageDetailsBySource={usageDetailsBySource}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            switchingItemKeys={switchingByProvider.codex}
            onAdd={handleCodexAdd}
            onEdit={handleCodexEdit}
            onDelete={handleCodexDelete}
            onToggle={handleCodexToggle}
          />
        </div>

        <div id="provider-claude" className={styles.providerSectionAnchor}>
          <ClaudeSection
            configs={claudeConfigs}
            keyStats={keyStats}
            usageDetailsBySource={usageDetailsBySource}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            switchingItemKeys={switchingByProvider.claude}
            onAdd={handleClaudeAdd}
            onEdit={handleClaudeEdit}
            onDelete={handleClaudeDelete}
            onToggle={handleClaudeToggle}
          />
        </div>
      </div>

      <ProviderNav />
    </div>
  );
}
