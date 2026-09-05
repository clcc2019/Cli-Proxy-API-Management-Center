import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useEventCallback } from '@/hooks';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCopy,
  IconCheck,
  IconChevronDown,
  IconFileText,
  IconKey,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconSlidersHorizontal,
  IconTrash2,
  IconX,
} from '@/components/ui/icons';
import { useAuthStore, useNotificationStore } from '@/stores';
import styles from './VisualConfigEditor.module.scss';
import apiKeyCardStyles from './ApiKeysCardEditor.module.scss';
import { copyToClipboard } from '@/utils/clipboard';
import { normalizeApiBase } from '@/utils/connection';
import type {
  PayloadFilterRule,
  PayloadModelEntry,
  PayloadParamEntry,
  PayloadParamValidationErrorCode,
  PayloadParamValueType,
  PayloadRule,
  VisualApiKeyEntry,
} from '@/types/visualConfig';
import { makeClientId } from '@/types/visualConfig';
import {
  getPayloadParamValidationError,
  VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS,
  VISUAL_CONFIG_PROTOCOL_OPTIONS,
} from '@/hooks/useVisualConfig';
import {
  excludedModelsToText,
  parseExcludedModels,
  parseTextList,
} from '@/components/providers/utils';
import { maskApiKey } from '@/utils/format';
import { isValidApiKeyCharset } from '@/utils/validation';
import type { ClientApiKeyQuota } from '@/types/config';
import { authFilesApi } from '@/services/api/authFiles';
import {
  CLIENT_API_KEY_QUOTA_FIELDS,
  clientApiKeyQuotaLimitCount,
  hasClientApiKeyQuota,
  type ClientApiKeyQuotaField,
} from '@/utils/clientApiKeyQuota';

/** Minimum character count before the expand/collapse toggle appears. */
const EXPAND_THRESHOLD = 30;

type QuotaInputValues = Record<ClientApiKeyQuotaField, string>;
type ApiKeyListFilter = 'all' | 'active' | 'disabled';
type ApiKeyModalSection = 'identity' | 'access' | 'limits';

const emptyQuotaInputValues = (): QuotaInputValues => ({
  dailyCost: '',
  monthlyCost: '',
  totalCost: '',
});

const quotaToInputValues = (quota?: ClientApiKeyQuota): QuotaInputValues => {
  const values = emptyQuotaInputValues();
  CLIENT_API_KEY_QUOTA_FIELDS.forEach(({ field }) => {
    const limit = quota?.[field];
    values[field] = Number.isFinite(limit) && Number(limit) > 0 ? String(limit) : '';
  });
  return values;
};

const parseQuotaInputValues = (
  values: QuotaInputValues
): { ok: true; quota?: ClientApiKeyQuota } | { ok: false } => {
  const quota: ClientApiKeyQuota = {};

  for (const { field } of CLIENT_API_KEY_QUOTA_FIELDS) {
    const raw = values[field].trim();
    if (!raw) continue;
    if (!/^\d+(?:\.\d+)?$/.test(raw)) return { ok: false };
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return { ok: false };
    if (parsed > 0) quota[field] = parsed;
  }

  return { ok: true, quota: hasClientApiKeyQuota(quota) ? quota : undefined };
};

const quotaFieldLabelKey = (field: ClientApiKeyQuotaField) =>
  `config_management.visual.api_keys.quota_${field.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)}`;

