import type { ProviderKeyConfig } from '@/types';
import type { HeaderEntry } from '@/utils/headers';
import type { KeyStats, UsageDetail } from '@/utils/usage';

export interface ModelEntry {
  name: string;
  alias: string;
}

export type ProviderFormState = Omit<ProviderKeyConfig, 'headers'> & {
	headers: HeaderEntry[];
	modelEntries: ModelEntry[];
	excludedText: string;
};

export interface ProviderSectionProps<TConfig> {
  configs: TConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  disabled: boolean;
  onEdit: (index: number) => void;
  onAdd: () => void;
  onDelete: (index: number) => void;
  onToggle?: (index: number, enabled: boolean) => void;
}
