import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import type { AuthFileItem } from '@/types';
import { useAuthFilesPrefixProxyEditor } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import { AuthFilesPrefixProxyEditorModal } from './AuthFilesPrefixProxyEditorModal';

export type AuthFilesPrefixProxyEditorFeatureProps = {
  file: AuthFileItem;
  disableControls: boolean;
  isCurrentLayer: boolean;
  applyLocalFilePatch: (name: string, patch: Partial<AuthFileItem>) => void;
  refreshAuthFilesFromServer: () => Promise<void>;
  onCopyText: (text: string) => void | Promise<void>;
  onDismiss: () => void;
};

/**
 * The prefix/proxy editor is only needed after an explicit card action.
 * Keeping its hook, validation code, and modal in one lazy boundary prevents
 * the large editor implementation from entering the auth-files route chunk.
 */
export function AuthFilesPrefixProxyEditorFeature({
  file,
  disableControls,
  isCurrentLayer,
  applyLocalFilePatch,
  refreshAuthFilesFromServer,
  onCopyText,
  onDismiss,
}: AuthFilesPrefixProxyEditorFeatureProps) {
  const { t } = useTranslation();
  const {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    openPrefixProxyEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  } = useAuthFilesPrefixProxyEditor({
    disableControls,
    applyLocalFilePatch,
    refreshAuthFilesFromServer,
    onDismiss,
  });

  useEffect(() => {
    void openPrefixProxyEditor(file);
  }, [file, openPrefixProxyEditor]);

  const unsavedChangesDialog = useMemo(
    () => ({
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.discard_changes'),
      cancelText: t('common.cancel'),
      variant: 'danger' as const,
    }),
    [t]
  );
  useUnsavedChangesGuard({
    enabled: isCurrentLayer,
    shouldBlock: prefixProxyDirty,
    dialog: unsavedChangesDialog,
  });

  const handleClose = useCallback(() => {
    closePrefixProxyEditor();
  }, [closePrefixProxyEditor]);

  if (!prefixProxyEditor) return null;

  return (
    <AuthFilesPrefixProxyEditorModal
      disableControls={disableControls}
      editor={prefixProxyEditor}
      updatedText={prefixProxyUpdatedText}
      dirty={prefixProxyDirty}
      onClose={handleClose}
      onCopyText={onCopyText}
      onSave={handlePrefixProxySave}
      onChange={handlePrefixProxyChange}
    />
  );
}
