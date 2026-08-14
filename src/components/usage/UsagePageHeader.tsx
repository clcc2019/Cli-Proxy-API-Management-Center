import { memo, type ChangeEventHandler, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { Select } from '@/components/ui/Select';
import styles from './UsagePageHeader.module.scss';

interface TimeRangeOption {
  value: string;
  label: string;
}

export interface UsagePageHeaderProps {
  timeRange: string;
  timeRangeOptions: ReadonlyArray<TimeRangeOption>;
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

export const UsagePageHeader = memo(function UsagePageHeader({
  timeRange,
  timeRangeOptions,
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
}: UsagePageHeaderProps) {
  const { t } = useTranslation();

  const disableExport = loading || importing || exportingDetailed;
  const disableExportDetailed = loading || importing || exporting;
  const disableImport = loading || exporting || exportingDetailed;
  const disableRefresh = loading || exporting || exportingDetailed || importing;

  return (
    <ManagementPageHeader
      className={styles.header}
      titleId="usage-page-title"
      title={t('usage_stats.title')}
      actions={
        <>
          <div className={styles.tools}>
            <div className={styles.rangeField}>
              <div className={styles.rangeLabel}>
                <span>{t('usage_stats.range_filter')}</span>
              </div>
              <Select
                value={timeRange}
                options={timeRangeOptions}
                onChange={onTimeRangeChange}
                className={styles.rangeSelect}
                dropdownClassName={styles.rangeDropdown}
                ariaLabel={t('usage_stats.range_filter')}
                fullWidth={false}
              />
            </div>

            <div className={styles.actions}>
              <Button
                variant="primary"
                size="sm"
                onClick={onExport}
                loading={exporting}
                disabled={disableExport}
                className={styles.primaryAction}
              >
                <span>{t('usage_stats.export')}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onExportDetailed}
                loading={exportingDetailed}
                disabled={disableExportDetailed}
              >
                <span>{t('usage_stats.export_details')}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onImport}
                loading={importing}
                disabled={disableImport}
              >
                <span>{t('usage_stats.import')}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                disabled={disableRefresh}
                loading={loading}
              >
                <span>{t('usage_stats.refresh')}</span>
              </Button>
            </div>
          </div>

          <input
            ref={importInputRef}
            className={styles.fileInput}
            type="file"
            aria-label={t('usage_stats.import')}
            accept=".json,application/json"
            onChange={onImportChange}
          />
        </>
      }
    />
  );
});

UsagePageHeader.displayName = 'UsagePageHeader';
