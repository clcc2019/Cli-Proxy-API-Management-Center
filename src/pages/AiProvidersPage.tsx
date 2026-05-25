import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  AmpcodeSection,
  ClaudeSection,
  CodexSection,
  GeminiSection,
  OpenAISection,
  VertexSection,
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
import { ampcodeApi, providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore, useThemeStore } from '@/stores';
import type { GeminiKeyConfig, OpenAIProviderConfig, ProviderKeyConfig } from '@/types';
import { indexUsageDetailsBySource } from '@/utils/usageIndex';
import styles from './AiProvidersPage.module.scss';

const getPriorityValue = (priority: number | null | undefined) =>
  Number.isFinite(priority) ? Number(priority) : 0;

const sortByPriorityDesc = <T extends { priority?: number | null }>(items: T[]) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const priorityDiff =
        getPriorityValue(right.item.priority) - getPriorityValue(left.item.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return left.index - right.index;
    })
    .map(({ item }) => item);

const findOpenAIProviderIndex = (
  items: OpenAIProviderConfig[],
  target: OpenAIProviderConfig
) => {
  const exactIndex = items.findIndex(
    (item) => item.name === target.name && item.baseUrl === target.baseUrl
  );
  if (exactIndex >= 0) return exactIndex;
  return items.findIndex((item) => item.name === target.name);
};

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

