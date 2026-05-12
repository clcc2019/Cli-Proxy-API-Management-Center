import { Fragment, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconCheck, IconLink, IconShield, IconStar, IconX } from '@/components/ui/icons';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import type { OpenAIProviderConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  type KeyStats,
} from '@/utils/usage';
import { collectUsageDetailsForCandidates, type UsageDetailsBySource } from '@/utils/usageIndex';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderDetailRow, ProviderModelHeader } from '../ProviderCardParts';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { getStatsBySource } from '../utils';

interface OpenAISectionProps {
  configs: OpenAIProviderConfig[];
  keyStats: KeyStats;
  usageDetailsBySource: UsageDetailsBySource;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  resolvedTheme: string;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
}

export const OpenAISection = memo(function OpenAISection({
  configs,
  keyStats,
  usageDetailsBySource,
  loading,
  disableControls,
  isSwitching,
  resolvedTheme,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
}: OpenAISectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();

    configs.forEach((provider) => {
      const sourceIds = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix }).forEach((id) => sourceIds.add(id));
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey }).forEach((id) => sourceIds.add(id));
      });

      const filteredDetails = sourceIds.size
        ? collectUsageDetailsForCandidates(usageDetailsBySource, sourceIds)
        : [];
      cache.set(provider.name, calculateStatusBarData(filteredDetails));
    });

    return cache;
  }, [configs, usageDetailsBySource]);

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img
              src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
              alt=""
              className={styles.cardTitleIcon}
            />
            {t('ai_providers.openai_title')}
          </span>
        }
        extra={
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.openai_add_button')}
          </Button>
        }
      >
        <ProviderList<OpenAIProviderConfig>
          items={configs}
          loading={loading}
          listClassName={styles.providerConfigList}
          rowClassName={styles.providerConfigItem}
          leadingIcon={
            <img
              src={resolvedTheme === 'dark' ? iconOpenaiDark : iconOpenaiLight}
              alt=""
            />
          }
          keyField={(_, index) => `openai-provider-${index}`}
          emptyTitle={t('ai_providers.openai_empty_title')}
          emptyDescription={t('ai_providers.openai_empty_desc')}
          onEdit={onEdit}
          onDelete={onDelete}
          actionsDisabled={actionsDisabled}
          getRowDisabled={(item) => item.disabled === true}
          renderExtraActions={(item, index) => (
            <ToggleSwitch
              checked={!item.disabled}
              disabled={toggleDisabled}
              label={t('ai_providers.config_toggle_label')}
              labelInside
              ariaLabel={t('ai_providers.config_toggle_label')}
              onChange={(enabled) => onToggle(index, enabled)}
            />
          )}
          renderContent={(item) => {
            const headerEntries = Object.entries(item.headers || {});
            const apiKeyEntries = item.apiKeyEntries || [];
            const statusData = statusBarCache.get(item.name) || calculateStatusBarData([]);

            return (
              <Fragment>
                <div className="item-title">{item.name}</div>
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
                  <ProviderDetailRow
                    icon={<IconLink size={20} />}
                    label={t('common.base_url')}
                    tone="url"
                  >
                    {item.baseUrl}
                  </ProviderDetailRow>
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
                {apiKeyEntries.length > 0 && (
                  <div className={styles.apiKeyEntriesSection}>
                    <div className={styles.apiKeyEntriesLabel}>
                      {t('ai_providers.openai_keys_count')}: {apiKeyEntries.length}
                    </div>
                    <div className={styles.apiKeyEntryList}>
                      {apiKeyEntries.map((entry, entryIndex) => {
                        const entryStats = getStatsBySource(entry.apiKey, keyStats);
                        return (
                          <div key={entryIndex} className={styles.apiKeyEntryCard}>
                            <span className={styles.apiKeyEntryIndex}>{entryIndex + 1}</span>
                            <span className={styles.apiKeyEntryKey}>{maskApiKey(entry.apiKey)}</span>
                            {entry.proxyUrl && (
                              <span className={styles.apiKeyEntryProxy}>{entry.proxyUrl}</span>
                            )}
                            <div className={styles.apiKeyEntryStats}>
                              <span
                                className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatSuccess}`}
                              >
                                <IconCheck size={12} /> {entryStats.success}
                              </span>
                              <span
                                className={`${styles.apiKeyEntryStat} ${styles.apiKeyEntryStatFailure}`}
                              >
                                <IconX size={12} /> {entryStats.failure}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className={styles.modelTagList}>
                  <ProviderModelHeader
                    label={t('ai_providers.openai_models_count')}
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
                <ProviderStatusBar statusData={statusData} showRateLabel />
              </Fragment>
            );
          }}
        />
      </Card>
    </>
  );
});
