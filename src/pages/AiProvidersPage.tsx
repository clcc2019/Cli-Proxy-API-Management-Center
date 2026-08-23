import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useAiProviderConfigs } from '@/components/providers/hooks/useAiProviderConfigs';
import {
  buildOpenAICompatibilityConfigKey,
  buildProviderConfigKey,
  findOpenAICompatibilityConfigIndex,
  findProviderKeyConfigIndex,
  hasDisableAllModelsRule,
} from '@/components/providers/utils';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useAuthStore } from '@/stores';
import { Skeleton } from '@/components/ui/Skeleton';
import type { OpenAICompatibilityConfig, ProviderKeyConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import { ProviderCategoryList } from '@/features/providers/components/ProviderCategoryList';
import { ProviderHeaderCard } from '@/features/providers/components/ProviderHeaderCard';
import {
  ProviderResourcePanel,
  type ProviderPanelControls,
} from '@/features/providers/components/ProviderResourcePanel';
import type {
  ProviderBrand,
  ProviderGroup,
  ProviderResource,
  ProviderSortBy,
  SortDir,
} from '@/features/providers/types';
import { useTranslation } from 'react-i18next';
import styles from '@/features/providers/ProvidersWorkbenchPage.module.scss';

const providerResourceFromKeyConfig = (
  brand: 'codex' | 'claude',
  config: ProviderKeyConfig,
  index: number
): ProviderResource => ({
  id: `${brand}:${buildProviderConfigKey(config)}:${index}`,
  brand,
  originalIndex: index,
  name: null,
  identifier: config.apiKey || `${brand}-${index + 1}`,
  apiKeyPreview: config.apiKey ? maskApiKey(config.apiKey) : null,
  apiKey: config.apiKey || null,
  authIndex: config.authIndex || null,
  baseUrl: config.baseUrl || null,
  proxyUrl: config.proxyUrl || null,
  prefix: config.prefix || null,
  modelCount: config.models?.length ?? 0,
  models: (config.models ?? []).map((model) => model.name).filter(Boolean),
  priority: config.priority ?? 0,
  headerCount: Object.keys(config.headers ?? {}).length,
  apiKeyEntryCount: 0,
  disabled: hasDisableAllModelsRule(config.excludedModels),
  flags: {
    websockets: brand === 'codex' ? Boolean(config.websockets) : undefined,
    cloakEnabled: brand === 'claude' ? Boolean(config.cloak) : undefined,
  },
  raw: config,
});

const providerResourceFromOpenAI = (
  config: OpenAICompatibilityConfig,
  index: number
): ProviderResource => {
  const firstApiKey = config.apiKeyEntries?.[0]?.apiKey ?? '';
  return {
    id: `openai:${buildOpenAICompatibilityConfigKey(config, index)}`,
    brand: 'openaiCompatibility',
    originalIndex: index,
    name: config.name || null,
    identifier: config.name || `openai-${index + 1}`,
    apiKeyPreview: firstApiKey ? maskApiKey(firstApiKey) : null,
    apiKey: null,
    authIndex: config.authIndex || null,
    baseUrl: config.baseUrl || null,
    proxyUrl: config.apiKeyEntries?.[0]?.proxyUrl || null,
    prefix: config.prefix || null,
    modelCount: config.models?.length ?? 0,
    models: (config.models ?? []).map((model) => model.name).filter(Boolean),
    priority: config.priority ?? 0,
    headerCount: Object.keys(config.headers ?? {}).length,
    apiKeyEntryCount: config.apiKeyEntries?.length ?? 0,
    disabled: Boolean(config.disabled),
    flags: {},
    raw: config,
  };
};

const matchesFilter = (resource: ProviderResource, normalized: string) => {
  if (!normalized) return true;
  return [
    resource.identifier,
    resource.name,
    resource.apiKeyPreview,
    resource.baseUrl,
    resource.proxyUrl,
    resource.prefix,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
};

export function AiProvidersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );

  const {
    codexConfigs,
    claudeConfigs,
    openAIConfigs,
    rawCodexConfigs,
    rawClaudeConfigs,
    rawOpenAIConfigs,
    loading,
    error,
    isSwitching,
    providerSummary,
    loadConfigs,
    deleteProviderEntry,
    deleteOpenAICompatEntry,
    setConfigEnabled,
    setOpenAICompatEnabled,
  } = useAiProviderConfigs({ t, enabled: isCurrentLayer });

  const [activeBrand, setActiveBrand] = useState<ProviderBrand>('codex');
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<ProviderSortBy>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedModels, setSelectedModels] = useState<Set<string>>(() => new Set());

  const handleRefresh = useCallback(async () => {
    await loadConfigs();
  }, [loadConfigs]);

  useHeaderRefresh(handleRefresh, isCurrentLayer);

  const groups = useMemo<ProviderGroup[]>(
    () => [
      {
        id: 'codex',
        resources: codexConfigs.map((config, index) =>
          providerResourceFromKeyConfig('codex', config, index)
        ),
      },
      {
        id: 'claude',
        resources: claudeConfigs.map((config, index) =>
          providerResourceFromKeyConfig('claude', config, index)
        ),
      },
      {
        id: 'openaiCompatibility',
        resources: openAIConfigs.map(providerResourceFromOpenAI),
      },
    ],
    [claudeConfigs, codexConfigs, openAIConfigs]
  );

  const activeGroup = groups.find((group) => group.id === activeBrand) ?? groups[0]!;
  const availableModels = useMemo(
    () => Array.from(new Set(activeGroup.resources.flatMap((resource) => resource.models))).sort(),
    [activeGroup]
  );

  const visibleResources = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    const filtered = activeGroup.resources.filter(
      (resource) =>
        matchesFilter(resource, normalized) &&
        (selectedModels.size === 0 || resource.models.some((model) => selectedModels.has(model)))
    );
    return [...filtered].sort((left, right) => {
      const result =
        sortBy === 'priority'
          ? left.priority - right.priority
          : sortBy === 'recent-success'
            ? left.originalIndex - right.originalIndex
            : (left.name ?? left.identifier).localeCompare(right.name ?? right.identifier);
      return sortDir === 'asc' ? result : -result;
    });
  }, [activeGroup.resources, filter, selectedModels, sortBy, sortDir]);

  const toolbarControls = useMemo<ProviderPanelControls>(
    () => ({
      sortBy,
      sortDir,
      onSortBy: setSortBy,
      onSortDir: setSortDir,
      availableModels,
      selectedModels,
      onSelectedModelsChange: setSelectedModels,
    }),
    [availableModels, selectedModels, sortBy, sortDir]
  );

  const openEditor = useCallback(
    (path: string) => navigate(path, { state: { fromAiProviders: true } }),
    [navigate]
  );

  const openResourceEditor = useCallback(
    (resource: ProviderResource) => {
      if (resource.brand === 'openaiCompatibility') {
        const current = openAIConfigs[resource.originalIndex];
        const rawIndex = current
          ? findOpenAICompatibilityConfigIndex(rawOpenAIConfigs || openAIConfigs, current)
          : resource.originalIndex;
        openEditor(`/ai-providers/openai/${rawIndex >= 0 ? rawIndex : resource.originalIndex}`);
        return;
      }

      const configs = resource.brand === 'codex' ? codexConfigs : claudeConfigs;
      const rawConfigs = resource.brand === 'codex' ? rawCodexConfigs : rawClaudeConfigs;
      const current = configs[resource.originalIndex];
      const rawIndex = current
        ? findProviderKeyConfigIndex(rawConfigs || configs, current)
        : resource.originalIndex;
      openEditor(
        `/ai-providers/${resource.brand}/${rawIndex >= 0 ? rawIndex : resource.originalIndex}`
      );
    },
    [
      claudeConfigs,
      codexConfigs,
      openAIConfigs,
      openEditor,
      rawClaudeConfigs,
      rawCodexConfigs,
      rawOpenAIConfigs,
    ]
  );

  const handleCreate = useCallback(() => {
    const routeBrand = activeBrand === 'openaiCompatibility' ? 'openai' : activeBrand;
    openEditor(`/ai-providers/${routeBrand}/new`);
  }, [activeBrand, openEditor]);

  const handleDelete = useCallback(
    (resource: ProviderResource) => {
      if (resource.brand === 'openaiCompatibility') {
        void deleteOpenAICompatEntry(resource.originalIndex);
      } else {
        void deleteProviderEntry(resource.brand, resource.originalIndex);
      }
    },
    [deleteOpenAICompatEntry, deleteProviderEntry]
  );

  const handleToggleDisabled = useCallback(
    (resource: ProviderResource, disabled: boolean) => {
      if (resource.brand === 'openaiCompatibility') {
        void setOpenAICompatEnabled(resource.originalIndex, !disabled);
      } else {
        void setConfigEnabled(resource.brand, resource.originalIndex, !disabled);
      }
    },
    [setConfigEnabled, setOpenAICompatEnabled]
  );

  const handleBrandSelect = useCallback((brand: ProviderBrand) => {
    setActiveBrand(brand);
    setFilter('');
    setSelectedModels(new Set());
  }, []);

  if (loading && providerSummary.configured === 0) {
    return (
      <div className={styles.page}>
        <Skeleton height={64} />
        <div className={styles.layout}>
          <Skeleton height={72} />
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <ProviderHeaderCard
        isFetching={loading}
        isNewDisabled={connectionStatus !== 'connected' || isSwitching}
        onRefresh={handleRefresh}
        onNew={handleCreate}
      />

      {error ? (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.layout}>
        <ProviderCategoryList
          groups={groups}
          activeBrand={activeGroup.id}
          onSelect={handleBrandSelect}
        />
        <ProviderResourcePanel
          group={activeGroup}
          filter={filter}
          onFilterChange={setFilter}
          filteredResources={visibleResources}
          disableMutations={connectionStatus !== 'connected' || isSwitching}
          toolbarControls={toolbarControls}
          onView={openResourceEditor}
          onEdit={openResourceEditor}
          onDelete={handleDelete}
          onToggleDisabled={handleToggleDisabled}
          onCreate={handleCreate}
        />
      </div>
    </div>
  );
}
