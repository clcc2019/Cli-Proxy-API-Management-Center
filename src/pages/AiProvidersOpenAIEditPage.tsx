import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import {
  IconBot,
  IconChevronDown,
  IconX,
} from '@/components/ui/icons';
import { Input } from '@/components/ui/Input';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { Modal } from '@/components/ui/Modal';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { modelsToEntries } from '@/components/ui/modelInputListUtils';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ProviderEditShell } from '@/components/common/ProviderEditShell';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useEventCallback } from '@/hooks';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { modelsApi, providersApi } from '@/services/api';
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
import type { ModelInfo } from '@/utils/models';
import styles from './AiProvidersOpenAIEditPage.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

type ApiKeyEntryForm = {
  apiKey: string;
  proxyUrl: string;
  authIndex?: string;
};

const EMPTY_OPENAI_API_KEY_ENTRY: ApiKeyEntryForm = { apiKey: '', proxyUrl: '' };
const EMPTY_MODEL_INFO_LIST: ModelInfo[] = [];
const EMPTY_MODEL_NAMES: string[] = [];

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
  apiKeyEntries: config.apiKeyEntries?.length
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
    form.priority !== undefined && Number.isFinite(form.priority)
      ? Math.trunc(form.priority)
      : null,
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
        currentEntries.map((entry, idx) => (idx === index ? { ...entry, [field]: value } : entry))
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
      <div className={styles.openaiKeyColumnLabels} aria-hidden="true">
        <span>{t('ai_providers.openai_key_column_label')}</span>
        <span>{t('ai_providers.openai_proxy_column_label')}</span>
        <span />
      </div>
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

type OpenAIEditorSectionProps = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  meta?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
};

function OpenAIEditorSection({
  id,
  title,
  description,
  meta,
  defaultExpanded = false,
  children,
}: OpenAIEditorSectionProps) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = !isMobile || expanded;

  return (
    <section className={styles.editorSection} aria-labelledby={id}>
      <header className={styles.sectionHeader}>
        <div className={styles.sectionHeading}>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
        {meta && <span className={styles.sectionMeta}>{meta}</span>}
        {isMobile && (
          <button
            type="button"
            className={styles.sectionToggle}
            aria-label={String(title)}
            aria-expanded={expanded}
            aria-controls={`${id}-content`}
            onClick={() => setExpanded((value) => !value)}
          >
            <IconChevronDown size={18} aria-hidden="true" />
          </button>
        )}
      </header>
      {isExpanded && (
        <div id={`${id}-content`} className={styles.sectionBody}>
          {children}
        </div>
      )}
    </section>
  );
}

type OpenAIModelDiscoveryRowProps = {
  model: ModelInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (name: string) => void;
};

