import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import { isModelExcluded } from '@/features/authFiles/constants';
import styles from './AuthFileModelsModal.module.scss';

export type AuthFileModelsModalProps = {
  open: boolean;
  fileName: string;
  fileType: string;
  loading: boolean;
  error: 'unsupported' | null;
  models: AuthFileModelItem[];
  excluded: Record<string, string[]>;
  onClose: () => void;
  onCopyText: (text: string) => void;
};

type AuthFileModelListItem = {
  model: AuthFileModelItem;
  excluded: boolean;
};

type AuthFileModelButtonProps = AuthFileModelListItem & {
  onCopyText: (text: string) => void;
};

const AuthFileModelButton = memo(function AuthFileModelButton({
  model,
  excluded,
  onCopyText,
}: AuthFileModelButtonProps) {
  const { t } = useTranslation();
  const copyLabel = t(
    excluded ? 'auth_files.models_copy_excluded_label' : 'auth_files.models_copy_label',
    { model: model.id }
  );
  const handleCopy = useCallback(() => {
    onCopyText(model.id);
  }, [model.id, onCopyText]);

  return (
    <button
      type="button"
      className={`${styles.modelItem} ${excluded ? styles.modelItemExcluded : ''}`}
      onClick={handleCopy}
      title={copyLabel}
      aria-label={copyLabel}
    >
      <span className={styles.modelId}>{model.id}</span>
      {model.display_name && model.display_name !== model.id && (
        <span className={styles.modelDisplayName}>{model.display_name}</span>
      )}
      {model.type && <span className={styles.modelType}>{model.type}</span>}
      {excluded && (
        <span className={styles.modelExcludedBadge}>{t('auth_files.models_excluded_badge')}</span>
      )}
    </button>
  );
});

AuthFileModelButton.displayName = 'AuthFileModelButton';

export const AuthFileModelsModal = memo(
  function AuthFileModelsModal(props: AuthFileModelsModalProps) {
    const { t } = useTranslation();
    const { open, fileName, fileType, loading, error, models, excluded, onClose, onCopyText } =
      props;
    const modelItems = useMemo<AuthFileModelListItem[]>(() => {
      if (!open) return [];
      if (loading || error || models.length === 0) return [];
      return models.map((model) => ({
        model,
        excluded: isModelExcluded(model.id, fileType, excluded),
      }));
    }, [error, excluded, fileType, loading, models, open]);

    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`${t('auth_files.models_title')} - ${fileName}`}
        footer={
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        }
      >
        {loading ? (
          <div className={styles.hint} role="status" aria-busy="true">
            {t('auth_files.models_loading')}
          </div>
        ) : error === 'unsupported' ? (
          <EmptyState
            title={t('auth_files.models_unsupported')}
            description={t('auth_files.models_unsupported_desc')}
          />
        ) : models.length === 0 ? (
          <EmptyState
            title={t('auth_files.models_empty')}
            description={t('auth_files.models_empty_desc')}
          />
        ) : (
          <div className={styles.modelsList}>
            {modelItems.map((item) => (
              <AuthFileModelButton
                key={item.model.id}
                model={item.model}
                excluded={item.excluded}
                onCopyText={onCopyText}
              />
            ))}
          </div>
        )}
      </Modal>
    );
  },
  (prev, next) => {
    if (!prev.open && !next.open) return true;
    return (
      prev.open === next.open &&
      prev.fileName === next.fileName &&
      prev.fileType === next.fileType &&
      prev.loading === next.loading &&
      prev.error === next.error &&
      prev.models === next.models &&
      prev.excluded === next.excluded &&
      prev.onClose === next.onClose &&
      prev.onCopyText === next.onCopyText
    );
  }
);

AuthFileModelsModal.displayName = 'AuthFileModelsModal';
