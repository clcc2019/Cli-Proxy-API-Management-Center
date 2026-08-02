import { memo } from 'react';
import { useEventCallback } from '@/hooks';
import { Button } from './Button';
import { IconX } from './icons';
import type { ModelEntry } from './modelInputListUtils';

interface ModelInputListProps {
  entries: ModelEntry[];
  onChange: (entries: ModelEntry[]) => void;
  addLabel?: string;
  disabled?: boolean;
  namePlaceholder?: string;
  aliasPlaceholder?: string;
  nameAriaLabel?: string;
  aliasAriaLabel?: string;
  hideAddButton?: boolean;
  onAdd?: () => void;
  className?: string;
  rowClassName?: string;
  inputClassName?: string;
  removeButtonClassName?: string;
  removeButtonTitle?: string;
  removeButtonAriaLabel?: string;
}

const EMPTY_MODEL_ENTRY: ModelEntry = { name: '', alias: '' };

type ModelInputField = 'name' | 'alias';

interface ModelInputRowProps {
  entry: ModelEntry;
  index: number;
  disabled: boolean;
  namePlaceholder: string;
  aliasPlaceholder: string;
  nameAriaLabel?: string;
  aliasAriaLabel?: string;
  inputClassNames: string;
  rowClassNames: string;
  removeButtonClassName: string;
  removeButtonTitle: string;
  removeButtonAriaLabel: string;
  removeDisabled: boolean;
  onUpdate: (index: number, field: ModelInputField, value: string) => void;
  onRemove: (index: number) => void;
}

const ModelInputRow = memo(function ModelInputRow({
  entry,
  index,
  disabled,
  namePlaceholder,
  aliasPlaceholder,
  nameAriaLabel,
  aliasAriaLabel,
  inputClassNames,
  rowClassNames,
  removeButtonClassName,
  removeButtonTitle,
  removeButtonAriaLabel,
  removeDisabled,
  onUpdate,
  onRemove,
}: ModelInputRowProps) {
  return (
    <div className={rowClassNames}>
      <input
        className={inputClassNames}
        placeholder={namePlaceholder}
        aria-label={`${nameAriaLabel ?? namePlaceholder} ${index + 1}`}
        value={entry.name}
        onChange={(e) => onUpdate(index, 'name', e.target.value)}
        disabled={disabled}
      />
      <span className="header-separator">→</span>
      <input
        className={inputClassNames}
        placeholder={aliasPlaceholder}
        aria-label={`${aliasAriaLabel ?? aliasPlaceholder} ${index + 1}`}
        value={entry.alias}
        onChange={(e) => onUpdate(index, 'alias', e.target.value)}
        disabled={disabled}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled || removeDisabled}
        className={removeButtonClassName}
        title={removeButtonTitle}
        aria-label={removeButtonAriaLabel}
      >
        <IconX size={14} />
      </Button>
    </div>
  );
});

export const ModelInputList = memo(function ModelInputList({
  entries,
  onChange,
  addLabel,
  disabled = false,
  namePlaceholder = 'model-name',
  aliasPlaceholder = 'alias (optional)',
  nameAriaLabel,
  aliasAriaLabel,
  hideAddButton = false,
  onAdd,
  className = '',
  rowClassName = '',
  inputClassName = '',
  removeButtonClassName = '',
  removeButtonTitle = 'Remove',
  removeButtonAriaLabel = 'Remove',
}: ModelInputListProps) {
  const currentEntries = entries.length ? entries : [EMPTY_MODEL_ENTRY];
  const containerClassName = ['header-input-list', className].filter(Boolean).join(' ');
  const inputClassNames = ['input', inputClassName].filter(Boolean).join(' ');
  const rowClassNames = ['header-input-row', rowClassName].filter(Boolean).join(' ');

  const updateEntry = useEventCallback(
    (index: number, field: ModelInputField, value: string) => {
      const next = currentEntries.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry
      );
      onChange(next);
    }
  );

  const addEntry = useEventCallback(() => {
    if (onAdd) {
      onAdd();
    } else {
      onChange([...currentEntries, EMPTY_MODEL_ENTRY]);
    }
  });

  const removeEntry = useEventCallback((index: number) => {
    const next = currentEntries.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [EMPTY_MODEL_ENTRY]);
  });

  return (
    <div className={containerClassName}>
      {currentEntries.map((entry, index) => (
        <ModelInputRow
          key={index}
          entry={entry}
          index={index}
          disabled={disabled}
          namePlaceholder={namePlaceholder}
          aliasPlaceholder={aliasPlaceholder}
          nameAriaLabel={nameAriaLabel}
          aliasAriaLabel={aliasAriaLabel}
          inputClassNames={inputClassNames}
          rowClassNames={rowClassNames}
          removeButtonClassName={removeButtonClassName}
          removeButtonTitle={removeButtonTitle}
          removeButtonAriaLabel={removeButtonAriaLabel}
          removeDisabled={currentEntries.length <= 1}
          onUpdate={updateEntry}
          onRemove={removeEntry}
        />
      ))}
      {!hideAddButton && addLabel && (
        <Button variant="secondary" size="sm" onClick={addEntry} disabled={disabled} className="align-start">
          {addLabel}
        </Button>
      )}
    </div>
  );
});
