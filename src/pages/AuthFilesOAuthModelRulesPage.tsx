import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Select, type SelectOption } from '@/components/ui/Select';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconX } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { AuthFileItem, OAuthModelAliasEntry, OAuthReasoningEffort } from '@/types';
import { generateId } from '@/utils/helpers';
import { normalizeOAuthReasoningEffort } from '@/utils/oauthModelAlias';
import styles from './AuthFilesOAuthModelRulesPage.module.scss';

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };
type LocationState = { fromAuthFiles?: boolean } | null;
type UnsupportedError = 'unsupported' | null;

type OAuthModelMappingFormEntry = OAuthModelAliasEntry & {
  id: string;
};

type OAuthModelMappingFormField = 'name' | 'alias' | 'fork';

export type OAuthModelRulesEditorModalProps = {
  open: boolean;
  initialProvider?: string;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

const OAUTH_PROVIDER_PRESETS = ['claude', 'codex', 'xai', 'qwen', 'kimi'];
const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);
const REASONING_EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const REASONING_EFFORT_SOURCES = ['default', ...REASONING_EFFORT_LEVELS] as const;

const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

const getHttpStatus = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;

const getRecordEntry = <T,>(record: Record<string, T>, providerKey: string): T | undefined => {
  const direct = record[providerKey];
  if (direct !== undefined) return direct;
  return Object.entries(record).find(([key]) => normalizeProviderKey(key) === providerKey)?.[1];
};

const buildEmptyMappingEntry = (): OAuthModelMappingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  fork: true,
});

const normalizeMappingEntries = (entries?: OAuthModelAliasEntry[]): OAuthModelMappingFormEntry[] =>
  (entries ?? []).map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    fork: Boolean(entry.fork),
    reasoningEffort: normalizeOAuthReasoningEffort(entry.reasoningEffort),
  }));

const serializeReasoningEffort = (value?: OAuthReasoningEffort): [string, string][] =>
  Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right));

const getReasoningOverrideCount = (value?: OAuthReasoningEffort): number =>
  Object.keys(value ?? {}).filter((source) => source !== 'default').length;

const mappingSignature = (entries: OAuthModelMappingFormEntry[]): string =>
  JSON.stringify(
    entries
      .map((entry) => ({
        name: entry.name.trim(),
        alias: entry.alias.trim(),
        fork: Boolean(entry.fork),
        reasoningEffort: serializeReasoningEffort(entry.reasoningEffort),
      }))
      .filter(
        (entry) =>
          entry.name || entry.alias || entry.reasoningEffort.length > 0 || entry.fork !== true
      )
  );

const areSetsEqual = (left: Set<string>, right: Set<string>): boolean =>
  left.size === right.size && Array.from(left).every((value) => right.has(value));

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : '');

