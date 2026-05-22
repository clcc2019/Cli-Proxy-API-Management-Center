import { useMemo } from 'react';
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
  const previewText = useMemo(() => compactJsonText(updatedText), [updatedText]);
  const editorControlsDisabled = Boolean(disableControls || editor?.saving || !editor?.json);

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      className={styles.prefixProxyModal}
      width={960}
      title={
        editor?.fileName
          ? t('auth_files.auth_field_editor_title', { name: editor.fileName })
          : t('auth_files.prefix_proxy_button')
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {dirty ? t('common.cancel') : t('common.close')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              if (!updatedText) return;
              void onCopyText(updatedText);
            }}
            disabled={editor?.saving === true || !updatedText}
          >
            {t('common.copy')}
          </Button>
          <Button
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={
              disableControls ||
              editor?.saving === true ||
              !dirty ||
              !editor?.json ||
              Boolean(editor?.headersTouched && editor.headersError)
            }
          >
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
                <div className={styles.prefixProxyFields}>
                  <div className={styles.prefixProxyField}>
                    <Input
                      density="sm"
                      label={t('auth_files.prefix_label')}
                      value={editor.prefix}
                      disabled={editorControlsDisabled}
                      onChange={(e) => onChange('prefix', e.target.value)}
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
                      onChange={(e) => onChange('priority', e.target.value)}
                    />
                  </div>
                  <div className={styles.prefixProxyFieldWide}>
                    <Input
                      density="sm"
                      label={t('auth_files.proxy_url_label')}
                      value={editor.proxyUrl}
                      placeholder={t('auth_files.proxy_url_placeholder')}
                      disabled={editorControlsDisabled}
                      onChange={(e) => onChange('proxyUrl', e.target.value)}
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
                      onChange={(e) => onChange('disableCooling', e.target.value)}
                    />
                  </div>
                  {editor.isCodexFile && (
                    <div className={styles.prefixProxySwitchField}>
                      <label>{t('ai_providers.codex_websockets_label')}</label>
                      <ToggleSwitch
                        checked={Boolean(editor.websockets)}
                        disabled={editorControlsDisabled}
                        ariaLabel={t('ai_providers.codex_websockets_label')}
                        onChange={(value) => onChange('websockets', value)}
                      />
                    </div>
                  )}
                  {editor.isCodexFile && (
                    <div className={styles.prefixProxyFieldWide}>
                      <Input
                        density="sm"
                        label={t('auth_files.user_agent_label')}
                        value={editor.userAgent}
                        placeholder={t('auth_files.user_agent_placeholder')}
                        title={t('auth_files.user_agent_hint')}
                        disabled={editorControlsDisabled}
                        onChange={(e) => onChange('userAgent', e.target.value)}
                      />
                    </div>
                  )}
                  <div className={styles.prefixProxyFieldWide}>
                    <Input
                      density="sm"
                      label={t('auth_files.note_label')}
                      value={editor.note}
                      placeholder={t('auth_files.note_placeholder')}
                      title={t('auth_files.note_hint')}
                      disabled={editorControlsDisabled}
                      onChange={(e) => onChange('note', e.target.value)}
                    />
                  </div>
                  <div className={`${styles.prefixProxyTextareaGroup} ${styles.prefixProxyFieldWide}`}>
                    <label>{t('auth_files.excluded_models_label')}</label>
                    <textarea
                      className="input"
                      value={editor.excludedModelsText}
                      placeholder={t('auth_files.excluded_models_placeholder')}
                      title={t('auth_files.excluded_models_hint')}
                      rows={2}
                      disabled={editorControlsDisabled}
                      onChange={(e) => onChange('excludedModelsText', e.target.value)}
                    />
                  </div>
                  <div className={`${styles.prefixProxyTextareaGroup} ${styles.prefixProxyFieldWide}`}>
                    <label>{t('auth_files.headers_label')}</label>
                    <textarea
                      className={`input ${styles.prefixProxyHeadersTextarea} ${editor.headersError ? styles.prefixProxyTextareaInvalid : ''}`}
                      value={editor.headersText}
                      placeholder={t('auth_files.headers_placeholder')}
                      title={t('auth_files.headers_hint')}
                      rows={3}
                      aria-invalid={Boolean(editor.headersError)}
                      disabled={editorControlsDisabled}
                      onChange={(e) => onChange('headersText', e.target.value)}
                    />
                    {editor.headersError && <div className="error-box">{editor.headersError}</div>}
                  </div>
                </div>
                <aside className={styles.prefixProxyPreviewPane}>
                  <div className={styles.prefixProxyJsonWrapper}>
                    <div className={styles.prefixProxyLabelRow}>
                      <label className={styles.prefixProxyLabel}>
                        {t('auth_files.prefix_proxy_source_label')}
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className={styles.prefixProxyCopyButton}
                        onClick={() => {
                          if (!previewText) return;
                          void onCopyText(previewText);
                        }}
                        disabled={editor.saving || !previewText}
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
