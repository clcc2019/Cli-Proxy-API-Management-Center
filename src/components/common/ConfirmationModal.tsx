import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useNotificationStore } from '@/stores/useNotificationStore';
import styles from './ConfirmationModal.module.scss';

export function ConfirmationModal() {
  const { t } = useTranslation();
  const messageId = useId();
  const confirmation = useNotificationStore((state) => state.confirmation);
  const hideConfirmation = useNotificationStore((state) => state.hideConfirmation);
  const setConfirmationLoading = useNotificationStore((state) => state.setConfirmationLoading);

  const { isOpen, isLoading, options } = confirmation;

  if (!isOpen || !options) {
    return null;
  }

  const {
    title,
    message,
    onConfirm,
    onCancel,
    restoreFocus,
    confirmText,
    cancelText,
    variant = 'primary',
  } = options;

  const handleConfirm = async () => {
    try {
      setConfirmationLoading(true);
      await onConfirm();
      hideConfirmation();
      if (restoreFocus) window.requestAnimationFrame(restoreFocus);
    } catch (error) {
      console.error('Confirmation action failed:', error);
      // Optional: show error notification here if needed,
      // but usually the calling component handles specific errors.
    } finally {
      setConfirmationLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) {
      return;
    }
    if (onCancel) {
      onCancel();
    }
    hideConfirmation();
  };

  return (
    <Modal
      open={isOpen}
      onClose={handleCancel}
      title={title}
      closeDisabled={isLoading}
      ariaDescribedBy={messageId}
    >
      {typeof message === 'string' ? (
        <p id={messageId} className={styles.message}>
          {message}
        </p>
      ) : (
        <div id={messageId} className={styles.message}>
          {message}
        </div>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
          {cancelText || t('common.cancel')}
        </Button>
        <Button variant={variant} onClick={handleConfirm} loading={isLoading}>
          {confirmText || t('common.confirm')}
        </Button>
      </div>
    </Modal>
  );
}
