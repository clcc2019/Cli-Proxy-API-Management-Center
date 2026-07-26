import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { providersApi } from '@/services/api';
import { useConfigStore, useNotificationStore } from '@/stores';
import type { OpenAICompatibilityConfig, ProviderKeyConfig } from '@/types';
import {
  buildOpenAICompatibilityConfigKey,
  findOpenAICompatibilityConfigIndex,
  findProviderKeyConfigIndex,
  buildProviderSwitchingKey,
  hasDisableAllModelsRule,
  sortToggleableProviderConfigs,
  type ProviderKind,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
} from '../utils';
import { getErrorMessage } from '@/utils/error';

type ConfigSection = 'codex-api-key' | 'claude-api-key';

const providerConfigSections: Record<ProviderKind, ConfigSection> = {
  codex: 'codex-api-key',
  claude: 'claude-api-key',
};

interface UseAiProviderConfigsOptions {
  t: TFunction;
}

export function useAiProviderConfigs({ t }: UseAiProviderConfigsOptions) {
  const showNotification = useNotificationStore((state) => state.showNotification);
  const configCodexApiKeys = useConfigStore((state) => state.config?.codexApiKeys);
  const configClaudeApiKeys = useConfigStore((state) => state.config?.claudeApiKeys);
  const configOpenAICompatibility = useConfigStore((state) => state.config?.openAICompatibility);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const isCacheValid = useConfigStore((state) => state.isCacheValid);

  const isMountedRef = useRef(false);
  const loadRequestVersionRef = useRef(0);
  const switchingKeysRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(() => !isCacheValid());
  const [error, setError] = useState('');
  const [codexConfigs, setCodexConfigs] = useState<ProviderKeyConfig[]>(() =>
    sortToggleableProviderConfigs(configCodexApiKeys || [])
  );
  const [claudeConfigs, setClaudeConfigs] = useState<ProviderKeyConfig[]>(() =>
    sortToggleableProviderConfigs(configClaudeApiKeys || [])
  );
  const [openAIConfigs, setOpenAIConfigs] = useState<OpenAICompatibilityConfig[]>(
    () => configOpenAICompatibility || []
  );
  const [switchingKeys, setSwitchingKeys] = useState<Set<string>>(() => new Set());

  const getConfigs = useCallback(
    (provider: ProviderKind) => (provider === 'codex' ? codexConfigs : claudeConfigs),
    [claudeConfigs, codexConfigs]
  );

  const commitConfigs = useCallback(
    (provider: ProviderKind, configs: ProviderKeyConfig[]) => {
      const next = sortToggleableProviderConfigs(configs);
      const section = providerConfigSections[provider];

      if (provider === 'codex') {
        setCodexConfigs(next);
      } else {
        setClaudeConfigs(next);
      }
      updateConfigValue(section, next);

      return next;
    },
    [updateConfigValue]
  );

  const commitOpenAIConfigs = useCallback(
    (configs: OpenAICompatibilityConfig[]) => {
      const next = [...configs];
      setOpenAIConfigs(next);
      updateConfigValue('openai-compatibility', next);
      return next;
    },
    [updateConfigValue]
  );

  const beginSwitching = useCallback((key: string) => {
    if (switchingKeysRef.current.size > 0) return false;
    loadRequestVersionRef.current += 1;
    const next = new Set([key]);
    switchingKeysRef.current = next;
    setSwitchingKeys(next);
    return true;
  }, []);

  const endSwitching = useCallback((key: string) => {
    if (!switchingKeysRef.current.has(key)) return;
    const next = new Set(switchingKeysRef.current);
    next.delete(key);
    switchingKeysRef.current = next;
    if (isMountedRef.current) setSwitchingKeys(next);
  }, []);

  const loadConfigs = useCallback(async () => {
    if (switchingKeysRef.current.size > 0) return;
    const requestVersion = (loadRequestVersionRef.current += 1);
    const hasValidCache = isCacheValid();
    if (!hasValidCache && isMountedRef.current) {
      setLoading(true);
    }
    if (isMountedRef.current) setError('');

    try {
      const [codex, claude, openAI] = await Promise.all([
        providersApi.getCodexConfigs(),
        providersApi.getClaudeConfigs(),
        providersApi.getOpenAICompatConfigs(),
      ]);
      if (!isMountedRef.current || requestVersion !== loadRequestVersionRef.current) return;
      const sortedCodex = sortToggleableProviderConfigs(codex);
      const sortedClaude = sortToggleableProviderConfigs(claude);
      setCodexConfigs(sortedCodex);
      setClaudeConfigs(sortedClaude);
      setOpenAIConfigs(openAI);
      updateConfigValue('codex-api-key', codex);
      updateConfigValue('claude-api-key', claude);
      updateConfigValue('openai-compatibility', openAI);
    } catch (err: unknown) {
      if (!isMountedRef.current || requestVersion !== loadRequestVersionRef.current) return;
      const message = getErrorMessage(err) || t('notification.refresh_failed');
      setError(message);
    } finally {
      if (isMountedRef.current && requestVersion === loadRequestVersionRef.current) {
        setLoading(false);
      }
    }
  }, [isCacheValid, t, updateConfigValue]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      loadRequestVersionRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  useEffect(() => {
    if (configCodexApiKeys) {
      setCodexConfigs(sortToggleableProviderConfigs(configCodexApiKeys));
    }
    if (configClaudeApiKeys) {
      setClaudeConfigs(sortToggleableProviderConfigs(configClaudeApiKeys));
    }
    if (configOpenAICompatibility) {
      setOpenAIConfigs(configOpenAICompatibility);
    }
  }, [configClaudeApiKeys, configCodexApiKeys, configOpenAICompatibility]);

  const setConfigEnabled = useCallback(
    async (provider: ProviderKind, index: number, enabled: boolean) => {
      const source = getConfigs(provider);
      const current = source[index];
      if (!current) return;

      const switchingKey = buildProviderSwitchingKey(provider, current);
      if (!beginSwitching(switchingKey)) return;

      const previousList = source;
      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);
      const nextItem: ProviderKeyConfig = { ...current, excludedModels: nextExcluded };
      const nextList = previousList.map((item) =>
        buildProviderSwitchingKey(provider, item) === switchingKey ? nextItem : item
      );

      const sortedNextList = commitConfigs(provider, nextList);

      try {
        if (provider === 'codex') {
          await providersApi.saveCodexConfigs(sortedNextList);
        } else {
          await providersApi.saveClaudeConfigs(sortedNextList);
        }
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        commitConfigs(provider, previousList);
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
    },
    [beginSwitching, commitConfigs, endSwitching, getConfigs, showNotification, t]
  );

  const setCodexPoolMode = useCallback(
    async (index: number, enabled: boolean) => {
      const current = codexConfigs[index];
      if (!current) return;

      const switchingKey = buildProviderSwitchingKey('codex', current);
      if (!beginSwitching(switchingKey)) return;

      const previousList = codexConfigs;
      const nextItem: ProviderKeyConfig = { ...current, poolMode: enabled };
      const nextList = previousList.map((item) =>
        buildProviderSwitchingKey('codex', item) === switchingKey ? nextItem : item
      );
      const sortedNextList = commitConfigs('codex', nextList);

      try {
        const latest = await providersApi.getCodexConfigs();
        const rawIndex = findProviderKeyConfigIndex(latest, current);
        if (rawIndex >= 0) {
          await providersApi.updateCodexConfig(rawIndex, { ...latest[rawIndex], poolMode: enabled });
        } else {
          await providersApi.saveCodexConfigs(sortedNextList);
        }
        const persisted = await providersApi.getCodexConfigs();
        commitConfigs('codex', persisted);
        showNotification(
          enabled
            ? t('notification.codex_pool_mode_enabled')
            : t('notification.codex_pool_mode_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        commitConfigs('codex', previousList);
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
    },
    [
      beginSwitching,
      codexConfigs,
      commitConfigs,
      endSwitching,
      showNotification,
      t,
    ]
  );

  const deleteProviderEntry = useCallback(
    async (provider: ProviderKind, index: number) => {
      const source = getConfigs(provider);
      const entry = source[index];
      if (!entry) return;
      const switchingKey = buildProviderSwitchingKey(provider, entry);
      if (!beginSwitching(switchingKey)) return;

      try {
        if (provider === 'codex') {
          await providersApi.deleteCodexConfig(entry.apiKey, entry.baseUrl);
        } else {
          await providersApi.deleteClaudeConfig(entry.apiKey, entry.baseUrl);
        }

        commitConfigs(
          provider,
          source.filter((_, idx) => idx !== index)
        );
        showNotification(
          t(
            provider === 'codex'
              ? 'notification.codex_config_deleted'
              : 'notification.claude_config_deleted'
          ),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
    },
    [beginSwitching, commitConfigs, endSwitching, getConfigs, showNotification, t]
  );

  const deleteOpenAICompatEntry = useCallback(
    async (index: number) => {
      const entry = openAIConfigs[index];
      if (!entry) return;
      const switchingKey = `openai:${buildOpenAICompatibilityConfigKey(entry, index)}`;
      if (!beginSwitching(switchingKey)) return;

      try {
        const latest = await providersApi.getOpenAICompatConfigs();
        const rawIndex = findOpenAICompatibilityConfigIndex(latest, entry);
        if (rawIndex >= 0) {
          await providersApi.deleteOpenAICompatConfig(rawIndex);
        }
        commitOpenAIConfigs(
          rawIndex >= 0 ? latest.filter((_, idx) => idx !== rawIndex) : latest
        );
        showNotification(t('notification.openai_provider_deleted'), 'success');
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        showNotification(`${t('notification.delete_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
    },
    [beginSwitching, commitOpenAIConfigs, endSwitching, openAIConfigs, showNotification, t]
  );

  const setOpenAICompatPoolMode = useCallback(
    async (index: number, enabled: boolean) => {
      const current = openAIConfigs[index];
      if (!current) return;

      const itemKey = buildOpenAICompatibilityConfigKey(current, index);
      const switchingKey = `openai:${itemKey}`;
      if (!beginSwitching(switchingKey)) return;

      const previousList = openAIConfigs;
      const nextItem: OpenAICompatibilityConfig = { ...current, poolMode: enabled };
      const nextList = previousList.map((item, idx) => (idx === index ? nextItem : item));
      commitOpenAIConfigs(nextList);

      try {
        await providersApi.saveOpenAICompatConfigs(nextList);
        showNotification(
          enabled
            ? t('notification.openai_pool_mode_enabled')
            : t('notification.openai_pool_mode_disabled'),
          'success'
        );
      } catch (err: unknown) {
        const message = getErrorMessage(err);
        commitOpenAIConfigs(previousList);
        showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
      } finally {
        endSwitching(switchingKey);
      }
    },
    [
      beginSwitching,
      commitOpenAIConfigs,
      endSwitching,
      openAIConfigs,
      showNotification,
      t,
    ]
  );

  const setOpenAICompatEnabled = useCallback(
    async (index: number, enabled: boolean) => {
      const current = openAIConfigs[index];
      if (!current) return;

      const switchingKey = `openai:${buildOpenAICompatibilityConfigKey(current, index)}`;
      if (!beginSwitching(switchingKey)) return;

      const previousList = openAIConfigs;
      const nextList = previousList.map((item, itemIndex) =>
        itemIndex === index ? { ...item, disabled: !enabled } : item
      );
      commitOpenAIConfigs(nextList);

      try {
        await providersApi.saveOpenAICompatConfigs(nextList);
        showNotification(
          enabled ? t('notification.config_enabled') : t('notification.config_disabled'),
          'success'
        );
      } catch (err: unknown) {
        commitOpenAIConfigs(previousList);
        showNotification(
          `${t('notification.update_failed')}: ${getErrorMessage(err)}`,
          'error'
        );
      } finally {
        endSwitching(switchingKey);
      }
    },
    [
      beginSwitching,
      commitOpenAIConfigs,
      endSwitching,
      openAIConfigs,
      showNotification,
      t,
    ]
  );

  const switchingByProvider = useMemo(() => {
    const codex = new Set<string>();
    const claude = new Set<string>();
    const openai = new Set<string>();

    switchingKeys.forEach((key) => {
      if (key.startsWith('codex:')) codex.add(key.slice('codex:'.length));
      else if (key.startsWith('claude:')) claude.add(key.slice('claude:'.length));
      else if (key.startsWith('openai:')) openai.add(key.slice('openai:'.length));
    });

    return { codex, claude, openai };
  }, [switchingKeys]);

  const providerSummary = useMemo(
    () => ({
      configured: codexConfigs.length + claudeConfigs.length + openAIConfigs.length,
      enabled:
        codexConfigs.filter((item) => !hasDisableAllModelsRule(item.excludedModels)).length +
        claudeConfigs.filter((item) => !hasDisableAllModelsRule(item.excludedModels)).length +
        openAIConfigs.filter((item) => !item.disabled).length,
    }),
    [claudeConfigs, codexConfigs, openAIConfigs]
  );

  return {
    codexConfigs,
    claudeConfigs,
    openAIConfigs,
    rawCodexConfigs: configCodexApiKeys,
    rawClaudeConfigs: configClaudeApiKeys,
    rawOpenAIConfigs: configOpenAICompatibility,
    loading,
    error,
    switchingByProvider,
    isSwitching: switchingKeys.size > 0,
    providerSummary,
    loadConfigs,
    deleteProviderEntry,
    deleteOpenAICompatEntry,
    setConfigEnabled,
    setCodexPoolMode,
    setOpenAICompatEnabled,
    setOpenAICompatPoolMode,
  };
}