export function OAuthModelRulesEditorModal({
  open,
  initialProvider = '',
  onClose,
  onSaved,
}: OAuthModelRulesEditorModalProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const [provider, setProvider] = useState(initialProvider);
  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [modelAlias, setModelAlias] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [excludedError, setExcludedError] = useState<UnsupportedError>(null);
  const [modelAliasError, setModelAliasError] = useState<UnsupportedError>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [initialSelectedModels, setInitialSelectedModels] = useState<Set<string>>(new Set());
  const [manualModel, setManualModel] = useState('');
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<UnsupportedError>(null);

  const [mappings, setMappings] = useState<OAuthModelMappingFormEntry[]>([]);
  const [initialMappingsSignature, setInitialMappingsSignature] = useState('[]');
  const [mappingErrors, setMappingErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const resolvedProviderKey = useMemo(() => normalizeProviderKey(provider), [provider]);
  const excludedSupported = excludedError !== 'unsupported';
  const aliasesSupported = modelAliasError !== 'unsupported';
  const canConfigureAnything = excludedSupported || aliasesSupported;

  useEffect(() => {
    if (open) setProvider(initialProvider);
  }, [initialProvider, open]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setInitialLoading(true);
      const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
        authFilesApi.list({ codexSubscription: 'skip', summary: true }),
        authFilesApi.getOauthExcludedModels(),
        authFilesApi.getOauthModelAlias(),
      ]);

      if (cancelled) return;

      if (filesResult.status === 'fulfilled') {
        setFiles(filesResult.value?.files ?? []);
      }

      if (excludedResult.status === 'fulfilled') {
        setExcluded(excludedResult.value ?? {});
        setExcludedError(null);
      } else if (getHttpStatus(excludedResult.reason) === 404) {
        setExcludedError('unsupported');
      } else {
        showNotification(
          `${t('notification.load_failed')}: ${getErrorMessage(excludedResult.reason)}`,
          'error'
        );
      }

      if (aliasResult.status === 'fulfilled') {
        setModelAlias(aliasResult.value ?? {});
        setModelAliasError(null);
      } else if (getHttpStatus(aliasResult.reason) === 404) {
        setModelAliasError('unsupported');
      } else {
        showNotification(
          `${t('notification.load_failed')}: ${getErrorMessage(aliasResult.reason)}`,
          'error'
        );
      }

      setInitialLoading(false);
    };

    void load().catch((error: unknown) => {
      if (cancelled) return;
      showNotification(`${t('notification.load_failed')}: ${getErrorMessage(error)}`, 'error');
      setInitialLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [showNotification, t]);

  const providerOptions = useMemo(() => {
    const values = new Set<string>(OAUTH_PROVIDER_PRESETS);
    Object.keys(excluded).forEach((value) => values.add(value));
    Object.keys(modelAlias).forEach((value) => values.add(value));
    files.forEach((file) => {
      if (typeof file.type === 'string') values.add(file.type);
      if (typeof file.provider === 'string') values.add(file.provider);
    });

    const known = new Set(OAUTH_PROVIDER_PRESETS.map(normalizeProviderKey));
    const extras = Array.from(values)
      .map((value) => value.trim())
      .filter((value) => value && !OAUTH_PROVIDER_EXCLUDES.has(normalizeProviderKey(value)))
      .filter((value) => !known.has(normalizeProviderKey(value)))
      .sort((left, right) => left.localeCompare(right));

    return [...OAUTH_PROVIDER_PRESETS, ...extras];
  }, [excluded, files, modelAlias]);

  const getTypeLabel = useCallback(
    (type: string): string => {
      const key = `auth_files.filter_${type}`;
      const translated = t(key);
      return translated === key ? type.charAt(0).toUpperCase() + type.slice(1) : translated;
    },
    [t]
  );

  const reasoningEffortOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('oauth_model_rules.reasoning_inherit') },
      ...REASONING_EFFORT_LEVELS.map((level) => ({
        value: level,
        label: level,
      })),
    ],
    [t]
  );

  const getReasoningSourceLabel = useCallback(
    (source: string) =>
      source === 'default' ? t('oauth_model_rules.reasoning_default_source') : source,
    [t]
  );

  const title = useMemo(
    () =>
      resolvedProviderKey
        ? t('oauth_model_rules.edit_title', { provider: provider.trim() || resolvedProviderKey })
        : t('oauth_model_rules.add_title'),
    [provider, resolvedProviderKey, t]
  );

  useEffect(() => {
    if (!resolvedProviderKey) {
      setSelectedModels(new Set());
      setInitialSelectedModels(new Set());
      setMappings([]);
      setInitialMappingsSignature('[]');
      setMappingErrors({});
      return;
    }

    const nextSelectedModels = new Set(getRecordEntry(excluded, resolvedProviderKey) ?? []);
    const nextMappings = normalizeMappingEntries(getRecordEntry(modelAlias, resolvedProviderKey));
    setSelectedModels(nextSelectedModels);
    setInitialSelectedModels(new Set(nextSelectedModels));
    setMappings(nextMappings);
    setInitialMappingsSignature(mappingSignature(nextMappings));
    setMappingErrors({});
  }, [excluded, modelAlias, resolvedProviderKey]);

  useEffect(() => {
    if (!resolvedProviderKey || !canConfigureAnything) {
      setModelsList([]);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    setModelsList([]);
    setModelsLoading(true);
    setModelsError(null);

    authFilesApi
      .getModelDefinitions(resolvedProviderKey)
      .then((models) => {
        if (!cancelled) setModelsList(models);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (getHttpStatus(error) === 404) {
          setModelsError('unsupported');
          setModelsList([]);
          return;
        }
        showNotification(`${t('notification.load_failed')}: ${getErrorMessage(error)}`, 'error');
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canConfigureAnything, resolvedProviderKey, showNotification, t]);

  const updateProvider = useCallback((value: string) => {
    setProvider(value);
  }, []);

  const toggleModel = useCallback((modelId: string, checked: boolean) => {
    setSelectedModels((previous) => {
      const next = new Set(previous);
      if (checked) next.add(modelId);
      else next.delete(modelId);
      return next;
    });
  }, []);

  const addManualModel = useCallback(() => {
    const model = manualModel.trim();
    if (!model) return;
    setSelectedModels((previous) => new Set(previous).add(model));
    setManualModel('');
  }, [manualModel]);

  const updateMappingEntry = useCallback(
    (index: number, field: OAuthModelMappingFormField, value: string | boolean) => {
      const entryId = mappings[index]?.id;
      setMappings((previous) =>
        previous.map((entry, entryIndex) => {
          if (entryIndex !== index) return entry;
          return field === 'fork'
            ? { ...entry, fork: Boolean(value) }
            : { ...entry, [field]: String(value) };
        })
      );
      if (entryId) {
        setMappingErrors((previous) => {
          if (!previous[entryId]) return previous;
          const next = { ...previous };
          delete next[entryId];
          return next;
        });
      }
    },
    [mappings]
  );

  const addMappingEntry = useCallback(() => {
    setMappings((previous) => [...previous, buildEmptyMappingEntry()]);
  }, []);

  const removeMappingEntry = useCallback((id: string) => {
    setMappings((previous) => previous.filter((entry) => entry.id !== id));
    setMappingErrors((previous) => {
      if (!previous[id]) return previous;
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }, []);

  const updateReasoningEffort = useCallback((index: number, source: string, target: string) => {
    setMappings((previous) =>
      previous.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;

        const nextReasoningEffort = {
          ...(normalizeOAuthReasoningEffort(entry.reasoningEffort) ?? {}),
        };
        if (target) nextReasoningEffort[source] = target;
        else delete nextReasoningEffort[source];

        return {
          ...entry,
          reasoningEffort: normalizeOAuthReasoningEffort(nextReasoningEffort),
        };
      })
    );
  }, []);

  const aliasPayload = useMemo(() => {
    const entries: OAuthModelAliasEntry[] = [];
    const errors: Record<string, string> = {};
    const seen = new Set<string>();

    mappings.forEach((entry) => {
      const name = entry.name.trim();
      const alias = entry.alias.trim();
      const reasoningEffort = normalizeOAuthReasoningEffort(entry.reasoningEffort);

      if (!name && !alias && !reasoningEffort && entry.fork) return;

      if (!name || !alias) {
        errors[entry.id] = t('oauth_model_rules.alias_incomplete');
        return;
      }

      const key = `${name.toLowerCase()}::${alias.toLowerCase()}`;
      if (seen.has(key)) {
        errors[entry.id] = t('oauth_model_rules.alias_duplicate');
        return;
      }
      seen.add(key);

      const next: OAuthModelAliasEntry = entry.fork ? { name, alias, fork: true } : { name, alias };
      if (reasoningEffort) next.reasoningEffort = reasoningEffort;
      entries.push(next);
    });

    return { entries, errors };
  }, [mappings, t]);

  const excludedDirty = !areSetsEqual(selectedModels, initialSelectedModels);
  const aliasDirty = mappingSignature(mappings) !== initialMappingsSignature;
  const hasChanges = (excludedSupported && excludedDirty) || (aliasesSupported && aliasDirty);
  const canSave = Boolean(resolvedProviderKey) && !disableControls && !saving && hasChanges;

  const visibleModels = useMemo<AuthFileModelItem[]>(() => {
    const knownIds = new Set(modelsList.map((model) => model.id));
    const customSelectedModels = Array.from(selectedModels)
      .filter((model) => !knownIds.has(model))
      .sort((left, right) => left.localeCompare(right))
      .map((id): AuthFileModelItem => ({ id }));
    return [...modelsList, ...customSelectedModels];
  }, [modelsList, selectedModels]);

  const handleSave = useCallback(async () => {
    const normalizedProvider = normalizeProviderKey(provider);
    if (!normalizedProvider) {
      showNotification(t('oauth_model_rules.provider_required'), 'error');
      return;
    }

    if (aliasesSupported && aliasDirty && Object.keys(aliasPayload.errors).length > 0) {
      setMappingErrors(aliasPayload.errors);
      showNotification(t('oauth_model_rules.alias_invalid'), 'error');
      return;
    }

    const tasks: { kind: 'excluded' | 'aliases'; task: () => Promise<void> }[] = [];
    if (excludedSupported && excludedDirty) {
      tasks.push({
        kind: 'excluded',
        task: async () => {
          const models = Array.from(selectedModels).sort((left, right) =>
            left.localeCompare(right)
          );
          if (models.length > 0) {
            await authFilesApi.saveOauthExcludedModels(normalizedProvider, models);
            return;
          }

          try {
            await authFilesApi.deleteOauthExcludedEntry(normalizedProvider);
          } catch {
            const current = await authFilesApi.getOauthExcludedModels();
            const next = Object.fromEntries(
              Object.entries(current ?? {}).filter(
                ([key]) => normalizeProviderKey(key) !== normalizedProvider
              )
            );
            await authFilesApi.replaceOauthExcludedModels(next);
          }
        },
      });
    }
    if (aliasesSupported && aliasDirty) {
      tasks.push({
        kind: 'aliases',
        task: async () => {
          if (aliasPayload.entries.length > 0) {
            await authFilesApi.saveOauthModelAlias(normalizedProvider, aliasPayload.entries);
          } else {
            await authFilesApi.deleteOauthModelAlias(normalizedProvider);
          }
        },
      });
    }

    if (tasks.length === 0) return;

    setSaving(true);
    try {
      const results = await Promise.allSettled(tasks.map(({ task }) => task()));
      const failed = results.find((result) => result.status === 'rejected');

      results.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        if (tasks[index].kind === 'excluded') {
          setInitialSelectedModels(new Set(selectedModels));
        } else {
          setInitialMappingsSignature(mappingSignature(mappings));
        }
      });

      if (failed && failed.status === 'rejected') {
        const errorMessage = getErrorMessage(failed.reason);
        showNotification(
          errorMessage
            ? `${t('oauth_model_rules.save_failed')}: ${errorMessage}`
            : t('oauth_model_rules.save_failed'),
          'error'
        );
        return;
      }

      showNotification(t('oauth_model_rules.save_success'), 'success');
      await onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [
    aliasDirty,
    aliasPayload,
    aliasesSupported,
    excludedDirty,
    excludedSupported,
    mappings,
    onClose,
    onSaved,
    provider,
    selectedModels,
    showNotification,
    t,
  ]);

  const modelSourceStatus = modelsLoading
    ? t('oauth_model_rules.model_source_loading')
    : modelsError === 'unsupported'
      ? t('oauth_model_rules.model_source_unavailable')
      : modelsList.length > 0
        ? t('oauth_model_rules.model_source_loaded', { count: modelsList.length })
        : t('oauth_model_rules.model_source_manual');

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      closeDisabled={saving}
      width={1100}
      fullScreenOnMobile
      className={styles.modal}
      footer={
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            {t('oauth_model_rules.save')}
          </Button>
        </div>
      }
    >
      <div className={styles.editor}>
        {initialLoading ? (
          <div className={styles.loadingState} role="status" aria-busy="true">
            <LoadingSpinner size={18} />
            <span>{t('common.loading')}</span>
          </div>
        ) : !canConfigureAnything ? (
          <EmptyState
            title={t('oauth_model_rules.upgrade_required_title')}
            description={t('oauth_model_rules.upgrade_required_desc')}
          />
        ) : (
          <div className={styles.rulesShell}>
            <section
              className={styles.providerContext}
              aria-labelledby="oauth-model-rules-provider-title"
            >
              <div className={styles.providerContextIntro}>
                <span className={styles.providerContextEyebrow}>
                  {t('oauth_model_rules.provider_label')}
                </span>
                <h2 id="oauth-model-rules-provider-title">
                  {t('oauth_model_rules.provider_title')}
                </h2>
                <p>{t('oauth_model_rules.provider_hint')}</p>
              </div>
              <div className={styles.providerContextControls}>
                <AutocompleteInput
                  id="oauth-model-rules-provider"
                  placeholder={t('oauth_model_rules.provider_placeholder')}
                  value={provider}
                  onChange={updateProvider}
                  options={providerOptions}
                  disabled={disableControls || saving}
                  wrapperStyle={{ marginBottom: 0 }}
                />
                <div
                  className={styles.providerTags}
                  role="group"
                  aria-label={t('oauth_model_rules.provider_label')}
                >
                  {OAUTH_PROVIDER_PRESETS.map((option) => {
                    const isActive =
                      normalizeProviderKey(provider) === normalizeProviderKey(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.providerTag} ${isActive ? styles.providerTagActive : ''}`}
                        onClick={() => updateProvider(option)}
                        disabled={disableControls || saving}
                        aria-pressed={isActive}
                      >
                        {getTypeLabel(option)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className={styles.rulesContent}>
              {!resolvedProviderKey ? (
                <div className={styles.awaitingProvider} role="status">
                  {t('oauth_model_rules.provider_required')}
                </div>
              ) : (
                <div className={styles.rulesSections}>
                  <section
                    className={styles.ruleSection}
                    aria-labelledby="oauth-model-rules-excluded-title"
                  >
                    <div className={styles.sectionHeader}>
                      <div>
                        <h2 id="oauth-model-rules-excluded-title">
                          {t('oauth_excluded.models_label')}
                        </h2>
                        <p>{t('oauth_model_rules.excluded_description')}</p>
                      </div>
                      {excludedSupported && (
                        <div
                          className={styles.modelSourceStatus}
                          role="status"
                          aria-busy={modelsLoading || undefined}
                        >
                          {modelsLoading && <LoadingSpinner size={14} />}
                          <span>{modelSourceStatus}</span>
                        </div>
                      )}
                    </div>

                    {!excludedSupported ? (
                      <div className={styles.unavailableState}>
                        {t('oauth_model_rules.excluded_unavailable')}
                      </div>
                    ) : (
                      <div className={styles.ruleBody}>
                        {visibleModels.length > 0 ? (
                          <div className={styles.modelList}>
                            {visibleModels.map((model) => (
                              <SelectionCheckbox
                                key={model.id}
                                checked={selectedModels.has(model.id)}
                                disabled={disableControls || saving}
                                onChange={(checked) => toggleModel(model.id, checked)}
                                className={styles.modelItem}
                                labelClassName={styles.modelText}
                                label={
                                  <>
                                    <span className={styles.modelId}>{model.id}</span>
                                    {model.display_name && model.display_name !== model.id && (
                                      <span className={styles.modelDisplayName}>
                                        {model.display_name}
                                      </span>
                                    )}
                                  </>
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <div className={styles.compactEmpty}>
                            {t('oauth_model_rules.no_models_yet')}
                          </div>
                        )}

                        <details className={styles.manualModelDetails}>
                          <summary>{t('oauth_model_rules.manual_model_disclosure')}</summary>
                          <div className={styles.manualModelControl}>
                            <input
                              className="input"
                              value={manualModel}
                              onChange={(event) => setManualModel(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addManualModel();
                                }
                              }}
                              placeholder={t('oauth_model_rules.manual_model_placeholder')}
                              disabled={disableControls || saving}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={addManualModel}
                              disabled={disableControls || saving || !manualModel.trim()}
                            >
                              {t('oauth_model_rules.add_model')}
                            </Button>
                          </div>
                          <p className={styles.controlHint}>
                            {t('oauth_model_rules.manual_model_hint')}
                          </p>
                        </details>

                        {excludedDirty &&
                          selectedModels.size === 0 &&
                          initialSelectedModels.size > 0 && (
                            <div className={styles.clearNotice} role="status">
                              {t('oauth_model_rules.excluded_clear_notice')}
                            </div>
                          )}
                      </div>
                    )}
                  </section>

                  <section
                    className={styles.ruleSection}
                    aria-labelledby="oauth-model-rules-alias-title"
                  >
                    <div className={styles.sectionHeader}>
                      <div>
                        <h2 id="oauth-model-rules-alias-title">
                          {t('oauth_model_alias.alias_label')}
                        </h2>
                        <p>{t('oauth_model_rules.alias_description')}</p>
                      </div>
                      {aliasesSupported && mappings.length > 0 && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={addMappingEntry}
                          disabled={disableControls || saving}
                        >
                          <IconPlus size={14} />
                          {t('oauth_model_rules.add_alias')}
                        </Button>
                      )}
                    </div>

                    {!aliasesSupported ? (
                      <div className={styles.unavailableState}>
                        {t('oauth_model_rules.aliases_unavailable')}
                      </div>
                    ) : mappings.length === 0 ? (
                      <div className={styles.aliasEmpty}>
                        <span>{t('oauth_model_rules.alias_empty')}</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={addMappingEntry}
                          disabled={disableControls || saving}
                        >
                          {t('oauth_model_rules.add_alias')}
                        </Button>
                      </div>
                    ) : (
                      <div className={styles.mappingsBody}>
                        <div className={styles.mappingList}>
                          {mappings.map((entry, index) => (
                            <div key={entry.id} className={styles.mappingRow}>
                              <div className={styles.mappingRowMain}>
                                <div className={styles.mappingField}>
                                  <span className={styles.mappingFieldLabel}>
                                    {t('oauth_model_alias.alias_name_placeholder')}
                                  </span>
                                  <AutocompleteInput
                                    wrapperStyle={{ marginBottom: 0 }}
                                    dropdownClassName={styles.originalModelDropdown}
                                    portal
                                    placeholder={t('oauth_model_alias.alias_name_placeholder')}
                                    value={entry.name}
                                    onChange={(value) => updateMappingEntry(index, 'name', value)}
                                    disabled={disableControls || saving}
                                    options={modelsList.map((model) => ({
                                      value: model.id,
                                      label:
                                        model.display_name && model.display_name !== model.id
                                          ? model.display_name
                                          : undefined,
                                    }))}
                                  />
                                </div>
                                <span className={styles.mappingSeparator} aria-hidden="true">
                                  →
                                </span>
                                <div className={styles.mappingField}>
                                  <span className={styles.mappingFieldLabel}>
                                    {t('oauth_model_alias.alias_placeholder')}
                                  </span>
                                  <input
                                    className={`input ${styles.mappingAliasInput}`}
                                    aria-label={t('oauth_model_alias.alias_placeholder')}
                                    placeholder={t('oauth_model_alias.alias_placeholder')}
                                    value={entry.alias}
                                    onChange={(event) =>
                                      updateMappingEntry(index, 'alias', event.target.value)
                                    }
                                    disabled={disableControls || saving}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={styles.mappingRemove}
                                  onClick={() => removeMappingEntry(entry.id)}
                                  disabled={disableControls || saving}
                                  title={t('common.delete')}
                                  aria-label={t('common.delete')}
                                >
                                  <IconX size={14} />
                                </Button>
                              </div>

                              <div className={styles.mappingRowSettings}>
                                <div className={styles.mappingFork}>
                                  <ToggleSwitch
                                    label={t('oauth_model_alias.alias_fork_label')}
                                    checked={Boolean(entry.fork)}
                                    onChange={(value) => updateMappingEntry(index, 'fork', value)}
                                    disabled={disableControls || saving}
                                  />
                                </div>
                                {resolvedProviderKey === 'codex' && (
                                  <div className={styles.reasoningInline}>
                                    <div className={styles.reasoningDefault}>
                                      <span className={styles.reasoningLabel}>
                                        {t('oauth_model_rules.reasoning_default_label')}
                                      </span>
                                      <Select
                                        id={`oauth-model-rules-reasoning-default-${entry.id}`}
                                        className={styles.reasoningSelect}
                                        value={entry.reasoningEffort?.default ?? ''}
                                        options={reasoningEffortOptions}
                                        dropdownClassName={styles.reasoningDropdown}
                                        onChange={(value) =>
                                          updateReasoningEffort(index, 'default', value)
                                        }
                                        disabled={disableControls || saving}
                                        ariaLabel={t('oauth_model_rules.reasoning_default_label')}
                                      />
                                    </div>
                                    <details className={styles.reasoningDetails}>
                                      <summary>
                                        {getReasoningOverrideCount(entry.reasoningEffort) > 0
                                          ? t('oauth_model_rules.reasoning_more_configured', {
                                              count: getReasoningOverrideCount(
                                                entry.reasoningEffort
                                              ),
                                            })
                                          : t('oauth_model_rules.reasoning_more')}
                                      </summary>
                                      <div className={styles.reasoningOverrides}>
                                        {REASONING_EFFORT_SOURCES.filter(
                                          (source) => source !== 'default'
                                        ).map((source) => (
                                          <div key={source} className={styles.reasoningOverride}>
                                            <span>{getReasoningSourceLabel(source)}</span>
                                            <Select
                                              id={`oauth-model-rules-reasoning-${entry.id}-${source}`}
                                              className={styles.reasoningSelect}
                                              value={entry.reasoningEffort?.[source] ?? ''}
                                              options={reasoningEffortOptions}
                                              dropdownClassName={styles.reasoningDropdown}
                                              onChange={(value) =>
                                                updateReasoningEffort(index, source, value)
                                              }
                                              disabled={disableControls || saving}
                                              ariaLabel={t(
                                                'oauth_model_rules.reasoning_override_label',
                                                {
                                                  source: getReasoningSourceLabel(source),
                                                }
                                              )}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  </div>
                                )}
                              </div>
                              {mappingErrors[entry.id] && (
                                <p
                                  id={`oauth-model-rules-reasoning-error-${entry.id}`}
                                  className={styles.mappingError}
                                >
                                  {mappingErrors[entry.id]}
                                </p>
                              )}
                            </div>
                          ))}
                          {aliasDirty && aliasPayload.entries.length === 0 && (
                            <div className={styles.clearNotice} role="status">
                              {t('oauth_model_rules.alias_clear_notice')}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Legacy route wrapper. The main Auth Files workflow opens the same editor in place;
 * direct links remain supported so bookmarked configuration URLs keep working.
 */
export function AuthFilesOAuthModelRulesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialProvider = searchParams.get('provider') ?? '';

  const handleClose = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAuthFiles) {
      navigate(-1);
      return;
    }
    navigate('/auth-files', { replace: true });
  }, [location.state, navigate]);

  return (
    <OAuthModelRulesEditorModal open initialProvider={initialProvider} onClose={handleClose} />
  );
}
