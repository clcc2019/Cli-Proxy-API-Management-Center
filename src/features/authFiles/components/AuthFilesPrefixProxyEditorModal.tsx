import {
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCopy } from '@/components/ui/icons';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { formatClientProfileJson } from '@/features/authFiles/clientProfileMetadata';
import styles from './AuthFilesPrefixProxyEditorModal.module.scss';

const compactJsonText = (text: string) => {
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text)) ?? text;
  } catch {
    return text;
  }
};

const prettyJsonText = (text: string) => {
  if (!text) return '';
  try {
    return JSON.stringify(JSON.parse(text), null, 2) ?? text;
  } catch {
    return text;
  }
};

type EditorSectionProps = {
  title: string;
  children: ReactNode;
};

function EditorSection({ title, children }: EditorSectionProps) {
  const headingId = useId();

  return (
    <section className={styles.prefixProxySection} aria-labelledby={headingId}>
      <header className={styles.prefixProxySectionHeader}>
        <h3 id={headingId} className={styles.prefixProxySectionTitle}>
          {title}
        </h3>
      </header>
      {children}
    </section>
  );
}

export type AuthFilesPrefixProxyEditorModalProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  updatedText: string;
  dirty: boolean;
  onClose: () => void;
  onCopyText: (text: string) => void | Promise<void>;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