const OpenAIModelDiscoveryRow = memo(function OpenAIModelDiscoveryRow({
  model,
  checked,
  disabled,
  onToggle,
}: OpenAIModelDiscoveryRowProps) {
  return (
    <SelectionCheckbox
      checked={checked}
      onChange={() => onToggle(model.name)}
      disabled={disabled}
      ariaLabel={model.name}
      className={`${styles.modelDiscoveryRow} ${checked ? styles.modelDiscoveryRowSelected : ''}`}
      labelClassName={styles.modelDiscoverySelectionLabel}
      label={
        <div className={styles.modelDiscoveryMeta}>
          <div className={styles.modelDiscoveryName}>
            {model.name}
            {model.alias && <span className={styles.modelDiscoveryAlias}>{model.alias}</span>}
          </div>
          {model.description && (
            <div className={styles.modelDiscoveryDescription}>{model.description}</div>
          )}
        </div>
      }
    />
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
  const [modelDiscoveryOpen, setModelDiscoveryOpen] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<ModelInfo[]>([]);
  const [modelDiscoveryFetching, setModelDiscoveryFetching] = useState(false);
  const [modelDiscoveryError, setModelDiscoveryError] = useState('');
  const [modelDiscoverySearch, setModelDiscoverySearch] = useState('');
  const [modelDiscoverySelected, setModelDiscoverySelected] = useState<Set<string>>(new Set());
  const autoFetchSignatureRef = useRef('');
  const modelDiscoveryRequestIdRef = useRef(0);
  const modelDiscoveryHintId = useId();

  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialData;
  const modelDiscoveryEndpoint = useMemo(
    () => modelsApi.buildModelsEndpoint(form.baseUrl),
    [form.baseUrl]
  );
  const firstApiKey = useMemo(
    () => form.apiKeyEntries.find((entry) => entry.apiKey.trim())?.apiKey.trim() ?? '',
    [form.apiKeyEntries]
  );
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
          const nextForm = nextInitialData
            ? buildFormFromConfig(nextInitialData)
            : buildEmptyForm();
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
  const discoveredModelsFiltered = useMemo(() => {
    if (!isCurrentLayer) return EMPTY_MODEL_INFO_LIST;

    const filter = modelDiscoverySearch.trim().toLowerCase();
    if (!filter) return discoveredModels;
    return discoveredModels.filter((model) => {
      const name = model.name.toLowerCase();
      const alias = (model.alias ?? '').toLowerCase();
      const description = (model.description ?? '').toLowerCase();
      return name.includes(filter) || alias.includes(filter) || description.includes(filter);
    });
  }, [discoveredModels, isCurrentLayer, modelDiscoverySearch]);
  const visibleDiscoveredModelNames = useMemo(
    () =>
      isCurrentLayer ? discoveredModelsFiltered.map((model) => model.name) : EMPTY_MODEL_NAMES,
    [discoveredModelsFiltered, isCurrentLayer]
  );
  const allVisibleDiscoveredSelected = useMemo(
    () =>
      visibleDiscoveredModelNames.length > 0 &&
      visibleDiscoveredModelNames.every((name) => modelDiscoverySelected.has(name)),
    [modelDiscoverySelected, visibleDiscoveredModelNames]
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
  const canOpenModelDiscovery =
    !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;
  const canApplyModelDiscovery =
    !disableControls && !saving && !modelDiscoveryFetching && modelDiscoverySelected.size > 0;

  const handleApiKeyEntriesChange = useCallback((apiKeyEntries: ApiKeyEntryForm[]) => {
    setForm((prev) => ({ ...prev, apiKeyEntries }));
  }, []);

  const handleHeaderEntriesChange = useCallback((headers: HeaderEntry[]) => {
    setForm((prev) => ({ ...prev, headers }));
  }, []);

  const handleModelEntriesChange = useCallback((modelEntries: ModelEntry[]) => {
    setForm((prev) => ({ ...prev, modelEntries }));
  }, []);

  const commitDiscoveredModels = useCallback((nextModels: ModelInfo[]) => {
    const availableNames = new Set(nextModels.map((model) => model.name));
    setDiscoveredModels(nextModels);
    setModelDiscoverySelected((prev) => {
      const next = new Set(Array.from(prev).filter((name) => availableNames.has(name)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  const mergeDiscoveredModels = useCallback(
    (selectedModels: ModelInfo[]) => {
      const existingNames = new Set(
        form.modelEntries.map((entry) => entry.name.trim().toLowerCase()).filter(Boolean)
      );
      const additions = selectedModels.filter((model) => {
        const key = model.name.trim().toLowerCase();
        if (!key || existingNames.has(key)) return false;
        existingNames.add(key);
        return true;
      });
      if (!additions.length) return;

      setForm((prev) => {
        const entries = prev.modelEntries
          .map((entry) => ({ name: entry.name.trim(), alias: entry.alias.trim() }))
          .filter((entry) => entry.name || entry.alias);
        const mergedNames = new Set(
          entries.map((entry) => entry.name.toLowerCase()).filter(Boolean)
        );

        additions.forEach((model) => {
          const name = model.name.trim();
          const key = name.toLowerCase();
          if (!name || mergedNames.has(key)) return;
          mergedNames.add(key);
          entries.push({ name, alias: model.alias?.trim() ?? '' });
        });

        return {
          ...prev,
          modelEntries: entries.length ? entries : [{ name: '', alias: '' }],
        };
      });

      showNotification(
        t('ai_providers.openai_models_fetch_added', { count: additions.length }),
        'success'
      );
    },
    [form.modelEntries, showNotification, t]
  );

  const fetchOpenAIModelDiscovery = useCallback(async () => {
    const requestId = (modelDiscoveryRequestIdRef.current += 1);
    setModelDiscoveryFetching(true);
    setModelDiscoveryError('');

    try {
      const headerObject = buildHeaderObject(form.headers);
      const hasCustomAuthorization = Object.keys(headerObject).some(
        (key) => key.toLowerCase() === 'authorization'
      );
      const list = await modelsApi.fetchModelsViaApiCall(
        form.baseUrl,
        hasCustomAuthorization ? undefined : firstApiKey || undefined,
        headerObject
      );
      if (modelDiscoveryRequestIdRef.current !== requestId) return;
      commitDiscoveredModels(list);
    } catch (err: unknown) {
      if (modelDiscoveryRequestIdRef.current !== requestId) return;
      commitDiscoveredModels([]);
      setModelDiscoveryError(
        `${t('ai_providers.openai_models_fetch_error')}: ${getErrorMessage(err)}`
      );
    } finally {
      if (modelDiscoveryRequestIdRef.current === requestId) {
        setModelDiscoveryFetching(false);
      }
    }
  }, [commitDiscoveredModels, firstApiKey, form.baseUrl, form.headers, t]);

  useEffect(
    () => () => {
      modelDiscoveryRequestIdRef.current += 1;
    },
    []
  );

  useEffect(() => {
    if (!isCurrentLayer || !modelDiscoveryOpen) return undefined;

    const headerObject = buildHeaderObject(form.headers);
    const headerSignature = Object.entries(headerObject)
      .sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    const signature = `${modelDiscoveryEndpoint}||${firstApiKey}||${headerSignature}`;
    if (autoFetchSignatureRef.current === signature) return undefined;

    modelDiscoveryRequestIdRef.current += 1;
    const taskId = window.setTimeout(() => {
      autoFetchSignatureRef.current = signature;
      setModelDiscoveryFetching(false);
      setModelDiscoverySearch('');
      setModelDiscoveryError('');
      commitDiscoveredModels([]);
      if (modelDiscoveryEndpoint) {
        void fetchOpenAIModelDiscovery();
      }
    }, 0);

    return () => {
      window.clearTimeout(taskId);
      modelDiscoveryRequestIdRef.current += 1;
    };
  }, [
    commitDiscoveredModels,
    fetchOpenAIModelDiscovery,
    firstApiKey,
    form.headers,
    isCurrentLayer,
    modelDiscoveryEndpoint,
    modelDiscoveryOpen,
  ]);

  const handleOpenModelDiscovery = useCallback(() => {
    if (!modelDiscoveryEndpoint) {
      showNotification(t('ai_providers.openai_models_fetch_invalid_url'), 'error');
      return;
    }
    setModelDiscoveryOpen(true);
  }, [modelDiscoveryEndpoint, showNotification, t]);

  const closeModelDiscovery = useCallback(() => {
    autoFetchSignatureRef.current = '';
    modelDiscoveryRequestIdRef.current += 1;
    setModelDiscoveryFetching(false);
    setModelDiscoverySelected(new Set());
    setModelDiscoveryOpen(false);
  }, []);

  const toggleModelDiscoverySelection = useCallback((name: string) => {
    setModelDiscoverySelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleSelectVisibleDiscoveredModels = useCallback(() => {
    setModelDiscoverySelected((prev) => {
      const next = new Set(prev);
      visibleDiscoveredModelNames.forEach((name) => next.add(name));
      return next;
    });
  }, [visibleDiscoveredModelNames]);

  const handleClearDiscoveredModelSelection = useCallback(() => {
    setModelDiscoverySelected(new Set());
  }, []);

  const handleApplyDiscoveredModels = useCallback(() => {
    const selectedModels = discoveredModels.filter((model) =>
      modelDiscoverySelected.has(model.name)
    );
    mergeDiscoveredModels(selectedModels);
    closeModelDiscovery();
  }, [closeModelDiscovery, discoveredModels, mergeDiscoveredModels, modelDiscoverySelected]);

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
      className={styles.editorModal}
      contentClassName={styles.editorContent}
      width={960}
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
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}

      {invalidIndexParam || invalidIndex ? (
        <div className={styles.invalidState} role="status">
          {t('common.invalid_provider_index')}
        </div>
      ) : (
        <div className={styles.openaiEditForm}>
          <OpenAIEditorSection
            id="openai-editor-basic"
            title={t('ai_providers.openai_editor_basic_title')}
            description={t('ai_providers.openai_editor_basic_desc')}
            defaultExpanded
          >
            <div className={styles.fieldGrid}>
              <Input
                label={t('ai_providers.openai_add_modal_name_label')}
                placeholder={t('ai_providers.openai_add_modal_name_placeholder')}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                disabled={disableControls || saving}
              />
              <Input
                label={t('ai_providers.openai_add_modal_url_label')}
                placeholder={t('ai_providers.openai_add_modal_url_placeholder')}
                value={form.baseUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                disabled={disableControls || saving}
              />
            </div>
          </OpenAIEditorSection>

          <OpenAIEditorSection
            id="openai-editor-routing"
            title={t('ai_providers.openai_editor_routing_title')}
            description={t('ai_providers.openai_editor_routing_desc')}
          >
            <div className={styles.fieldGrid}>
              <Input
                label={t('ai_providers.prefix_label')}
                placeholder={t('ai_providers.prefix_placeholder')}
                hint={t('ai_providers.prefix_hint')}
                value={form.prefix}
                onChange={(event) => setForm((prev) => ({ ...prev, prefix: event.target.value }))}
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
            </div>

            <div className={styles.openaiSwitchGrid}>
              <div className={styles.switchOption}>
                <div className={styles.switchCopy}>
                  <span>{t('ai_providers.config_toggle_label')}</span>
                  <p>{t('ai_providers.openai_enabled_hint')}</p>
                </div>
                <ToggleSwitch
                  checked={!form.disabled}
                  onChange={(value) => setForm((prev) => ({ ...prev, disabled: !value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.config_toggle_label')}
                />
              </div>
              <div className={styles.switchOption}>
                <div className={styles.switchCopy}>
                  <span>{t('ai_providers.openai_pool_mode_label')}</span>
                  <p>{t('ai_providers.openai_pool_mode_hint')}</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(form.poolMode)}
                  onChange={(value) => setForm((prev) => ({ ...prev, poolMode: value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.openai_pool_mode_label')}
                />
              </div>
              <div className={styles.switchOption}>
                <div className={styles.switchCopy}>
                  <span>{t('ai_providers.disable_cooling_label')}</span>
                  <p>{t('ai_providers.openai_disable_cooling_hint')}</p>
                </div>
                <ToggleSwitch
                  checked={Boolean(form.disableCooling)}
                  onChange={(value) => setForm((prev) => ({ ...prev, disableCooling: value }))}
                  disabled={disableControls || saving}
                  ariaLabel={t('ai_providers.disable_cooling_label')}
                />
              </div>
            </div>
          </OpenAIEditorSection>

          <OpenAIEditorSection
            id="openai-editor-credentials"
            title={t('ai_providers.openai_editor_credentials_title')}
            description={t('ai_providers.openai_editor_credentials_desc')}
            meta={t('ai_providers.openai_keys_summary', {
              count: normalizedApiKeyEntries.length,
            })}
          >
            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span>{t('ai_providers.openai_add_modal_keys_label')}</span>
                <p>{t('ai_providers.openai_keys_hint')}</p>
              </div>
              <OpenAIApiKeyInputList
                entries={form.apiKeyEntries}
                onChange={handleApiKeyEntriesChange}
                disabled={disableControls || saving}
              />
            </div>

            <div className={styles.subsection}>
              <div className={styles.subsectionHeader}>
                <span>{t('common.custom_headers_label')}</span>
                <p>{t('common.custom_headers_hint')}</p>
              </div>
              <div className={styles.customHeaders}>
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
              </div>
            </div>
          </OpenAIEditorSection>

          <OpenAIEditorSection
            id="openai-editor-models"
            title={t('ai_providers.openai_editor_models_title')}
            description={t('ai_providers.openai_editor_models_desc')}
            meta={t('ai_providers.openai_models_summary', { count: normalizedModels.length })}
          >
            <Input
              label={t('ai_providers.openai_test_model_placeholder')}
              hint={t('ai_providers.openai_test_model_hint')}
              value={form.testModel}
              onChange={(event) => setForm((prev) => ({ ...prev, testModel: event.target.value }))}
              disabled={disableControls || saving}
            />

            <div className={styles.subsection}>
              <div className={styles.subsectionHeaderRow}>
                <div className={styles.subsectionHeader}>
                  <span>{t('ai_providers.openai_add_modal_models_label')}</span>
                  <p>{t('ai_providers.openai_models_hint')}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenModelDiscovery}
                  disabled={!canOpenModelDiscovery}
                >
                  {t('ai_providers.openai_models_fetch_button')}
                </Button>
              </div>
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
          </OpenAIEditorSection>

          <Modal
            open={modelDiscoveryOpen}
            title={t('ai_providers.openai_models_fetch_title')}
            onClose={closeModelDiscovery}
            width={720}
            className={styles.modelDiscoveryModal}
            fullScreenOnMobile
            ariaDescribedBy={modelDiscoveryHintId}
            footer={
              <div className={styles.modelDiscoveryFooter}>
                <Button variant="secondary" size="sm" onClick={closeModelDiscovery}>
                  {t('common.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyDiscoveredModels}
                  disabled={!canApplyModelDiscovery}
                >
                  {t('ai_providers.openai_models_fetch_apply')}
                </Button>
              </div>
            }
          >
            <div className={styles.modelDiscoveryContent}>
              <p id={modelDiscoveryHintId} className={styles.modelDiscoveryIntro}>
                {t('ai_providers.openai_models_fetch_hint')}
              </p>

              <div className={styles.modelDiscoveryEndpoint}>
                <span>{t('ai_providers.openai_models_fetch_url_label')}</span>
                <div className={styles.modelDiscoveryEndpointControls}>
                  <input
                    className="input"
                    value={modelDiscoveryEndpoint}
                    aria-label={t('ai_providers.openai_models_fetch_url_label')}
                    readOnly
                  />
                  <RefreshButton
                    variant="secondary"
                    size="sm"
                    onClick={() => void fetchOpenAIModelDiscovery()}
                    loading={modelDiscoveryFetching}
                    disabled={disableControls || saving}
                    label={t('ai_providers.openai_models_fetch_refresh')}
                  >
                    {t('ai_providers.openai_models_fetch_refresh')}
                  </RefreshButton>
                </div>
              </div>

              <Input
                label={t('ai_providers.openai_models_search_label')}
                placeholder={t('ai_providers.openai_models_search_placeholder')}
                value={modelDiscoverySearch}
                onChange={(event) => setModelDiscoverySearch(event.target.value)}
                disabled={modelDiscoveryFetching}
              />

              {discoveredModels.length > 0 && (
                <div className={styles.modelDiscoveryToolbar}>
                  <div className={styles.modelDiscoveryToolbarActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSelectVisibleDiscoveredModels}
                      disabled={
                        disableControls ||
                        saving ||
                        modelDiscoveryFetching ||
                        discoveredModelsFiltered.length === 0 ||
                        allVisibleDiscoveredSelected
                      }
                    >
                      {t('ai_providers.model_discovery_select_visible')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearDiscoveredModelSelection}
                      disabled={
                        disableControls ||
                        saving ||
                        modelDiscoveryFetching ||
                        modelDiscoverySelected.size === 0
                      }
                    >
                      {t('ai_providers.model_discovery_clear_selection')}
                    </Button>
                  </div>
                  <span className={styles.modelDiscoverySelectionSummary}>
                    {t('ai_providers.model_discovery_selected_count', {
                      count: modelDiscoverySelected.size,
                    })}
                  </span>
                </div>
              )}

              {modelDiscoveryError && (
                <div className={styles.modelDiscoveryError} role="alert">
                  {modelDiscoveryError}
                </div>
              )}

              {modelDiscoveryFetching ? (
                <div className={styles.modelDiscoveryState} role="status" aria-live="polite">
                  {t('ai_providers.openai_models_fetch_loading')}
                </div>
              ) : discoveredModels.length === 0 ? (
                <div className={styles.modelDiscoveryState} role="status">
                  {t('ai_providers.openai_models_fetch_empty')}
                </div>
              ) : discoveredModelsFiltered.length === 0 ? (
                <div className={styles.modelDiscoveryState} role="status">
                  {t('ai_providers.openai_models_search_empty')}
                </div>
              ) : (
                <div className={styles.modelDiscoveryList}>
                  {discoveredModelsFiltered.map((model) => (
                    <OpenAIModelDiscoveryRow
                      key={model.name}
                      model={model}
                      checked={modelDiscoverySelected.has(model.name)}
                      disabled={disableControls || saving || modelDiscoveryFetching}
                      onToggle={toggleModelDiscoverySelection}
                    />
                  ))}
                </div>
              )}
            </div>
          </Modal>
        </div>
      )}
    </ProviderEditShell>
  );
}
