import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiDetailsCard } from './ApiDetailsCard';
import { ModelStatsCard } from './ModelStatsCard';
import { UsageSectionIntro } from './UsageSectionIntro';
import { getAggregateApiStats, getAggregateModelStats } from '@/utils/usageAggregate';
import type { ModelPrice } from '@/utils/usage';
import type { UsageAggregateWindow } from '@/types/usageAggregate';
import styles from '@/pages/UsagePage.module.scss';

export interface UsageDetailsSectionProps {
  window: UsageAggregateWindow | null;
  loading: boolean;
  modelPrices: Record<string, ModelPrice>;
}

export const UsageDetailsSection = memo(function UsageDetailsSection({
  window,
  loading,
  modelPrices,
}: UsageDetailsSectionProps) {
  const { t } = useTranslation();
  const hasPrices = Object.keys(modelPrices).length > 0;
  const apiStats = useMemo(() => getAggregateApiStats(window, modelPrices), [modelPrices, window]);
  const modelStats = useMemo(
    () => getAggregateModelStats(window, modelPrices),
    [modelPrices, window]
  );

  return (
    <section id="usage-models" className={styles.section}>
      <UsageSectionIntro
        title={t('usage_stats.details_title')}
        description={t('usage_stats.details_desc')}
      />
      <div className={styles.detailsGrid}>
        <ApiDetailsCard apiStats={apiStats} loading={loading} hasPrices={hasPrices} />
        <ModelStatsCard modelStats={modelStats} loading={loading} hasPrices={hasPrices} />
      </div>
    </section>
  );
});

UsageDetailsSection.displayName = 'UsageDetailsSection';
