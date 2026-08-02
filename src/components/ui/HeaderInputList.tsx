import { memo } from 'react';
import { useEventCallback } from '@/hooks';
import { Button } from './Button';
import { IconX } from './icons';
import type { HeaderEntry } from '@/utils/headers';

interface HeaderInputListProps {
  entries: HeaderEntry[];
  onChange: (entries: HeaderEntry[]) => void;
  addLabel: string;
  disabled?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  keyAriaLabel?: string;
  valueAriaLabel?: string;
  removeButtonTitle?: string;
  removeButtonAriaLabel?: string;
}

const EMPTY_HEADER_ENTRY: HeaderEntry = { key: '', value: '' };

type HeaderInputField = 'key' | 'value';

interface HeaderInputRowProps {
  entry: HeaderEntry;
  index: number;
  disabled: boolean;
  keyPlaceholder: string;
  valuePlaceholder: string;
  keyAriaLabel?: string;
  valueAriaLabel?: string;
  removeButtonTitle: string;
  removeButtonAriaLabel: string;
  removeDisabled: boolean;
  onUpdate: (index: number, field: HeaderInputField, value: string) => void;
  onRemove: (index: number) => void;
}

const HeaderInputRow = memo(function HeaderInputRow({
  entry,
  index,
  disabled,
  keyPlaceholder,
  valuePlaceholder,
  keyAriaLabel,
  valueAriaLabel,
  removeButtonTitle,
  removeButtonAriaLabel,
  removeDisabled,
  onUpdate,
  onRemove,
}: HeaderInputRowProps) {
  return (
    <div className="header-input-row">
      <input
        className="input"
        placeholder={keyPlaceholder}
        aria-label={`${keyAriaLabel ?? keyPlaceholder} ${index + 1}`}
        value={entry.key}
        onChange={(e) => onUpdate(index, 'key', e.target.value)}
        disabled={disabled}
      />
      <span className="header-separator">:</span>
      <input
        className="input"
        placeholder={valuePlaceholder}
        aria-label={`${valueAriaLabel ?? valuePlaceholder} ${index + 1}`}
        value={entry.value}
        onChange={(e) => onUpdate(index, 'value', e.target.value)}
        disabled={disabled}
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(index)}
        disabled={disabled || removeDisabled}
        title={removeButtonTitle}
        aria-label={removeButtonAriaLabel}
      >
        <IconX size={14} />
      </Button>
    </div>
  );
});

export const HeaderInputList = memo(function HeaderInputList({
  entries,
  onChange,
  addLabel,
  disabled = false,
  keyPlaceholder = 'X-Custom-Header',
  valuePlaceholder = 'value',
  keyAriaLabel,
  valueAriaLabel,
  removeButtonTitle = 'Remove',
  removeButtonAriaLabel = 'Remove',
}: HeaderInputListProps) {
  const currentEntries = entries.length ? entries : [EMPTY_HEADER_ENTRY];

  const updateEntry = useEventCallback(
    (index: number, field: HeaderInputField, value: string) => {
      const next = currentEntries.map((entry, idx) =>
        idx === index ? { ...entry, [field]: value } : entry
      );
      onChange(next);
    }
  );

  const addEntry = useEventCallback(() => {
    onChange([...currentEntries, EMPTY_HEADER_ENTRY]);
  });

  const removeEntry = useEventCallback((index: number) => {
    const next = currentEntries.filter((_, idx) => idx !== index);
    onChange(next.length ? next : [EMPTY_HEADER_ENTRY]);
  });

  return (
    <div className="header-input-list">
      {currentEntries.map((entry, index) => (
        <HeaderInputRow
          key={index}
          entry={entry}
          index={index}
          disabled={disabled}
          keyPlaceholder={keyPlaceholder}
          valuePlaceholder={valuePlaceholder}
          keyAriaLabel={keyAriaLabel}
          valueAriaLabel={valueAriaLabel}
          removeButtonTitle={removeButtonTitle}
          removeButtonAriaLabel={removeButtonAriaLabel}
          removeDisabled={currentEntries.length <= 1}
          onUpdate={updateEntry}
          onRemove={removeEntry}
        />
      ))}
      <Button variant="secondary" size="sm" onClick={addEntry} disabled={disabled} className="align-start">
        {addLabel}
      </Button>
    </div>
  );
});
