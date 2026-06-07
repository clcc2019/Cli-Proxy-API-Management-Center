import { Fragment, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconExternalLink,
  IconLink,
  IconRefreshCw,
  IconSatellite,
  IconShield,
  IconStar,
} from '@/components/ui/icons';
import iconCodex from '@/assets/icons/codex.svg';
import type { ProviderKeyConfig } from '@/types';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  type KeyStats,
} from '@/utils/usage';
import {
  collectUsageDetailsForCandidates,
  type UsageDetailsBySource,
} from '@/utils/usageIndex';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderDetailRow, ProviderModelHeader } from '../ProviderCardParts';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { buildProviderConfigKey, hasDisableAllModelsRule } from '../utils';

interface CodexSectionProps {
  configs: ProviderKeyConfig[];
  keyStats: KeyStats;
  usageDetailsBySource: UsageDetailsBySource;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  /** 正在切换开关的 item key 集合（apiKey:baseUrl:prefix 格式） */
  switchingItemKeys?: ReadonlySet<string>;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
  onPoolModeToggle: (index: number, enabled: boolean) => void;
}

export const CodexSection = memo(function CodexSection({
  configs,
  keyStats,
  usageDetailsBySource,
  loading,
  disableControls,
  isSwitching,
  switchingItemKeys,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onPoolModeToggle,
}: CodexSectionProps) {
  const { t } = useTranslation();
  void keyStats;
  void isSwitching;
  // 父级按钮（“新增”）仍然受全局 loading/连接状态控制，但卡片级别的按钮
  // 交由每张卡片的 switchingItemKeys 决定，从而允许多张卡片并发切换。
  const actionsDisabled = disableControls || loading;
  const toggleGloballyDisabled = disableControls || loading;

  const isItemSwitching = (item: ProviderKeyConfig) =>
    switchingItemKeys ? switchingItemKeys.has(buildProviderConfigKey(item)) : false;

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
            <img src={iconCodex} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.codex_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.codex_add_button')}
          </Button>
        }
      >
        <ProviderList<ProviderKeyConfig>
          items={configs}
          loading={loading}
          listClassName={styles.providerConfigList}
          rowClassName={`${styles.providerConfigItem} ${styles.providerConfigItemCodex}`}
          leadingIcon={<img src={iconCodex} alt="" />}
          keyField={(item) => buildProviderConfigKey(item)}
          emptyTitle={t('ai_providers.codex_empty_title')}
          emptyDescription={t('ai_providers.codex_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
          isRowSwitching={(item) => isItemSwitching(item)}
          renderExtraActions={(item, index) => (
            <>
              <ToggleSwitch
                label={t('ai_providers.codex_pool_mode_label')}
                checked={Boolean(item.poolMode)}
                className={styles.providerCardToggle}
                disabled={toggleGloballyDisabled || isItemSwitching(item)}
                onChange={(value) => void onPoolModeToggle(index, value)}
              />
              <ToggleSwitch
                label={t('ai_providers.config_toggle_label')}
                checked={!hasDisableAllModelsRule(item.excludedModels)}
                className={styles.providerCardToggle}
                disabled={toggleGloballyDisabled || isItemSwitching(item)}
                onChange={(value) => void onToggle(index, value)}
              />
            </>
          )}
          renderContent={(item) => {
            const headerEntries = Object.entries(item.headers || {});
            const excludedModels = item.excludedModels ?? [];
            const statusData = statusBarCache.get(item.apiKey) || calculateStatusBarData([]);

            return (
              <Fragment>
                <div className="item-title">{t('ai_providers.codex_item_title')}</div>
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
                  {item.prefix && (
                    <ProviderDetailRow
                      icon={<IconShield size={20} />}
                      label={t('common.prefix')}
                      tone="prefix"
                    >
                      {item.prefix}
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
                  {item.proxyUrl && (
                    <ProviderDetailRow
                      icon={<IconExternalLink size={20} />}
                      label={t('common.proxy_url')}
                      tone="proxy"
                    >
                      {item.proxyUrl}
                    </ProviderDetailRow>
                  )}
                  {item.websockets !== undefined && (
                    <ProviderDetailRow
                      icon={<IconSatellite size={20} />}
                      label={t('ai_providers.codex_websockets_label')}
                      tone="option"
                    >
                      {item.websockets ? t('common.yes') : t('common.no')}
                    </ProviderDetailRow>
                  )}
                  {item.poolMode !== undefined && (
                    <ProviderDetailRow
                      icon={<IconRefreshCw size={20} />}
                      label={t('ai_providers.codex_pool_mode_label')}
                      tone="option"
                    >
                      {item.poolMode ? t('common.yes') : t('common.no')}
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
                    label={t('ai_providers.codex_models_count')}
                    count={item.models?.length || 0}
                  />
                  {item.models?.length
                    ? item.models.map((model) => (
                      <span key={model.name} className={styles.modelTag}>
                        <span className={styles.modelName}>{model.name}</span>
                        {model.alias && model.alias !== model.name && (
                          <span className={styles.modelAlias}>{model.alias}</span>
                        )}
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
                        <span key={model} className={`${styles.modelTag} ${styles.excludedModelTag}`}>
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
