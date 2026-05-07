import { memo, type ChangeEventHandler, type RefObject } from 'react';
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
  selectedSeriesCount: number;
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
  selectedSeriesCount,
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
  const { t } = useTranslation();

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
        <div className={styles.heroMeta}>
          <div className={styles.heroChip}>
            <span className={styles.heroChipLabel}>{t('usage_stats.range_filter')}</span>
            <span className={styles.heroChipValue}>{selectedRangeLabel}</span>
          </div>
          <div className={styles.heroChip}>
            <span className={styles.heroChipLabel}>{t('usage_stats.model_price_model')}</span>
            <span className={styles.heroChipValue}>{visibleModelCount}</span>
          </div>
          <div className={styles.heroChip}>
            <span className={styles.heroChipLabel}>{t('usage_stats.chart_series')}</span>
            <span className={styles.heroChipValue}>{selectedSeriesCount}</span>
          </div>
          {lastRefreshedAt && (
            <div className={styles.heroChip}>
              <span className={styles.heroChipLabel}>{t('usage_stats.last_updated')}</span>
              <span className={styles.heroChipValue}>{lastRefreshedAt.toLocaleString()}</span>
            </div>
          )}
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
            disabled={loading || importing || exportingDetailed}
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
            disabled={loading || importing || exporting}
          >
            <IconFileText size={15} />
            <span>{t('usage_stats.export_details')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onImport}
            loading={importing}
            disabled={loading || exporting || exportingDetailed}
          >
            <IconDatabase size={15} />
            <span>{t('usage_stats.import')}</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onRefresh}
            disabled={loading || exporting || exportingDetailed || importing}
          >
            <IconRefreshCw size={15} />
            <span>{loading ? t('common.loading') : t('usage_stats.refresh')}</span>
          </Button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={onImportChange}
        />
      </div>
    </section>
  );
});

UsagePageHero.displayName = 'UsagePageHero';
