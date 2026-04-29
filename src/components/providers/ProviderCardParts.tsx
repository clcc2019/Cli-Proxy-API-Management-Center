import type { ReactNode } from 'react';
import { IconModelCluster } from '@/components/ui/icons';
import styles from '@/pages/AiProvidersPage.module.scss';

type FieldTone = 'key' | 'priority' | 'url' | 'prefix' | 'proxy' | 'option' | 'model';

interface ProviderDetailRowProps {
  icon: ReactNode;
  label: ReactNode;
  children: ReactNode;
  tone?: FieldTone;
  className?: string;
}

const fieldToneClass: Record<FieldTone, string> = {
  key: styles.fieldRowKey,
  priority: styles.fieldRowPriority,
  url: styles.fieldRowUrl,
  prefix: styles.fieldRowPrefix,
  proxy: styles.fieldRowProxy,
  option: styles.fieldRowOption,
  model: styles.fieldRowModel,
};

function normalizeLabel(label: ReactNode) {
  return typeof label === 'string' ? label.replace(/[:：]\s*$/, '') : label;
}

export function ProviderDetailRow({
  icon,
  label,
  children,
  tone = 'option',
  className = '',
}: ProviderDetailRowProps) {
  const rowClassName = [styles.fieldRow, fieldToneClass[tone], className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClassName}>
      <span className={styles.fieldIcon}>{icon}</span>
      <span className={styles.fieldLabel}>{normalizeLabel(label)}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

interface ProviderModelHeaderProps {
  label: ReactNode;
  count: number;
}

export function ProviderModelHeader({ label, count }: ProviderModelHeaderProps) {
  return (
    <span className={styles.modelCountLabel}>
      <span className={styles.modelCountIcon}>
        <IconModelCluster size={18} />
      </span>
      <span>{normalizeLabel(label)}</span>
      <span className={styles.modelCountBadge}>{count}</span>
    </span>
  );
}
