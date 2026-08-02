import { memo } from 'react';
import { CredentialStatsCard } from './CredentialStatsCard';
import type { Config } from '@/types/config';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import styles from '@/pages/UsagePage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

export interface UsageSupportSectionProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  config: Config | null | undefined;
}

export const UsageSupportSection = memo(function UsageSupportSection({
  window,
  loading,
  config,
}: UsageSupportSectionProps) {
  return (
    <div className={styles.supportStack}>
      <div id="usage-health" className={styles.anchorBlock}>
        <CredentialStatsCard
          credentials={window?.credentials ?? (EMPTY_LIST as never[])}
          loading={loading}
          claudeConfigs={config?.claudeApiKeys ?? (EMPTY_LIST as never[])}
          codexConfigs={config?.codexApiKeys ?? (EMPTY_LIST as never[])}
        />
      </div>
    </div>
  );
});

UsageSupportSection.displayName = 'UsageSupportSection';
