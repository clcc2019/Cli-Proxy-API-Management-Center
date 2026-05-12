import { memo } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconLink, IconModelCluster, IconShield } from '@/components/ui/icons';
import iconAmp from '@/assets/icons/amp.svg';
import type { AmpcodeConfig } from '@/types';
import styles from '@/pages/AiProvidersPage.module.scss';
import { useTranslation } from 'react-i18next';
import { ProviderDetailRow, ProviderModelHeader } from '../ProviderCardParts';

interface AmpcodeSectionProps {
  config: AmpcodeConfig | null | undefined;
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onEdit: () => void;
}

export const AmpcodeSection = memo(function AmpcodeSection({
  config,
  loading,
  disableControls,
  isSwitching,
  onEdit,
}: AmpcodeSectionProps) {
  const { t } = useTranslation();
  const showLoadingPlaceholder = loading && !config;

  return (
    <>
      <Card
        title={
          <span className={styles.cardTitle}>
            <img src={iconAmp} alt="" className={styles.cardTitleIcon} />
            {t('ai_providers.ampcode_title')}
          </span>
        }
        extra={
          <Button
            size="sm"
            onClick={onEdit}
            disabled={disableControls || loading || isSwitching}
          >
            {t('common.edit')}
          </Button>
        }
      >
        {showLoadingPlaceholder ? (
          <div className="hint">{t('common.loading')}</div>
        ) : (
          <>
            <div className={styles.fieldGrid}>
              <ProviderDetailRow
                icon={<IconLink size={20} />}
                label={t('ai_providers.ampcode_upstream_url_label')}
                tone="url"
              >
                {config?.upstreamUrl || t('common.not_set')}
              </ProviderDetailRow>
              <ProviderDetailRow
                icon={<IconShield size={20} />}
                label={t('ai_providers.ampcode_force_model_mappings_label')}
                tone="option"
              >
                {(config?.forceModelMappings ?? false) ? t('common.yes') : t('common.no')}
              </ProviderDetailRow>
              <ProviderDetailRow
                icon={<IconModelCluster size={20} />}
                label={t('ai_providers.ampcode_model_mappings_count')}
                tone="model"
              >
                {config?.modelMappings?.length || 0}
              </ProviderDetailRow>
              <ProviderDetailRow
                icon={<IconModelCluster size={20} />}
                label={t('ai_providers.ampcode_upstream_api_keys_count')}
                tone="model"
              >
                {config?.upstreamApiKeys?.length || 0}
              </ProviderDetailRow>
            </div>
            {config?.modelMappings?.length ? (
              <div className={styles.modelTagList}>
                <ProviderModelHeader
                  label={t('ai_providers.ampcode_model_mappings_count')}
                  count={config.modelMappings.length}
                />
                {config.modelMappings.slice(0, 5).map((mapping) => (
                  <span key={`${mapping.from}→${mapping.to}`} className={styles.modelTag}>
                    <span className={styles.modelName}>{mapping.from}</span>
                    <span className={styles.modelAlias}>{mapping.to}</span>
                  </span>
                ))}
                {config.modelMappings.length > 5 && (
                  <span className={styles.modelTag}>
                    <span className={styles.modelName}>+{config.modelMappings.length - 5}</span>
                  </span>
                )}
              </div>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
});
