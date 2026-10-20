import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { IconCheckCircle2, IconFileText, IconUpload } from '@/components/ui/icons';
import { vertexApi } from '@/services/api/vertex';
import { AUTH_FILES_REFRESH_EVENT } from '@/utils/constants';
import { getErrorMessage } from '@/utils/error';
import { useNotificationStore } from '@/stores';
import iconVertex from '@/assets/icons/vertex.svg';
import styles from './VertexImportModal.module.scss';

type VertexImportModalProps = {
  open: boolean;
  onClose: () => void;
  onGotoAuthFiles: () => void;
};

type VertexImportResult = {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
};

export function VertexImportModal({ open, onClose, onGotoAuthFiles }: VertexImportModalProps) {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | undefined>();
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VertexImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(undefined);
    setLocation('');
    setLoading(false);
    setError('');
    setResult(null);
  }, [open]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.json')) {
      setFile(undefined);
      setError(t('vertex_import.file_required'));
      return;
    }
    setFile(selected);
    setError('');
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) {
      setError(t('vertex_import.file_required'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await vertexApi.importCredential(file, location.trim() || undefined);
      setResult({
        projectId: response.project_id,
        email: response.email,
        location: response.location,
        authFile: response['auth-file'] ?? response.auth_file,
      });
      window.dispatchEvent(new Event(AUTH_FILES_REFRESH_EVENT));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('notification.upload_failed'));
    } finally {
      setLoading(false);
    }
  };

  const resultRows = result
    ? [
        { key: 'result_project', value: result.projectId },
        { key: 'result_email', value: result.email },
        { key: 'result_location', value: result.location },
        { key: 'result_file', value: result.authFile },
      ].filter((row): row is { key: string; value: string } => Boolean(row.value))
    : [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      className={styles.modal}
      closeDisabled={loading}
      title={
        <span className={styles.title}>
          <img src={iconVertex} alt="" width={24} height={24} />
          {t('vertex_import.title')}
        </span>
      }
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          {result ? (
            <Button className={styles.footerPrimary} onClick={onGotoAuthFiles}>
              {t('auth_login.goto_auth_files')}
            </Button>
          ) : (
            <Button
              className={styles.footerPrimary}
              onClick={() => void handleImport()}
              loading={loading}
              disabled={!file}
            >
              {t('vertex_import.import_button')}
            </Button>
          )}
        </div>
      }
    >
      {result ? (
        <div className={styles.result} role="status">
          <IconCheckCircle2 className={styles.resultIcon} size={34} aria-hidden="true" />
          <h3>{t('vertex_import.result_title')}</h3>
          {resultRows.length > 0 && (
            <dl className={styles.facts}>
              {resultRows.map((row) => (
                <div className={styles.fact} key={row.key}>
                  <dt>{t(`vertex_import.${row.key}`)}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      ) : (
        <div className={styles.stack}>
          <p className={styles.hint}>{t('vertex_import.description')}</p>

          <div className={styles.field}>
            <span className={styles.label}>{t('vertex_import.file_label')}</span>
            <div className={styles.filePicker}>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                {file ? <IconFileText size={16} /> : <IconUpload size={16} />}
                {t('vertex_import.choose_file')}
              </Button>
              <span className={styles.fileName} title={file?.name}>
                {file?.name ?? t('vertex_import.file_placeholder')}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleFileChange}
            />
            <span className={styles.fieldHint}>{t('vertex_import.file_hint')}</span>
          </div>

          <Input
            label={t('vertex_import.location_label')}
            hint={t('vertex_import.location_hint')}
            placeholder={t('vertex_import.location_placeholder')}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={loading}
            spellCheck={false}
          />

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