export function AuthFilesPrefixProxyEditorModal(props: AuthFilesPrefixProxyEditorModalProps) {
  const { t } = useTranslation();
  const { disableControls, editor, updatedText, dirty, onClose, onCopyText, onSave, onChange } =
    props;
  const formId = useId();
  const editorFileName = editor?.fileName ?? '';
  const editorFile = editor?.file ?? null;
  const editorClientProfile = editor?.clientProfile ?? null;
  const previewPayload = useMemo(
    () => ({ fileName: editorFileName, text: updatedText }),
    [editorFileName, updatedText]
  );
  const deferredPreviewPayload = useDeferredValue(previewPayload);
  const previewSourceText =
    updatedText && deferredPreviewPayload.fileName === editorFileName
      ? deferredPreviewPayload.text
      : updatedText;
  // 缩进 JSON 让预览面板可读性大幅提升
  const previewText = useMemo(() => prettyJsonText(previewSourceText), [previewSourceText]);
  const fileInfoText = useMemo(
    () => (editorFile ? JSON.stringify(editorFile, null, 2) : ''),
    [editorFile]
  );
  const clientProfileText = useMemo(
    () => formatClientProfileJson(editorClientProfile),
    [editorClientProfile]
  );
  const clientProfileCount = editorClientProfile ? Object.keys(editorClientProfile).length : 0;
  const disableCoolingOptions = useMemo(
    () => [
      { value: '', label: t('auth_files.disable_cooling_default') },
      { value: 'true', label: t('auth_files.disable_cooling_true') },
      { value: 'false', label: t('auth_files.disable_cooling_false') },
    ],
    [t]
  );
  const editorControlsDisabled = Boolean(disableControls || editor?.saving || !editor?.json);
  const headersInvalid = Boolean(editor?.headersTouched && editor?.headersError);
  const saveDisabled =
    disableControls || editor?.saving === true || !dirty || !editor?.json || headersInvalid;

  // 稳定化字段变更回调，避免每次按键都创建新闭包
  const handlePrefixChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('prefix', e.target.value),
    [onChange]
  );
  const handlePriorityChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('priority', e.target.value),
    [onChange]
  );
  const handleProxyUrlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('proxyUrl', e.target.value),
    [onChange]
  );
  const handleBaseUrlChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('baseUrl', e.target.value),
    [onChange]
  );
  const handleDisableCoolingChange = useCallback(
    (value: string) => onChange('disableCooling', value),
    [onChange]
  );
  const handleUserAgentChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('userAgent', e.target.value),
    [onChange]
  );
  const handleNoteChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange('note', e.target.value),
    [onChange]
  );
  const handleWebsocketsChange = useCallback(
    (value: boolean) => onChange('websockets', value),
    [onChange]
  );
  const handleServiceTierPassthroughChange = useCallback(
    (value: boolean) => onChange('serviceTierPassthrough', value),
    [onChange]
  );
  const handleExcludedModelsChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => onChange('excludedModelsText', e.target.value),
    [onChange]
  );
  const handleHeadersChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => onChange('headersText', e.target.value),
    [onChange]
  );

  const handleCopyPreview = useCallback(() => {
    if (!updatedText) return;
    // 复制按钮使用压缩 JSON，方便粘贴到终端/curl
    void onCopyText(compactJsonText(updatedText));
  }, [onCopyText, updatedText]);
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!saveDisabled) {
        onSave();
      }
    },
    [onSave, saveDisabled]
  );

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      fullScreenOnMobile
      className={styles.prefixProxyModal}
      width={1040}
      title={
        <span className={styles.prefixProxyTitleGroup}>
          <span className={styles.prefixProxyTitleRow}>
            <span className={styles.prefixProxyTitleMain}>
              {t('auth_files.prefix_proxy_button')}
            </span>
            {dirty && !editor?.saving && (
              <span className={styles.prefixProxyDirtyBadge} role="status">
                {t('common.unsaved')}
              </span>
            )}
          </span>
          {editor?.fileName && (
            <span className={styles.prefixProxyTitleName} title={editor.fileName}>
              {editor.fileName}
            </span>
          )}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={editor?.saving === true}
            disabled={saveDisabled}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {editor && (
        <div className={styles.prefixProxyEditor}>
          {editor.loading ? (
            <div className={styles.prefixProxyLoading} role="status" aria-busy="true">
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && (
                <div className={styles.prefixProxyError} role="alert">
                  {editor.error}
                </div>
              )}
              <form
                id={formId}
                className={styles.prefixProxyWorkspace}
                aria-busy={editor.saving}
                onSubmit={handleSubmit}
              >
                <section className={styles.prefixProxySettingsPanel}>
                  <div className={styles.prefixProxyForm}>
                    <EditorSection title={t('auth_files.section_connection')}>
                      <div className={styles.prefixProxyFields}>
                        <div className={styles.prefixProxyField}>
                          <Input
                            density="sm"
                            label={t('auth_files.prefix_label')}
                            value={editor.prefix}
                            title="prefix"
                            disabled={editorControlsDisabled}
                            onChange={handlePrefixChange}
                          />
                        </div>
                        <div className={styles.prefixProxyField}>
                          <Input
                            density="sm"
                            label={t('auth_files.base_url_label')}
                            value={editor.baseUrl}
                            placeholder={t('auth_files.base_url_placeholder')}
                            title="base_url"
                            disabled={editorControlsDisabled}
                            onChange={handleBaseUrlChange}
                          />
                        </div>
                        <div className={styles.prefixProxyFieldWide}>
                          <Input
                            density="sm"
                            label={t('auth_files.proxy_url_label')}
                            value={editor.proxyUrl}
                            placeholder={t('auth_files.proxy_url_placeholder')}
                            title="proxy_url"
                            disabled={editorControlsDisabled}
                            onChange={handleProxyUrlChange}
                          />
                        </div>
                      </div>
                    </EditorSection>

                    <EditorSection title={t('auth_files.section_policy')}>
                      <div className={styles.prefixProxyFields}>
                        <div className={styles.prefixProxyField}>
                          <Input
                            density="sm"
                            label={t('auth_files.priority_label')}
                            value={editor.priority}
                            placeholder={t('auth_files.priority_placeholder')}
                            title={t('auth_files.priority_hint')}
                            disabled={editorControlsDisabled}
                            onChange={handlePriorityChange}
                          />
                        </div>
                        <div className={styles.prefixProxyField}>
                          <span className={styles.prefixProxyFieldLabel}>
                            {t('auth_files.disable_cooling_label')}
                          </span>
                          <Select
                            value={editor.disableCooling}
                            options={disableCoolingOptions}
                            className={styles.prefixProxySelect}
                            dropdownClassName={styles.prefixProxyDropdown}
                            disabled={editorControlsDisabled}
                            ariaLabel={t('auth_files.disable_cooling_label')}
                            onChange={handleDisableCoolingChange}
                          />
                        </div>
                        <div className={styles.prefixProxyFieldWide}>
                          <Input
                            density="sm"
                            label={t('auth_files.note_label')}
                            value={editor.note}
                            placeholder={t('auth_files.note_placeholder')}
                            title={t('auth_files.note_hint')}
                            disabled={editorControlsDisabled}
                            onChange={handleNoteChange}
                          />
                        </div>
                      </div>
                    </EditorSection>

                    {editor.isCodexFile && (
                      <EditorSection title={t('auth_files.section_codex')}>
                        <div className={styles.prefixProxyFields}>
                          <div className={styles.prefixProxySwitchField}>
                            <span className={styles.prefixProxySwitchFieldLabelGroup}>
                              <span className={styles.prefixProxySwitchFieldLabel}>
                                {t('ai_providers.codex_websockets_label')}
                              </span>
                              <span className={styles.prefixProxySwitchFieldHint}>
                                {t('ai_providers.codex_websockets_hint')}
                              </span>
                            </span>
                            <ToggleSwitch
                              checked={Boolean(editor.websockets)}
                              disabled={editorControlsDisabled}
                              ariaLabel={t('ai_providers.codex_websockets_label')}
                              onChange={handleWebsocketsChange}
                            />
                          </div>
                          <div className={styles.prefixProxySwitchField}>
                            <span className={styles.prefixProxySwitchFieldLabelGroup}>
                              <span className={styles.prefixProxySwitchFieldLabel}>
                                {t('auth_files.service_tier_passthrough_label')}
                              </span>
                              <span className={styles.prefixProxySwitchFieldHint}>
                                {t('auth_files.service_tier_passthrough_hint')}
                              </span>
                            </span>
                            <ToggleSwitch
                              checked={Boolean(editor.serviceTierPassthrough)}
                              disabled={editorControlsDisabled}
                              ariaLabel={t('auth_files.service_tier_passthrough_label')}
                              onChange={handleServiceTierPassthroughChange}
                            />
                          </div>
                          <div className={styles.prefixProxyFieldWide}>
                            <Input
                              density="sm"
                              label={t('auth_files.user_agent_label')}
                              value={editor.userAgent}
                              placeholder={t('auth_files.user_agent_placeholder')}
                              title={t('auth_files.user_agent_hint')}
                              disabled={editorControlsDisabled}
                              onChange={handleUserAgentChange}
                            />
                          </div>
                        </div>
                      </EditorSection>
                    )}

                    <EditorSection title={t('auth_files.section_advanced')}>
                      <div className={styles.prefixProxyFields}>
                        <div
                          className={`${styles.prefixProxyTextareaGroup} ${styles.prefixProxyFieldWide}`}
                        >
                          <span className="form-label">
                            {t('auth_files.excluded_models_label')}
                          </span>
                          <textarea
                            className={`input ${styles.prefixProxyMonoTextarea}`}
                            aria-label={t('auth_files.excluded_models_label')}
                            value={editor.excludedModelsText}
                            placeholder={t('auth_files.excluded_models_placeholder')}
                            title={t('auth_files.excluded_models_hint')}
                            rows={2}
                            disabled={editorControlsDisabled}
                            onChange={handleExcludedModelsChange}
                            spellCheck={false}
                          />
                        </div>
                        <div
                          className={`${styles.prefixProxyTextareaGroup} ${styles.prefixProxyFieldWide}`}
                        >
                          <span className="form-label">
                            {t('auth_files.headers_label')}
                            {headersInvalid && (
                              <span className={styles.prefixProxyFieldStatusError}>
                                {t('common.invalid')}
                              </span>
                            )}
                          </span>
                          <textarea
                            className={`input ${styles.prefixProxyMonoTextarea} ${styles.prefixProxyHeadersTextarea} ${headersInvalid ? styles.prefixProxyTextareaInvalid : ''}`}
                            aria-label={t('auth_files.headers_label')}
                            value={editor.headersText}
                            placeholder={t('auth_files.headers_placeholder')}
                            title={t('auth_files.headers_hint')}
                            rows={3}
                            aria-invalid={Boolean(editor.headersError)}
                            disabled={editorControlsDisabled}
                            onChange={handleHeadersChange}
                            spellCheck={false}
                          />
                          {editor.headersError && (
                            <div className="error-box" role="alert">
                              {editor.headersError}
                            </div>
                          )}
                        </div>
                      </div>
                    </EditorSection>
                  </div>
                </section>

                <aside
                  className={styles.prefixProxyInspectorPanel}
                  aria-label={t('auth_files.settings_preview_section')}
                >
                  <header className={styles.prefixProxyInspectorHeader}>
                    <h2 className={styles.prefixProxyPreviewTitle}>
                      {t('auth_files.settings_preview_section')}
                    </h2>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className={styles.prefixProxyCopyButton}
                      onClick={handleCopyPreview}
                      disabled={editor.saving || !updatedText}
                      title={t('auth_files.prefix_proxy_copy_json')}
                      aria-label={t('auth_files.prefix_proxy_copy_json')}
                    >
                      <IconCopy size={14} />
                      {t('auth_files.prefix_proxy_copy_json')}
                    </Button>
                  </header>

                  <textarea
                    className={styles.prefixProxyPreviewTextarea}
                    aria-label={t('auth_files.settings_preview_section')}
                    rows={18}
                    readOnly
                    value={previewText}
                    spellCheck={false}
                  />

                  <div className={styles.prefixProxyInfoStack}>
                    {fileInfoText && (
                      <details className={styles.prefixProxyJsonDetails}>
                        <summary className={styles.prefixProxyJsonSummary}>
                          <span className={styles.prefixProxyLabelGroup}>
                            <span className={styles.prefixProxyLabel}>
                              {t('auth_files.prefix_proxy_info_label')}
                            </span>
                          </span>
                        </summary>
                        <div className={styles.prefixProxyJsonWrapper}>
                          <textarea
                            className={styles.prefixProxyInfoTextarea}
                            aria-label={t('auth_files.prefix_proxy_info_label')}
                            rows={8}
                            readOnly
                            value={fileInfoText}
                            spellCheck={false}
                          />
                        </div>
                      </details>
                    )}

                    {clientProfileText && (
                      <details className={styles.prefixProxyJsonDetails}>
                        <summary className={styles.prefixProxyJsonSummary}>
                          <span className={styles.prefixProxyLabelGroup}>
                            <span className={styles.prefixProxyLabel}>
                              {t('auth_files.client_profile_label')}
                            </span>
                            <span className={styles.prefixProxyPreviewBadge}>
                              {t('auth_files.client_profile_count', {
                                count: clientProfileCount,
                              })}
                            </span>
                          </span>
                        </summary>
                        <div className={styles.prefixProxyJsonWrapper}>
                          <textarea
                            className={styles.prefixProxyInfoTextarea}
                            aria-label={t('auth_files.client_profile_label')}
                            rows={6}
                            readOnly
                            value={clientProfileText}
                            spellCheck={false}
                          />
                        </div>
                      </details>
                    )}
                  </div>
                </aside>
              </form>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
