import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { IconPlus, IconTrash2 } from '@/components/ui/icons';
import {
  makeClientId,
  type VisualModelAliasRule,
  type VisualModelAliasValidationErrorCode,
} from '@/types/visualConfig';
import styles from './ModelAliasesEditor.module.scss';

type ModelAliasesEditorProps = {
  value: VisualModelAliasRule[];
  modelOptions: string[];
  disabled?: boolean;
  validationError: VisualModelAliasValidationErrorCode | null;
  onChange: (value: VisualModelAliasRule[]) => void;
};

export function ModelAliasesEditor({
  value,
  modelOptions,
  disabled = false,
  validationError,
  onChange,
}: ModelAliasesEditorProps) {
  const { t } = useTranslation();

  const updateRule = (id: string, patch: Partial<VisualModelAliasRule>) => {
    onChange(value.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const duplicateAliases = new Set(
    value
      .map((rule) => rule.alias.trim().toLowerCase())
      .filter((alias, index, aliases) => alias && aliases.indexOf(alias) !== index)
  );

  const addRule = () => {
    onChange([...value, { id: makeClientId(), name: '', alias: '', fork: true }]);
  };

  const removeRule = (id: string) => {
    onChange(value.filter((rule) => rule.id !== id));
  };

  return (
    <div className={styles.editor}>
      <div className={styles.toolbar}>
        <span className={styles.ruleCount}>
          {t('config_management.visual.sections.model_aliases.rule_count', {
            count: value.length,
          })}
        </span>
        <Button variant="secondary" size="sm" onClick={addRule} disabled={disabled}>
          <IconPlus size={15} aria-hidden="true" />
          {t('config_management.visual.sections.model_aliases.add')}
        </Button>
      </div>

      {value.length === 0 ? (
        <div className={styles.emptyState}>
          {t('config_management.visual.sections.model_aliases.empty')}
        </div>
      ) : (
        <div className={styles.ruleList}>
          {value.map((rule, index) => {
            const alias = rule.alias.trim().toLowerCase();
            const duplicate = Boolean(alias && duplicateAliases.has(alias));
            const missingAlias = !rule.alias.trim();
            const missingName = !rule.name.trim();

            return (
              <article className={styles.rule} key={rule.id}>
                <div className={styles.mapping}>
                  <AutocompleteInput
                    label={t('config_management.visual.sections.model_aliases.client_alias')}
                    value={rule.alias}
                    onChange={(alias) => updateRule(rule.id, { alias })}
                    options={modelOptions}
                    placeholder="gpt-6-astra"
                    disabled={disabled}
                    error={
                      missingAlias
                        ? t('config_management.visual.sections.model_aliases.required')
                        : duplicate
                          ? t('config_management.visual.sections.model_aliases.duplicate')
                          : undefined
                    }
                  />
                  <span className={styles.arrow} aria-hidden="true">
                    →
                  </span>
                  <AutocompleteInput
                    label={t('config_management.visual.sections.model_aliases.upstream_model')}
                    value={rule.name}
                    onChange={(name) => updateRule(rule.id, { name })}
                    options={modelOptions}
                    placeholder="gpt-5.6-luna"
                    disabled={disabled}
                    error={
                      missingName
                        ? t('config_management.visual.sections.model_aliases.required')
                        : undefined
                    }
                  />
                </div>

                <div className={styles.ruleOptions}>
                  <div className={styles.forkSetting}>
                    <ToggleSwitch
                      checked={rule.fork}
                      onChange={(fork) => updateRule(rule.id, { fork })}
                      label={t('config_management.visual.sections.model_aliases.fork')}
                      disabled={disabled}
                    />
                    <span>{t('config_management.visual.sections.model_aliases.fork_hint')}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={styles.removeButton}
                    onClick={() => removeRule(rule.id)}
                    disabled={disabled}
                    aria-label={t('config_management.visual.sections.model_aliases.remove', {
                      index: index + 1,
                    })}
                    title={t('config_management.visual.sections.model_aliases.remove', {
                      index: index + 1,
                    })}
                  >
                    <IconTrash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {validationError ? (
        <p className={styles.validationMessage} role="alert">
          {t(`config_management.visual.sections.model_aliases.validation.${validationError}`)}
        </p>
      ) : null}
    </div>
  );
}
