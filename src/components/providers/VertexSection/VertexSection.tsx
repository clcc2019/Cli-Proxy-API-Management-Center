import { Fragment, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconExternalLink, IconLink, IconShield, IconStar } from '@/components/ui/icons';
import iconVertex from '@/assets/icons/vertex.svg';
import type { ProviderKeyConfig } from '@/types';
import { buildCandidateUsageSourceIds, calculateStatusBarData, type KeyStats } from '@/utils/usage';
import { collectUsageDetailsForCandidates, type UsageDetailsBySource } from '@/utils/usageIndex';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderDetailRow, ProviderModelHeader } from '../ProviderCardParts';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { hasDisableAllModelsRule } from '../utils';

interface VertexSectionProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  usageDetailsBySource: UsageDetailsBySource;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
}

export const VertexSection = memo(function VertexSection({
  configs,
  usageDetailsBySource,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: VertexSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    configs.forEach((config) => {
      if (!config.apiKey) return;
      const candidates = buildCandidateUsageSourceIds({
        apiKey: config.apiKey,
        prefix: config.prefix,
      });
      if (!candidates.length) return;
      cache.set(
        config.apiKey,
        calculateStatusBarData(collectUsageDetailsForCandidates(usageDetailsBySource, candidates))
      );
    });

    return cache;
  }, [configs, usageDetailsBySource]);

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.vertex_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.vertex_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          listClassName={styles.providerConfigList}
          rowClassName={styles.providerConfigItem}
          leadingIcon={<img src={iconVertex} alt="" />}
          keyField={(item) => item.apiKey}
          emptyTitle={t('ai_providers.vertex_empty_title')}
          emptyDescription={t('ai_providers.vertex_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
          renderExtraActions={(item, index) => (
            <ToggleSwitch
              label={t('ai_providers.config_toggle_label')}
              checked={!hasDisableAllModelsRule(item.excludedModels)}
              className={styles.providerCardToggle}
              disabled={toggleDisabled}
              onChange={(value) => void onToggle(index, value)}
            />
          )}
          renderContent={(item, index) => {
            const headerEntries = Object.entries(item.headers || {});
            const excludedModels = item.excludedModels ?? [];
            const statusData = statusBarCache.get(item.apiKey) || calculateStatusBarData([]);

            return (
              <Fragment>
                <div className="item-title">
                  {t('ai_providers.vertex_item_title')} #{index + 1}
                </div>
                <div className={styles.fieldGrid}>
                  {item.priority !== undefined &&
                    item.priority !== null &&
                    Number.isFinite(item.priority) && (
                      <ProviderDetailRow
                        icon={<IconStar size={20} />}
                        label={t('common.priority')}
                        tone="priority"
                      >
                        {item.priority}
                      </ProviderDetailRow>
                    )}
                  {item.baseUrl && (
                    <ProviderDetailRow
                      icon={<IconLink size={20} />}
                      label={t('common.base_url')}
                      tone="url"
                    >
                      {item.baseUrl}
                    </ProviderDetailRow>
                  )}
                  {item.prefix && (
                    <ProviderDetailRow
                      icon={<IconShield size={20} />}
                      label={t('common.prefix')}
                      tone="prefix"
                    >
                      {item.prefix}
                    </ProviderDetailRow>
                  )}
                  {item.proxyUrl && (
                    <ProviderDetailRow
                      icon={<IconExternalLink size={20} />}
                      label={t('common.proxy_url')}
                      tone="proxy"
                    >
                      {item.proxyUrl}
                    </ProviderDetailRow>
                  )}
                </div>
                {headerEntries.length > 0 && (
                  <div className={styles.headerBadgeList}>
                    {headerEntries.map(([key, value]) => (
                      <span key={key} className={styles.headerBadge}>
                        <strong>{key}:</strong> {value}
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.modelTagList}>
                  <ProviderModelHeader
                    label={t('ai_providers.vertex_models_count')}
                    count={item.models?.length || 0}
                  />
                  {item.models?.length
                    ? item.models.map((model) => (
                        <span
                          key={`${model.name}-${model.alias || 'default'}`}
                          className={styles.modelTag}
                        >
                          <span className={styles.modelName}>{model.name}</span>
                          {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                        </span>
                      ))
                    : null}
                </div>
                {excludedModels.length ? (
                  <div className={styles.excludedModelsSection}>
                    <div className={styles.excludedModelsLabel}>
                      {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                    </div>
                    <div className={styles.modelTagList}>
                      {excludedModels.map((model) => (
                        <span
                          key={model}
                          className={`${styles.modelTag} ${styles.excludedModelTag}`}
                        >
                          <span className={styles.modelName}>{model}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <ProviderStatusBar statusData={statusData} showRateLabel />
              </Fragment>
            );
          }}
        />
      </Card>
    </>
  );
});
