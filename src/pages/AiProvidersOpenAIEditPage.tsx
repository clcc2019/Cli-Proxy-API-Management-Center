import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { IconBot, IconX } from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { ModelInputList } from '@/components/ui/ModelInputList';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ProviderEditShell } from '@/components/common/ProviderEditShell';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useEventCallback } from '@/hooks';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type {
  OpenAICompatibilityApiKeyEntry,
  OpenAICompatibilityConfig,
  OpenAICompatibilityModel,
} from '@/types';
import { areKeyValueEntriesEqual, areModelEntriesEqual } from '@/utils/compare';
import {
  buildHeaderObject,
  headersToEntries,
  normalizeHeaderEntries,
  type HeaderEntry,
} from '@/utils/headers';
import { isProviderPrefixValid, normalizeProviderPrefix } from '@/components/providers/utils';
import { getErrorMessage } from '@/utils/error';
import styles from './AiProvidersPage.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

type ApiKeyEntryForm = {
  apiKey: string;
  proxyUrl: string;
  authIndex?: string;
};

const EMPTY_OPENAI_API_KEY_ENTRY: ApiKeyEntryForm = { apiKey: '', proxyUrl: '' };

type OpenAIFormState = {
  name: string;
  priority?: number;
  prefix: string;
  disabled: boolean;
  poolMode: boolean;
  baseUrl: string;
  disableCooling: boolean;
  testModel: string;
  apiKeyEntries: ApiKeyEntryForm[];
  headers: HeaderEntry[];
  modelEntries: ModelEntry[];
};

type OpenAIFormBaseline = {
  name: string;
  priority: number | null;
  prefix: string;
  disabled: boolean;
  poolMode: boolean;
  baseUrl: string;
  disableCooling: boolean;
  testModel: string;
  apiKeyEntries: ApiKeyEntryForm[];
  headers: HeaderEntry[];
  models: ModelEntry[];
};

const buildEmptyForm = (): OpenAIFormState => ({
  name: '',
  priority: undefined,
  prefix: '',
  disabled: false,
  poolMode: false,
  baseUrl: '',
  disableCooling: false,
  testModel: '',
  apiKeyEntries: [{ apiKey: '', proxyUrl: '' }],
  headers: [],
  modelEntries: [{ name: '', alias: '' }],
});

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeApiKeyEntries = (entries: ApiKeyEntryForm[]) =>
  (entries ?? []).reduce<ApiKeyEntryForm[]>((acc, entry) => {
    const apiKey = String(entry?.apiKey ?? '').trim();
    const proxyUrl = String(entry?.proxyUrl ?? '').trim();
    const authIndex = String(entry?.authIndex ?? '').trim();
    if (!apiKey && !proxyUrl) return acc;
    acc.push({ apiKey, proxyUrl, authIndex: authIndex || undefined });
    return acc;
  }, []);

const normalizeModelEntries = (entries: ModelEntry[]) =>
  (entries ?? []).reduce<ModelEntry[]>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name && alias === name) alias = '';
    if (!name && !alias) return acc;
    acc.push({ name, alias });
    return acc;
  }, []);

const areApiKeyEntriesEqual = (left: ApiKeyEntryForm[], right: ApiKeyEntryForm[]) => {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (!a || !b) return false;
    if (a.apiKey !== b.apiKey || a.proxyUrl !== b.proxyUrl || a.authIndex !== b.authIndex) {
      return false;
    }
  }
  return true;
};

const buildFormFromConfig = (config: OpenAICompatibilityConfig): OpenAIFormState => ({
  name: config.name ?? '',
  priority: config.priority,
  prefix: config.prefix ?? '',
  disabled: Boolean(config.disabled),
  poolMode: Boolean(config.poolMode),
  baseUrl: config.baseUrl ?? '',
  disableCooling: Boolean(config.disableCooling),
  testModel: config.testModel ?? '',
  apiKeyEntries:
    config.apiKeyEntries?.length
      ? config.apiKeyEntries.map((entry) => ({
          apiKey: entry.apiKey ?? '',
          proxyUrl: entry.proxyUrl ?? '',
          authIndex: entry.authIndex,
        }))
      : [{ apiKey: '', proxyUrl: '' }],
  headers: headersToEntries(config.headers),
  modelEntries: modelsToEntries(config.models),
});

const buildOpenAIBaseline = (form: OpenAIFormState): OpenAIFormBaseline => ({
  name: String(form.name ?? '').trim(),
  priority:
    form.priority !== undefined && Number.isFinite(form.priority) ? Math.trunc(form.priority) : null,
  prefix: String(form.prefix ?? '').trim(),
  disabled: Boolean(form.disabled),
  poolMode: Boolean(form.poolMode),
  baseUrl: String(form.baseUrl ?? '').trim(),
  disableCooling: Boolean(form.disableCooling),
  testModel: String(form.testModel ?? '').trim(),
  apiKeyEntries: normalizeApiKeyEntries(form.apiKeyEntries),
  headers: normalizeHeaderEntries(form.headers),
  models: normalizeModelEntries(form.modelEntries),
});