const sortToggleableProviderConfigs = <T extends { priority?: number | null; excludedModels?: string[] }>(
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

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);

  const ampcodeConfig = useConfigStore((state) => state.config?.ampcode);
  const configGeminiApiKeys = useConfigStore((state) => state.config?.geminiApiKeys);
  const configCodexApiKeys = useConfigStore((state) => state.config?.codexApiKeys);
  const configClaudeApiKeys = useConfigStore((state) => state.config?.claudeApiKeys);
  const configVertexApiKeys = useConfigStore((state) => state.config?.vertexApiKeys);
  const configOpenaiCompatibility = useConfigStore((state) => state.config?.openaiCompatibility);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const hasMounted = useRef(false);
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');

  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyConfig[]>(
    () => sortToggleableProviderConfigs(configGeminiApiKeys || [])
  );
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(
    () => sortToggleableProviderConfigs(configCodexApiKeys || [])
  );
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>(
    () => sortToggleableProviderConfigs(configClaudeApiKeys || [])
  );
  const [vertexConfigs, setVertexConfigs] = useState<ProviderKeyConfig[]>(
    () => sortToggleableProviderConfigs(configVertexApiKeys || [])
  );
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProviderConfig[]>(
    () => sortByPriorityDesc(configOpenaiCompatibility || [])
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

  // 分类出每个 section 正在切换的 item key，使得：
  // 1. 保存某张卡片时，同 section 的其他卡片仍然可点击；
  // 2. 跨 section 完全互不影响；
  // 3. 同一张卡片在保存期间只禁用它自己，不会阻塞其他卡片。
  const switchingByProvider = useMemo(() => {
    const codex = new Set<string>();
    const gemini = new Set<string>();
    const claude = new Set<string>();
    const vertex = new Set<string>();
    const openai = new Set<string>();
    switchingKeys.forEach((key) => {
      if (key.startsWith('codex:')) codex.add(key.slice('codex:'.length));
      else if (key.startsWith('gemini:')) gemini.add(key.slice('gemini:'.length));
      else if (key.startsWith('claude:')) claude.add(key.slice('claude:'.length));
      else if (key.startsWith('vertex:')) vertex.add(key.slice('vertex:'.length));
      else if (key.startsWith('openai:')) openai.add(key.slice('openai:'.length));
    });
    return { codex, gemini, claude, vertex, openai };
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
      const [configResult, vertexResult, ampcodeResult] = await Promise.allSettled([
        fetchConfig(),
        providersApi.getVertexConfigs(),
        ampcodeApi.getAmpcode(),
      ]);

      if (configResult.status !== 'fulfilled') {
        throw configResult.reason;
      }

      const data = configResult.value;
      setGeminiKeys(sortToggleableProviderConfigs(data?.geminiApiKeys || []));
      setCodexConfigs(sortToggleableProviderConfigs(data?.codexApiKeys || []));
      setClaudeConfigs(sortToggleableProviderConfigs(data?.claudeApiKeys || []));
      setVertexConfigs(sortToggleableProviderConfigs(data?.vertexApiKeys || []));
      setOpenaiProviders(sortByPriorityDesc(data?.openaiCompatibility || []));

      if (vertexResult.status === 'fulfilled') {
        const sortedVertexConfigs = sortToggleableProviderConfigs(vertexResult.value || []);
        setVertexConfigs(sortedVertexConfigs);
        updateConfigValue('vertex-api-key', sortedVertexConfigs);
        clearCache('vertex-api-key');
      }

      if (ampcodeResult.status === 'fulfilled') {
        updateConfigValue('ampcode', ampcodeResult.value);
        clearCache('ampcode');
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [clearCache, fetchConfig, isCacheValid, t, updateConfigValue]);

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
    if (configGeminiApiKeys) setGeminiKeys(sortToggleableProviderConfigs(configGeminiApiKeys));
    if (configCodexApiKeys) setCodexConfigs(sortToggleableProviderConfigs(configCodexApiKeys));
    if (configClaudeApiKeys) setClaudeConfigs(sortToggleableProviderConfigs(configClaudeApiKeys));
    if (configVertexApiKeys) setVertexConfigs(sortToggleableProviderConfigs(configVertexApiKeys));
    if (configOpenaiCompatibility) setOpenaiProviders(sortByPriorityDesc(configOpenaiCompatibility));
  }, [
    configGeminiApiKeys,
    configCodexApiKeys,
    configClaudeApiKeys,
    configVertexApiKeys,
    configOpenaiCompatibility,
  ]);

  useHeaderRefresh(refreshKeyStats, isCurrentLayer);

  const openEditor = useCallback(
    (path: string) => {
      navigate(path, { state: { fromAiProviders: true } });
    },
    [navigate]
  );

  const openProviderKeyEditor = useCallback(
    (
      provider: 'gemini' | 'codex' | 'claude' | 'vertex',
      displayIndex: number
    ) => {
      const displayItems =
        provider === 'gemini'
          ? geminiKeys
          : provider === 'codex'
            ? codexConfigs
            : provider === 'claude'
              ? claudeConfigs
              : vertexConfigs;
      const rawItems =
        provider === 'gemini'
          ? configGeminiApiKeys
          : provider === 'codex'
            ? configCodexApiKeys
            : provider === 'claude'
              ? configClaudeApiKeys
              : configVertexApiKeys;
      const current = displayItems[displayIndex];
      const rawIndex = current
        ? findProviderKeyConfigIndex(rawItems || displayItems, current)
        : -1;

      openEditor(`/ai-providers/${provider}/${rawIndex >= 0 ? rawIndex : displayIndex}`);
    },
    [
      claudeConfigs,
      codexConfigs,
      configClaudeApiKeys,
      configCodexApiKeys,
      configGeminiApiKeys,
      configVertexApiKeys,
      geminiKeys,
      openEditor,
      vertexConfigs,
    ]
  );

  const deleteGemini = async (index: number) => {
    const entry = geminiKeys[index];
    if (!entry) return;
    try {
      await providersApi.deleteGeminiKey(entry.apiKey, entry.baseUrl);
      const next = sortToggleableProviderConfigs(geminiKeys.filter((_, idx) => idx !== index));
      setGeminiKeys(next);
      updateConfigValue('gemini-api-key', next);
      clearCache('gemini-api-key');
      showNotification(t('notification.gemini_key_deleted'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
    }
  };

  const setConfigEnabled = async (
    provider: 'gemini' | 'codex' | 'claude' | 'vertex',
    index: number,
    enabled: boolean
  ) => {
    if (provider === 'gemini') {
      const current = geminiKeys[index];
      if (!current) return;

      const switchingKey = `${provider}:${current.apiKey}:${current.baseUrl ?? ''}`;
      if (switchingKeys.has(switchingKey)) return;
      beginSwitching(switchingKey);

      const previousList = geminiKeys;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: GeminiKeyConfig = { ...current, excludedModels: nextExcluded };
      // 使用 key-based 定位，避免排序造成的 index 漂移
      const nextList = sortToggleableProviderConfigs(
        previousList.map((item) =>
          item.apiKey === current.apiKey &&
          (item.baseUrl ?? '') === (current.baseUrl ?? '')
            ? nextItem
            : item
        )
      );

      setGeminiKeys(nextList);
      updateConfigValue('gemini-api-key', nextList);
      clearCache('gemini-api-key');

      try {
        await providersApi.saveGeminiKeys(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        setGeminiKeys(previousList);
        updateConfigValue('gemini-api-key', previousList);
        clearCache('gemini-api-key');
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
      return;
    }

    const source =
      provider === 'codex'
        ? codexConfigs
        : provider === 'claude'
          ? claudeConfigs
          : vertexConfigs;
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
    } else if (provider === 'claude') {
      setClaudeConfigs(nextList);
      updateConfigValue('claude-api-key', nextList);
      clearCache('claude-api-key');
    } else {
      setVertexConfigs(nextList);
      updateConfigValue('vertex-api-key', nextList);
      clearCache('vertex-api-key');
    }

    try {
      if (provider === 'codex') {
        await providersApi.saveCodexConfigs(nextList);
      } else if (provider === 'claude') {
        await providersApi.saveClaudeConfigs(nextList);
      } else {
        await providersApi.saveVertexConfigs(nextList);
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
      } else if (provider === 'claude') {
        setClaudeConfigs(previousList);
        updateConfigValue('claude-api-key', previousList);
        clearCache('claude-api-key');
      } else {
        setVertexConfigs(previousList);
        updateConfigValue('vertex-api-key', previousList);
        clearCache('vertex-api-key');
      }
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      endSwitching(switchingKey);
    }
  };

  const setOpenAIProviderEnabled = async (index: number, enabled: boolean) => {
    const current = openaiProviders[index];
    if (!current) return;

    const switchingKey = `openai:${current.name}`;
    if (switchingKeys.has(switchingKey)) return;
    beginSwitching(switchingKey);

    const previousList = openaiProviders;
    const previousConfigList = configOpenaiCompatibility || previousList;
    const configIndex = findOpenAIProviderIndex(previousConfigList, current);
    const patchIndex = configIndex >= 0 ? configIndex : index;
    const nextItem: OpenAIProviderConfig = { ...current, disabled: !enabled };
    // 使用 name 匹配而不是 index，避免排序/增删导致错位
    const nextList = previousList.map((item) =>
      item.name === current.name && item.baseUrl === current.baseUrl ? nextItem : item
    );
    const nextConfigList =
      configIndex >= 0
        ? previousConfigList.map((item, idx) =>
            idx === configIndex ? { ...item, disabled: !enabled } : item
          )
        : nextList;

    setOpenaiProviders(nextList);
    updateConfigValue('openai-compatibility', nextConfigList);
    clearCache('openai-compatibility');

    try {
      await providersApi.updateOpenAIProviderDisabled(patchIndex, !enabled);
      showNotification(
        enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
        'success'
      );
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setOpenaiProviders(previousList);
      updateConfigValue('openai-compatibility', previousConfigList);
      clearCache('openai-compatibility');
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

  const deleteVertex = async (index: number) => {
    const entry = vertexConfigs[index];
    if (!entry) return;
    try {
      await providersApi.deleteVertexConfig(entry.apiKey, entry.baseUrl);
      const next = sortToggleableProviderConfigs(vertexConfigs.filter((_, idx) => idx !== index));
      setVertexConfigs(next);
      updateConfigValue('vertex-api-key', next);
      clearCache('vertex-api-key');
      showNotification(t('notification.vertex_config_deleted'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
    }
  };

  const deleteOpenai = async (index: number) => {
    const entry = openaiProviders[index];
    if (!entry) return;
    try {
      await providersApi.deleteOpenAIProvider(entry.name);
      const next = sortByPriorityDesc(openaiProviders.filter((_, idx) => idx !== index));
      setOpenaiProviders(next);
      updateConfigValue('openai-compatibility', next);
      clearCache('openai-compatibility');
      showNotification(t('notification.openai_provider_deleted'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
    }
  };

  // 使用 useEventCallback 让 handler 保持稳定引用（子组件被 memo 包裹，
  // 不希望因为父组件每次渲染就重建回调），同时始终读到最新的 state。
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

  const handleGeminiAdd = useEventCallback(() => openEditor('/ai-providers/gemini/new'));
  const handleGeminiEdit = useEventCallback((index: number) =>
    openProviderKeyEditor('gemini', index)
  );
  const handleGeminiDelete = useEventCallback((index: number) => {
    void deleteGemini(index);
  });
  const handleGeminiToggle = useEventCallback((index: number, enabled: boolean) => {
    void setConfigEnabled('gemini', index, enabled);
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

  const handleVertexAdd = useEventCallback(() => openEditor('/ai-providers/vertex/new'));
  const handleVertexEdit = useEventCallback((index: number) =>
    openProviderKeyEditor('vertex', index)
  );
  const handleVertexDelete = useEventCallback((index: number) => {
    void deleteVertex(index);
  });
  const handleVertexToggle = useEventCallback((index: number, enabled: boolean) => {
    void setConfigEnabled('vertex', index, enabled);
  });

  const handleAmpcodeEdit = useEventCallback(() => openEditor('/ai-providers/ampcode'));

  const handleOpenaiAdd = useEventCallback(() => openEditor('/ai-providers/openai/new'));
  const handleOpenaiEdit = useEventCallback((index: number) =>
    openEditor(`/ai-providers/openai/${index}`)
  );
  const handleOpenaiDelete = useEventCallback((index: number) => {
    void deleteOpenai(index);
  });
  const handleOpenaiToggle = useEventCallback((index: number, enabled: boolean) => {
    void setOpenAIProviderEnabled(index, enabled);
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

        <div id="provider-gemini" className={styles.providerSectionAnchor}>
          <GeminiSection
            configs={geminiKeys}
            keyStats={keyStats}
            usageDetailsBySource={usageDetailsBySource}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            switchingItemKeys={switchingByProvider.gemini}
            onAdd={handleGeminiAdd}
            onEdit={handleGeminiEdit}
            onDelete={handleGeminiDelete}
            onToggle={handleGeminiToggle}
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

        <div id="provider-vertex" className={styles.providerSectionAnchor}>
          <VertexSection
            configs={vertexConfigs}
            keyStats={keyStats}
            usageDetailsBySource={usageDetailsBySource}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            switchingItemKeys={switchingByProvider.vertex}
            onAdd={handleVertexAdd}
            onEdit={handleVertexEdit}
            onDelete={handleVertexDelete}
            onToggle={handleVertexToggle}
          />
        </div>

        <div id="provider-ampcode" className={styles.providerSectionAnchor}>
          <AmpcodeSection
            config={ampcodeConfig}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            onEdit={handleAmpcodeEdit}
          />
        </div>

        <div id="provider-openai" className={styles.providerSectionAnchor}>
          <OpenAISection
            configs={openaiProviders}
            keyStats={keyStats}
            usageDetailsBySource={usageDetailsBySource}
            loading={loading}
            disableControls={disableControls}
            isSwitching={isSwitching}
            switchingItemKeys={switchingByProvider.openai}
            resolvedTheme={resolvedTheme}
            onAdd={handleOpenaiAdd}
            onEdit={handleOpenaiEdit}
            onDelete={handleOpenaiDelete}
            onToggle={handleOpenaiToggle}
          />
        </div>
      </div>

      <ProviderNav />
    </div>
  );
}
