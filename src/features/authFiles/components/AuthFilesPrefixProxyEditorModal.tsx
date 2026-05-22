import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCopy } from '@/components/ui/icons';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
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
  // 缩进 JSON 让预览面板可读性大幅提升
  const previewText = useMemo(() => prettyJsonText(updatedText), [updatedText]);
  const editorControlsDisabled = Boolean(disableControls || editor?.saving || !editor?.json);
  const headersInvalid = Boolean(editor?.headersTouched && editor?.headersError);
  const saveDisabled =
    disableControls ||
    editor?.saving === true ||
    !dirty ||
    !editor?.json ||
    headersInvalid;

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
    (e: React.ChangeEvent<HTMLInputElement>) => onChange('disableCooling', e.target.value),
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
  const handleExcludedModelsChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange('excludedModelsText', e.target.value),
    [onChange]
  );
  const handleHeadersChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange('headersText', e.target.value),
    [onChange]
  );

  const handleCopyAll = useCallback(() => {
    if (!updatedText) return;
    void onCopyText(updatedText);
  }, [onCopyText, updatedText]);

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
      className={styles.prefixProxyModal}
      width={960}
      title={
        <span className={styles.prefixProxyTitleGroup}>
          <span className={styles.prefixProxyTitleMain}>
            {t('auth_files.prefix_proxy_button')}
          </span>
          {editor?.fileName && (
            <span className={styles.prefixProxyTitleName} title={editor.fileName}>
              {editor.fileName}
            </span>
          )}
          {dirty && !editor?.saving && (
            <span className={styles.prefixProxyDirtyBadge}>
              {t('common.unsaved', { defaultValue: '未保存' })}
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
            variant="secondary"
            onClick={handleCopyAll}
            disabled={editor?.saving === true || !updatedText}
          >
            {t('common.copy')}
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
            <div className={styles.prefixProxyLoading}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.prefixProxyError}>{editor.error}</div>}
              <div className={styles.prefixProxyLayout}>
                <div className={styles.prefixProxyForm}>
                  {/* 基础信息分区 */}
                  <section className={styles.prefixProxySection}>
                    <header className={styles.prefixProxySectionHeader}>
                      <h3 className={styles.prefixProxySectionTitle}>
                        {t('auth_files.section_basic', { defaultValue: '基础信息' })}
                      </h3>
                    </header>
                    <div className={styles.prefixProxyFields}>
                      <div className={styles.prefixProxyField}>
                        <Input
                          density="sm"
                          label={t('auth_files.prefix_label')}
                          value={editor.prefix}
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

                  {/* 连接与代理分区 */}
                  <section className={styles.prefixProxySection}>
                    <header className={styles.prefixProxySectionHeader}>
                      <h3 className={styles.prefixProxySectionTitle}>
                        {t('auth_files.section_connection', { defaultValue: '连接与代理' })}
                      </h3>
                    </header>
                    <div className={styles.prefixProxyFields}>
                      <div className={styles.prefixProxyFieldWide}>
                        <Input
                          density="sm"
                          label={t('auth_files.proxy_url_label')}
                          value={editor.proxyUrl}
                          placeholder={t('auth_files.proxy_url_placeholder')}
                          disabled={editorControlsDisabled}
                          onChange={handleProxyUrlChange}
                        />
                      </div>
                      <div className={styles.prefixProxyField}>
                        <Input
                          density="sm"
                          label={t('auth_files.disable_cooling_label')}
                          value={editor.disableCooling}
                          placeholder={t('auth_files.disable_cooling_placeholder')}
                          title={t('auth_files.disable_cooling_hint')}
                          disabled={editorControlsDisabled}
                          onChange={handleDisableCoolingChange}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Codex 专属分区（条件展示） */}
                  {editor.isCodexFile && (
                    <section className={styles.prefixProxySection}>
                      <header className={styles.prefixProxySectionHeader}>
                        <h3 className={styles.prefixProxySectionTitle}>
                          {t('auth_files.section_codex', { defaultValue: 'Codex 专属' })}
                        </h3>
                      </header>
                      <div className={styles.prefixProxyFields}>
                        <div className={styles.prefixProxySwitchField}>
                          <div className={styles.prefixProxySwitchFieldLabelGroup}>
                            <span className={styles.prefixProxySwitchFieldLabel}>
                              {t('ai_providers.codex_websockets_label')}
                            </span>
                            <span className={styles.prefixProxySwitchFieldHint}>
                              {t('ai_providers.codex_websockets_hint')}
                            </span>
                          </div>
                          <ToggleSwitch
                            checked={Boolean(editor.websockets)}
                            disabled={editorControlsDisabled}
                            ariaLabel={t('ai_providers.codex_websockets_label')}
                            onChange={handleWebsocketsChange}
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

                  {/* 高级筛选分区 */}
                  <section className={styles.prefixProxySection}>
                    <header className={styles.prefixProxySectionHeader}>
                      <h3 className={styles.prefixProxySectionTitle}>
                        {t('auth_files.section_advanced', { defaultValue: '高级配置' })}
                      </h3>
                    </header>
                    <div className={styles.prefixProxyFields}>
                      <div
                        className={`${styles.prefixProxyTextareaGroup} ${styles.prefixProxyFieldWide}`}
                      >
                        <label>{t('auth_files.excluded_models_label')}</label>
                        <textarea
                          className={`input ${styles.prefixProxyMonoTextarea}`}
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
                        <label>
                          {t('auth_files.headers_label')}
                          {headersInvalid && (
                            <span className={styles.prefixProxyFieldStatusError}>
                              {t('common.invalid', { defaultValue: '格式错误' })}
                            </span>
                          )}
                        </label>
                        <textarea
                          className={`input ${styles.prefixProxyMonoTextarea} ${styles.prefixProxyHeadersTextarea} ${headersInvalid ? styles.prefixProxyTextareaInvalid : ''}`}
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
                          <div className="error-box">{editor.headersError}</div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                <aside className={styles.prefixProxyPreviewPane}>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <div className={styles.prefixProxyLabelRow}>
                      <div className={styles.prefixProxyLabelGroup}>
                        <label className={styles.prefixProxyLabel}>
                          {t('auth_files.prefix_proxy_source_label')}
                        </label>
                        {dirty && (
                          <span className={styles.prefixProxyPreviewBadge}>
                            {t('common.modified', { defaultValue: '已修改' })}
                          </span>
                        )}
                      </div>
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
                      rows={12}
                      readOnly
                      value={previewText}
                      spellCheck={false}
                    />
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
