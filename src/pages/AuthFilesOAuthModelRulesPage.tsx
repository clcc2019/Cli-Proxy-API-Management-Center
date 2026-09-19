import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { Select, type SelectOption } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconTrash2, IconX } from '@/components/ui/icons';
import { authFilesApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { OAuthModelAliasEntry, OAuthReasoningEffort } from '@/types';
import { generateId } from '@/utils/helpers';
import { normalizeOAuthReasoningEffort } from '@/utils/oauthModelAlias';
import styles from './AuthFilesOAuthModelRulesPage.module.scss';

type AuthFileModelItem = {
  id: string;
  display_name?: string;
  type?: string;
  owned_by?: string;
};

type LocationState = { fromAuthFiles?: boolean } | null;
type UnsupportedError = 'unsupported' | null;
type MappingField = 'name' | 'alias' | 'fork';

type OAuthModelMappingFormEntry = OAuthModelAliasEntry & {
  id: string;
  effortOnly: boolean;
};

type ProviderDraft = {
  name: string;
  selectedModels: Set<string>;
  initialSelectedModels: Set<string>;
  mappings: OAuthModelMappingFormEntry[];
  initialMappingsSignature: string;
};

type AliasPayload = {
  entries: OAuthModelAliasEntry[];
  errors: Record<string, string>;
};

type SaveTask = {
  key: string;
  kind: 'excluded' | 'aliases';
  task: () => Promise<void>;
};

export type OAuthModelRulesEditorModalProps = {
  open: boolean;
  initialProvider?: string;
  onClose: () => void;
  onSaved?: () => Promise<void> | void;
};

const OAUTH_PROVIDER_PRESETS = ['claude', 'codex', 'xai', 'qwen', 'kimi'];
const OAUTH_PROVIDER_EXCLUDES = new Set(['all', 'unknown', 'empty']);
const REASONING_EFFORT_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
const EMPTY_MODEL_OPTIONS: Array<{ value: string; label?: string }> = [];
const EMPTY_PROVIDER_KEYS: string[] = [];
const EMPTY_STRING_SET = new Set<string>();

const normalizeProviderKey = (value: string) => value.trim().toLowerCase();

const getHttpStatus = (error: unknown): unknown =>
  typeof error === 'object' && error !== null && 'status' in error
    ? (error as { status?: unknown }).status
    : undefined;

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : '');

const getRecordEntry = <T,>(record: Record<string, T>, providerKey: string): T | undefined => {
  const direct = record[providerKey];
  if (direct !== undefined) return direct;
  return Object.entries(record).find(([key]) => normalizeProviderKey(key) === providerKey)?.[1];
};

const hasSameModelName = (entry: Pick<OAuthModelAliasEntry, 'name' | 'alias'>): boolean => {
  const name = entry.name.trim();
  const alias = entry.alias.trim();
  return Boolean(name && alias && name.toLowerCase() === alias.toLowerCase());
};

const buildEmptyMappingEntry = (): OAuthModelMappingFormEntry => ({
  id: generateId(),
  name: '',
  alias: '',
  fork: true,
  effortOnly: false,
});

const normalizeMappingEntries = (
  entries: OAuthModelAliasEntry[] | undefined,
  providerKey: string
): OAuthModelMappingFormEntry[] =>
  (entries ?? []).map((entry) => ({
    id: generateId(),
    name: entry.name ?? '',
    alias: entry.alias ?? '',
    fork: Boolean(entry.fork),
    reasoningEffort: normalizeOAuthReasoningEffort(entry.reasoningEffort),
    effortOnly: providerKey === 'codex' && hasSameModelName(entry),
  }));

const serializeReasoningEffort = (value?: OAuthReasoningEffort): [string, string][] =>
  Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right));

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

const isProviderAllowed = (value: string): boolean => {
  const normalized = normalizeProviderKey(value);
  return Boolean(normalized && !OAUTH_PROVIDER_EXCLUDES.has(normalized));
};

const createProviderDraft = (
  name: string,
  excluded: Record<string, string[]>,
  modelAlias: Record<string, OAuthModelAliasEntry[]>
): ProviderDraft => {
  const providerKey = normalizeProviderKey(name);
  const selectedModels = new Set(getRecordEntry(excluded, providerKey) ?? []);
  const mappings = normalizeMappingEntries(getRecordEntry(modelAlias, providerKey), providerKey);
  return {
    name: name.trim() || providerKey,
    selectedModels,
    initialSelectedModels: new Set(selectedModels),
    mappings,
    initialMappingsSignature: mappingSignature(mappings),
  };
};

const isExcludedDirty = (draft: ProviderDraft): boolean =>
  !areSetsEqual(draft.selectedModels, draft.initialSelectedModels);

const isAliasDirty = (draft: ProviderDraft): boolean =>
  mappingSignature(draft.mappings) !== draft.initialMappingsSignature;

const isDraftDirty = (
  draft: ProviderDraft,
  excludedSupported: boolean,
  aliasesSupported: boolean
) => (excludedSupported && isExcludedDirty(draft)) || (aliasesSupported && isAliasDirty(draft));

const addProviderName = (names: Map<string, string>, value: unknown) => {
  if (typeof value !== 'string') return;
  const trimmed = value.trim();
  const key = normalizeProviderKey(trimmed);
  if (!isProviderAllowed(trimmed) || names.has(key)) return;
  names.set(key, trimmed);
};

const collectProviderNames = (
  filesResponse: {
    type_counts?: Record<string, number>;
    files?: Array<{ type?: string; provider?: string }>;
  } | null,
  excluded: Record<string, string[]>,
  modelAlias: Record<string, OAuthModelAliasEntry[]>,
  initialProvider: string
): Map<string, string> => {
  const names = new Map<string, string>();
  OAUTH_PROVIDER_PRESETS.forEach((value) => addProviderName(names, value));
  Object.keys(filesResponse?.type_counts ?? {}).forEach((value) => addProviderName(names, value));
  (filesResponse?.files ?? []).forEach((file) => {
    addProviderName(names, file.type);
    addProviderName(names, file.provider);
  });
  Object.keys(excluded).forEach((value) => addProviderName(names, value));
  Object.keys(modelAlias).forEach((value) => addProviderName(names, value));
  addProviderName(names, initialProvider);
  return names;
};

