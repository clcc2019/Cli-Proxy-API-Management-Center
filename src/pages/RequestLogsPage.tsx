import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconRefreshCw } from '@/components/ui/icons';
import { useHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { useConfigStore } from '@/stores';
import { RequestEventsDetailsCard, useUsageData } from '@/components/usage';
import styles from './UsagePage.module.scss';

const EMPTY_LIST: readonly never[] = Object.freeze([]);

export function RequestLogsPage() {
  const { t } = useTranslation();
  const config = useConfigStore((state) => state.config);

  const { usage, loading, error, lastRefreshedAt, modelPrices, loadUsage } = useUsageData();

  useHeaderRefresh(loadUsage);

  return (
    <div className={styles.container}>
      {loading && !usage && (
        <div className={styles.loadingOverlay} aria-busy="true">
          <div className={styles.loadingOverlayContent}>
            <LoadingSpinner size={28} className={styles.loadingOverlaySpinner} />
            <span className={styles.loadingOverlayText}>{t('common.loading')}</span>
          </div>
        </div>
      )}

      <div className={styles.requestLogsHeader}>
        <h1 className={styles.requestLogsTitle}>{t('nav.request_logs')}</h1>
        <div className={styles.requestLogsHeaderActions}>
          {lastRefreshedAt && (
            <span className={styles.requestLogsSubtle}>
              {t('usage_stats.last_updated')}: {lastRefreshedAt.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadUsage().catch(() => {})}
            disabled={loading}
            loading={loading}
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
          >
            <IconRefreshCw size={14} aria-hidden="true" />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </div>

      {error && <div className={styles.errorBox}>{error}</div>}

      <RequestEventsDetailsCard
        usage={usage}
        loading={loading}
        modelPrices={modelPrices}
        geminiKeys={config?.geminiApiKeys ?? (EMPTY_LIST as never[])}
        claudeConfigs={config?.claudeApiKeys ?? (EMPTY_LIST as never[])}
        codexConfigs={config?.codexApiKeys ?? (EMPTY_LIST as never[])}
        vertexConfigs={config?.vertexApiKeys ?? (EMPTY_LIST as never[])}
        openaiProviders={config?.openaiCompatibility ?? (EMPTY_LIST as never[])}
      />
    </div>
  );
}
