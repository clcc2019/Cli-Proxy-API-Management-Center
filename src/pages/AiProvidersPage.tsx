import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ClaudeSection,
  CodexSection,
  OpenAICompatibilitySection,
  ProviderNav,
  useAiProviderConfigs,
  useProviderStats,
} from '@/components/providers';
import {
  findProviderKeyConfigIndex,
  getEnabledProviderConfigCount,
  type ProviderKind,
} from '@/components/providers/utils';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useEventCallback } from '@/hooks/useEventCallback';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { indexUsageDetailsBySource } from '@/utils/usageIndex';
import styles from './AiProvidersPage.module.scss';

const getConnectionStatusKey = (status: string) => {
  if (status === 'connected') return 'common.connected_status';
  if (status === 'connecting') return 'common.connecting_status';
  return 'common.disconnected_status';
};

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const {
    codexConfigs,
    claudeConfigs,
    openAIConfigs,
    rawCodexConfigs,
    rawClaudeConfigs,
    loading,
    error,
    switchingByProvider,
    isSwitching,
    providerSummary,
    deleteProviderEntry,
    setConfigEnabled,
    setCodexPoolMode,
    setOpenAICompatPoolMode,
  } = useAiProviderConfigs({ t });

  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const { keyStats, usageDetails, loadKeyStats, refreshKeyStats } = useProviderStats({
    enabled: isCurrentLayer,
  });
  const usageDetailsBySource = useMemo(
    () => indexUsageDetailsBySource(usageDetails),
    [usageDetails]
  );

  useEffect(() => {
    if (!isCurrentLayer) return;
    void loadKeyStats().catch(() => {});
  }, [isCurrentLayer, loadKeyStats]);

  useHeaderRefresh(refreshKeyStats, isCurrentLayer);

  const openEditor = useCallback(
    (path: string) => {
      navigate(path, { state: { fromAiProviders: true } });
    },
    [navigate]
  );

  const openProviderKeyEditor = useCallback(
    (provider: ProviderKind, displayIndex: number) => {
      const displayItems = provider === 'codex' ? codexConfigs : claudeConfigs;
      const rawItems = provider === 'codex' ? rawCodexConfigs : rawClaudeConfigs;
      const current = displayItems[displayIndex];
      const rawIndex = current ? findProviderKeyConfigIndex(rawItems || displayItems, current) : -1;

      openEditor(`/ai-providers/${provider}/${rawIndex >= 0 ? rawIndex : displayIndex}`);
    },
    [claudeConfigs, codexConfigs, openEditor, rawClaudeConfigs, rawCodexConfigs]
  );

  const providerMeta = useMemo(
    () => [
      {
        label: t('ai_providers.page_meta_configured_label'),
        value: providerSummary.configured,
      },
      {
        label: t('ai_providers.page_meta_enabled_label'),
        value: providerSummary.enabled,
      },
      {
        label: t('ai_providers.codex_title'),
        value: getEnabledProviderConfigCount(codexConfigs),
      },
      {
        label: t('ai_providers.claude_title'),
        value: getEnabledProviderConfigCount(claudeConfigs),
      },
      {
        label: t('ai_providers.openai_title'),
        value: openAIConfigs.filter((item) => !item.disabled).length,
      },
    ],
    [
      claudeConfigs,
      codexConfigs,
      openAIConfigs,
      providerSummary.configured,
      providerSummary.enabled,
      t,
    ]
  );

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
  const handleCodexPoolModeToggle = useEventCallback((index: number, enabled: boolean) => {
    void setCodexPoolMode(index, enabled);
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
  const handleOpenAIPoolModeToggle = useEventCallback((index: number, enabled: boolean) => {
    void setOpenAICompatPoolMode(index, enabled);
  });

  return (
    <div className={styles.container}>
      <section className={styles.pageHeader}>
        <div className={styles.pageHeaderMain}>
          <span className={styles.pageEyebrow}>{t('ai_providers.page_eyebrow')}</span>
          <h1 className={styles.pageTitle}>{t('ai_providers.title')}</h1>
          <p className={styles.pageDescription}>{t('ai_providers.page_description')}</p>
        </div>

        <div className={styles.pageHeaderAside}>
          <div className={styles.statusBadge}>{t(getConnectionStatusKey(connectionStatus))}</div>
          <div className={styles.pageMetaGrid}>
            {providerMeta.map((item) => (
              <div key={item.label} className={styles.pageMetaItem}>
                <span className={styles.pageMetaValue}>{item.value}</span>
                <span className={styles.pageMetaLabel}>{item.label}</span>
              </div>
            ))}
          </div>
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
            onPoolModeToggle={handleCodexPoolModeToggle}
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

        <div id="provider-openai" className={styles.providerSectionAnchor}>
          <OpenAICompatibilitySection
            configs={openAIConfigs}
            loading={loading}
            disableControls={disableControls}
            switchingItemKeys={switchingByProvider.openai}
            onPoolModeToggle={handleOpenAIPoolModeToggle}
          />
        </div>
      </div>

      <ProviderNav />
    </div>
  );
}