const getReasoningSourceOrder = (source: string): number => {
  const index = REASONING_EFFORT_LEVELS.indexOf(source as (typeof REASONING_EFFORT_LEVELS)[number]);
  return index === -1 ? REASONING_EFFORT_LEVELS.length : index;
};

const sortReasoningSources = (sources: string[]): string[] =>
  [...sources].sort((left, right) => {
    const order = getReasoningSourceOrder(left) - getReasoningSourceOrder(right);
    return order || left.localeCompare(right);
  });

type ReasoningMappingEditorProps = {
  entry: OAuthModelMappingFormEntry;
  disabled: boolean;
  reasoningOptions: SelectOption[];
  onUpdate: (source: string, target: string) => void;
  onChangeSource: (source: string, nextSource: string) => void;
  onAdd: () => void;
  onRemove: (source: string) => void;
};

function ReasoningMappingEditor({
  entry,
  disabled,
  reasoningOptions,
  onUpdate,
  onChangeSource,
  onAdd,
  onRemove,
}: ReasoningMappingEditorProps) {
  const { t } = useTranslation();
  const reasoning = entry.reasoningEffort ?? {};
  const sources = sortReasoningSources(
    Object.keys(reasoning).filter((source) => source !== 'default')
  );
  const sourceOptions = (currentSource: string): SelectOption[] => {
    const knownSources = new Set([...REASONING_EFFORT_LEVELS, ...sources]);
    return Array.from(knownSources)
      .filter((source) => source === currentSource || !sources.includes(source))
      .sort((left, right) => getReasoningSourceOrder(left) - getReasoningSourceOrder(right))
      .map((source) => ({ value: source, label: source }));
  };

  return (
    <div className={styles.reasoningPanel}>
      <div className={styles.reasoningHeader}>
        <div>
          <strong>{t('oauth_model_rules.reasoning_matrix_title')}</strong>
          <p>{t('oauth_model_rules.reasoning_matrix_hint')}</p>
        </div>
        <div className={styles.defaultReasoning}>
          <span>{t('oauth_model_rules.reasoning_default_label')}</span>
          <Select
            className={styles.reasoningSelect}
            value={reasoning.default ?? ''}
            options={reasoningOptions}
            onChange={(value) => onUpdate('default', value)}
            disabled={disabled}
            ariaLabel={t('oauth_model_rules.reasoning_default_label')}
          />
        </div>
      </div>

      {sources.length > 0 ? (
        <div className={styles.reasoningRows}>
          {sources.map((source) => (
            <div className={styles.reasoningRow} key={source}>
              <Select
                className={styles.reasoningSelect}
                value={source}
                options={sourceOptions(source)}
                onChange={(value) => onChangeSource(source, value)}
                disabled={disabled}
                ariaLabel={t('oauth_model_rules.reasoning_request_level')}
              />
              <span className={styles.reasoningArrow} aria-hidden="true">
                →
              </span>
              <Select
                className={styles.reasoningSelect}
                value={reasoning[source] ?? ''}
                options={reasoningOptions}
                onChange={(value) => onUpdate(source, value)}
                disabled={disabled}
                ariaLabel={t('oauth_model_rules.reasoning_target_level')}
              />
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onRemove(source)}
                disabled={disabled}
                aria-label={t('common.delete')}
                title={t('common.delete')}
              >
                <IconTrash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.reasoningEmpty}>{t('oauth_model_rules.reasoning_matrix_hint')}</p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className={styles.addReasoningButton}
        onClick={onAdd}
        disabled={disabled || sources.length >= REASONING_EFFORT_LEVELS.length}
      >
        <IconPlus size={14} />
        {t('oauth_model_rules.reasoning_more')}
      </Button>
    </div>
  );
}

type RuleSummaryProps = {
  entry: OAuthModelMappingFormEntry;
  providerKey: string;
  error?: string;
  disabled: boolean;
  onOpen: () => void;
  onRemove: () => void;
};

function RuleSummary({ entry, providerKey, error, disabled, onOpen, onRemove }: RuleSummaryProps) {
  const { t } = useTranslation();
  const reasoningOnly = providerKey === 'codex' && entry.effortOnly;
  const reasoningCount = Object.keys(entry.reasoningEffort ?? {}).length;

  return (
    <article className={`${styles.ruleSummary} ${error ? styles.ruleSummaryInvalid : ''}`}>
      <button
        type="button"
        className={styles.ruleSummaryTrigger}
        onClick={onOpen}
        disabled={disabled}
        aria-label={`${entry.name || t('oauth_model_rules.new_rule')} → ${
          reasoningOnly
            ? t('oauth_model_rules.reasoning_only_short')
            : entry.alias || t('oauth_model_rules.new_rule')
        }`}
      >
        <div className={styles.ruleSummaryMain}>
          <span className={styles.ruleModel}>{entry.name || t('oauth_model_rules.new_rule')}</span>
          <span className={styles.ruleArrow} aria-hidden="true">
            →
          </span>
          <span className={styles.ruleTarget}>
            {reasoningOnly
              ? t('oauth_model_rules.reasoning_only_short')
              : entry.alias || t('oauth_model_rules.new_rule')}
          </span>
        </div>
        <div className={styles.ruleSummaryMeta}>
          {reasoningOnly && <span>{t('oauth_model_rules.reasoning_only_short')}</span>}
          {reasoningCount > 0 && (
            <span>{t('oauth_model_rules.reasoning_configured', { count: reasoningCount })}</span>
          )}
          {!reasoningOnly && entry.fork && <span>{t('oauth_model_alias.alias_fork_label')}</span>}
          {error && (
            <span className={styles.inlineError} role="alert">
              {error}
            </span>
          )}
        </div>
      </button>
      <div className={styles.ruleActions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('common.delete')}
          title={t('common.delete')}
        >
          <IconTrash2 size={15} />
        </button>
      </div>
    </article>
  );
}

type RuleEditorProps = {
  entry: OAuthModelMappingFormEntry;
  providerKey: string;
  disabled: boolean;
  modelOptions: Array<{ value: string; label?: string }>;
  reasoningOptions: SelectOption[];
  error?: string;
  onUpdate: (field: MappingField, value: string | boolean) => void;
  onModeChange: (reasoningOnly: boolean) => void;
  onUpdateReasoning: (source: string, target: string) => void;
  onChangeReasoningSource: (source: string, nextSource: string) => void;
  onAddReasoning: () => void;
  onRemoveReasoning: (source: string) => void;
  onDone: () => void;
};

function RuleEditor({
  entry,
  providerKey,
  disabled,
  modelOptions,
  reasoningOptions,
  error,
  onUpdate,
  onModeChange,
  onUpdateReasoning,
  onChangeReasoningSource,
  onAddReasoning,
  onRemoveReasoning,
  onDone,
}: RuleEditorProps) {
  const { t } = useTranslation();
  const reasoningOnly = providerKey === 'codex' && entry.effortOnly;

  return (
    <div className={styles.ruleEditor}>
      <div className={styles.ruleEditorHeader}>
        <strong>
          {entry.name || entry.alias
            ? t('oauth_model_rules.rule_editor_title')
            : t('oauth_model_rules.new_rule')}
        </strong>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={disabled}>
          {t('common.close')}
        </Button>
      </div>

      <div className={styles.editorGrid}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor={`oauth-rule-source-${entry.id}`}>
            {t('oauth_model_rules.source_model_label')}
          </label>
          <AutocompleteInput
            id={`oauth-rule-source-${entry.id}`}
            value={entry.name}
            onChange={(value) => onUpdate('name', value)}
            options={modelOptions}
            placeholder={t('oauth_model_rules.source_model_placeholder')}
            disabled={disabled}
            className={styles.modelAutocompleteInput}
            dropdownClassName={styles.modelDropdown}
            portal
            wrapperStyle={{ marginBottom: 0 }}
          />
        </div>
        <span className={styles.editorArrow} aria-hidden="true">
          →
        </span>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor={`oauth-rule-alias-${entry.id}`}>
            {reasoningOnly
              ? t('oauth_model_rules.reasoning_only_model_label')
              : t('oauth_model_rules.target_model_label')}
          </label>
          {reasoningOnly ? (
            <span className={styles.readonlyInput}>
              {entry.name || t('oauth_model_rules.new_rule')}
            </span>
          ) : (
            <AutocompleteInput
              id={`oauth-rule-alias-${entry.id}`}
              value={entry.alias}
              onChange={(value) => onUpdate('alias', value)}
              options={modelOptions}
              placeholder={t('oauth_model_rules.target_model_placeholder')}
              disabled={disabled}
              className={styles.modelAutocompleteInput}
              dropdownClassName={styles.modelDropdown}
              portal
              wrapperStyle={{ marginBottom: 0 }}
            />
          )}
        </div>
      </div>

      {providerKey === 'codex' && (
        <div className={styles.ruleOptions}>
          <div className={styles.modeGroup}>
            <span className={styles.fieldLabel}>{t('oauth_model_rules.rule_mode_label')}</span>
            <div
              className={styles.modeSwitch}
              role="tablist"
              aria-label={t('oauth_model_rules.rule_mode_label')}
            >
              <button
                type="button"
                role="tab"
                aria-selected={!reasoningOnly}
                className={`${styles.modeButton} ${!reasoningOnly ? styles.modeButtonActive : ''}`}
                onClick={() => onModeChange(false)}
                disabled={disabled}
              >
                {t('oauth_model_rules.rule_mode_rewrite')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={reasoningOnly}
                className={`${styles.modeButton} ${reasoningOnly ? styles.modeButtonActive : ''}`}
                onClick={() => onModeChange(true)}
                disabled={disabled}
              >
                {t('oauth_model_rules.rule_mode_reasoning')}
              </button>
            </div>
          </div>
          {!reasoningOnly && (
            <ToggleSwitch
              checked={Boolean(entry.fork)}
              onChange={(value) => onUpdate('fork', value)}
              label={t('oauth_model_alias.alias_fork_label')}
              disabled={disabled}
              className={styles.forkSwitch}
            />
          )}
        </div>
      )}

      {providerKey === 'codex' && (
        <ReasoningMappingEditor
          entry={entry}
          disabled={disabled}
          reasoningOptions={reasoningOptions}
          onUpdate={onUpdateReasoning}
          onChangeSource={onChangeReasoningSource}
          onAdd={onAddReasoning}
          onRemove={onRemoveReasoning}
        />
      )}

      {error && (
        <p className={styles.mappingError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.ruleEditorFooter}>
        <span>{t('oauth_model_rules.reasoning_matrix_hint')}</span>
        <Button variant="secondary" size="sm" onClick={onDone} disabled={disabled}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

export function OAuthModelRulesEditorModal({
  open,
  initialProvider = '',
  onClose,
  onSaved,
}: OAuthModelRulesEditorModalProps) {
  const { t } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const showNotification = useNotificationStore((state) => state.showNotification);
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const disableControls = connectionStatus !== 'connected';

  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({});
  const [activeProviderKey, setActiveProviderKey] = useState('');
  const [newProviderOpen, setNewProviderOpen] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [excludedError, setExcludedError] = useState<UnsupportedError>(null);
  const [modelAliasError, setModelAliasError] = useState<UnsupportedError>(null);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<UnsupportedError>(null);
  const [modelInput, setModelInput] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [mappingErrors, setMappingErrors] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const modelsRequestVersionRef = useRef(0);

  const excludedSupported = excludedError !== 'unsupported';
  const aliasesSupported = modelAliasError !== 'unsupported';
  const canConfigureAnything = excludedSupported || aliasesSupported;
  const activeDraft = activeProviderKey ? providerDrafts[activeProviderKey] : undefined;

  const updateDraft = useCallback(
    (providerKey: string, updater: (draft: ProviderDraft) => ProviderDraft) => {
      setProviderDrafts((previous) => {
        const current = previous[providerKey];
        if (!current) return previous;
        const next = updater(current);
        return next === current ? previous : { ...previous, [providerKey]: next };
      });
    },
    []
  );

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    let cancelled = false;
    const load = async () => {
      setInitialLoading(true);
      setExcludedError(null);
      setModelAliasError(null);

      const [filesResult, excludedResult, aliasResult] = await Promise.allSettled([
        authFilesApi.list({
          codexSubscription: 'skip',
          summary: true,
          includeRecentRequests: false,
          typeCountsOnly: true,
          page: 1,
          pageSize: 1,
        }),
        authFilesApi.getOauthExcludedModels(),
        authFilesApi.getOauthModelAlias(),
      ]);

      if (cancelled) return;

      const filesResponse = filesResult.status === 'fulfilled' ? filesResult.value : null;
      let nextExcluded: Record<string, string[]> = {};
      let nextModelAlias: Record<string, OAuthModelAliasEntry[]> = {};

      if (excludedResult.status === 'fulfilled') {
        nextExcluded = excludedResult.value ?? {};
      } else if (getHttpStatus(excludedResult.reason) === 404) {
        setExcludedError('unsupported');
      } else {
        showNotification(
          `${t('notification.load_failed')}: ${getErrorMessage(excludedResult.reason)}`,
          'error'
        );
      }

      if (aliasResult.status === 'fulfilled') {
        nextModelAlias = aliasResult.value ?? {};
      } else if (getHttpStatus(aliasResult.reason) === 404) {
        setModelAliasError('unsupported');
      } else {
        showNotification(
          `${t('notification.load_failed')}: ${getErrorMessage(aliasResult.reason)}`,
          'error'
        );
      }

      const providerNames = collectProviderNames(
        filesResponse,
        nextExcluded,
        nextModelAlias,
        initialProvider
      );
      const nextDrafts = Object.fromEntries(
        Array.from(providerNames.entries()).map(([key, name]) => [
          key,
          createProviderDraft(name, nextExcluded, nextModelAlias),
        ])
      );
      const initialKey = normalizeProviderKey(initialProvider);
      const firstConfiguredKey = Array.from(providerNames.keys()).find((key) => {
        const draft = nextDrafts[key];
        return draft && (draft.selectedModels.size > 0 || draft.mappings.length > 0);
      });
      const firstProviderKey = Array.from(providerNames.keys())[0] ?? '';

      setProviderDrafts(nextDrafts);
      setActiveProviderKey(initialKey || firstConfiguredKey || firstProviderKey);
      setMappingErrors({});
      setEditingRuleId(null);
      setInitialLoading(false);
    };

    const taskId = window.setTimeout(() => {
      void load().catch((error: unknown) => {
        if (cancelled) return;
        showNotification(`${t('notification.load_failed')}: ${getErrorMessage(error)}`, 'error');
        setInitialLoading(false);
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(taskId);
    };
  }, [initialProvider, isCurrentLayer, showNotification, t]);

  useEffect(() => {
    const requestVersion = (modelsRequestVersionRef.current += 1);
    if (!isCurrentLayer || initialLoading || !activeProviderKey || !canConfigureAnything) {
      const resetTask = window.setTimeout(() => {
        if (modelsRequestVersionRef.current !== requestVersion) return;
        setModelsList([]);
        setModelsError(null);
        setModelsLoading(false);
      }, 0);
      return () => window.clearTimeout(resetTask);
    }

    const requestTask = window.setTimeout(() => {
      if (modelsRequestVersionRef.current !== requestVersion) return;
      setModelsList([]);
      setModelsLoading(true);
      setModelsError(null);

      void authFilesApi
        .getModelDefinitions(activeProviderKey)
        .then((models) => {
          if (modelsRequestVersionRef.current === requestVersion) setModelsList(models);
        })
        .catch((error: unknown) => {
          if (modelsRequestVersionRef.current !== requestVersion) return;
          if (getHttpStatus(error) === 404) {
            setModelsError('unsupported');
            setModelsList([]);
            return;
          }
          showNotification(`${t('notification.load_failed')}: ${getErrorMessage(error)}`, 'error');
        })
        .finally(() => {
          if (modelsRequestVersionRef.current === requestVersion) setModelsLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(requestTask);
      if (modelsRequestVersionRef.current === requestVersion) modelsRequestVersionRef.current += 1;
    };
  }, [
    activeProviderKey,
    canConfigureAnything,
    initialLoading,
    isCurrentLayer,
    showNotification,
    t,
  ]);

  const providerKeys = useMemo(() => {
    const keys = Object.keys(providerDrafts);
    if (keys.length === 0) return EMPTY_PROVIDER_KEYS;
    return keys.sort((left, right) => {
      const leftPreset = OAUTH_PROVIDER_PRESETS.indexOf(left);
      const rightPreset = OAUTH_PROVIDER_PRESETS.indexOf(right);
      if (leftPreset !== -1 || rightPreset !== -1) {
        if (leftPreset === -1) return 1;
        if (rightPreset === -1) return -1;
        return leftPreset - rightPreset;
      }
      return left.localeCompare(right);
    });
  }, [providerDrafts]);

  const providerOptions = useMemo<SelectOption[]>(
    () => providerKeys.map((key) => ({ value: key, label: providerDrafts[key]?.name ?? key })),
    [providerDrafts, providerKeys]
  );

  const selectProvider = useCallback((providerKey: string) => {
    setActiveProviderKey(providerKey);
    setModelInput('');
    setEditingRuleId(null);
    setShowDiscardPrompt(false);
  }, []);

  const addProvider = useCallback(() => {
    const name = newProviderName.trim();
    const providerKey = normalizeProviderKey(name);
    if (!name) {
      showNotification(t('oauth_model_rules.provider_required'), 'error');
      return;
    }
    if (!isProviderAllowed(name)) {
      showNotification(t('oauth_model_rules.provider_name_invalid'), 'error');
      return;
    }

    if (providerDrafts[providerKey]) {
      selectProvider(providerKey);
      setNewProviderName('');
      setNewProviderOpen(false);
      return;
    }

    setProviderDrafts((previous) => ({
      ...previous,
      [providerKey]: createProviderDraft(name, {}, {}),
    }));
    selectProvider(providerKey);
    setNewProviderName('');
    setNewProviderOpen(false);
  }, [newProviderName, providerDrafts, selectProvider, showNotification, t]);

  const activeSelectedModels = activeDraft?.selectedModels ?? EMPTY_STRING_SET;
  const activeMappings = useMemo(() => activeDraft?.mappings ?? [], [activeDraft]);
  const activeExcludedDirty = activeDraft ? isExcludedDirty(activeDraft) : false;
  const activeAliasDirty = activeDraft ? isAliasDirty(activeDraft) : false;

  const reasoningOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('oauth_model_rules.reasoning_inherit') },
      ...REASONING_EFFORT_LEVELS.map((level) => ({ value: level, label: level })),
    ],
    [t]
  );

  const getAliasPayload = useCallback(
    (draft: ProviderDraft, providerKey: string): AliasPayload => {
      const entries: OAuthModelAliasEntry[] = [];
      const errors: Record<string, string> = {};
      const seen = new Set<string>();

      draft.mappings.forEach((entry) => {
        const name = entry.name.trim();
        const alias = entry.effortOnly ? name : entry.alias.trim();
        const reasoningEffort = normalizeOAuthReasoningEffort(entry.reasoningEffort);

        if (!name && !alias && !reasoningEffort && entry.fork) return;
        if (!name || !alias) {
          errors[entry.id] = t('oauth_model_rules.alias_incomplete');
          return;
        }

        const sameModel = hasSameModelName({ name, alias });
        if (sameModel && providerKey !== 'codex') {
          errors[entry.id] = t('oauth_model_rules.reasoning_same_model_codex_only');
          return;
        }
        if (sameModel && !reasoningEffort) {
          errors[entry.id] = t('oauth_model_rules.reasoning_same_model_requires_effort');
          return;
        }

        const key = `${name.toLowerCase()}::${alias.toLowerCase()}`;
        if (seen.has(key)) {
          errors[entry.id] = t('oauth_model_rules.alias_duplicate');
          return;
        }
        seen.add(key);

        const next: OAuthModelAliasEntry =
          entry.fork && !sameModel ? { name, alias, fork: true } : { name, alias };
        if (reasoningEffort) next.reasoningEffort = reasoningEffort;
        entries.push(next);
      });

      return { entries, errors };
    },
    [t]
  );

  const activeAliasPayload = useMemo(
    () =>
      activeDraft && activeProviderKey
        ? getAliasPayload(activeDraft, activeProviderKey)
        : { entries: [], errors: {} },
    [activeDraft, activeProviderKey, getAliasPayload]
  );

  const modelOptions = useMemo(() => {
    if (!activeDraft || !isCurrentLayer) return EMPTY_MODEL_OPTIONS;
    const options: Array<{ value: string; label?: string }> = modelsList.map((model) => ({
      value: model.id,
      label: model.display_name && model.display_name !== model.id ? model.display_name : undefined,
    }));
    const knownIds = new Set(options.map((option) => option.value));
    activeSelectedModels.forEach((model) => {
      if (model !== '*' && !knownIds.has(model)) options.push({ value: model });
    });
    activeMappings.forEach((entry) => {
      const source = entry.name.trim();
      if (source && !knownIds.has(source)) {
        options.push({ value: source });
        knownIds.add(source);
      }
    });
    return options;
  }, [activeDraft, activeMappings, activeSelectedModels, isCurrentLayer, modelsList]);

  const modelSourceStatus = modelsLoading
    ? t('oauth_model_rules.model_source_loading')
    : modelsError === 'unsupported'
      ? t('oauth_model_rules.model_source_unavailable')
      : modelsList.length > 0
        ? t('oauth_model_rules.model_source_loaded', { count: modelsList.length })
        : t('oauth_model_rules.model_source_manual');

  const clearMappingError = useCallback((providerKey: string, entryId: string) => {
    setMappingErrors((previous) => {
      if (!previous[providerKey]?.[entryId]) return previous;
      const providerErrors = { ...previous[providerKey] };
      delete providerErrors[entryId];
      return { ...previous, [providerKey]: providerErrors };
    });
  }, []);

  const toggleModel = useCallback(
    (modelId: string, checked: boolean) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => {
        const selectedModels = new Set(draft.selectedModels);
        if (checked) selectedModels.add(modelId);
        else selectedModels.delete(modelId);
        return { ...draft, selectedModels };
      });
    },
    [activeProviderKey, updateDraft]
  );

  const addManualModels = useCallback(() => {
    const models = modelInput
      .split(/[\n,]/)
      .map((model) => model.trim())
      .filter(Boolean);
    if (!activeProviderKey || models.length === 0) return;
    updateDraft(activeProviderKey, (draft) => {
      const selectedModels = new Set(draft.selectedModels);
      models.forEach((model) => selectedModels.add(model));
      return { ...draft, selectedModels };
    });
    setModelInput('');
  }, [activeProviderKey, modelInput, updateDraft]);

  const clearSelectedModels = useCallback(() => {
    if (!activeProviderKey) return;
    updateDraft(activeProviderKey, (draft) => ({ ...draft, selectedModels: new Set() }));
  }, [activeProviderKey, updateDraft]);

  const updateMapping = useCallback(
    (entryId: string, field: MappingField, value: string | boolean) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => {
        const mappings = draft.mappings.map((entry) => {
          if (entry.id !== entryId) return entry;
          if (field === 'fork') return { ...entry, fork: Boolean(value) };
          const nextValue = String(value);
          if (field === 'name' && entry.effortOnly) {
            return { ...entry, name: nextValue, alias: nextValue };
          }
          const nextEntry = { ...entry, [field]: nextValue };
          return {
            ...nextEntry,
            effortOnly: activeProviderKey === 'codex' && hasSameModelName(nextEntry),
          };
        });
        return { ...draft, mappings };
      });
      clearMappingError(activeProviderKey, entryId);
    },
    [activeProviderKey, clearMappingError, updateDraft]
  );

  const setRuleMode = useCallback(
    (entryId: string, reasoningOnly: boolean) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => ({
        ...draft,
        mappings: draft.mappings.map((entry) => {
          if (entry.id !== entryId) return entry;
          return reasoningOnly
            ? { ...entry, alias: entry.name, fork: false, effortOnly: true }
            : {
                ...entry,
                alias: entry.effortOnly ? '' : entry.alias,
                fork: true,
                effortOnly: false,
              };
        }),
      }));
      clearMappingError(activeProviderKey, entryId);
    },
    [activeProviderKey, clearMappingError, updateDraft]
  );

  const addMapping = useCallback(() => {
    if (!activeProviderKey) return;
    const entry = buildEmptyMappingEntry();
    updateDraft(activeProviderKey, (draft) => ({
      ...draft,
      mappings: [...draft.mappings, entry],
    }));
    setEditingRuleId(entry.id);
  }, [activeProviderKey, updateDraft]);

  const removeMapping = useCallback(
    (entryId: string) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => ({
        ...draft,
        mappings: draft.mappings.filter((entry) => entry.id !== entryId),
      }));
      clearMappingError(activeProviderKey, entryId);
      setEditingRuleId((current) => (current === entryId ? null : current));
    },
    [activeProviderKey, clearMappingError, updateDraft]
  );

  const updateReasoningEffort = useCallback(
    (entryId: string, source: string, target: string) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => ({
        ...draft,
        mappings: draft.mappings.map((entry) => {
          if (entry.id !== entryId) return entry;
          const nextReasoningEffort = {
            ...(normalizeOAuthReasoningEffort(entry.reasoningEffort) ?? {}),
          };
          if (target) nextReasoningEffort[source] = target;
          else delete nextReasoningEffort[source];
          return {
            ...entry,
            reasoningEffort: normalizeOAuthReasoningEffort(nextReasoningEffort),
          };
        }),
      }));
      clearMappingError(activeProviderKey, entryId);
    },
    [activeProviderKey, clearMappingError, updateDraft]
  );

  const changeReasoningSource = useCallback(
    (entryId: string, source: string, nextSource: string) => {
      if (!activeProviderKey || !nextSource) return;
      updateDraft(activeProviderKey, (draft) => ({
        ...draft,
        mappings: draft.mappings.map((entry) => {
          if (entry.id !== entryId) return entry;
          const nextReasoningEffort = {
            ...(normalizeOAuthReasoningEffort(entry.reasoningEffort) ?? {}),
          };
          const target = nextReasoningEffort[source];
          delete nextReasoningEffort[source];
          nextReasoningEffort[nextSource] = target || 'medium';
          return { ...entry, reasoningEffort: nextReasoningEffort };
        }),
      }));
      clearMappingError(activeProviderKey, entryId);
    },
    [activeProviderKey, clearMappingError, updateDraft]
  );

  const addReasoningMapping = useCallback(
    (entryId: string) => {
      if (!activeProviderKey) return;
      updateDraft(activeProviderKey, (draft) => ({
        ...draft,
        mappings: draft.mappings.map((entry) => {
          if (entry.id !== entryId) return entry;
          const current = normalizeOAuthReasoningEffort(entry.reasoningEffort) ?? {};
          const used = new Set(Object.keys(current).filter((source) => source !== 'default'));
          const source = REASONING_EFFORT_LEVELS.find((level) => !used.has(level));
          if (!source) return entry;
          return {
            ...entry,
            reasoningEffort: { ...current, [source]: source },
          };
        }),
      }));
    },
    [activeProviderKey, updateDraft]
  );

  const finishEditingRule = useCallback(
    (entryId: string) => {
      const entry = activeDraft?.mappings.find((item) => item.id === entryId);
      if (
        entry &&
        !entry.name.trim() &&
        !entry.alias.trim() &&
        Object.keys(entry.reasoningEffort ?? {}).length === 0
      ) {
        removeMapping(entryId);
        return;
      }
      setEditingRuleId(null);
    },
    [activeDraft, removeMapping]
  );

  const dirtyProviderKeys = useMemo(
    () =>
      Object.keys(providerDrafts).filter((key) =>
        isDraftDirty(providerDrafts[key], excludedSupported, aliasesSupported)
      ),
    [aliasesSupported, excludedSupported, providerDrafts]
  );

  const dirtySectionCount = useMemo(
    () =>
      dirtyProviderKeys.reduce((count, key) => {
        const draft = providerDrafts[key];
        return (
          count +
          Number(excludedSupported && isExcludedDirty(draft)) +
          Number(aliasesSupported && isAliasDirty(draft))
        );
      }, 0),
    [aliasesSupported, dirtyProviderKeys, excludedSupported, providerDrafts]
  );

  const hasAnyChanges = dirtyProviderKeys.length > 0;
  const canSave = !disableControls && !saving && hasAnyChanges;

  const handleSaveAll = useCallback(async () => {
    const tasks: SaveTask[] = [];
    const validationErrors: Record<string, Record<string, string>> = {};

    Object.entries(providerDrafts).forEach(([providerKey, draft]) => {
      if (!isDraftDirty(draft, excludedSupported, aliasesSupported)) return;
      if (aliasesSupported && isAliasDirty(draft)) {
        const aliasPayload = getAliasPayload(draft, providerKey);
        if (Object.keys(aliasPayload.errors).length > 0) {
          validationErrors[providerKey] = aliasPayload.errors;
        }
      }
    });

    if (Object.keys(validationErrors).length > 0) {
      setMappingErrors((previous) => ({ ...previous, ...validationErrors }));
      const firstInvalidProvider = Object.keys(validationErrors)[0];
      const firstInvalidEntry = Object.keys(validationErrors[firstInvalidProvider] ?? {})[0];
      setActiveProviderKey(firstInvalidProvider);
      setEditingRuleId(firstInvalidEntry || null);
      showNotification(t('oauth_model_rules.alias_invalid'), 'error');
      return;
    }

    Object.entries(providerDrafts).forEach(([providerKey, draft]) => {
      const normalizedProvider = normalizeProviderKey(draft.name);
      if (!normalizedProvider) return;

      if (excludedSupported && isExcludedDirty(draft)) {
        const models = Array.from(draft.selectedModels).sort((left, right) =>
          left.localeCompare(right)
        );
        tasks.push({
          key: providerKey,
          kind: 'excluded',
          task: async () => {
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

      if (aliasesSupported && isAliasDirty(draft)) {
        const aliasPayload = getAliasPayload(draft, providerKey);
        tasks.push({
          key: providerKey,
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
    });

    if (tasks.length === 0) return;

    setSaving(true);
    try {
      const results = await Promise.allSettled(tasks.map(({ task }) => task()));
      const failed = results.find((result) => result.status === 'rejected');
      const successfulTasks = tasks.filter((_, index) => results[index].status === 'fulfilled');

      if (successfulTasks.length > 0) {
        setProviderDrafts((previous) => {
          const next = { ...previous };
          successfulTasks.forEach(({ key, kind }) => {
            const draft = next[key];
            if (!draft) return;
            next[key] =
              kind === 'excluded'
                ? { ...draft, initialSelectedModels: new Set(draft.selectedModels) }
                : { ...draft, initialMappingsSignature: mappingSignature(draft.mappings) };
          });
          return next;
        });
      }

      if (failed?.status === 'rejected') {
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
    aliasesSupported,
    excludedSupported,
    getAliasPayload,
    onClose,
    onSaved,
    providerDrafts,
    showNotification,
    t,
  ]);

  const canRequestClose = useCallback(() => {
    if (saving) return false;
    if (hasAnyChanges) {
      setShowDiscardPrompt(true);
      return false;
    }
    return true;
  }, [hasAnyChanges, saving]);

  const confirmDiscard = useCallback(() => {
    setShowDiscardPrompt(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (canRequestClose()) onClose();
  }, [canRequestClose, onClose]);

  const activeMappingErrors = activeProviderKey ? (mappingErrors[activeProviderKey] ?? {}) : {};
  const selectedModels = Array.from(activeSelectedModels).sort((left, right) =>
    left.localeCompare(right)
  );

  return (
    <Modal
      open={open}
      title={t('oauth_model_rules.title')}
      onClose={onClose}
      onBeforeClose={canRequestClose}
      closeDisabled={saving}
      width={960}
      fullScreenOnMobile
      className={styles.modal}
      footer={
        showDiscardPrompt ? (
          <div
            className={styles.discardPrompt}
            role="alertdialog"
            aria-live="assertive"
            aria-labelledby="oauth-model-rules-discard-title"
          >
            <div className={styles.discardPromptCopy}>
              <strong id="oauth-model-rules-discard-title">
                {t('oauth_model_rules.discard_title')}
              </strong>
              <span>{t('oauth_model_rules.discard_close_desc')}</span>
            </div>
            <div className={styles.discardPromptActions}>
              <Button variant="ghost" onClick={() => setShowDiscardPrompt(false)}>
                {t('oauth_model_rules.keep_editing')}
              </Button>
              <Button variant="danger" onClick={confirmDiscard}>
                {t('oauth_model_rules.discard_confirm')}
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.modalFooter}>
            <div className={styles.footerStatus} role="status" aria-live="polite">
              <span
                className={`${styles.footerStatusDot} ${hasAnyChanges ? styles.footerStatusDirty : ''}`}
                aria-hidden="true"
              />
              {hasAnyChanges
                ? t('oauth_model_rules.unsaved_changes_summary', {
                    providers: dirtyProviderKeys.length,
                    sections: dirtySectionCount,
                  })
                : t('oauth_model_rules.no_unsaved_changes')}
            </div>
            <div className={styles.modalFooterActions}>
              <Button variant="secondary" onClick={requestClose} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSaveAll} loading={saving} disabled={!canSave}>
                {t('oauth_model_rules.save_all')}
              </Button>
            </div>
          </div>
        )
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
          <div className={styles.shell}>
            <section
              className={styles.providerBar}
              aria-label={t('oauth_model_rules.provider_label')}
            >
              <div className={styles.providerField}>
                <span className={styles.sectionKicker}>
                  {t('oauth_model_rules.provider_label')}
                </span>
                <Select
                  value={activeProviderKey}
                  options={providerOptions}
                  onChange={selectProvider}
                  disabled={disableControls || saving}
                  ariaLabel={t('oauth_model_rules.provider_list_title')}
                  className={styles.providerSelect}
                />
              </div>
              {activeDraft && (
                <div className={styles.providerStats}>
                  <span>
                    {t('oauth_model_rules.disabled_count', { count: activeSelectedModels.size })}
                  </span>
                  <span>
                    {t('oauth_model_rules.alias_count', { count: activeMappings.length })}
                  </span>
                </div>
              )}
              {newProviderOpen ? (
                <form
                  className={styles.newProviderForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    addProvider();
                  }}
                >
                  <input
                    autoFocus
                    className={styles.providerNameInput}
                    value={newProviderName}
                    onChange={(event) => setNewProviderName(event.target.value)}
                    placeholder={t('oauth_model_rules.provider_name_placeholder')}
                    disabled={disableControls || saving}
                  />
                  <Button
                    size="sm"
                    type="submit"
                    disabled={disableControls || saving || !newProviderName.trim()}
                  >
                    {t('oauth_model_rules.create_provider')}
                  </Button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setNewProviderOpen(false)}
                    disabled={saving}
                    aria-label={t('common.close')}
                  >
                    <IconX size={15} />
                  </button>
                </form>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.addProviderButton}
                  onClick={() => setNewProviderOpen(true)}
                  disabled={disableControls || saving}
                >
                  <IconPlus size={14} />
                  {t('oauth_model_rules.add_provider')}
                </Button>
              )}
            </section>

            {activeDraft && (
              <div className={styles.sections}>
                <section className={styles.section} aria-labelledby="oauth-disabled-models-title">
                  <header className={styles.sectionHeader}>
                    <div>
                      <span className={styles.sectionKicker}>01</span>
                      <h2 id="oauth-disabled-models-title">{t('oauth_excluded.models_label')}</h2>
                      <p>{t('oauth_model_rules.excluded_description')}</p>
                    </div>
                    <span
                      className={styles.sectionStatus}
                      role="status"
                      aria-busy={modelsLoading || undefined}
                    >
                      {modelsLoading && <LoadingSpinner size={12} />}
                      {modelSourceStatus}
                    </span>
                  </header>
                  {excludedSupported ? (
                    <div className={styles.sectionBody}>
                      <div className={styles.modelAddRow}>
                        <div className={styles.modelPicker}>
                          <AutocompleteInput
                            value={modelInput}
                            onChange={setModelInput}
                            options={modelOptions}
                            placeholder={t('oauth_model_rules.manual_model_placeholder')}
                            disabled={disableControls || saving}
                            className={styles.modelAutocompleteInput}
                            dropdownClassName={styles.modelDropdown}
                            portal
                            wrapperStyle={{ marginBottom: 0 }}
                          />
                        </div>
                        <Button
                          variant="secondary"
                          onClick={addManualModels}
                          disabled={disableControls || saving || !modelInput.trim()}
                        >
                          <IconPlus size={14} />
                          {t('oauth_model_rules.add_model')}
                        </Button>
                      </div>
                      <p className={styles.fieldHint}>{t('oauth_model_rules.manual_model_hint')}</p>

                      {selectedModels.length > 0 ? (
                        <div className={styles.selectedModelBlock}>
                          <div className={styles.selectedModelHeader}>
                            <span>
                              {t('oauth_model_rules.selected_count', {
                                selected: selectedModels.length,
                                total: Math.max(modelsList.length, selectedModels.length),
                              })}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={clearSelectedModels}
                              disabled={disableControls || saving}
                            >
                              {t('oauth_model_rules.clear_selected')}
                            </Button>
                          </div>
                          <div
                            className={styles.selectedModels}
                            aria-label={t('oauth_model_rules.selected_models_label')}
                          >
                            {selectedModels.map((model) => (
                              <button
                                key={model}
                                type="button"
                                className={styles.selectedModel}
                                onClick={() => toggleModel(model, false)}
                                disabled={disableControls || saving}
                                title={t('oauth_model_rules.remove_model', { model })}
                              >
                                <span>{model}</span>
                                <IconX size={12} />
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className={styles.emptyHint}>{t('oauth_model_rules.no_models_yet')}</p>
                      )}

                      {activeExcludedDirty &&
                        selectedModels.length === 0 &&
                        activeDraft.initialSelectedModels.size > 0 && (
                          <div className={styles.clearNotice} role="status">
                            {t('oauth_model_rules.excluded_clear_notice')}
                          </div>
                        )}
                    </div>
                  ) : (
                    <div className={styles.unavailableState}>
                      {t('oauth_model_rules.excluded_unavailable')}
                    </div>
                  )}
                </section>

                <section
                  className={`${styles.section} ${styles.rulesSection}`}
                  aria-labelledby="oauth-alias-rules-title"
                >
                  <header className={styles.sectionHeader}>
                    <div>
                      <span className={styles.sectionKicker}>02</span>
                      <h2 id="oauth-alias-rules-title">{t('oauth_model_rules.alias_title')}</h2>
                      <p>{t('oauth_model_rules.alias_description')}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addMapping}
                      disabled={disableControls || saving || editingRuleId !== null}
                    >
                      <IconPlus size={14} />
                      {t('oauth_model_rules.add_alias')}
                    </Button>
                  </header>
                  {!aliasesSupported ? (
                    <div className={styles.unavailableState}>
                      {t('oauth_model_rules.aliases_unavailable')}
                    </div>
                  ) : activeMappings.length === 0 ? (
                    <div className={styles.emptyRules}>
                      <span>{t('oauth_model_rules.alias_empty')}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={addMapping}
                        disabled={disableControls || saving}
                      >
                        <IconPlus size={14} />
                        {t('oauth_model_rules.add_alias')}
                      </Button>
                    </div>
                  ) : (
                    <div className={styles.rulesList}>
                      {activeMappings.map((entry) =>
                        editingRuleId === entry.id ? (
                          <RuleEditor
                            key={entry.id}
                            entry={entry}
                            providerKey={activeProviderKey}
                            disabled={disableControls || saving}
                            modelOptions={modelOptions}
                            reasoningOptions={reasoningOptions}
                            error={activeMappingErrors[entry.id]}
                            onUpdate={(field, value) => updateMapping(entry.id, field, value)}
                            onModeChange={(reasoningOnly) => setRuleMode(entry.id, reasoningOnly)}
                            onUpdateReasoning={(source, target) =>
                              updateReasoningEffort(entry.id, source, target)
                            }
                            onChangeReasoningSource={(source, nextSource) =>
                              changeReasoningSource(entry.id, source, nextSource)
                            }
                            onAddReasoning={() => addReasoningMapping(entry.id)}
                            onRemoveReasoning={(source) =>
                              updateReasoningEffort(entry.id, source, '')
                            }
                            onDone={() => finishEditingRule(entry.id)}
                          />
                        ) : (
                          <RuleSummary
                            key={entry.id}
                            entry={entry}
                            providerKey={activeProviderKey}
                            error={activeMappingErrors[entry.id]}
                            disabled={disableControls || saving}
                            onOpen={() => setEditingRuleId(entry.id)}
                            onRemove={() => removeMapping(entry.id)}
                          />
                        )
                      )}
                    </div>
                  )}
                  {activeAliasDirty && activeAliasPayload.entries.length === 0 && (
                    <div className={styles.clearNotice} role="status">
                      {t('oauth_model_rules.alias_clear_notice')}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/**
 * Legacy route wrapper. Direct links remain supported while the main Auth Files
 * workflow opens the same editor in place.
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
    <OAuthModelRulesEditorModal
      key={initialProvider || 'new-provider'}
      open
      initialProvider={initialProvider}
      onClose={handleClose}
    />
  );
}
