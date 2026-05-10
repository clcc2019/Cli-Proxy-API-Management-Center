import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSettings, IconTrash2 } from '@/components/ui/icons';

interface ProviderListProps<T> {
  items: T[];
  loading: boolean;
  keyField: (item: T, index: number) => string;
  renderContent: (item: T, index: number) => ReactNode;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  deleteLabel?: string;
  actionsDisabled?: boolean;
  getRowDisabled?: (item: T, index: number) => boolean;
  renderExtraActions?: (item: T, index: number) => ReactNode;
  leadingIcon?: ReactNode;
  listClassName?: string;
  rowClassName?: string;
}

export function ProviderList<T>({
  items,
  loading,
  keyField,
  renderContent,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  deleteLabel,
  actionsDisabled = false,
  getRowDisabled,
  renderExtraActions,
  leadingIcon,
  listClassName,
  rowClassName,
}: ProviderListProps<T>) {
  const { t } = useTranslation();

  if (loading && items.length === 0) {
    return <div className="hint">{t('common.loading')}</div>;
  }

  if (!items.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const listClasses = ['item-list', listClassName].filter(Boolean).join(' ');

  return (
    <div className={listClasses}>
      {items.map((item, index) => {
        const rowDisabled = getRowDisabled ? getRowDisabled(item, index) : false;
        const rowClasses = [
          'item-row',
          rowClassName,
          rowDisabled ? 'provider-card-disabled' : 'provider-card-enabled',
        ]
          .filter(Boolean)
          .join(' ');
        const statusLabel = rowDisabled
          ? t('ai_providers.config_disabled_badge')
          : t('ai_providers.config_enabled_badge', {
              defaultValue: t('ai_providers.config_toggle_label'),
            });

        return (
          <div
            key={keyField(item, index)}
            className={rowClasses}
          >
            {leadingIcon && <span className="provider-card-avatar">{leadingIcon}</span>}
            <span
              className={`provider-card-state ${rowDisabled ? 'is-disabled' : 'is-enabled'}`}
            >
              {statusLabel}
            </span>
            <span className="provider-card-menu" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <div className="item-meta">{renderContent(item, index)}</div>
            <div className="item-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(index)}
                disabled={actionsDisabled}
                className="provider-card-action provider-card-action-edit"
              >
                <IconSettings size={16} />
                <span>{t('common.edit')}</span>
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onDelete(index)}
                disabled={actionsDisabled}
                className="provider-card-action provider-card-action-delete"
              >
                <IconTrash2 size={16} />
                <span>{deleteLabel || t('common.delete')}</span>
              </Button>
              {renderExtraActions ? renderExtraActions(item, index) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