const buildApiKeyPayload = (entries: ApiKeyEntryForm[]): OpenAICompatibilityApiKeyEntry[] =>
  normalizeApiKeyEntries(entries)
    .filter((entry) => entry.apiKey)
    .map((entry) => ({
      apiKey: entry.apiKey,
      proxyUrl: entry.proxyUrl || undefined,
      authIndex: entry.authIndex,
    }));

const buildModelPayload = (
  entries: ModelEntry[],
  originalModels?: OpenAICompatibilityModel[]
): OpenAICompatibilityModel[] => {
  const originalByName = new Map<string, OpenAICompatibilityModel>();
  (originalModels ?? []).forEach((model) => {
    const name = String(model?.name ?? '').trim();
    if (name) originalByName.set(name.toLowerCase(), model);
  });

  return normalizeModelEntries(entries)
    .filter((entry) => entry.name)
    .map((entry) => {
      const original = originalByName.get(entry.name.toLowerCase());
      const next: OpenAICompatibilityModel = original ? { ...original } : { name: entry.name };
      next.name = entry.name;
      if (entry.alias && entry.alias !== entry.name) {
        next.alias = entry.alias;
      } else {
        delete next.alias;
      }
      return next;
    });
};

type OpenAIApiKeyInputField = 'apiKey' | 'proxyUrl';

interface OpenAIApiKeyInputRowProps {
  entry: ApiKeyEntryForm;
  index: number;
  disabled: boolean;
  apiKeyPlaceholder: string;
  proxyPlaceholder: string;
  deleteLabel: string;
  removeButtonClassName: string;
  removeDisabled: boolean;
  onUpdate: (index: number, field: OpenAIApiKeyInputField, value: string) => void;
  onRemove: (index: number) => void;
}

const OpenAIApiKeyInputRow = memo(function OpenAIApiKeyInputRow({
  entry,
  index,
  disabled,
  apiKeyPlaceholder,
  proxyPlaceholder,
  deleteLabel,
  removeButtonClassName,
  removeDisabled,
  onUpdate,
  onRemove,
}: OpenAIApiKeyInputRowProps) {
  return (
    <div className={styles.openaiKeyInputRow}>
      <input
        className="input"
        value={entry.apiKey}
        placeholder={apiKeyPlaceholder}
        aria-label={`${apiKeyPlaceholder} ${index + 1}`}
        onChange={(event) => onUpdate(index, 'apiKey', event.target.value)}
        disabled={disabled}
      />
      <input
        className="input"
        value={entry.proxyUrl}
        placeholder={proxyPlaceholder}
        aria-label={`${proxyPlaceholder} ${index + 1}`}
        onChange={(event) => onUpdate(index, 'proxyUrl', event.target.value)}
        disabled={disabled}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled || removeDisabled}
        title={deleteLabel}
        aria-label={deleteLabel}
        className={removeButtonClassName}
      >
        <IconX size={14} />
      </Button>
    </div>
  );
});

const OpenAIApiKeyInputList = memo(function OpenAIApiKeyInputList({
  entries,
  onChange,
  disabled,
}: {
  entries: ApiKeyEntryForm[];
  onChange: (entries: ApiKeyEntryForm[]) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const currentEntries = entries.length ? entries : [EMPTY_OPENAI_API_KEY_ENTRY];

  const updateEntry = useEventCallback(
    (index: number, field: OpenAIApiKeyInputField, value: string) => {
      onChange(
        currentEntries.map((entry, idx) =>
          idx === index ? { ...entry, [field]: value } : entry
        )
      );
    }
  );

  const addEntry = useEventCallback(() => {
    onChange([...currentEntries, EMPTY_OPENAI_API_KEY_ENTRY]);
  });

  const removeEntry = useEventCallback((index: number) => {
    const next = currentEntries.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [EMPTY_OPENAI_API_KEY_ENTRY]);
  });

  return (
    <div className={styles.openaiKeyInputList}>
      {currentEntries.map((entry, index) => (
        <OpenAIApiKeyInputRow
          key={index}
          entry={entry}
          index={index}
          disabled={disabled}
          apiKeyPlaceholder={t('ai_providers.openai_key_placeholder')}
          proxyPlaceholder={t('ai_providers.openai_proxy_placeholder')}
          deleteLabel={t('common.delete')}
          removeButtonClassName={styles.modelRowRemoveButton}
          removeDisabled={currentEntries.length <= 1}
          onUpdate={updateEntry}
          onRemove={removeEntry}
        />
      ))}
      <Button
        variant="secondary"
        size="sm"
        onClick={addEntry}
        disabled={disabled}
        className="align-start"
      >
        {t('ai_providers.openai_keys_add_btn')}
      </Button>
    </div>
  );
});

