import { memo } from 'react';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import type { ModelInfo } from '@/utils/models';
import styles from '../AiProvidersPage.module.scss';

export interface ModelDiscoveryRowProps {
  model: ModelInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: (name: string) => void;
}

export const ModelDiscoveryRow = memo(function ModelDiscoveryRow({
  model,
  checked,
  disabled,
  onToggle,
}: ModelDiscoveryRowProps) {
  return (
    <SelectionCheckbox
      checked={checked}
      onChange={() => onToggle(model.name)}
      disabled={disabled}
      ariaLabel={model.name}
      className={`${styles.modelDiscoveryRow} ${
        checked ? styles.modelDiscoveryRowSelected : ''
      }`}
      labelClassName={styles.modelDiscoverySelectionLabel}
      label={
        <div className={styles.modelDiscoveryMeta}>
          <div className={styles.modelDiscoveryName}>
            {model.name}
            {model.alias && <span className={styles.modelDiscoveryAlias}>{model.alias}</span>}
          </div>
          {model.description && (
            <div className={styles.modelDiscoveryDesc}>{model.description}</div>
          )}
        </div>
      }
    />
  );
});

ModelDiscoveryRow.displayName = 'ModelDiscoveryRow';
