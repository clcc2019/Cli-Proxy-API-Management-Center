import { useEffect } from 'react';
import type { AuthFileItem } from '@/types';
import { useAuthFilesModels } from '@/features/authFiles/hooks/useAuthFilesModels';
import { AuthFileModelsModal } from './AuthFileModelsModal';

type ModelsRequest = {
  file: AuthFileItem;
  requestId: number;
};

export type AuthFilesModelsFeatureProps = {
  request: ModelsRequest | null;
  scopeKey: string;
  excluded: Record<string, string[]>;
  onCopyText: (text: string) => void | Promise<void>;
  onDismiss: () => void;
};

/**
 * Model discovery is an explicit card action. Keep its request state and
 * modal dependencies out of the auth-files route's initial render path.
 */
export function AuthFilesModelsFeature({
  request,
  scopeKey,
  excluded,
  onCopyText,
  onDismiss,
}: AuthFilesModelsFeatureProps) {
  const {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal,
  } = useAuthFilesModels(scopeKey, onDismiss);

  useEffect(() => {
    if (!request) return;
    void showModels(request.file);
  }, [request, scopeKey, showModels]);

  if (!modelsModalOpen) return null;

  return (
    <AuthFileModelsModal
      open
      fileName={modelsFileName}
      fileType={modelsFileType}
      loading={modelsLoading}
      error={modelsError}
      models={modelsList}
      excluded={excluded}
      onClose={closeModelsModal}
      onCopyText={onCopyText}
    />
  );
}
