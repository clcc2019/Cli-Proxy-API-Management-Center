import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSettings } from '@/components/ui/icons';
import type { OAuthModelAliasEntry } from '@/types';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;

type ProviderRuleSummary = {
  provider: string;
  disabledCount: number;
  aliasCount: number;
};

export type OAuthModelRulesCardProps = {
  disableControls: boolean;
  excludedError: UnsupportedError;
  modelAliasError: UnsupportedError;
  excluded: Record<string, string[]>;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  onManage: (provider?: string) => void;
};

const getProviderKey = (provider: string) => provider.trim().toLowerCase();

export const OAuthModelRulesCard = memo(function OAuthModelRulesCard({
  disableControls,
  excludedError,
  modelAliasError,
  excluded,
  modelAlias,
  onManage,
}: OAuthModelRulesCardProps) {
  const { t } = useTranslation();
  const rules = useMemo<ProviderRuleSummary[]>(() => {
    const summaryByProvider = new Map<string, ProviderRuleSummary>();

    const ensureSummary = (provider: string) => {
      const key = getProviderKey(provider);
      if (!key) return null;

      const existing = summaryByProvider.get(key);
      if (existing) return existing;

      const next = { provider: provider.trim(), disabledCount: 0, aliasCount: 0 };
      summaryByProvider.set(key, next);
      return next;
    };

    Object.entries(excluded).forEach(([provider, models]) => {
      const summary = ensureSummary(provider);
      if (summary) summary.disabledCount = models?.length ?? 0;
    });

    Object.entries(modelAlias).forEach(([provider, mappings]) => {
      const summary = ensureSummary(provider);
      if (summary) summary.aliasCount = mappings?.length ?? 0;
    });

    return Array.from(summaryByProvider.values()).sort((left, right) =>
      left.provider.localeCompare(right.provider)
    );
  }, [excluded, modelAlias]);

  const excludedUnavailable = excludedError === 'unsupported';
  const aliasesUnavailable = modelAliasError === 'unsupported';
  const allUnavailable = excludedUnavailable && aliasesUnavailable;

  return (
    <Card
      flush
      className={styles.oauthConfigCard}
      title={t('oauth_model_rules.title')}
      extra={
        <Button size="sm" onClick={() => onManage()} disabled={disableControls || allUnavailable}>
          {t('oauth_model_rules.add')}
        </Button>
      }
    >
      {allUnavailable ? (
        <EmptyState
          title={t('oauth_model_rules.upgrade_required_title')}
          description={t('oauth_model_rules.upgrade_required_desc')}
        />
      ) : (
        <>
          {(excludedUnavailable || aliasesUnavailable) && (
            <div className={styles.modelRulesNotice} role="status">
              {excludedUnavailable && <span>{t('oauth_model_rules.excluded_unavailable')}</span>}
              {aliasesUnavailable && <span>{t('oauth_model_rules.aliases_unavailable')}</span>}
            </div>
          )}

          {rules.length === 0 ? (
            <EmptyState
              title={t('oauth_model_rules.list_empty_title')}
              description={t('oauth_model_rules.list_empty_desc')}
              action={
                <Button size="sm" onClick={() => onManage()} disabled={disableControls}>
                  {t('oauth_model_rules.add')}
                </Button>
              }
            />
          ) : (
            <div className={styles.modelRulesList}>
              {rules.map((rule) => (
                <div key={getProviderKey(rule.provider)} className={styles.modelRulesItem}>
                  <div className={styles.modelRulesInfo}>
                    <div className={styles.excludedProvider}>{rule.provider}</div>
                    <div className={styles.modelRulesStats}>
                      {!excludedUnavailable && (
                        <span className={styles.modelRulesStat}>
                          {t('oauth_excluded.model_count', { count: rule.disabledCount })}
                        </span>
                      )}
                      {!aliasesUnavailable && (
                        <span className={styles.modelRulesStat}>
                          {t('oauth_model_alias.model_count', { count: rule.aliasCount })}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onManage(rule.provider)}
                    disabled={disableControls}
                  >
                    <IconSettings size={14} />
                    {t('oauth_model_rules.manage')}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
});