/** Auto-expanding textarea that collapses back to a single-line input on demand. */
function ExpandableInput({
  value,
  placeholder,
  ariaLabel,
  disabled,
  className,
  onChange,
}: {
  value: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // Strip newlines — these fields are single-line identifiers/paths that
    // would break YAML serialization if they contained line breaks.
    const sanitized = e.target.value.replace(/[\r\n]/g, '');
    onChange(sanitized);
    // autoResize is handled by useLayoutEffect after React syncs the
    // sanitized value back to the DOM — calling it here would measure
    // stale content.
  };

  // Resize synchronously before paint to avoid visual flicker.
  useLayoutEffect(() => {
    if (!collapsed && textareaRef.current) {
      autoResize(textareaRef.current);
    }
  }, [collapsed, value, autoResize]);

  if (collapsed) {
    return (
      <div className={styles.expandableInputWrapper}>
        <input
          className={`input ${className ?? ''}`}
          placeholder={placeholder}
          aria-label={ariaLabel}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]/g, ''))}
          disabled={disabled}
        />
        {value.length > EXPAND_THRESHOLD && (
          <button
            type="button"
            className={styles.expandableToggle}
            disabled={disabled}
            onClick={() => {
              setCollapsed(false);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
              });
            }}
            title={t('common.expand')}
            aria-label={t('common.expand')}
          >
            ▼
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.expandableInputWrapper} ${styles.expandableInputExpanded}`}>
      <textarea
        ref={textareaRef}
        className={`input ${styles.expandableTextarea} ${className ?? ''}`}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        rows={2}
      />
      <button
        type="button"
        className={styles.expandableToggle}
        disabled={disabled}
        onClick={() => setCollapsed(true)}
        title={t('common.collapse')}
        aria-label={t('common.collapse')}
      >
        ▲
      </button>
    </div>
  );
}

type SearchableAuthFilesSelectProps = {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  emptyLabel: string;
  loadingLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  selectedLabel: (count: number) => string;
  clearLabel: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
};

function SearchableAuthFilesSelect({
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  emptyLabel,
  loadingLabel,
  searchLabel,
  searchPlaceholder,
  selectedLabel,
  clearLabel,
  ariaDescribedBy,
  ariaLabel,
}: SearchableAuthFilesSelectProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);

  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) => option.toLowerCase().includes(normalized));
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      setDropdownStyle({ top: rect.bottom + 6, left, width, maxHeight: Math.max(180, spaceBelow) });
    } else {
      setDropdownStyle({
        bottom: window.innerHeight - rect.top + 6,
        left,
        width,
        maxHeight: Math.max(180, spaceAbove),
      });
    }
  }, []);

  useEffect(() => {
    if (!open || disabled) return undefined;
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [disabled, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    searchRef.current?.focus();
  }, [open, updatePosition]);

  const toggleOption = (option: string) => {
    const next = value.includes(option)
      ? value.filter((item) => item !== option)
      : [...value, option];
    onChange(next);
  };

  const displayLabel = value.length > 0 ? selectedLabel(value.length) : emptyLabel;
  const dropdown =
    open && dropdownStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={dropdownRef}
            className={apiKeyCardStyles.authFilesDropdown}
            style={dropdownStyle}
          >
            <div className={apiKeyCardStyles.authFilesSearchRow}>
              <IconSearch size={15} aria-hidden="true" />
              <input
                ref={searchRef}
                className={apiKeyCardStyles.authFilesSearchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
              />
              {value.length > 0 && (
                <button
                  type="button"
                  className={apiKeyCardStyles.authFilesClear}
                  onClick={() => onChange([])}
                >
                  {clearLabel}
                </button>
              )}
            </div>
            <div
              className={apiKeyCardStyles.authFilesOptions}
              role="listbox"
              aria-multiselectable="true"
            >
              {loading ? (
                <div className={apiKeyCardStyles.authFilesEmpty}>{loadingLabel}</div>
              ) : filteredOptions.length === 0 ? (
                <div className={apiKeyCardStyles.authFilesEmpty}>{emptyLabel}</div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = value.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`${apiKeyCardStyles.authFilesOption} ${selected ? apiKeyCardStyles.authFilesOptionSelected : ''}`}
                      onClick={() => toggleOption(option)}
                    >
                      <span className={apiKeyCardStyles.authFilesCheck} aria-hidden="true">
                        {selected && <IconCheck size={13} />}
                      </span>
                      <span>{option}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={apiKeyCardStyles.authFilesTrigger}
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
        }}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
      >
        <span className={value.length > 0 ? '' : apiKeyCardStyles.authFilesPlaceholder}>
          {displayLabel}
        </span>
        <IconChevronDown size={15} aria-hidden="true" />
      </button>
      {dropdown}
    </>
  );
}

function getValidationMessage(
  t: ReturnType<typeof useTranslation>['t'],
  errorCode?: PayloadParamValidationErrorCode
) {
  if (!errorCode) return undefined;
  return t(`config_management.visual.validation.${errorCode}`);
}

function buildProtocolOptions(
  t: ReturnType<typeof useTranslation>['t'],
  rules: Array<{ models: PayloadModelEntry[] }>
) {
  const options: Array<{ value: string; label: string }> = VISUAL_CONFIG_PROTOCOL_OPTIONS.map(
    (option) => ({
      value: option.value,
      label: t(option.labelKey),
    })
  );
  const seen = new Set<string>(options.map((option) => option.value));

  for (const rule of rules) {
    for (const model of rule.models) {
      const protocol = model.protocol;
      if (!protocol || !protocol.trim() || seen.has(protocol)) continue;
      seen.add(protocol);
      options.push({ value: protocol, label: protocol });
    }
  }

  return options;
}

const buildOpenAiBaseUrl = (apiBase: string): string => {
  const normalized = normalizeApiBase(apiBase);
  if (!normalized) return '';
  return `${normalized.replace(/\/+$/, '')}/v1`;
};

const formatFullCopyText = (apiUrl: string, apiKey: string): string => {
  const trimmedKey = apiKey.trim();
  if (!apiUrl) {
    return `apikey: ${trimmedKey}`;
  }
  return `endpoint地址：${apiUrl}\napikey: ${trimmedKey}`;
};

type ApiKeyListEntry = {
  entry: VisualApiKeyEntry;
  index: number;
};

type ApiKeysChange = (
  nextValue: VisualApiKeyEntry[] | ((currentValue: VisualApiKeyEntry[]) => VisualApiKeyEntry[])
) => void;

type ApiKeyCardRowProps = {
  entry: VisualApiKeyEntry;
  index: number;
  disabled?: boolean;
  onToggleDisabled: (apiKeyId: string, disabledState: boolean) => void;
  onCopyFull: (apiKey: string) => void;
  onCopyKey: (apiKey: string) => void;
  onEdit: (entry: VisualApiKeyEntry) => void;
  onDelete: (apiKeyId: string) => void;
};

const ApiKeyCardRow = memo(function ApiKeyCardRow({
  entry,
  index,
  disabled,
  onToggleDisabled,
  onCopyFull,
  onCopyKey,
  onEdit,
  onDelete,
}: ApiKeyCardRowProps) {
  const { t } = useTranslation();
  const note = (entry.note ?? '').trim();
  const isDisabled = Boolean(entry.disabled);
  const hasRules = entry.allowedModels.length > 0 || entry.excludedModels.length > 0;
  const hasAuthFiles = entry.authFiles.length > 0;
  const hasQuota = hasClientApiKeyQuota(entry.quota);

  return (
    <article
      className={[apiKeyCardStyles.card, isDisabled ? apiKeyCardStyles.cardDisabled : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className={apiKeyCardStyles.identityCell}>
        <span className={apiKeyCardStyles.avatar} aria-hidden="true">
          <IconKey size={18} />
        </span>
        <div className={apiKeyCardStyles.identityCopy}>
          <div className={apiKeyCardStyles.cardTitleRow}>
            <strong className={apiKeyCardStyles.cardName}>
              {t('api_keys.item_title')} #{index + 1}
            </strong>
            {note && (
              <span className={apiKeyCardStyles.noteBadge} title={note}>
                {note}
              </span>
            )}
          </div>
          <code className={apiKeyCardStyles.keyValue} title={entry.apiKey}>
            {maskApiKey(String(entry.apiKey || ''))}
          </code>
        </div>
      </div>

      <div className={apiKeyCardStyles.scopeCell}>
        <span className={apiKeyCardStyles.mobileCellLabel}>{t('api_keys.column_scope')}</span>
        <div className={apiKeyCardStyles.summaryRow}>
          {hasRules && (
            <span className={apiKeyCardStyles.summaryChip}>
              {t('config_management.visual.api_keys.rules_summary', {
                allowed: entry.allowedModels.length,
                excluded: entry.excludedModels.length,
              })}
            </span>
          )}
          {hasQuota && (
            <span
              className={[apiKeyCardStyles.summaryChip, apiKeyCardStyles.summaryChipQuota].join(
                ' '
              )}
            >
              {t('config_management.visual.api_keys.quota_summary', {
                count: clientApiKeyQuotaLimitCount(entry.quota),
              })}
            </span>
          )}
          {hasAuthFiles && (
            <span className={apiKeyCardStyles.summaryChip}>
              {t('config_management.visual.api_keys.auth_files_summary', {
                count: entry.authFiles.length,
              })}
            </span>
          )}
          {!hasRules && !hasQuota && !hasAuthFiles && (
            <span className={apiKeyCardStyles.noScope}>{t('api_keys.scope_open')}</span>
          )}
        </div>
      </div>

      <div className={apiKeyCardStyles.statusCell}>
        <span className={apiKeyCardStyles.mobileCellLabel}>{t('api_keys.column_status')}</span>
        <span
          className={[
            apiKeyCardStyles.statusBadge,
            isDisabled ? apiKeyCardStyles.statusBadgeDisabled : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className={apiKeyCardStyles.statusDot} aria-hidden="true" />
          {t(
            isDisabled
              ? 'config_management.visual.api_keys.status_disabled'
              : 'config_management.visual.api_keys.status_enabled'
          )}
        </span>
        <ToggleSwitch
          checked={!isDisabled}
          onChange={(enabled) => onToggleDisabled(entry.id, !enabled)}
          disabled={disabled}
          label={t('config_management.visual.api_keys.enabled_toggle')}
          ariaLabel={t('config_management.visual.api_keys.enabled_toggle')}
          className={apiKeyCardStyles.enabledSwitch}
        />
      </div>

      <div className={apiKeyCardStyles.actions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCopyFull(entry.apiKey)}
          disabled={disabled}
          className={[apiKeyCardStyles.iconButton, apiKeyCardStyles.copyFullButton].join(' ')}
          title={t('config_management.visual.api_keys.copy_full_hint')}
          aria-label={t('config_management.visual.api_keys.copy_full')}
        >
          <IconFileText size={17} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onCopyKey(entry.apiKey)}
          disabled={disabled}
          className={[apiKeyCardStyles.iconButton, apiKeyCardStyles.copyKeyButton].join(' ')}
          title={t('config_management.visual.api_keys.copy_key_only')}
          aria-label={t('config_management.visual.api_keys.copy_key_only')}
        >
          <IconCopy size={17} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onEdit(entry)}
          disabled={disabled}
          className={[apiKeyCardStyles.iconButton, apiKeyCardStyles.editButton].join(' ')}
          title={t('config_management.visual.common.edit')}
          aria-label={t('config_management.visual.common.edit')}
        >
          <IconSettings size={17} />
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onDelete(entry.id)}
          disabled={disabled}
          className={[apiKeyCardStyles.iconButton, apiKeyCardStyles.deleteButton].join(' ')}
          title={t('config_management.visual.common.delete')}
          aria-label={t('config_management.visual.common.delete')}
        >
          <IconTrash2 size={17} />
        </Button>
      </div>
    </article>
  );
});

type ApiKeyCardListProps = {
  entries: ApiKeyListEntry[];
  disabled?: boolean;
  onToggleDisabled: (apiKeyId: string, disabledState: boolean) => void;
  onCopyFull: (apiKey: string) => void;
  onCopyKey: (apiKey: string) => void;
  onEdit: (entry: VisualApiKeyEntry) => void;
  onDelete: (apiKeyId: string) => void;
};

const ApiKeyCardList = memo(function ApiKeyCardList({
  entries,
  disabled,
  onToggleDisabled,
  onCopyFull,
  onCopyKey,
  onEdit,
  onDelete,
}: ApiKeyCardListProps) {
  const { t } = useTranslation();

  return (
    <div className={apiKeyCardStyles.listSurface}>
      <div className={apiKeyCardStyles.listHeader} role="row">
        <span>{t('api_keys.column_key')}</span>
        <span>{t('api_keys.column_scope')}</span>
        <span>{t('api_keys.column_status')}</span>
        <span className={apiKeyCardStyles.actionsHeader}>{t('api_keys.column_actions')}</span>
      </div>
      <div className={apiKeyCardStyles.cardList} role="rowgroup">
        {entries.map(({ entry, index }) => (
          <ApiKeyCardRow
            key={entry.id}
            entry={entry}
            index={index}
            disabled={disabled}
            onToggleDisabled={onToggleDisabled}
            onCopyFull={onCopyFull}
            onCopyKey={onCopyKey}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
});

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: VisualApiKeyEntry[];
  disabled?: boolean;
  onChange: ApiKeysChange;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const apiBase = useAuthStore((state) => state.apiBase);
  const apiKeys = useMemo(() => value ?? [], [value]);
  const apiUrl = useMemo(() => buildOpenAiBaseUrl(apiBase || ''), [apiBase]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const noteInputId = `${apiKeyInputId}-note`;
  const noteHintId = `${noteInputId}-hint`;
  const quotaHintId = `${apiKeyInputId}-quota-hint`;
  const authFilesHintId = `${apiKeyInputId}-auth-files-hint`;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSection, setModalSection] = useState<ApiKeyModalSection>('identity');
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [disabledValue, setDisabledValue] = useState(false);
  const [allowedModelsValue, setAllowedModelsValue] = useState('');
  const [excludedModelsValue, setExcludedModelsValue] = useState('');
  const [authFilesValue, setAuthFilesValue] = useState<string[]>([]);
  const authFilesValueRef = useRef(authFilesValue);
  const [authFileOptions, setAuthFileOptions] = useState<string[]>([]);
  const [authFilesLoading, setAuthFilesLoading] = useState(false);
  const [authFilesLoadError, setAuthFilesLoadError] = useState(false);
  const [quotaValues, setQuotaValues] = useState<QuotaInputValues>(() => emptyQuotaInputValues());
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<ApiKeyListFilter>('all');

  const activeCount = useMemo(
    () => apiKeys.reduce((count, entry) => count + (entry.disabled ? 0 : 1), 0),
    [apiKeys]
  );
  const disabledCount = apiKeys.length - activeCount;
  const filteredApiKeys = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return apiKeys
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (listFilter === 'active' && entry.disabled) return false;
        if (listFilter === 'disabled' && !entry.disabled) return false;
        if (!query) return true;

        return [
          entry.apiKey,
          entry.note,
          ...entry.allowedModels,
          ...entry.excludedModels,
          ...entry.authFiles,
        ].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(query)
        );
      });
  }, [apiKeys, listFilter, searchQuery]);

  function generateSecureApiKey(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(17);
    crypto.getRandomValues(array);
    return 'sk-' + Array.from(array, (b) => charset[b % charset.length]).join('');
  }

  const openAddModal = () => {
    setEditingApiKeyId(null);
    setInputValue('');
    setNoteValue('');
    setDisabledValue(false);
    setAllowedModelsValue('');
    setExcludedModelsValue('');
    setAuthFilesValue([]);
    setAuthFileOptions([]);
    setAuthFilesLoading(true);
    setAuthFilesLoadError(false);
    setQuotaValues(emptyQuotaInputValues());
    setFormError('');
    setModalSection('identity');
    setModalOpen(true);
  };

  const openEditModal = useCallback((entry: VisualApiKeyEntry) => {
    setEditingApiKeyId(entry.id);
    setInputValue(entry.apiKey ?? '');
    setNoteValue(entry.note ?? '');
    setDisabledValue(Boolean(entry.disabled));
    setAllowedModelsValue(excludedModelsToText(entry.allowedModels));
    setExcludedModelsValue(excludedModelsToText(entry.excludedModels));
    setAuthFilesValue(entry.authFiles ?? []);
    setAuthFileOptions(entry.authFiles ?? []);
    setAuthFilesLoading(true);
    setAuthFilesLoadError(false);
    setQuotaValues(quotaToInputValues(entry.quota));
    setFormError('');
    setModalSection('identity');
    setModalOpen(true);
  }, []);

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setNoteValue('');
    setDisabledValue(false);
    setAllowedModelsValue('');
    setExcludedModelsValue('');
    setAuthFilesValue([]);
    setAuthFileOptions([]);
    setAuthFilesLoading(false);
    setQuotaValues(emptyQuotaInputValues());
    setEditingApiKeyId(null);
    setFormError('');
    setModalSection('identity');
  };

  useEffect(() => {
    authFilesValueRef.current = authFilesValue;
  }, [authFilesValue]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    let active = true;
    void authFilesApi
      .list({ includeRecentRequests: false })
      .then((response) => {
        if (!active) return;
        const names = (response.files ?? [])
          .map((file) => String(file.name ?? '').trim())
          .filter(Boolean);
        setAuthFileOptions(
          Array.from(new Set([...names, ...authFilesValueRef.current])).sort((left, right) =>
            left.localeCompare(right, undefined, { sensitivity: 'accent' })
          )
        );
      })
      .catch(() => {
        if (active) setAuthFilesLoadError(true);
      })
      .finally(() => {
        if (active) setAuthFilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [modalOpen]);

  const handleDelete = useCallback(
    (apiKeyId: string) => {
      const entry = apiKeys.find((item) => item.id === apiKeyId);
      showConfirmation({
        title: t('api_keys.delete_title'),
        message: t('api_keys.delete_confirm_named', {
          name: entry?.note?.trim() || maskApiKey(entry?.apiKey ?? ''),
        }),
        confirmText: t('config_management.visual.common.delete'),
        cancelText: t('config_management.visual.common.cancel'),
        variant: 'danger',
        onConfirm: () => {
          onChange((currentValue) => currentValue.filter((item) => item.id !== apiKeyId));
        },
      });
    },
    [apiKeys, onChange, showConfirmation, t]
  );

  const handleToggleDisabled = useCallback(
    (apiKeyId: string, disabledState: boolean) => {
      onChange((currentValue) =>
        currentValue.map((entry) =>
          entry.id === apiKeyId ? { ...entry, disabled: disabledState } : entry
        )
      );
    },
    [onChange]
  );

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      setModalSection('identity');
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      setModalSection('identity');
      return;
    }
    const allowedModels = parseTextList(allowedModelsValue);
    const excludedModels = parseExcludedModels(excludedModelsValue);
    const authFiles = Array.from(
      new Set(authFilesValue.map((file) => file.trim()).filter(Boolean))
    );
    const parsedQuota = parseQuotaInputValues(quotaValues);
    if (!parsedQuota.ok) {
      setFormError(t('config_management.visual.api_keys.quota_error_invalid'));
      setModalSection('limits');
      return;
    }
    const nextEntry: VisualApiKeyEntry = {
      id: editingApiKeyId ?? makeClientId(),
      apiKey: trimmed,
      note: noteValue.trim(),
      disabled: disabledValue,
      allowedModels,
      excludedModels,
      authFiles,
      ...(parsedQuota.quota ? { quota: parsedQuota.quota } : {}),
    };
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, nextEntry]
        : apiKeys.map((entry) => (entry.id === editingApiKeyId ? nextEntry : entry));
    onChange(nextKeys);
    closeModal();
  };

  const handleCopyKey = useCallback(
    async (apiKey: string) => {
      const copied = await copyToClipboard(apiKey);
      showNotification(
        t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const handleCopyFull = useCallback(
    async (apiKey: string) => {
      const text = formatFullCopyText(apiUrl, apiKey);
      const copied = await copyToClipboard(text);
      showNotification(
        copied
          ? t('config_management.visual.api_keys.copy_full_success')
          : t('notification.copy_failed'),
        copied ? 'success' : 'error'
      );
    },
    [apiUrl, showNotification, t]
  );

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <section className={apiKeyCardStyles.editor} aria-labelledby="api-key-list-title">
      <div className={apiKeyCardStyles.headerRow}>
        <div className={apiKeyCardStyles.headerCopy}>
          <h2 id="api-key-list-title" className={apiKeyCardStyles.headerLabel}>
            {t('api_keys.section_title')}
          </h2>
          <p className={apiKeyCardStyles.headerDescription}>{t('api_keys.section_description')}</p>
        </div>
        <Button
          size="sm"
          onClick={openAddModal}
          disabled={disabled}
          className={apiKeyCardStyles.addButton}
        >
          <IconPlus size={16} aria-hidden="true" />
          {t('config_management.visual.api_keys.add')}
        </Button>
      </div>

      {apiKeys.length > 0 && (
        <div className={apiKeyCardStyles.toolbar}>
          <div className={apiKeyCardStyles.searchControl}>
            <IconSearch size={16} aria-hidden="true" />
            <input
              className={apiKeyCardStyles.searchInput}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('api_keys.search_placeholder')}
              aria-label={t('api_keys.search_label')}
            />
            {searchQuery && (
              <button
                type="button"
                className={apiKeyCardStyles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label={t('common.clear')}
                title={t('common.clear')}
              >
                <IconX size={14} />
              </button>
            )}
          </div>

          <div
            className={apiKeyCardStyles.filterBar}
            role="group"
            aria-label={t('api_keys.filter_label')}
          >
            {(
              [
                ['all', apiKeys.length, 'api_keys.filter_all'],
                ['active', activeCount, 'api_keys.filter_active'],
                ['disabled', disabledCount, 'api_keys.filter_disabled'],
              ] as const
            ).map(([filter, count, labelKey]) => (
              <button
                key={filter}
                type="button"
                className={`${apiKeyCardStyles.filterButton} ${listFilter === filter ? apiKeyCardStyles.filterButtonActive : ''}`}
                onClick={() => setListFilter(filter)}
                aria-pressed={listFilter === filter}
              >
                {t(labelKey)}
                <span className={apiKeyCardStyles.filterCount}>{count}</span>
              </button>
            ))}
          </div>

          <span
            className={apiKeyCardStyles.resultCount}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {t('api_keys.filtered_count', { shown: filteredApiKeys.length, total: apiKeys.length })}
          </span>
        </div>
      )}

      {apiKeys.length === 0 ? (
        <div className={apiKeyCardStyles.emptyState}>
          <span className={apiKeyCardStyles.emptyIcon} aria-hidden="true">
            <IconKey size={22} />
          </span>
          <div className={apiKeyCardStyles.emptyCopy}>
            <strong>{t('api_keys.empty_title')}</strong>
            <p>{t('api_keys.empty_desc')}</p>
          </div>
        </div>
      ) : filteredApiKeys.length === 0 ? (
        <div className={apiKeyCardStyles.noResults}>
          <IconSearch size={20} aria-hidden="true" />
          <div>
            <strong>{t('api_keys.filter_empty')}</strong>
            <button
              type="button"
              className={apiKeyCardStyles.clearFilters}
              onClick={() => {
                setSearchQuery('');
                setListFilter('all');
              }}
            >
              {t('api_keys.clear_filters')}
            </button>
          </div>
        </div>
      ) : (
        <ApiKeyCardList
          entries={filteredApiKeys}
          disabled={disabled}
          onToggleDisabled={handleToggleDisabled}
          onCopyFull={handleCopyFull}
          onCopyKey={handleCopyKey}
          onEdit={openEditModal}
          onDelete={handleDelete}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={820}
        fullScreenOnMobile
        className={apiKeyCardStyles.modal}
        title={
          <div className={apiKeyCardStyles.modalTitleBlock}>
            <span className={apiKeyCardStyles.modalEyebrow}>
              <IconKey size={13} />
              {editingApiKeyId !== null
                ? t('api_keys.modal_edit_eyebrow')
                : t('api_keys.modal_add_eyebrow')}
            </span>
            <span className={apiKeyCardStyles.modalTitleText}>
              {editingApiKeyId !== null
                ? t('config_management.visual.api_keys.edit_title')
                : t('config_management.visual.api_keys.add_title')}
            </span>
          </div>
        }
        footer={
          <>
            <span className={apiKeyCardStyles.modalFooterHint}>
              {modalSection === 'identity'
                ? t('api_keys.modal_step_identity')
                : modalSection === 'access'
                  ? t('api_keys.modal_step_access')
                  : t('api_keys.modal_step_limits')}
            </span>
            <Button variant="secondary" onClick={closeModal} disabled={disabled}>
              {t('config_management.visual.common.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={disabled}>
              {editingApiKeyId !== null
                ? t('config_management.visual.common.update')
                : t('config_management.visual.common.add')}
            </Button>
          </>
        }
      >
        <div className={apiKeyCardStyles.modalLayout}>
          <nav
            className={apiKeyCardStyles.modalNav}
            aria-label={t('api_keys.modal_sections_label')}
          >
            <button
              type="button"
              className={modalSection === 'identity' ? apiKeyCardStyles.modalNavActive : ''}
              onClick={() => setModalSection('identity')}
              aria-current={modalSection === 'identity' ? 'step' : undefined}
            >
              <IconKey size={16} />
              <span>{t('api_keys.modal_section_identity')}</span>
              <small>01</small>
            </button>
            <button
              type="button"
              className={modalSection === 'access' ? apiKeyCardStyles.modalNavActive : ''}
              onClick={() => setModalSection('access')}
              aria-current={modalSection === 'access' ? 'step' : undefined}
            >
              <IconShield size={16} />
              <span>{t('api_keys.modal_section_access')}</span>
              <small>02</small>
            </button>
            <button
              type="button"
              className={modalSection === 'limits' ? apiKeyCardStyles.modalNavActive : ''}
              onClick={() => setModalSection('limits')}
              aria-current={modalSection === 'limits' ? 'step' : undefined}
            >
              <IconSlidersHorizontal size={16} />
              <span>{t('api_keys.modal_section_limits')}</span>
              <small>03</small>
            </button>
          </nav>

          <div className={apiKeyCardStyles.modalForm}>
            {modalSection === 'identity' && (
              <div className={apiKeyCardStyles.modalSectionIntro}>
                <span>{t('api_keys.modal_section_identity_kicker')}</span>
                <p>{t('api_keys.modal_section_identity_description')}</p>
              </div>
            )}

            {modalSection === 'identity' && (
              <>
                <div className="form-group">
                  <label htmlFor={apiKeyInputId}>
                    {t('config_management.visual.api_keys.input_label')}
                  </label>
                  <div className={styles.apiKeyModalInputRow}>
                    <input
                      id={apiKeyInputId}
                      className="input"
                      placeholder={t('config_management.visual.api_keys.input_placeholder')}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      disabled={disabled}
                      aria-describedby={
                        formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId
                      }
                      aria-invalid={Boolean(formError)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleGenerate}
                      disabled={disabled}
                    >
                      {t('config_management.visual.api_keys.generate')}
                    </Button>
                  </div>
                  <div id={apiKeyHintId} className="hint">
                    {t('config_management.visual.api_keys.input_hint')}
                  </div>
                  {formError && (
                    <div id={apiKeyErrorId} className="error-box" role="alert">
                      {formError}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor={noteInputId}>
                    {t('config_management.visual.api_keys.note_label')}
                  </label>
                  <input
                    id={noteInputId}
                    className="input"
                    placeholder={t('config_management.visual.api_keys.note_placeholder')}
                    value={noteValue}
                    onChange={(e) => setNoteValue(e.target.value)}
                    disabled={disabled}
                    aria-describedby={noteHintId}
                    maxLength={120}
                  />
                  <div id={noteHintId} className="hint">
                    {t('config_management.visual.api_keys.note_hint')}
                  </div>
                </div>
                <div className="form-group">
                  <ToggleSwitch
                    checked={!disabledValue}
                    onChange={(enabled) => setDisabledValue(!enabled)}
                    disabled={disabled}
                    label={t('config_management.visual.api_keys.enabled_toggle')}
                    ariaLabel={t('config_management.visual.api_keys.enabled_toggle')}
                  />
                  <div className="hint">{t('config_management.visual.api_keys.disabled_hint')}</div>
                </div>
              </>
            )}

            {modalSection === 'access' && (
              <>
                <div className={apiKeyCardStyles.modalSectionIntro}>
                  <span>{t('api_keys.modal_section_access_kicker')}</span>
                  <p>{t('api_keys.modal_section_access_description')}</p>
                </div>
                <div className={apiKeyCardStyles.modalColumns}>
                  <div className="form-group">
                    <span className="form-label">
                      {t('config_management.visual.api_keys.allowed_models_label')}
                    </span>
                    <textarea
                      className="input"
                      rows={4}
                      aria-label={t('config_management.visual.api_keys.allowed_models_label')}
                      placeholder={t(
                        'config_management.visual.api_keys.allowed_models_placeholder'
                      )}
                      value={allowedModelsValue}
                      onChange={(e) => setAllowedModelsValue(e.target.value)}
                      disabled={disabled}
                    />
                    <div className="hint">
                      {t('config_management.visual.api_keys.allowed_models_hint')}
                    </div>
                  </div>
                  <div className="form-group">
                    <span className="form-label">
                      {t('config_management.visual.api_keys.excluded_models_label')}
                    </span>
                    <textarea
                      className="input"
                      rows={4}
                      aria-label={t('config_management.visual.api_keys.excluded_models_label')}
                      placeholder={t(
                        'config_management.visual.api_keys.excluded_models_placeholder'
                      )}
                      value={excludedModelsValue}
                      onChange={(e) => setExcludedModelsValue(e.target.value)}
                      disabled={disabled}
                    />
                    <div className="hint">
                      {t('config_management.visual.api_keys.excluded_models_hint')}
                    </div>
                  </div>
                </div>
                <div className="form-group">
                  <span className="form-label">
                    {t('config_management.visual.api_keys.auth_files_label')}
                  </span>
                  <SearchableAuthFilesSelect
                    options={authFileOptions}
                    value={authFilesValue}
                    onChange={setAuthFilesValue}
                    disabled={disabled}
                    loading={authFilesLoading}
                    emptyLabel={t('config_management.visual.api_keys.auth_files_empty')}
                    loadingLabel={t('config_management.visual.api_keys.auth_files_loading')}
                    searchLabel={t('config_management.visual.api_keys.auth_files_search_label')}
                    searchPlaceholder={t(
                      'config_management.visual.api_keys.auth_files_search_placeholder'
                    )}
                    selectedLabel={(count) =>
                      t('config_management.visual.api_keys.auth_files_selected', { count })
                    }
                    clearLabel={t('config_management.visual.api_keys.auth_files_clear')}
                    ariaDescribedBy={authFilesHintId}
                    ariaLabel={t('config_management.visual.api_keys.auth_files_label')}
                  />
                  <div id={authFilesHintId} className="hint">
                    {authFilesLoadError
                      ? t('config_management.visual.api_keys.auth_files_load_failed')
                      : t('config_management.visual.api_keys.auth_files_hint')}
                  </div>
                </div>
              </>
            )}

            {modalSection === 'limits' && (
              <>
                <div className={apiKeyCardStyles.modalSectionIntro}>
                  <span>{t('api_keys.modal_section_limits_kicker')}</span>
                  <p>{t('api_keys.modal_section_limits_description')}</p>
                </div>
                <div className="form-group">
                  <span className="form-label">
                    {t('config_management.visual.api_keys.quota_title')}
                  </span>
                  <div className={styles.quotaGrid}>
                    {CLIENT_API_KEY_QUOTA_FIELDS.map(({ field }) => (
                      <div key={field} className={styles.quotaField}>
                        <label
                          className={styles.quotaFieldLabel}
                          htmlFor={`${apiKeyInputId}-${field}`}
                        >
                          {t(quotaFieldLabelKey(field))}
                        </label>
                        <input
                          id={`${apiKeyInputId}-${field}`}
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          placeholder={t('config_management.visual.api_keys.quota_placeholder')}
                          value={quotaValues[field]}
                          aria-describedby={quotaHintId}
                          onChange={(e) =>
                            setQuotaValues((current) => ({ ...current, [field]: e.target.value }))
                          }
                          disabled={disabled}
                        />
                      </div>
                    ))}
                  </div>
                  <div id={quotaHintId} className="hint">
                    {t('config_management.visual.api_keys.quota_hint')}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
    </section>
  );
});

interface StringListRowProps {
  item: string;
  index: number;
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  deleteLabel: string;
  onUpdate: (index: number, nextValue: string) => void;
  onRemove: (index: number) => void;
}

const StringListRow = memo(function StringListRow({
  item,
  index,
  disabled,
  placeholder,
  inputAriaLabel,
  deleteLabel,
  onUpdate,
  onRemove,
}: StringListRowProps) {
  return (
    <div className={styles.stringListRow}>
      <ExpandableInput
        placeholder={placeholder}
        ariaLabel={inputAriaLabel ?? placeholder}
        value={item}
        onChange={(nextValue) => onUpdate(index, nextValue)}
        disabled={disabled}
      />
      <Button variant="ghost" size="sm" onClick={() => onRemove(index)} disabled={disabled}>
        {deleteLabel}
      </Button>
    </div>
  );
});

const StringListEditor = memo(function StringListEditor({
  value,
  disabled,
  placeholder,
  inputAriaLabel,
  onChange,
}: {
  value: string[];
  disabled?: boolean;
  placeholder?: string;
  inputAriaLabel?: string;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const items = value.length ? value : [];
  const [itemIds, setItemIds] = useState(() => items.map(() => makeClientId()));
  const renderItemIds = useMemo(() => {
    if (itemIds.length === items.length) return itemIds;
    if (itemIds.length > items.length) return itemIds.slice(0, items.length);
    return [
      ...itemIds,
      ...Array.from({ length: items.length - itemIds.length }, () => makeClientId()),
    ];
  }, [itemIds, items.length]);

  const updateItem = useEventCallback((index: number, nextValue: string) => {
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  });
  const addItem = useEventCallback(() => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  });
  const removeItem = useEventCallback((index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  });
  const deleteLabel = t('config_management.visual.common.delete');

  return (
    <div className={styles.stringList}>
      {items.map((item, index) => (
        <StringListRow
          key={renderItemIds[index] ?? `item-${index}`}
          item={item}
          index={index}
          disabled={disabled}
          placeholder={placeholder}
          inputAriaLabel={inputAriaLabel}
          deleteLabel={deleteLabel}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      ))}
      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addItem} disabled={disabled}>
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});

type PayloadRuleCardOption = {
  value: string;
  label: string;
};

type PayloadRuleCardProps = {
  rule: PayloadRule;
  ruleIndex: number;
  disabled?: boolean;
  protocolFirst: boolean;
  rawJsonValues: boolean;
  protocolOptions: PayloadRuleCardOption[];
  payloadValueTypeOptions: PayloadRuleCardOption[];
  booleanValueOptions: PayloadRuleCardOption[];
  onRemoveRule: (ruleIndex: number) => void;
  onAddModel: (ruleIndex: number) => void;
  onRemoveModel: (ruleIndex: number, modelIndex: number) => void;
  onUpdateModel: (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => void;
  onAddParam: (ruleIndex: number) => void;
  onRemoveParam: (ruleIndex: number, paramIndex: number) => void;
  onUpdateParam: (ruleIndex: number, paramIndex: number, patch: Partial<PayloadParamEntry>) => void;
};

const arePayloadRuleCardOptionsEqual = (
  previous: PayloadRuleCardOption[],
  next: PayloadRuleCardOption[]
) => {
  if (previous === next) return true;
  if (previous.length !== next.length) return false;
  return previous.every(
    (option, index) => option.value === next[index]?.value && option.label === next[index]?.label
  );
};

const arePayloadRuleCardPropsEqual = (previous: PayloadRuleCardProps, next: PayloadRuleCardProps) =>
  previous.rule === next.rule &&
  previous.ruleIndex === next.ruleIndex &&
  previous.disabled === next.disabled &&
  previous.protocolFirst === next.protocolFirst &&
  previous.rawJsonValues === next.rawJsonValues &&
  arePayloadRuleCardOptionsEqual(previous.protocolOptions, next.protocolOptions) &&
  arePayloadRuleCardOptionsEqual(previous.payloadValueTypeOptions, next.payloadValueTypeOptions) &&
  arePayloadRuleCardOptionsEqual(previous.booleanValueOptions, next.booleanValueOptions) &&
  previous.onRemoveRule === next.onRemoveRule &&
  previous.onAddModel === next.onAddModel &&
  previous.onRemoveModel === next.onRemoveModel &&
  previous.onUpdateModel === next.onUpdateModel &&
  previous.onAddParam === next.onAddParam &&
  previous.onRemoveParam === next.onRemoveParam &&
  previous.onUpdateParam === next.onUpdateParam;

type PayloadModelRowProps = {
  model: PayloadModelEntry;
  modelIndex: number;
  ruleIndex: number;
  disabled?: boolean;
  protocolFirst?: boolean;
  rowClassName: string;
  protocolOptions: PayloadRuleCardOption[];
  onRemoveModel: (ruleIndex: number, modelIndex: number) => void;
  onUpdateModel: (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => void;
};

const arePayloadModelRowPropsEqual = (previous: PayloadModelRowProps, next: PayloadModelRowProps) =>
  previous.model === next.model &&
  previous.modelIndex === next.modelIndex &&
  previous.ruleIndex === next.ruleIndex &&
  previous.disabled === next.disabled &&
  previous.protocolFirst === next.protocolFirst &&
  previous.rowClassName === next.rowClassName &&
  arePayloadRuleCardOptionsEqual(previous.protocolOptions, next.protocolOptions) &&
  previous.onRemoveModel === next.onRemoveModel &&
  previous.onUpdateModel === next.onUpdateModel;

const PayloadModelRow = memo(function PayloadModelRow({
  model,
  modelIndex,
  ruleIndex,
  disabled,
  protocolFirst = false,
  rowClassName,
  protocolOptions,
  onRemoveModel,
  onUpdateModel,
}: PayloadModelRowProps) {
  const { t } = useTranslation();
  const modelNameLabel = t('config_management.visual.payload_rules.model_name');
  const providerTypeLabel = t('config_management.visual.payload_rules.provider_type');

  const modelInput = (
    <ExpandableInput
      placeholder={modelNameLabel}
      ariaLabel={modelNameLabel}
      value={model.name}
      onChange={(nextValue) => onUpdateModel(ruleIndex, modelIndex, { name: nextValue })}
      disabled={disabled}
    />
  );
  const protocolSelect = (
    <Select
      value={model.protocol ?? ''}
      options={protocolOptions}
      disabled={disabled}
      ariaLabel={providerTypeLabel}
      onChange={(nextValue) =>
        onUpdateModel(ruleIndex, modelIndex, {
          protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
        })
      }
    />
  );

  return (
    <div className={rowClassName}>
      {protocolFirst ? (
        <>
          {protocolSelect}
          {modelInput}
        </>
      ) : (
        <>
          {modelInput}
          {protocolSelect}
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className={styles.payloadRowActionButton}
        onClick={() => onRemoveModel(ruleIndex, modelIndex)}
        disabled={disabled}
      >
        {t('config_management.visual.common.delete')}
      </Button>
    </div>
  );
}, arePayloadModelRowPropsEqual);

type PayloadParamRowProps = {
  param: PayloadParamEntry;
  paramIndex: number;
  ruleIndex: number;
  disabled?: boolean;
  rawJsonValues: boolean;
  payloadValueTypeOptions: PayloadRuleCardOption[];
  booleanValueOptions: PayloadRuleCardOption[];
  onRemoveParam: (ruleIndex: number, paramIndex: number) => void;
  onUpdateParam: (ruleIndex: number, paramIndex: number, patch: Partial<PayloadParamEntry>) => void;
};

const arePayloadParamRowPropsEqual = (previous: PayloadParamRowProps, next: PayloadParamRowProps) =>
  previous.param === next.param &&
  previous.paramIndex === next.paramIndex &&
  previous.ruleIndex === next.ruleIndex &&
  previous.disabled === next.disabled &&
  previous.rawJsonValues === next.rawJsonValues &&
  arePayloadRuleCardOptionsEqual(previous.payloadValueTypeOptions, next.payloadValueTypeOptions) &&
  arePayloadRuleCardOptionsEqual(previous.booleanValueOptions, next.booleanValueOptions) &&
  previous.onRemoveParam === next.onRemoveParam &&
  previous.onUpdateParam === next.onUpdateParam;

const PayloadParamRow = memo(function PayloadParamRow({
  param,
  paramIndex,
  ruleIndex,
  disabled,
  rawJsonValues,
  payloadValueTypeOptions,
  booleanValueOptions,
  onRemoveParam,
  onUpdateParam,
}: PayloadParamRowProps) {
  const { t } = useTranslation();

  const getValuePlaceholder = (valueType: PayloadParamValueType) => {
    switch (valueType) {
      case 'string':
        return t('config_management.visual.payload_rules.value_string');
      case 'number':
        return t('config_management.visual.payload_rules.value_number');
      case 'boolean':
        return t('config_management.visual.payload_rules.value_boolean');
      case 'json':
        return t('config_management.visual.payload_rules.value_json');
      default:
        return t('config_management.visual.payload_rules.value_default');
    }
  };

  const errorCode = getPayloadParamValidationError(
    rawJsonValues ? { ...param, valueType: 'json' } : param
  );
  const paramError = getValidationMessage(t, errorCode);

  const renderParamValueEditor = () => {
    if (rawJsonValues) {
      return (
        <textarea
          className={['input', styles.payloadJsonInput].join(' ')}
          placeholder={t('config_management.visual.payload_rules.value_raw_json')}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) =>
            onUpdateParam(ruleIndex, paramIndex, { value: e.target.value, valueType: 'json' })
          }
          disabled={disabled}
        />
      );
    }

    if (param.valueType === 'boolean') {
      return (
        <Select
          value={
            param.value.toLowerCase() === 'true' || param.value.toLowerCase() === 'false'
              ? param.value.toLowerCase()
              : ''
          }
          options={booleanValueOptions}
          placeholder={t('config_management.visual.payload_rules.value_boolean')}
          disabled={disabled}
          ariaLabel={t('config_management.visual.payload_rules.param_value')}
          onChange={(nextValue) => onUpdateParam(ruleIndex, paramIndex, { value: nextValue })}
        />
      );
    }

    if (param.valueType === 'json') {
      return (
        <textarea
          className={['input', styles.payloadJsonInput].join(' ')}
          placeholder={getValuePlaceholder(param.valueType)}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) => onUpdateParam(ruleIndex, paramIndex, { value: e.target.value })}
          disabled={disabled}
        />
      );
    }

    return (
      <ExpandableInput
        placeholder={getValuePlaceholder(param.valueType)}
        ariaLabel={t('config_management.visual.payload_rules.param_value')}
        value={param.value}
        onChange={(nextValue) => onUpdateParam(ruleIndex, paramIndex, { value: nextValue })}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={styles.payloadRuleParamGroup}>
      <div className={styles.payloadRuleParamRow}>
        <ExpandableInput
          placeholder={t('config_management.visual.payload_rules.json_path')}
          ariaLabel={t('config_management.visual.payload_rules.json_path')}
          value={param.path}
          onChange={(nextValue) => onUpdateParam(ruleIndex, paramIndex, { path: nextValue })}
          disabled={disabled}
        />
        {rawJsonValues ? null : (
          <Select
            value={param.valueType}
            options={payloadValueTypeOptions}
            disabled={disabled}
            ariaLabel={t('config_management.visual.payload_rules.param_type')}
            onChange={(nextValue) =>
              onUpdateParam(ruleIndex, paramIndex, {
                valueType: nextValue as PayloadParamValueType,
                value:
                  nextValue === 'boolean'
                    ? 'true'
                    : nextValue === 'json' && param.value.trim() === ''
                      ? '{}'
                      : param.value,
              })
            }
          />
        )}
        {renderParamValueEditor()}
        <Button
          variant="ghost"
          size="sm"
          className={styles.payloadRowActionButton}
          onClick={() => onRemoveParam(ruleIndex, paramIndex)}
          disabled={disabled}
        >
          {t('config_management.visual.common.delete')}
        </Button>
      </div>
      {paramError && (
        <div className={['error-box', styles.payloadParamError].join(' ')} role="alert">
          {paramError}
        </div>
      )}
    </div>
  );
}, arePayloadParamRowPropsEqual);

const PayloadRuleCard = memo(function PayloadRuleCard({
  rule,
  ruleIndex,
  disabled,
  protocolFirst,
  rawJsonValues,
  protocolOptions,
  payloadValueTypeOptions,
  booleanValueOptions,
  onRemoveRule,
  onAddModel,
  onRemoveModel,
  onUpdateModel,
  onAddParam,
  onRemoveParam,
  onUpdateParam,
}: PayloadRuleCardProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.ruleCard}>
      <div className={styles.ruleCardHeader}>
        <div className={styles.ruleCardTitle}>
          {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemoveRule(ruleIndex)}
          disabled={disabled}
        >
          {t('config_management.visual.common.delete')}
        </Button>
      </div>

      <div className={styles.blockStack}>
        <div className={styles.blockLabel}>
          {t('config_management.visual.payload_rules.models')}
        </div>
        {rule.models.map((model, modelIndex) => (
          <PayloadModelRow
            key={model.id}
            model={model}
            modelIndex={modelIndex}
            ruleIndex={ruleIndex}
            disabled={disabled}
            protocolFirst={protocolFirst}
            rowClassName={[
              styles.payloadRuleModelRow,
              protocolFirst ? styles.payloadRuleModelRowProtocolFirst : '',
            ]
              .filter(Boolean)
              .join(' ')}
            protocolOptions={protocolOptions}
            onRemoveModel={onRemoveModel}
            onUpdateModel={onUpdateModel}
          />
        ))}
        <div className={styles.actionRow}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAddModel(ruleIndex)}
            disabled={disabled}
          >
            {t('config_management.visual.payload_rules.add_model')}
          </Button>
        </div>
      </div>

      <div className={styles.blockStack}>
        <div className={styles.blockLabel}>
          {t('config_management.visual.payload_rules.params')}
        </div>
        {rule.params.map((param, paramIndex) => (
          <PayloadParamRow
            key={param.id}
            param={param}
            paramIndex={paramIndex}
            ruleIndex={ruleIndex}
            disabled={disabled}
            rawJsonValues={rawJsonValues}
            payloadValueTypeOptions={payloadValueTypeOptions}
            booleanValueOptions={booleanValueOptions}
            onRemoveParam={onRemoveParam}
            onUpdateParam={onUpdateParam}
          />
        ))}
        <div className={styles.actionRow}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAddParam(ruleIndex)}
            disabled={disabled}
          >
            {t('config_management.visual.payload_rules.add_param')}
          </Button>
        </div>
      </div>
    </div>
  );
}, arePayloadRuleCardPropsEqual);

export const PayloadRulesEditor = memo(function PayloadRulesEditor({
  value,
  disabled,
  protocolFirst = false,
  rawJsonValues = false,
  onChange,
}: {
  value: PayloadRule[];
  disabled?: boolean;
  protocolFirst?: boolean;
  rawJsonValues?: boolean;
  onChange: (next: PayloadRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const rulesRef = useRef(rules);
  const onChangeRef = useRef(onChange);
  const rawJsonValuesRef = useRef(rawJsonValues);
  useLayoutEffect(() => {
    rulesRef.current = rules;
    onChangeRef.current = onChange;
    rawJsonValuesRef.current = rawJsonValues;
  }, [onChange, rawJsonValues, rules]);
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);
  const payloadValueTypeOptions = useMemo(
    () =>
      VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t]
  );
  const booleanValueOptions = useMemo(
    () => [
      { value: 'true', label: t('config_management.visual.payload_rules.boolean_true') },
      { value: 'false', label: t('config_management.visual.payload_rules.boolean_false') },
    ],
    [t]
  );

  const updateRule = useCallback((ruleIndex: number, patch: Partial<PayloadRule>) => {
    const currentRules = rulesRef.current;
    if (!currentRules[ruleIndex]) return;
    onChangeRef.current(
      currentRules.map((rule, index) => (index === ruleIndex ? { ...rule, ...patch } : rule))
    );
  }, []);

  const addRule = useCallback(() => {
    onChangeRef.current([...rulesRef.current, { id: makeClientId(), models: [], params: [] }]);
  }, []);

  const removeRule = useCallback((ruleIndex: number) => {
    onChangeRef.current(rulesRef.current.filter((_, index) => index !== ruleIndex));
  }, []);

  const addModel = useCallback(
    (ruleIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
      updateRule(ruleIndex, { models: [...rule.models, nextModel] });
    },
    [updateRule]
  );

  const removeModel = useCallback(
    (ruleIndex: number, modelIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, { models: rule.models.filter((_, index) => index !== modelIndex) });
    },
    [updateRule]
  );

  const updateModel = useCallback(
    (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, {
        models: rule.models.map((model, index) =>
          index === modelIndex ? { ...model, ...patch } : model
        ),
      });
    },
    [updateRule]
  );

  const addParam = useCallback(
    (ruleIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      const nextParam: PayloadParamEntry = {
        id: makeClientId(),
        path: '',
        valueType: rawJsonValuesRef.current ? 'json' : 'string',
        value: '',
      };
      updateRule(ruleIndex, { params: [...rule.params, nextParam] });
    },
    [updateRule]
  );

  const removeParam = useCallback(
    (ruleIndex: number, paramIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, { params: rule.params.filter((_, index) => index !== paramIndex) });
    },
    [updateRule]
  );

  const updateParam = useCallback(
    (ruleIndex: number, paramIndex: number, patch: Partial<PayloadParamEntry>) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, {
        params: rule.params.map((param, index) =>
          index === paramIndex ? { ...param, ...patch } : param
        ),
      });
    },
    [updateRule]
  );
  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <PayloadRuleCard
          key={rule.id}
          rule={rule}
          ruleIndex={ruleIndex}
          disabled={disabled}
          protocolFirst={protocolFirst}
          rawJsonValues={rawJsonValues}
          protocolOptions={protocolOptions}
          payloadValueTypeOptions={payloadValueTypeOptions}
          booleanValueOptions={booleanValueOptions}
          onRemoveRule={removeRule}
          onAddModel={addModel}
          onRemoveModel={removeModel}
          onUpdateModel={updateModel}
          onAddParam={addParam}
          onRemoveParam={removeParam}
          onUpdateParam={updateParam}
        />
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});

type PayloadFilterRuleCardProps = {
  rule: PayloadFilterRule;
  ruleIndex: number;
  disabled?: boolean;
  protocolOptions: PayloadRuleCardOption[];
  onRemoveRule: (ruleIndex: number) => void;
  onAddModel: (ruleIndex: number) => void;
  onRemoveModel: (ruleIndex: number, modelIndex: number) => void;
  onUpdateModel: (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => void;
  onUpdateParams: (ruleIndex: number, params: string[]) => void;
};

const arePayloadFilterRuleCardPropsEqual = (
  previous: PayloadFilterRuleCardProps,
  next: PayloadFilterRuleCardProps
) =>
  previous.rule === next.rule &&
  previous.ruleIndex === next.ruleIndex &&
  previous.disabled === next.disabled &&
  arePayloadRuleCardOptionsEqual(previous.protocolOptions, next.protocolOptions) &&
  previous.onRemoveRule === next.onRemoveRule &&
  previous.onAddModel === next.onAddModel &&
  previous.onRemoveModel === next.onRemoveModel &&
  previous.onUpdateModel === next.onUpdateModel &&
  previous.onUpdateParams === next.onUpdateParams;

const PayloadFilterRuleCard = memo(function PayloadFilterRuleCard({
  rule,
  ruleIndex,
  disabled,
  protocolOptions,
  onRemoveRule,
  onAddModel,
  onRemoveModel,
  onUpdateModel,
  onUpdateParams,
}: PayloadFilterRuleCardProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.ruleCard}>
      <div className={styles.ruleCardHeader}>
        <div className={styles.ruleCardTitle}>
          {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemoveRule(ruleIndex)}
          disabled={disabled}
        >
          {t('config_management.visual.common.delete')}
        </Button>
      </div>

      <div className={styles.blockStack}>
        <div className={styles.blockLabel}>
          {t('config_management.visual.payload_rules.models')}
        </div>
        {rule.models.map((model, modelIndex) => (
          <PayloadModelRow
            key={model.id}
            model={model}
            modelIndex={modelIndex}
            ruleIndex={ruleIndex}
            disabled={disabled}
            rowClassName={styles.payloadFilterModelRow}
            protocolOptions={protocolOptions}
            onRemoveModel={onRemoveModel}
            onUpdateModel={onUpdateModel}
          />
        ))}
        <div className={styles.actionRow}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onAddModel(ruleIndex)}
            disabled={disabled}
          >
            {t('config_management.visual.payload_rules.add_model')}
          </Button>
        </div>
      </div>

      <div className={styles.blockStack}>
        <div className={styles.blockLabel}>
          {t('config_management.visual.payload_rules.remove_params')}
        </div>
        <StringListEditor
          value={rule.params}
          disabled={disabled}
          placeholder={t('config_management.visual.payload_rules.json_path_filter')}
          inputAriaLabel={t('config_management.visual.payload_rules.json_path_filter')}
          onChange={(params) => onUpdateParams(ruleIndex, params)}
        />
      </div>
    </div>
  );
}, arePayloadFilterRuleCardPropsEqual);

export const PayloadFilterRulesEditor = memo(function PayloadFilterRulesEditor({
  value,
  disabled,
  onChange,
}: {
  value: PayloadFilterRule[];
  disabled?: boolean;
  onChange: (next: PayloadFilterRule[]) => void;
}) {
  const { t } = useTranslation();
  const rules = value;
  const rulesRef = useRef(rules);
  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    rulesRef.current = rules;
    onChangeRef.current = onChange;
  }, [onChange, rules]);
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const updateRule = useCallback((ruleIndex: number, patch: Partial<PayloadFilterRule>) => {
    const currentRules = rulesRef.current;
    if (!currentRules[ruleIndex]) return;
    onChangeRef.current(
      currentRules.map((rule, index) => (index === ruleIndex ? { ...rule, ...patch } : rule))
    );
  }, []);

  const addRule = useCallback(() => {
    onChangeRef.current([...rulesRef.current, { id: makeClientId(), models: [], params: [] }]);
  }, []);

  const removeRule = useCallback((ruleIndex: number) => {
    onChangeRef.current(rulesRef.current.filter((_, index) => index !== ruleIndex));
  }, []);

  const addModel = useCallback(
    (ruleIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
      updateRule(ruleIndex, { models: [...rule.models, nextModel] });
    },
    [updateRule]
  );

  const removeModel = useCallback(
    (ruleIndex: number, modelIndex: number) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, { models: rule.models.filter((_, index) => index !== modelIndex) });
    },
    [updateRule]
  );

  const updateModel = useCallback(
    (ruleIndex: number, modelIndex: number, patch: Partial<PayloadModelEntry>) => {
      const rule = rulesRef.current[ruleIndex];
      if (!rule) return;
      updateRule(ruleIndex, {
        models: rule.models.map((model, index) =>
          index === modelIndex ? { ...model, ...patch } : model
        ),
      });
    },
    [updateRule]
  );

  const updateParams = useCallback(
    (ruleIndex: number, params: string[]) => {
      updateRule(ruleIndex, { params });
    },
    [updateRule]
  );

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <PayloadFilterRuleCard
          key={rule.id}
          rule={rule}
          ruleIndex={ruleIndex}
          disabled={disabled}
          protocolOptions={protocolOptions}
          onRemoveRule={removeRule}
          onAddModel={addModel}
          onRemoveModel={removeModel}
          onUpdateModel={updateModel}
          onUpdateParams={updateParams}
        />
      ))}

      {rules.length === 0 && (
        <div className={styles.emptyState}>
          {t('config_management.visual.payload_rules.no_rules')}
        </div>
      )}

      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          {t('config_management.visual.payload_rules.add_rule')}
        </Button>
      </div>
    </div>
  );
});
