import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { ProviderEditShell } from '@/components/common/ProviderEditShell';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import iconClaude from '@/assets/icons/claude.svg';
import { modelsApi } from '@/services/api';
import type { ModelInfo } from '@/utils/models';
import { buildHeaderObject } from '@/utils/headers';
import { getErrorMessage } from '@/utils/error';
import { ModelDiscoveryRow } from './components/ModelDiscoveryRow';
import type { ClaudeEditOutletContext } from './AiProvidersClaudeEditLayout';
import styles from './AiProvidersPage.module.scss';

const EMPTY_MODEL_INFO_LIST: ModelInfo[] = [];
const EMPTY_MODEL_NAMES: string[] = [];

export function AiProvidersClaudeModelsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const {
    disableControls,
    loading: initialLoading,
    saving,
    form,
    mergeDiscoveredModels,
  } = useOutletContext<ClaudeEditOutletContext>();

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const autoFetchSignatureRef = useRef<string>('');
  const fetchRequestVersionRef = useRef(0);
  const endpoint = useMemo(
    () => modelsApi.buildClaudeModelsEndpoint(form.baseUrl ?? ''),
    [form.baseUrl]
  );

  const filteredModels = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_MODEL_INFO_LIST;

    const filter = search.trim().toLowerCase();
    if (!filter) return models;
    return models.filter((model) => {
      const name = (model.name || '').toLowerCase();
      const alias = (model.alias || '').toLowerCase();
      const desc = (model.description || '').toLowerCase();
      return name.includes(filter) || alias.includes(filter) || desc.includes(filter);
    });
  }, [isCurrentLayer, models, search]);
  const visibleModelNames = useMemo(
    () => (isCurrentLayer ? filteredModels.map((model) => model.name) : EMPTY_MODEL_NAMES),
    [filteredModels, isCurrentLayer]
  );
  const allVisibleSelected = useMemo(
    () => visibleModelNames.length > 0 && visibleModelNames.every((name) => selected.has(name)),
    [selected, visibleModelNames]
  );

  const commitModels = useCallback((nextModels: ModelInfo[]) => {
    const availableNames = new Set(nextModels.map((model) => model.name));
    setModels(nextModels);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((name) => {
        if (availableNames.has(name)) {
          next.add(name);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, []);

  const fetchClaudeModelDiscovery = useCallback(async () => {
    const requestVersion = (fetchRequestVersionRef.current += 1);
    setFetching(true);
    setError('');
    const headerObject = buildHeaderObject(form.headers);
    try {
      const list = await modelsApi.fetchClaudeModelsViaApiCall(
        form.baseUrl ?? '',
        form.apiKey.trim() || undefined,
        headerObject
      );
      if (requestVersion !== fetchRequestVersionRef.current) return;
      commitModels(list);
    } catch (err: unknown) {
      if (requestVersion !== fetchRequestVersionRef.current) return;
      commitModels([]);
      const message = getErrorMessage(err);
      const hasCustomXApiKey = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'x-api-key'
      );
      const hasAuthorization = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'authorization'
      );
      const shouldAttachDiag =
        message.toLowerCase().includes('x-api-key') || message.includes('401');
      const diag = shouldAttachDiag
        ? ` [diag: apiKeyField=${form.apiKey.trim() ? 'yes' : 'no'}, customXApiKey=${
            hasCustomXApiKey ? 'yes' : 'no'
          }, customAuthorization=${hasAuthorization ? 'yes' : 'no'}]`
        : '';
      setError(`${t('ai_providers.claude_models_fetch_error')}: ${message}${diag}`);
    } finally {
      if (requestVersion === fetchRequestVersionRef.current) {
        setFetching(false);
      }
    }
  }, [commitModels, form.apiKey, form.baseUrl, form.headers, t]);

  useEffect(() => {
    if (!isCurrentLayer || initialLoading) return;

    const taskId = window.setTimeout(() => {
      const headerObject = buildHeaderObject(form.headers);
      const hasCustomXApiKey = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'x-api-key'
      );
      const hasAuthorization = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'authorization'
      );
      const hasApiKeyField = Boolean(form.apiKey.trim());
      const canAutoFetch = hasApiKeyField || hasCustomXApiKey || hasAuthorization;
      const headerSignature = Object.entries(headerObject)
        .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
        .map(([key, value]) => `${key}:${value}`)
        .join('|');
      const signature = `${endpoint}||${form.apiKey.trim()}||${headerSignature}`;

      if (autoFetchSignatureRef.current === signature) return;
      autoFetchSignatureRef.current = signature;
      fetchRequestVersionRef.current += 1;
      setFetching(false);
      commitModels([]);
      setSearch('');
      setError('');

      // Avoid firing a guaranteed 401 while the parent form is still missing credentials.
      if (canAutoFetch) {
        void fetchClaudeModelDiscovery();
      }
    }, 0);

    return () => {
      window.clearTimeout(taskId);
      fetchRequestVersionRef.current += 1;
    };
  }, [
    commitModels,
    endpoint,
    fetchClaudeModelDiscovery,
    form.apiKey,
    form.headers,
    initialLoading,
    isCurrentLayer,
  ]);

  const handleBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);
  const toggleSelection = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleSelectVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      visibleModelNames.forEach((name) => next.add(name));
      return next;
    });
  }, [visibleModelNames]);

  const handleClearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleApply = () => {
    const selectedModels = models.filter((model) => selected.has(model.name));
    if (selectedModels.length) {
      mergeDiscoveredModels(selectedModels);
    }
    handleBack();
  };

  const canApply = !disableControls && !saving && !fetching && selected.size > 0;

  return (
    <ProviderEditShell
      title={t('ai_providers.claude_models_fetch_title')}
      leadingIcon={<img src={iconClaude} alt="" />}
      onBack={handleBack}
      floatingAction={
        <>
          <Button variant="secondary" size="sm" onClick={handleBack}>
            {t('common.back')}
          </Button>
          <Button size="sm" onClick={handleApply} disabled={!canApply}>
            {t('ai_providers.claude_models_fetch_apply')}
          </Button>
        </>
      }
      isLoading={initialLoading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        <div className={styles.openaiModelsContent}>
          <div className={styles.sectionHint}>{t('ai_providers.claude_models_fetch_hint')}</div>
          <div className={styles.openaiModelsEndpointSection}>
            <span className={styles.openaiModelsEndpointLabel}>
              {t('ai_providers.claude_models_fetch_url_label')}
            </span>
            <div className={styles.openaiModelsEndpointControls}>
              <input
                className={`input ${styles.openaiModelsEndpointInput}`}
                aria-label={t('ai_providers.claude_models_fetch_url_label')}
                readOnly
                value={endpoint}
              />
              <RefreshButton
                variant="secondary"
                size="sm"
                onClick={() => void fetchClaudeModelDiscovery()}
                loading={fetching}
                disabled={disableControls || saving}
                label={t('ai_providers.claude_models_fetch_refresh')}
              >
                {t('ai_providers.claude_models_fetch_refresh')}
              </RefreshButton>
            </div>
          </div>
          <Input
            label={t('ai_providers.claude_models_search_label')}
            placeholder={t('ai_providers.claude_models_search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={fetching}
          />
          {models.length > 0 && (
            <div className={styles.modelDiscoveryToolbar}>
              <div className={styles.modelDiscoveryToolbarActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSelectVisible}
                  disabled={
                    disableControls ||
                    saving ||
                    fetching ||
                    filteredModels.length === 0 ||
                    allVisibleSelected
                  }
                >
                  {t('ai_providers.model_discovery_select_visible')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={disableControls || saving || fetching || selected.size === 0}
                >
                  {t('ai_providers.model_discovery_clear_selection')}
                </Button>
              </div>
              <div className={styles.modelDiscoverySelectionSummary}>
                {t('ai_providers.model_discovery_selected_count', { count: selected.size })}
              </div>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {fetching ? (
            <div className={styles.sectionHint}>
              {t('ai_providers.claude_models_fetch_loading')}
            </div>
          ) : models.length === 0 ? (
            <div className={styles.sectionHint}>{t('ai_providers.claude_models_fetch_empty')}</div>
          ) : filteredModels.length === 0 ? (
            <div className={styles.sectionHint}>{t('ai_providers.claude_models_search_empty')}</div>
          ) : (
            <div className={styles.modelDiscoveryList}>
              {filteredModels.map((model) => {
                return (
                  <ModelDiscoveryRow
                    key={model.name}
                    model={model}
                    checked={selected.has(model.name)}
                    disabled={disableControls || saving || fetching}
                    onToggle={toggleSelection}
                  />
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </ProviderEditShell>
  );
}
