import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconEye,
  IconPencil,
  IconTrash2,
} from '@/components/ui/icons';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ProviderResource } from '../types';
import styles from './ProviderResourceTable.module.scss';

interface ProviderResourceTableProps {
  resources: ProviderResource[];
  disableMutations?: boolean;
  onView: (resource: ProviderResource) => void;
  onEdit: (resource: ProviderResource) => void;
  onDelete: (resource: ProviderResource) => void;
  onToggleDisabled?: (resource: ProviderResource, disabled: boolean) => void;
}

const columnWidths = ['180px', '190px', '84px', '150px', '130px', '176px'];

export function ProviderResourceTable({
  resources,
  disableMutations,
  onView,
  onEdit,
  onDelete,
  onToggleDisabled,
}: ProviderResourceTableProps) {
  const { t } = useTranslation();

  const renderMetric = (key: string, label: string, value: number) => (
    <span key={key} className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
    </span>
  );

  const renderModelsSummary = (resource: ProviderResource) => {
    const items: ReactNode[] = [
      renderMetric('models', t('providersPage.table.metrics.models'), resource.modelCount),
      renderMetric('headers', t('providersPage.table.metrics.headers'), resource.headerCount),
    ];
    if (resource.brand === 'openaiCompatibility') {
      items.splice(
        1,
        0,
        renderMetric('keys', t('providersPage.table.metrics.keys'), resource.apiKeyEntryCount)
      );
    }
    if (resource.flags.websockets) {
      items.push(
        <span key="ws" className={styles.flagTag}>
          {t('providersPage.table.websocketsTag')}
        </span>
      );
    }
    if (resource.flags.cloakEnabled) {
      items.push(
        <span key="cloak" className={styles.flagTag}>
          {t('providersPage.table.cloakTag')}
        </span>
      );
    }
    return <div className={styles.metricsCell}>{items}</div>;
  };

  return (
    <Table
      className={styles.providerTable}
      wrapperClassName={styles.providerTableWrap}
      aria-label={t('providersPage.table.ariaLabel')}
      cols={columnWidths.map((width, index) => (
        <col key={index} style={{ width }} />
      ))}
    >
      <TableHeader>
        <TableRow>
          <TableHead>{t('providersPage.table.key')}</TableHead>
          <TableHead>{t('providersPage.table.baseUrl')}</TableHead>
          <TableHead>{t('providersPage.table.prefix')}</TableHead>
          <TableHead>{t('providersPage.table.models')}</TableHead>
          <TableHead>{t('providersPage.table.status')}</TableHead>
          <TableHead alignRight className={styles.actionsHead}>
            {t('providersPage.table.actions')}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => (
          <TableRow key={resource.id}>
            <TableCell>
              <div className={styles.primaryCell}>
                <span className={styles.primaryName}>
                  {resource.name ?? resource.apiKeyPreview ?? resource.identifier}
                </span>
                <span className={styles.primarySub}>
                  {resource.brand === 'openaiCompatibility'
                    ? (resource.apiKeyPreview ?? '—')
                    : resource.authIndex
                      ? `auth: ${resource.authIndex}`
                      : (resource.apiKeyPreview ?? '—')}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <span className={styles.baseUrl}>
                {resource.baseUrl ||
                  (resource.brand === 'claude'
                    ? `https://api.anthropic.com ${t('providersPage.status.defaultSuffix')}`
                    : t('providersPage.status.notSet'))}
              </span>
            </TableCell>
            <TableCell>
              {resource.prefix ? (
                <span className={styles.chip}>{resource.prefix}</span>
              ) : (
                <span className={styles.baseUrl}>{t('providersPage.status.none')}</span>
              )}
            </TableCell>
            <TableCell>{renderModelsSummary(resource)}</TableCell>
            <TableCell>
              <span
                className={`${styles.statusBadge} ${
                  resource.disabled ? styles.statusDisabled : styles.statusActive
                }`}
              >
                {resource.disabled ? (
                  <IconAlertTriangle size={14} />
                ) : (
                  <IconCheckCircle2 size={14} />
                )}
                {t(
                  resource.disabled
                    ? 'providersPage.status.disabled'
                    : 'providersPage.status.active'
                )}
              </span>
            </TableCell>
            <TableCell alignRight className={styles.actionsCell}>
              <div className={styles.actions}>
                {onToggleDisabled ? (
                  <span className={styles.toggleWrap}>
                    <ToggleSwitch
                      checked={!resource.disabled}
                      disabled={disableMutations}
                      onChange={(value) => onToggleDisabled(resource, !value)}
                      ariaLabel={t(
                        resource.disabled
                          ? 'providersPage.actions.enable'
                          : 'providersPage.actions.disable'
                      )}
                    />
                  </span>
                ) : null}
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('providersPage.actions.view')}
                  title={t('providersPage.actions.view')}
                  onClick={() => onView(resource)}
                >
                  <IconEye size={16} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('providersPage.actions.edit')}
                  title={t('providersPage.actions.edit')}
                  disabled={disableMutations}
                  onClick={() => onEdit(resource)}
                >
                  <IconPencil size={16} />
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  aria-label={t('providersPage.actions.delete')}
                  title={t('providersPage.actions.delete')}
                  disabled={disableMutations}
                  onClick={() => onDelete(resource)}
                >
                  <IconTrash2 size={16} />
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
