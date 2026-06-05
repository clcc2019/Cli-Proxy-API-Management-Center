import { memo, useMemo } from 'react';
import { CredentialStatsCard } from './CredentialStatsCard';
import { PriceSettingsCard } from './PriceSettingsCard';
import { getAggregateModelNames } from '@/utils/usageAggregate';
import type { ModelPrice } from '@/utils/usage';
import type { Config } from '@/types/config';
import type { UsageAggregateWindow, UsageAggregateSnapshot } from '@/types/usageAggregate';
import styles from '@/pages/UsagePage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

export interface UsageSupportSectionProps {
  usage: UsageAggregateSnapshot | null;
  window: UsageAggregateWindow | null;
  loading: boolean;
  config: Config | null | undefined;
  modelPrices: Record<string, ModelPrice>;
  onPricesChange: (prices: Record<string, ModelPrice>) => void;
}

export const UsageSupportSection = memo(function UsageSupportSection({
  usage,
  window,
  loading,
  config,
  modelPrices,
  onPricesChange,
}: UsageSupportSectionProps) {
  const allModelNames = useMemo(() => getAggregateModelNames(usage), [usage]);

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

      <div id="usage-pricing" className={styles.anchorBlock}>
        <PriceSettingsCard
          modelNames={allModelNames}
          modelPrices={modelPrices}
          onPricesChange={onPricesChange}
        />
      </div>
    </div>
  );
});

UsageSupportSection.displayName = 'UsageSupportSection';
