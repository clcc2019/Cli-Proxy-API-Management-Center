import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCopy,
  IconFileText,
  IconKey,
  IconPlus,
  IconSearch,
  IconSettings,
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

export const ApiKeysCardEditor = memo(function ApiKeysCardEditor({
  value,
  disabled,
  onChange,
}: {
  value: VisualApiKeyEntry[];
  disabled?: boolean;
  onChange: (nextValue: VisualApiKeyEntry[]) => void;
}) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const apiKeys = useMemo(() => value ?? [], [value]);
  const apiUrl = useMemo(() => buildOpenAiBaseUrl(apiBase || ''), [apiBase]);

  const apiKeyInputId = useId();
  const apiKeyHintId = `${apiKeyInputId}-hint`;
  const apiKeyErrorId = `${apiKeyInputId}-error`;
  const noteInputId = `${apiKeyInputId}-note`;
  const noteHintId = `${noteInputId}-hint`;
  const quotaHintId = `${apiKeyInputId}-quota-hint`;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [disabledValue, setDisabledValue] = useState(false);
  const [allowedModelsValue, setAllowedModelsValue] = useState('');
  const [excludedModelsValue, setExcludedModelsValue] = useState('');
  const [quotaValues, setQuotaValues] = useState<QuotaInputValues>(() => emptyQuotaInputValues());
  const [formError, setFormError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [listFilter, setListFilter] = useState<ApiKeyListFilter>('all');

  const activeCount = apiKeys.filter((entry) => !entry.disabled).length;
  const disabledCount = apiKeys.length - activeCount;
  const filteredApiKeys = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return apiKeys
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (listFilter === 'active' && entry.disabled) return false;
        if (listFilter === 'disabled' && !entry.disabled) return false;
        if (!query) return true;

        return [entry.apiKey, entry.note, ...entry.allowedModels, ...entry.excludedModels].some(
          (value) =>
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
    setQuotaValues(emptyQuotaInputValues());
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (apiKeyId: string) => {
    const entry = apiKeys.find((item) => item.id === apiKeyId);
    setEditingApiKeyId(apiKeyId);
    setInputValue(entry?.apiKey ?? '');
    setNoteValue(entry?.note ?? '');
    setDisabledValue(Boolean(entry?.disabled));
    setAllowedModelsValue(excludedModelsToText(entry?.allowedModels));
    setExcludedModelsValue(excludedModelsToText(entry?.excludedModels));
    setQuotaValues(quotaToInputValues(entry?.quota));
    setFormError('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setInputValue('');
    setNoteValue('');
    setDisabledValue(false);
    setAllowedModelsValue('');
    setExcludedModelsValue('');
    setQuotaValues(emptyQuotaInputValues());
    setEditingApiKeyId(null);
    setFormError('');
  };

  const handleDelete = (apiKeyId: string) => {
    onChange(apiKeys.filter((entry) => entry.id !== apiKeyId));
  };

  const handleToggleDisabled = (apiKeyId: string, disabledState: boolean) => {
    onChange(
      apiKeys.map((entry) =>
        entry.id === apiKeyId ? { ...entry, disabled: disabledState } : entry
      )
    );
  };

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setFormError(t('config_management.visual.api_keys.error_empty'));
      return;
    }
    if (!isValidApiKeyCharset(trimmed)) {
      setFormError(t('config_management.visual.api_keys.error_invalid'));
      return;
    }
    const allowedModels = parseTextList(allowedModelsValue);
    const excludedModels = parseExcludedModels(excludedModelsValue);
    const parsedQuota = parseQuotaInputValues(quotaValues);
    if (!parsedQuota.ok) {
      setFormError(t('config_management.visual.api_keys.quota_error_invalid'));
      return;
    }
    const nextEntry: VisualApiKeyEntry = {
      id: editingApiKeyId ?? makeClientId(),
      apiKey: trimmed,
      note: noteValue.trim(),
      disabled: disabledValue,
      allowedModels,
      excludedModels,
      ...(parsedQuota.quota ? { quota: parsedQuota.quota } : {}),
    };
    const nextKeys =
      editingApiKeyId === null
        ? [...apiKeys, nextEntry]
        : apiKeys.map((entry) => (entry.id === editingApiKeyId ? nextEntry : entry));
    onChange(nextKeys);
    closeModal();
  };

  const handleCopyKey = async (apiKey: string) => {
    const copied = await copyToClipboard(apiKey);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleCopyFull = async (apiKey: string) => {
    const text = formatFullCopyText(apiUrl, apiKey);
    const copied = await copyToClipboard(text);
    showNotification(
      copied
        ? t('config_management.visual.api_keys.copy_full_success')
        : t('notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const handleGenerate = () => {
    setInputValue(generateSecureApiKey());
    setFormError('');
  };

  return (
    <section className={apiKeyCardStyles.editor} aria-labelledby="api-key-list-title">
      <div className={apiKeyCardStyles.headerRow}>
        <div className={apiKeyCardStyles.headerCopy}>
          <span className={apiKeyCardStyles.headerKicker}>
            {t('config_management.visual.api_keys.label')}
          </span>
          <h2 id="api-key-list-title" className={apiKeyCardStyles.headerLabel}>
            {t('api_keys.section_title')}
          </h2>
          <p className={apiKeyCardStyles.headerHint}>
            {t('config_management.visual.api_keys.hint')}
          </p>
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

          <span className={apiKeyCardStyles.resultCount}>
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
        <div className={apiKeyCardStyles.listSurface}>
          <div className={apiKeyCardStyles.listHeader} role="row">
            <span>{t('api_keys.column_key')}</span>
            <span>{t('api_keys.column_scope')}</span>
            <span>{t('api_keys.column_status')}</span>
            <span className={apiKeyCardStyles.actionsHeader}>{t('api_keys.column_actions')}</span>
          </div>
          <div className={apiKeyCardStyles.cardList} role="rowgroup">
            {filteredApiKeys.map(({ entry, index }) => {
              const note = (entry.note ?? '').trim();
              const isDisabled = Boolean(entry.disabled);
              const hasRules = entry.allowedModels.length > 0 || entry.excludedModels.length > 0;
              const hasQuota = hasClientApiKeyQuota(entry.quota);

              return (
                <article
                  key={entry.id}
                  className={`${apiKeyCardStyles.card} ${isDisabled ? apiKeyCardStyles.cardDisabled : ''}`}
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
                    <span className={apiKeyCardStyles.mobileCellLabel}>
                      {t('api_keys.column_scope')}
                    </span>
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
                          className={`${apiKeyCardStyles.summaryChip} ${apiKeyCardStyles.summaryChipQuota}`}
                        >
                          {t('config_management.visual.api_keys.quota_summary', {
                            count: clientApiKeyQuotaLimitCount(entry.quota),
                          })}
                        </span>
                      )}
                      {!hasRules && !hasQuota && (
                        <span className={apiKeyCardStyles.noScope}>{t('api_keys.scope_open')}</span>
                      )}
                    </div>
                  </div>

                  <div className={apiKeyCardStyles.statusCell}>
                    <span className={apiKeyCardStyles.mobileCellLabel}>
                      {t('api_keys.column_status')}
                    </span>
                    <span
                      className={`${apiKeyCardStyles.statusBadge} ${isDisabled ? apiKeyCardStyles.statusBadgeDisabled : ''}`}
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
                      onChange={(enabled) => handleToggleDisabled(entry.id, !enabled)}
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
                      onClick={() => handleCopyFull(entry.apiKey)}
                      disabled={disabled}
                      className={`${apiKeyCardStyles.iconButton} ${apiKeyCardStyles.copyFullButton}`}
                      title={t('config_management.visual.api_keys.copy_full_hint')}
                      aria-label={t('config_management.visual.api_keys.copy_full')}
                    >
                      <IconFileText size={17} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleCopyKey(entry.apiKey)}
                      disabled={disabled}
                      className={`${apiKeyCardStyles.iconButton} ${apiKeyCardStyles.copyKeyButton}`}
                      title={t('config_management.visual.api_keys.copy_key_only')}
                      aria-label={t('config_management.visual.api_keys.copy_key_only')}
                    >
                      <IconCopy size={17} />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEditModal(entry.id)}
                      disabled={disabled}
                      className={`${apiKeyCardStyles.iconButton} ${apiKeyCardStyles.editButton}`}
                      title={t('config_management.visual.common.edit')}
                      aria-label={t('config_management.visual.common.edit')}
                    >
                      <IconSettings size={17} />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={disabled}
                      className={`${apiKeyCardStyles.iconButton} ${apiKeyCardStyles.deleteButton}`}
                      title={t('config_management.visual.common.delete')}
                      aria-label={t('config_management.visual.common.delete')}
                    >
                      <IconTrash2 size={17} />
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={680}
        fullScreenOnMobile
        className={apiKeyCardStyles.modal}
        title={
          editingApiKeyId !== null
            ? t('config_management.visual.api_keys.edit_title')
            : t('config_management.visual.api_keys.add_title')
        }
        footer={
          <>
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
        <div className={apiKeyCardStyles.modalForm}>
          <div className={apiKeyCardStyles.modalIntro}>
            <span>{t('config_management.visual.api_keys.input_hint')}</span>
          </div>
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
                aria-describedby={formError ? `${apiKeyErrorId} ${apiKeyHintId}` : apiKeyHintId}
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
            <label htmlFor={noteInputId}>{t('config_management.visual.api_keys.note_label')}</label>
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
          <div className={apiKeyCardStyles.modalColumns}>
            <div className="form-group">
              <span className="form-label">
                {t('config_management.visual.api_keys.allowed_models_label')}
              </span>
              <textarea
                className="input"
                rows={4}
                aria-label={t('config_management.visual.api_keys.allowed_models_label')}
                placeholder={t('config_management.visual.api_keys.allowed_models_placeholder')}
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
                placeholder={t('config_management.visual.api_keys.excluded_models_placeholder')}
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
            <span className="form-label">{t('config_management.visual.api_keys.quota_title')}</span>
            <div className={styles.quotaGrid}>
              {CLIENT_API_KEY_QUOTA_FIELDS.map(({ field }) => (
                <div key={field} className={styles.quotaField}>
                  <label className={styles.quotaFieldLabel} htmlFor={`${apiKeyInputId}-${field}`}>
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
        </div>
      </Modal>
    </section>
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

  const updateItem = (index: number, nextValue: string) =>
    onChange(items.map((item, i) => (i === index ? nextValue : item)));
  const addItem = () => {
    setItemIds([...renderItemIds, makeClientId()]);
    onChange([...items, '']);
  };
  const removeItem = (index: number) => {
    setItemIds(renderItemIds.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className={styles.stringList}>
      {items.map((item, index) => (
        <div key={renderItemIds[index] ?? `item-${index}`} className={styles.stringListRow}>
          <ExpandableInput
            placeholder={placeholder}
            ariaLabel={inputAriaLabel ?? placeholder}
            value={item}
            onChange={(nextValue) => updateItem(index, nextValue)}
            disabled={disabled}
          />
          <Button variant="ghost" size="sm" onClick={() => removeItem(index)} disabled={disabled}>
            {t('config_management.visual.common.delete')}
          </Button>
        </div>
      ))}
      <div className={styles.actionRow}>
        <Button variant="secondary" size="sm" onClick={addItem} disabled={disabled}>
          {t('config_management.visual.common.add')}
        </Button>
      </div>
    </div>
  );
});

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

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  const addParam = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextParam: PayloadParamEntry = {
      id: makeClientId(),
      path: '',
      valueType: rawJsonValues ? 'json' : 'string',
      value: '',
    };
    updateRule(ruleIndex, { params: [...rule.params, nextParam] });
  };

  const removeParam = (ruleIndex: number, paramIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { params: rule.params.filter((_, i) => i !== paramIndex) });
  };

  const updateParam = (
    ruleIndex: number,
    paramIndex: number,
    patch: Partial<PayloadParamEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      params: rule.params.map((p, i) => (i === paramIndex ? { ...p, ...patch } : p)),
    });
  };

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

  const getParamErrorMessage = (param: PayloadParamEntry) => {
    const errorCode = getPayloadParamValidationError(
      rawJsonValues ? { ...param, valueType: 'json' } : param
    );
    return getValidationMessage(t, errorCode);
  };

  const renderParamValueEditor = (
    ruleIndex: number,
    paramIndex: number,
    param: PayloadParamEntry
  ) => {
    if (rawJsonValues) {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={t('config_management.visual.payload_rules.value_raw_json')}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) =>
            updateParam(ruleIndex, paramIndex, { value: e.target.value, valueType: 'json' })
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
          onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        />
      );
    }

    if (param.valueType === 'json') {
      return (
        <textarea
          className={`input ${styles.payloadJsonInput}`}
          placeholder={getValuePlaceholder(param.valueType)}
          aria-label={t('config_management.visual.payload_rules.param_value')}
          value={param.value}
          onChange={(e) => updateParam(ruleIndex, paramIndex, { value: e.target.value })}
          disabled={disabled}
        />
      );
    }

    return (
      <ExpandableInput
        placeholder={getValuePlaceholder(param.valueType)}
        ariaLabel={t('config_management.visual.payload_rules.param_value')}
        value={param.value}
        onChange={(nextValue) => updateParam(ruleIndex, paramIndex, { value: nextValue })}
        disabled={disabled}
      />
    );
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
              disabled={disabled}
            >
              {t('config_management.visual.common.delete')}
            </Button>
          </div>

          <div className={styles.blockStack}>
            <div className={styles.blockLabel}>
              {t('config_management.visual.payload_rules.models')}
            </div>
            {(rule.models.length ? rule.models : []).map((model, modelIndex) => (
              <div
                key={model.id}
                className={[
                  styles.payloadRuleModelRow,
                  protocolFirst ? styles.payloadRuleModelRowProtocolFirst : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {protocolFirst ? (
                  <>
                    <Select
                      value={model.protocol ?? ''}
                      options={protocolOptions}
                      disabled={disabled}
                      ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, {
                          protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                        })
                      }
                    />
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.model_name')}
                      ariaLabel={t('config_management.visual.payload_rules.model_name')}
                      value={model.name}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, { name: nextValue })
                      }
                      disabled={disabled}
                    />
                  </>
                ) : (
                  <>
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.model_name')}
                      ariaLabel={t('config_management.visual.payload_rules.model_name')}
                      value={model.name}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, { name: nextValue })
                      }
                      disabled={disabled}
                    />
                    <Select
                      value={model.protocol ?? ''}
                      options={protocolOptions}
                      disabled={disabled}
                      ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                      onChange={(nextValue) =>
                        updateModel(ruleIndex, modelIndex, {
                          protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                        })
                      }
                    />
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => removeModel(ruleIndex, modelIndex)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
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
            {(rule.params.length ? rule.params : []).map((param, paramIndex) => {
              const paramError = getParamErrorMessage(param);

              return (
                <div key={param.id} className={styles.payloadRuleParamGroup}>
                  <div className={styles.payloadRuleParamRow}>
                    <ExpandableInput
                      placeholder={t('config_management.visual.payload_rules.json_path')}
                      ariaLabel={t('config_management.visual.payload_rules.json_path')}
                      value={param.path}
                      onChange={(nextValue) =>
                        updateParam(ruleIndex, paramIndex, { path: nextValue })
                      }
                      disabled={disabled}
                    />
                    {rawJsonValues ? null : (
                      <Select
                        value={param.valueType}
                        options={payloadValueTypeOptions}
                        disabled={disabled}
                        ariaLabel={t('config_management.visual.payload_rules.param_type')}
                        onChange={(nextValue) =>
                          updateParam(ruleIndex, paramIndex, {
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
                    {renderParamValueEditor(ruleIndex, paramIndex, param)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.payloadRowActionButton}
                      onClick={() => removeParam(ruleIndex, paramIndex)}
                      disabled={disabled}
                    >
                      {t('config_management.visual.common.delete')}
                    </Button>
                  </div>
                  {paramError && (
                    <div className={`error-box ${styles.payloadParamError}`} role="alert">
                      {paramError}
                    </div>
                  )}
                </div>
              );
            })}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addParam(ruleIndex)}
                disabled={disabled}
              >
                {t('config_management.visual.payload_rules.add_param')}
              </Button>
            </div>
          </div>
        </div>
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
  const protocolOptions = useMemo(() => buildProtocolOptions(t, rules), [rules, t]);

  const addRule = () => onChange([...rules, { id: makeClientId(), models: [], params: [] }]);
  const removeRule = (ruleIndex: number) => onChange(rules.filter((_, i) => i !== ruleIndex));

  const updateRule = (ruleIndex: number, patch: Partial<PayloadFilterRule>) =>
    onChange(rules.map((rule, i) => (i === ruleIndex ? { ...rule, ...patch } : rule)));

  const addModel = (ruleIndex: number) => {
    const rule = rules[ruleIndex];
    const nextModel: PayloadModelEntry = { id: makeClientId(), name: '', protocol: undefined };
    updateRule(ruleIndex, { models: [...rule.models, nextModel] });
  };

  const removeModel = (ruleIndex: number, modelIndex: number) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, { models: rule.models.filter((_, i) => i !== modelIndex) });
  };

  const updateModel = (
    ruleIndex: number,
    modelIndex: number,
    patch: Partial<PayloadModelEntry>
  ) => {
    const rule = rules[ruleIndex];
    updateRule(ruleIndex, {
      models: rule.models.map((m, i) => (i === modelIndex ? { ...m, ...patch } : m)),
    });
  };

  return (
    <div className={styles.blockStack}>
      {rules.map((rule, ruleIndex) => (
        <div key={rule.id} className={styles.ruleCard}>
          <div className={styles.ruleCardHeader}>
            <div className={styles.ruleCardTitle}>
              {t('config_management.visual.payload_rules.rule')} {ruleIndex + 1}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(ruleIndex)}
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
              <div key={model.id} className={styles.payloadFilterModelRow}>
                <ExpandableInput
                  placeholder={t('config_management.visual.payload_rules.model_name')}
                  ariaLabel={t('config_management.visual.payload_rules.model_name')}
                  value={model.name}
                  onChange={(nextValue) => updateModel(ruleIndex, modelIndex, { name: nextValue })}
                  disabled={disabled}
                />
                <Select
                  value={model.protocol ?? ''}
                  options={protocolOptions}
                  disabled={disabled}
                  ariaLabel={t('config_management.visual.payload_rules.provider_type')}
                  onChange={(nextValue) =>
                    updateModel(ruleIndex, modelIndex, {
                      protocol: (nextValue || undefined) as PayloadModelEntry['protocol'],
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.payloadRowActionButton}
                  onClick={() => removeModel(ruleIndex, modelIndex)}
                  disabled={disabled}
                >
                  {t('config_management.visual.common.delete')}
                </Button>
              </div>
            ))}
            <div className={styles.actionRow}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addModel(ruleIndex)}
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
              onChange={(params) => updateRule(ruleIndex, { params })}
            />
          </div>
        </div>
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
