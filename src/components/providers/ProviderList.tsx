import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconSettings, IconTrash2 } from '@/components/ui/icons';

interface ProviderListProps<T> {
  items: T[];
  loading: boolean;
  keyField: (item: T, index: number) => string;
  renderContent: (item: T, index: number) => ReactNode;
  renderTitle: (item: T, index: number) => ReactNode;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
  emptyTitle: string;
  emptyDescription: string;
  deleteLabel?: string;
  editLabel?: string;
  actionsDisabled?: boolean;
  getRowDisabled?: (item: T, index: number) => boolean;
  /**
   * 是否给该行显示“正在保存”的视觉状态（如轻微 loading / disabled）。
   * 与 `actionsDisabled` 不同，这是针对单个行的实时切换反馈。
   */
  isRowSwitching?: (item: T, index: number) => boolean;
  renderExtraActions?: (item: T, index: number) => ReactNode;
  leadingIcon?: ReactNode;
  listClassName?: string;
  rowClassName?: string;
}

function ProviderListImpl<T>({
  items,
  loading,
  keyField,
  renderContent,
  renderTitle,
  onEdit,
  onDelete,
  emptyTitle,
  emptyDescription,
  deleteLabel,
  editLabel,
  actionsDisabled = false,
  getRowDisabled,
  isRowSwitching,
  renderExtraActions,
  leadingIcon,
  listClassName,
  rowClassName,
}: ProviderListProps<T>) {
  const { t } = useTranslation();

  if (loading && items.length === 0) {
    return (
      <div className="hint" role="status" aria-busy="true">
        {t('common.loading')}
      </div>
    );
  }

  if (!items.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const listClasses = ['item-list', listClassName].filter(Boolean).join(' ');

  return (
    <div className={listClasses}>
      {items.map((item, index) => {
        const rowDisabled = getRowDisabled ? getRowDisabled(item, index) : false;
        const rowSwitching = isRowSwitching ? isRowSwitching(item, index) : false;
        const rowClasses = [
          'item-row',
          rowClassName,
          rowDisabled ? 'provider-card-disabled' : 'provider-card-enabled',
          rowSwitching ? 'provider-card-switching' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const statusLabel = rowDisabled
          ? t('ai_providers.config_disabled_badge')
          : t('ai_providers.config_enabled_badge');
        const extraActions = renderExtraActions ? renderExtraActions(item, index) : null;
        const rowActionsDisabled = actionsDisabled || rowSwitching;
        const hasActions = Boolean(onEdit || onDelete);

        return (
          <div
            key={keyField(item, index)}
            className={rowClasses}
            aria-busy={rowSwitching || undefined}
          >
            <div className="provider-card-header">
              {leadingIcon && <span className="provider-card-avatar">{leadingIcon}</span>}
              <div className="provider-card-identity">
                <div className="item-title">{renderTitle(item, index)}</div>
                <span
                  className={`provider-card-state ${rowDisabled ? 'is-disabled' : 'is-enabled'}`}
                >
                  {statusLabel}
                </span>
              </div>
              {extraActions && <div className="provider-card-toggle-slot">{extraActions}</div>}
            </div>
            <div className="item-meta">{renderContent(item, index)}</div>
            {hasActions && (
              <div className="item-actions">
                {onEdit && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onEdit(index)}
                    disabled={rowActionsDisabled}
                    className="provider-card-action provider-card-action-edit"
                    title={editLabel || t('common.edit')}
                    aria-label={editLabel || t('common.edit')}
                  >
                    <IconSettings size={18} />
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => onDelete(index)}
                    disabled={rowActionsDisabled}
                    className="provider-card-action provider-card-action-delete"
                    title={deleteLabel || t('common.delete')}
                    aria-label={deleteLabel || t('common.delete')}
                  >
                    <IconTrash2 size={18} />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export const ProviderList = memo(ProviderListImpl) as typeof ProviderListImpl;
