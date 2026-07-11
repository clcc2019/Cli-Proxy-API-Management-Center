import { memo, useMemo, type ChangeEventHandler, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import {
  IconChartLine,
  IconDatabase,
  IconDownload,
  IconFileText,
  IconRefreshCw,
} from '@/components/ui/icons';
import styles from '@/pages/UsagePage.module.scss';

interface TimeRangeOption {
  value: string;
  label: string;
}

export interface UsagePageHeroProps {
  timeRange: string;
  timeRangeOptions: ReadonlyArray<TimeRangeOption>;
  selectedRangeLabel: string;
  visibleModelCount: number;
  lastRefreshedAt: Date | null;
  loading: boolean;
  exporting: boolean;
  exportingDetailed: boolean;
  importing: boolean;
  onTimeRangeChange: (value: string) => void;
  onExport: () => void;
  onExportDetailed: () => void;
  onImport: () => void;
  onRefresh: () => void;
  importInputRef: RefObject<HTMLInputElement | null>;
  onImportChange: ChangeEventHandler<HTMLInputElement>;
}

export const UsagePageHero = memo(function UsagePageHero({
  timeRange,
  timeRangeOptions,
  selectedRangeLabel,
  visibleModelCount,
  lastRefreshedAt,
  loading,
  exporting,
  exportingDetailed,
  importing,
  onTimeRangeChange,
  onExport,
  onExportDetailed,
  onImport,
  onRefresh,
  importInputRef,
  onImportChange,
}: UsagePageHeroProps) {
  const { i18n, t } = useTranslation();
  const lastUpdatedLabel = useMemo(
    () =>
      lastRefreshedAt
        ? `${t('usage_stats.last_updated')}: ${lastRefreshedAt.toLocaleString(i18n.language)}`
        : null,
    [i18n.language, lastRefreshedAt, t]
  );
  const disableExport = loading || importing || exportingDetailed;
  const disableExportDetailed = loading || importing || exporting;
  const disableImport = loading || exporting || exportingDetailed;
  const disableRefresh = loading || exporting || exportingDetailed || importing;

  return (
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <h1 className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <IconChartLine size={25} />
          </span>
          <span>{t('usage_stats.title')}</span>
        </h1>
        <p className={styles.pageSubtitle}>{t('usage_stats.subtitle')}</p>
        <div className={styles.heroSummary}>
          <span>{selectedRangeLabel}</span>
          <span>
            {t('usage_stats.model_price_model')}: {visibleModelCount}
          </span>
          {lastUpdatedLabel && <span>{lastUpdatedLabel}</span>}
        </div>
      </div>

      <div className={styles.heroActions}>
        <div className={styles.timeRangeGroup}>
          <span className={styles.timeRangeIcon}>
            <IconDatabase size={17} />
          </span>
          <span className={styles.timeRangeLabel}>{t('usage_stats.range_filter')}</span>
          <Select
            value={timeRange}
            options={timeRangeOptions}
            onChange={onTimeRangeChange}
            className={styles.timeRangeSelectControl}
            ariaLabel={t('usage_stats.range_filter')}
            fullWidth={false}
          />
        </div>

        <div className={styles.actionGrid}>
          <Button
            variant="primary"
            size="sm"
            onClick={onExport}
            loading={exporting}
            disabled={disableExport}
            className={styles.heroActionPrimary}
          >
            <IconDownload size={15} />
            <span>{t('usage_stats.export')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExportDetailed}
            loading={exportingDetailed}
            disabled={disableExportDetailed}
          >
            <IconFileText size={15} />
            <span>{t('usage_stats.export_details')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onImport}
            loading={importing}
            disabled={disableImport}
          >
            <IconDatabase size={15} />
            <span>{t('usage_stats.import')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={disableRefresh}
          >
            <IconRefreshCw size={15} />
            <span>{loading ? t('common.loading') : t('usage_stats.refresh')}</span>
          </Button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          aria-label={t('usage_stats.import')}
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onImportChange}
        />
      </div>
    </section>
  );
});

UsagePageHero.displayName = 'UsagePageHero';
