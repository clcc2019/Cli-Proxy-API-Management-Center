import { Fragment, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconBot, IconKey, IconLink, IconShield, IconStar } from '@/components/ui/icons';
import type { OpenAICompatibilityConfig } from '@/types';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderDetailRow, ProviderModelHeader } from '../ProviderCardParts';
import { ProviderList } from '../ProviderList';
import { ProviderSectionShell } from '../ProviderSectionShell';
import { buildOpenAICompatibilityConfigKey } from '../utils';

interface OpenAICompatibilitySectionProps {
  configs: OpenAICompatibilityConfig[];
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  switchingItemKeys?: ReadonlySet<string>;
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onPoolModeToggle: (index: number, enabled: boolean) => void;
}

export const OpenAICompatibilitySection = memo(function OpenAICompatibilitySection({
  configs,
  loading,
  disableControls,
  isSwitching,
  switchingItemKeys,
  onAdd,
  onEdit,
  onDelete,
  onPoolModeToggle,
}: OpenAICompatibilitySectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;

  const isItemSwitching = (item: OpenAICompatibilityConfig, index: number) =>
    switchingItemKeys
      ? switchingItemKeys.has(buildOpenAICompatibilityConfigKey(item, index))
      : false;

  return (
    <ProviderSectionShell
      title={
        <span className={styles.cardTitle}>
          <IconBot size={18} />
          {t('ai_providers.openai_title')}
        </span>
      }
      count={configs.length}
      action={
        <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
          {t('ai_providers.openai_add_button')}
        </Button>
      }
    >
      <ProviderList<OpenAICompatibilityConfig>
        items={configs}
        loading={loading}
        listClassName={styles.providerConfigList}
        rowClassName={`${styles.providerConfigItem} ${styles.providerConfigItemOpenAI}`}
        leadingIcon={<IconBot size={18} />}
        keyField={(item, index) => buildOpenAICompatibilityConfigKey(item, index)}
        renderTitle={(item) => item.name || t('ai_providers.openai_item_title')}
        emptyTitle={t('ai_providers.openai_empty_title')}
        emptyDescription={t('ai_providers.openai_empty_desc')}
        onEdit={onEdit}
        onDelete={onDelete}
        actionsDisabled={actionsDisabled}
        getRowDisabled={(item) => Boolean(item.disabled)}
        isRowSwitching={(item, index) => isItemSwitching(item, index)}
        renderExtraActions={(item, index) => (
          <ToggleSwitch
            label={t('ai_providers.openai_pool_mode_label')}
            checked={Boolean(item.poolMode)}
            className={styles.providerCardToggle}
            disabled={actionsDisabled || isItemSwitching(item, index)}
            onChange={(value) => void onPoolModeToggle(index, value)}
          />
        )}
        renderContent={(item) => {
          const headerEntries = Object.entries(item.headers || {});
          const models = item.models ?? [];
          const apiKeyCount = item.apiKeyEntries?.length ?? 0;

          return (
            <Fragment>
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
                <ProviderDetailRow
                  icon={<IconKey size={20} />}
                  label={t('ai_providers.openai_keys_count')}
                  tone="key"
                >
                  {apiKeyCount}
                </ProviderDetailRow>
                {item.disableCooling !== undefined && (
                  <ProviderDetailRow
                    icon={<IconShield size={20} />}
                    label={t('ai_providers.disable_cooling_label')}
                    tone="option"
                  >
                    {item.disableCooling ? t('common.yes') : t('common.no')}
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
                  label={t('ai_providers.openai_models_count')}
                  count={models.length}
                />
                {models.map((model, index) => (
                  <span
                    key={`${model.name}:${model.alias ?? ''}:${index}`}
                    className={styles.modelTag}
                  >
                    <span className={styles.modelName}>{model.name}</span>
                    {model.alias && model.alias !== model.name && (
                      <span className={styles.modelAlias}>{model.alias}</span>
                    )}
                  </span>
                ))}
              </div>
            </Fragment>
          );
        }}
      />
    </ProviderSectionShell>
  );
});
