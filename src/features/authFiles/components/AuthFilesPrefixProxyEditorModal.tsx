import { useCallback, useDeferredValue, useMemo } from 'react';
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
import styles from '@/pages/AuthFilesPage.module.scss';

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
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('prefix', e.target.value),
    [onChange]
  );
  const handlePriorityChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('priority', e.target.value),
    [onChange]
  );
  const handleProxyUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('proxyUrl', e.target.value),
    [onChange]
  );
  const handleDisableCoolingChange = useCallback(
    (value: string) => onChange('disableCooling', value),
    [onChange]
  );
  const handleUserAgentChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('userAgent', e.target.value),
    [onChange]
  );
  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('note', e.target.value),
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
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange('excludedModelsText', e.target.value),
    [onChange]
  );
  const handleHeadersChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange('headersText', e.target.value),
    [onChange]
  );

  const handleCopyPreview = useCallback(() => {
    if (!updatedText) return;
    // 复制按钮使用压缩 JSON，方便粘贴到终端/curl
    void onCopyText(compactJsonText(updatedText));
  }, [onCopyText, updatedText]);

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      fullScreenOnMobile
      className={styles.prefixProxyModal}
      width={960}
      title={
        <span className={styles.prefixProxyTitleGroup}>
          <span className={styles.prefixProxyTitleMain}>{t('auth_files.prefix_proxy_button')}</span>
          {editor?.fileName && (
            <span className={styles.prefixProxyTitleName} title={editor.fileName}>
              {editor.fileName}
            </span>
          )}
          {dirty && !editor?.saving && (
            <span className={styles.prefixProxyDirtyBadge}>{t('common.unsaved')}</span>
          )}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button onClick={onSave} loading={editor?.saving === true} disabled={saveDisabled}>
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
              <div className={styles.prefixProxyWorkspace}>
                <section className={styles.prefixProxySettingsPanel}>
                  <header className={styles.prefixProxyPanelHeader}>
                    <div className={styles.prefixProxyPanelTitleGroup}>
                      <h3 className={styles.prefixProxyPanelTitle}>
                        {t('auth_files.settings_edit_section')}
                      </h3>
                      <span className={styles.prefixProxyPanelHint}>
                        {t('auth_files.settings_edit_hint')}
                      </span>
                    </div>
                  </header>

                  <div className={styles.prefixProxyForm}>
                    <section className={styles.prefixProxySection}>
                      <header className={styles.prefixProxySectionHeader}>
                        <div className={styles.prefixProxySectionHeading}>
                          <span className={styles.prefixProxySectionIndex} aria-hidden="true">
                            01
                          </span>
                          <h3 className={styles.prefixProxySectionTitle}>
                            {t('auth_files.section_basic')}
                          </h3>
                        </div>
                      </header>
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
                            label={t('auth_files.priority_label')}
                            value={editor.priority}
                            placeholder={t('auth_files.priority_placeholder')}
                            title={t('auth_files.priority_hint')}
                            disabled={editorControlsDisabled}
                            onChange={handlePriorityChange}
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
                    </section>

                    {editor.isCodexFile && (
                      <section className={styles.prefixProxySection}>
                        <header className={styles.prefixProxySectionHeader}>
                          <div className={styles.prefixProxySectionHeading}>
                            <span className={styles.prefixProxySectionIndex} aria-hidden="true">
                              02
                            </span>
                            <h3 className={styles.prefixProxySectionTitle}>
                              {t('auth_files.section_codex')}
                            </h3>
                          </div>
                        </header>
                        <div className={styles.prefixProxyFields}>
                          <div
                            className={styles.prefixProxySwitchField}
                            title={t('ai_providers.codex_websockets_hint')}
                          >
                            <span className={styles.prefixProxySwitchFieldLabel}>
                              {t('ai_providers.codex_websockets_label')}
                            </span>
                            <ToggleSwitch
                              checked={Boolean(editor.websockets)}
                              disabled={editorControlsDisabled}
                              ariaLabel={t('ai_providers.codex_websockets_label')}
                              onChange={handleWebsocketsChange}
                            />
                          </div>
                          <div
                            className={styles.prefixProxySwitchField}
                            title={t('auth_files.service_tier_passthrough_hint')}
                          >
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
                      </section>
                    )}

                    <section className={styles.prefixProxySection}>
                      <header className={styles.prefixProxySectionHeader}>
                        <div className={styles.prefixProxySectionHeading}>
                          <span className={styles.prefixProxySectionIndex} aria-hidden="true">
                            {editor.isCodexFile ? '03' : '02'}
                          </span>
                          <h3 className={styles.prefixProxySectionTitle}>
                            {t('auth_files.section_advanced')}
                          </h3>
                        </div>
                      </header>
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
                    </section>
                  </div>
                </section>

                <aside className={styles.prefixProxyInspectorPanel}>
                  <header className={styles.prefixProxyPanelHeader}>
                    <div className={styles.prefixProxyPanelTitleGroup}>
                      <h3 className={styles.prefixProxyPanelTitle}>
                        {t('auth_files.settings_info_section')}
                      </h3>
                      <span className={styles.prefixProxyPanelHint}>
                        {t('auth_files.settings_info_hint')}
                      </span>
                    </div>
                  </header>

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

                    <details className={styles.prefixProxyJsonDetails}>
                      <summary className={styles.prefixProxyJsonSummary}>
                        <span className={styles.prefixProxyLabelGroup}>
                          <span className={styles.prefixProxyLabel}>
                            {t('auth_files.prefix_proxy_source_label')}
                          </span>
                          {dirty && (
                            <span className={styles.prefixProxyPreviewBadge}>
                              {t('common.modified')}
                            </span>
                          )}
                        </span>
                      </summary>
                      <div className={styles.prefixProxyJsonWrapper}>
                        <div className={styles.prefixProxyJsonActions}>
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
                        </div>
                        <textarea
                          className={styles.prefixProxyTextarea}
                          aria-label={t('auth_files.prefix_proxy_source_label')}
                          rows={10}
                          readOnly
                          value={previewText}
                          spellCheck={false}
                        />
                      </div>
                    </details>

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
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