export function AiProvidersOpenAIEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;

  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const disableControls = connectionStatus !== 'connected';
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [configs, setConfigs] = useState<OpenAICompatibilityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<OpenAIFormState>(() => buildEmptyForm());
  const [baseline, setBaseline] = useState(() => buildOpenAIBaseline(buildEmptyForm()));

  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialData;
  const title =
    editIndex !== null
      ? t('ai_providers.openai_edit_modal_title')
      : t('ai_providers.openai_add_modal_title');

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    let cancelled = false;
    const taskId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      setError('');

      void providersApi
        .getOpenAICompatConfigs()
        .then((value) => {
          if (cancelled) return;
          const nextConfigs = Array.isArray(value) ? value : [];
          const nextInitialData = editIndex === null ? undefined : nextConfigs[editIndex];
          const nextForm = nextInitialData ? buildFormFromConfig(nextInitialData) : buildEmptyForm();
          setConfigs(nextConfigs);
          setForm(nextForm);
          setBaseline(buildOpenAIBaseline(nextForm));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(getErrorMessage(err) || t('notification.refresh_failed'));
        })
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(taskId);
    };
  }, [editIndex, isCurrentLayer, t]);

  const normalizedHeaders = useMemo(() => normalizeHeaderEntries(form.headers), [form.headers]);
  const normalizedModels = useMemo(
    () => normalizeModelEntries(form.modelEntries),
    [form.modelEntries]
  );
  const normalizedApiKeyEntries = useMemo(
    () => normalizeApiKeyEntries(form.apiKeyEntries),
    [form.apiKeyEntries]
  );
  const normalizedPriority = useMemo(
    () =>
      form.priority !== undefined && Number.isFinite(form.priority)
        ? Math.trunc(form.priority)
        : null,
    [form.priority]
  );

  const isDirty =
    baseline.name !== form.name.trim() ||
    baseline.priority !== normalizedPriority ||
    baseline.prefix !== String(form.prefix ?? '').trim() ||
    baseline.disabled !== Boolean(form.disabled) ||
    baseline.poolMode !== Boolean(form.poolMode) ||
    baseline.baseUrl !== String(form.baseUrl ?? '').trim() ||
    baseline.disableCooling !== Boolean(form.disableCooling) ||
    baseline.testModel !== String(form.testModel ?? '').trim() ||
    !areApiKeyEntriesEqual(baseline.apiKeyEntries, normalizedApiKeyEntries) ||
    !areKeyValueEntriesEqual(baseline.headers, normalizedHeaders) ||
    !areModelEntriesEqual(baseline.models, normalizedModels);

  const canGuard = !loading && !saving && !invalidIndexParam && !invalidIndex;
  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: isCurrentLayer && canGuard,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const canSave = !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;

  const handleApiKeyEntriesChange = useCallback((apiKeyEntries: ApiKeyEntryForm[]) => {
    setForm((prev) => ({ ...prev, apiKeyEntries }));
  }, []);

  const handleHeaderEntriesChange = useCallback((headers: HeaderEntry[]) => {
    setForm((prev) => ({ ...prev, headers }));
  }, []);

  const handleModelEntriesChange = useCallback((modelEntries: ModelEntry[]) => {
    setForm((prev) => ({ ...prev, modelEntries }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const name = form.name.trim();
    const baseUrl = form.baseUrl.trim();
    const rawPrefix = form.prefix ?? '';
    const normalizedPrefix = normalizeProviderPrefix(rawPrefix);
    if (!name || !baseUrl) {
      showNotification(t('notification.openai_provider_required'), 'error');
      return;
    }
    if (!isProviderPrefixValid(rawPrefix)) {
      showNotification(t('notification.prefix_invalid'), 'error');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: OpenAICompatibilityConfig = {
        name,
        priority: normalizedPriority ?? undefined,
        prefix: normalizedPrefix || undefined,
        disabled:
          form.disabled || initialData?.disabled !== undefined ? Boolean(form.disabled) : undefined,
        poolMode:
          form.poolMode || initialData?.poolMode !== undefined ? Boolean(form.poolMode) : undefined,
        baseUrl,
        disableCooling:
          form.disableCooling || initialData?.disableCooling !== undefined
            ? Boolean(form.disableCooling)
            : undefined,
        testModel: form.testModel.trim() || undefined,
        apiKeyEntries: buildApiKeyPayload(form.apiKeyEntries),
        headers: buildHeaderObject(form.headers),
        models: buildModelPayload(form.modelEntries, initialData?.models),
      };

      const nextList =
        editIndex !== null
          ? configs.map((item, index) => (index === editIndex ? payload : item))
          : [...configs, payload];

      await providersApi.saveOpenAICompatConfigs(nextList);
      const persisted = await providersApi.getOpenAICompatConfigs();
      setConfigs(persisted);
      updateConfigValue('openai-compatibility', persisted);
      clearCache('openai-compatibility');
      showNotification(
        editIndex !== null
          ? t('notification.openai_provider_updated')
          : t('notification.openai_provider_added'),
        'success'
      );
      allowNextNavigation();
      setBaseline(buildOpenAIBaseline(form));
      handleBack();
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    canSave,
    clearCache,
    configs,
    editIndex,
    form,
    handleBack,
    initialData,
    normalizedPriority,
    showNotification,
    t,
    updateConfigValue,
  ]);

  return (
    <ProviderEditShell
      title={title}
      leadingIcon={<IconBot size={17} />}
      onBack={handleBack}
      floatingAction={
        <>
          <Button variant="secondary" size="sm" onClick={handleBack}>
            {t('common.back')}
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving} disabled={!canSave}>
            {t('common.save')}
          </Button>
        </>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {invalidIndexParam || invalidIndex ? (
          <div className="hint">{t('common.invalid_provider_index')}</div>
        ) : (
          <div className={styles.openaiEditForm}>
            <Input
              label={t('ai_providers.openai_add_modal_name_label')}
              placeholder={t('ai_providers.openai_add_modal_name_placeholder')}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.priority_label')}
              hint={t('ai_providers.priority_hint')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(event) => {
                const raw = event.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  priority: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                }));
              }}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              hint={t('ai_providers.prefix_hint')}
              value={form.prefix}
              onChange={(event) => setForm((prev) => ({ ...prev, prefix: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.openai_add_modal_url_label')}
              placeholder={t('ai_providers.openai_add_modal_url_placeholder')}
              value={form.baseUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.openai_test_model_placeholder')}
              value={form.testModel}
              onChange={(event) => setForm((prev) => ({ ...prev, testModel: event.target.value }))}
              disabled={disableControls || saving}
            />

            <div className={styles.openaiSwitchGrid}>
              <div className="form-group">
                <span className="form-label">{t('ai_providers.config_toggle_label')}</span>
                <ToggleSwitch
                  checked={!form.disabled}
                  onChange={(value) => setForm((prev) => ({ ...prev, disabled: !value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.config_toggle_label')}
                />
              </div>
              <div className="form-group">
                <span className="form-label">{t('ai_providers.openai_pool_mode_label')}</span>
                <ToggleSwitch
                  checked={Boolean(form.poolMode)}
                  onChange={(value) => setForm((prev) => ({ ...prev, poolMode: value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.openai_pool_mode_label')}
                />
              </div>
              <div className="form-group">
                <span className="form-label">{t('ai_providers.disable_cooling_label')}</span>
                <ToggleSwitch
                  checked={Boolean(form.disableCooling)}
                  onChange={(value) => setForm((prev) => ({ ...prev, disableCooling: value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.disable_cooling_label')}
                />
              </div>
            </div>

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <span className={styles.modelConfigTitle}>
                  {t('ai_providers.openai_add_modal_keys_label')}
                </span>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.openai_keys_hint')}</div>
              <OpenAIApiKeyInputList
                entries={form.apiKeyEntries}
                onChange={handleApiKeyEntriesChange}
                disabled={disableControls || saving}
              />
            </div>

            <HeaderInputList
              entries={form.headers}
              onChange={handleHeaderEntriesChange}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={disableControls || saving}
            />

            <div className={styles.modelConfigSection}>
              <div className={styles.modelConfigHeader}>
                <span className={styles.modelConfigTitle}>
                  {t('ai_providers.openai_add_modal_models_label')}
                </span>
              </div>
              <div className={styles.sectionHint}>{t('ai_providers.openai_models_hint')}</div>
              <ModelInputList
                entries={form.modelEntries}
                onChange={handleModelEntriesChange}
                addLabel={t('ai_providers.openai_models_add_btn')}
                namePlaceholder={t('ai_providers.openai_model_name_placeholder')}
                aliasPlaceholder={t('ai_providers.openai_model_alias_placeholder')}
                disabled={disableControls || saving}
                className={styles.modelInputList}
                rowClassName={styles.modelInputRow}
                inputClassName={styles.modelInputField}
                removeButtonClassName={styles.modelRowRemoveButton}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
              />
            </div>
          </div>
        )}
      </Card>
    </ProviderEditShell>
  );
}
