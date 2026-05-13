import { memo, useEffect, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCheck,
  IconCopy,
  IconDatabase,
  IconDownload,
  IconDollarSign,
  IconInfo,
  IconKey,
  IconModelCluster,
  IconSettings,
  IconTrash2,
  IconX,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import {
  calculateStatusBarData,
  formatMillionTokens,
  formatUsd,
  normalizeAuthIndex,
  type KeyStats,
  type KeyUsageStats,
} from '@/utils/usage';
import { formatFileSize } from '@/utils/format';
import {
  QUOTA_PROVIDER_TYPES,
  formatLastRefresh,
  formatModified,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  parsePriorityValue,
  readAuthFileWebsockets,
  resolveAuthFileStats,
  resolveAuthFileUsageStats,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import type { AuthFilePlanBadgeInfo } from '@/features/authFiles/planMetadata';
import {
  AuthFileQuotaRefreshButton,
  AuthFileQuotaSection,
} from '@/features/authFiles/components/AuthFileQuotaSection';
import { AuthFilePlanBadge } from '@/features/authFiles/components/AuthFilePlanBadge';
import { AuthFileWarningIndicator } from '@/features/authFiles/components/AuthFileWarningIndicator';
import styles from '@/pages/AuthFilesPage.module.scss';

const HEALTHY_STATUS_MESSAGES = new Set(['ok', 'healthy', 'ready', 'success', 'available']);
const AUTH_FILE_NAME_MASK = '*';

const getStableMaskSeed = (value: string): number => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const getNextMaskSeed = (seed: number): number => {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
};

const maskAuthFileDisplayName = (value: string): string => {
  const chars = Array.from(value);
  if (chars.length === 0) return value;

  const maskCount = Math.min(2, chars.length);
  const maskIndexes = new Set<number>();
  let seed = getStableMaskSeed(value) || 1;

  while (maskIndexes.size < maskCount) {
    seed = getNextMaskSeed(seed);
    maskIndexes.add(seed % chars.length);
  }

  return chars.map((char, index) => (maskIndexes.has(index) ? AUTH_FILE_NAME_MASK : char)).join('');
};

export type AuthFileCardProps = {
  file: AuthFileItem;
  compact: boolean;
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: boolean;
  statusUpdating: boolean;
  accessTokenCopying: boolean;
  priorityUpdating: boolean;
  quotaFilterType: QuotaProviderType | null;
  planBadge: AuthFilePlanBadgeInfo | null;
  keyStats: KeyStats;
  keyUsageStats: KeyUsageStats;
  statusBarCache: Map<string, AuthFileStatusBarData>;
  onShowModels: (file: AuthFileItem) => void;
  onCopyName: (name: string) => void | Promise<void>;
  onDownload: (name: string) => void;
  onCopyAccessToken: (file: AuthFileItem) => void;
  onPriorityChange: (file: AuthFileItem, priority: number) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

export const AuthFileCard = memo(function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const {
    file,
    compact,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    accessTokenCopying,
    priorityUpdating,
    quotaFilterType,
    planBadge,
    keyStats,
    keyUsageStats,
    statusBarCache,
    onShowModels,
    onCopyName,
    onDownload,
    onCopyAccessToken,
    onPriorityChange,
    onOpenPrefixProxyEditor,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  const fileStats = resolveAuthFileStats(file, keyStats);
  const fileUsageStats = resolveAuthFileUsageStats(file, keyUsageStats);
  const isRuntimeOnly = isRuntimeOnlyAuthFile(file);
  const isAistudio = (file.type || '').toLowerCase() === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;
  const typeColor = getTypeColor(file.type || 'unknown', resolvedTheme);
  const typeLabel = getTypeLabel(t, file.type || 'unknown');
  const providerIcon = getAuthFileIcon(file.type || 'unknown', resolvedTheme);
  const websocketsEnabled = readAuthFileWebsockets(file);
  const websocketsBadgeLabel =
    websocketsEnabled === null
      ? null
      : websocketsEnabled
        ? t('auth_files.websockets_enabled_badge')
        : t('auth_files.websockets_disabled_badge');

  const quotaType =
    quotaFilterType && resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly && !compact;

  const providerCardClass =
    quotaType === 'antigravity'
      ? styles.antigravityCard
      : quotaType === 'claude'
        ? styles.claudeCard
        : quotaType === 'codex'
          ? styles.codexCard
          : quotaType === 'gemini-cli'
            ? styles.geminiCliCard
            : quotaType === 'kiro'
              ? styles.kiroCard
              : quotaType === 'kimi'
                ? styles.kimiCard
                : '';

  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndexKey = normalizeAuthIndex(rawAuthIndex);
  const statusData =
    (authIndexKey && statusBarCache.get(authIndexKey)) || calculateStatusBarData([]);
  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  const priorityValue = parsePriorityValue(file.priority ?? file['priority']);
  const currentPriority = priorityValue ?? 0;
  const [priorityDraft, setPriorityDraft] = useState(String(currentPriority));

  useEffect(() => {
    setPriorityDraft(String(currentPriority));
  }, [currentPriority]);

  const commitPriorityDraft = () => {
    const nextPriority = parsePriorityValue(priorityDraft);
    if (nextPriority === undefined) {
      setPriorityDraft(String(currentPriority));
      return;
    }
    if (nextPriority !== currentPriority) {
      onPriorityChange(file, nextPriority);
      return;
    }
    setPriorityDraft(String(currentPriority));
  };

  const stepPriority = (delta: number) => {
    const nextPriority = currentPriority + delta;
    setPriorityDraft(String(nextPriority));
    onPriorityChange(file, nextPriority);
  };

  const handlePriorityKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      setPriorityDraft(String(currentPriority));
      event.currentTarget.blur();
    }
  };
  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const totalRequests = fileUsageStats.success + fileUsageStats.failure;
  const tokenDisplay = formatMillionTokens(fileUsageStats.totalTokens);
  const authFileDisplayName = file.name.replace(/\.json$/i, '');
  const maskedAuthFileDisplayName = maskAuthFileDisplayName(authFileDisplayName);
  const canDisplayCost = totalRequests === 0 || fileUsageStats.pricedRequests > 0;
  const costDisplay = canDisplayCost ? formatUsd(fileUsageStats.totalCost) : '--';
  const costTitle = canDisplayCost
    ? t('usage_stats.total_cost_hint')
    : t('usage_stats.cost_need_price');
  const stateLabel = isRuntimeOnly
    ? t('auth_files.type_virtual') || '虚拟认证文件'
    : file.disabled
      ? t('auth_files.health_status_disabled')
      : hasStatusWarning
        ? t('auth_files.health_status_warning')
        : rawStatusMessage
          ? t('auth_files.health_status_healthy')
          : t('auth_files.status_toggle_label');
  const stateBadgeClass = isRuntimeOnly
    ? styles.stateBadgeVirtual
    : file.disabled
      ? styles.stateBadgeDisabled
      : hasStatusWarning
        ? styles.stateBadgeWarning
        : styles.stateBadgeActive;

  return (
    <div
      className={`${styles.fileCard} ${compact ? styles.fileCardCompact : ''} ${providerCardClass} ${selected ? styles.fileCardSelected : ''} ${file.disabled ? styles.fileCardDisabled : ''}`}
    >
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && (
              <SelectionCheckbox
                checked={selected}
                onChange={() => onToggleSelect(file.name)}
                className={styles.cardSelection}
                aria-label={
                  selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')
                }
                title={selected ? t('auth_files.batch_deselect') : t('auth_files.batch_select_all')}
              />
            )}
            <div
              className={styles.providerAvatar}
              style={{
                backgroundColor: typeColor.bg,
                color: typeColor.text,
                ...(typeColor.border ? { border: typeColor.border } : {}),
              }}
            >
              {providerIcon ? (
                <img src={providerIcon} alt="" className={styles.providerAvatarImage} />
              ) : (
                <span className={styles.providerAvatarFallback}>
                  {typeLabel.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className={styles.cardHeaderContent}>
              <div className={styles.cardBadgeRow}>
                <span
                  className={styles.typeBadge}
                  style={{
                    backgroundColor: typeColor.bg,
                    color: typeColor.text,
                    ...(typeColor.border ? { border: typeColor.border } : {}),
                  }}
                >
                  {typeLabel}
                </span>
                <span className={`${styles.stateBadge} ${stateBadgeClass}`}>{stateLabel}</span>
                {planBadge && <AuthFilePlanBadge badge={planBadge} />}
                {websocketsBadgeLabel && (
                  <span
                    className={`${styles.featureBadge} ${
                      websocketsEnabled ? styles.featureBadgeEnabled : styles.featureBadgeDisabled
                    }`}
                    title={t('ai_providers.codex_websockets_hint')}
                  >
                    {websocketsBadgeLabel}
                  </span>
                )}
              </div>
              <div className={styles.fileNameRow}>
                <span className={styles.fileName} title={maskedAuthFileDisplayName}>
                  {maskedAuthFileDisplayName}
                </span>
                <button
                  type="button"
                  className={styles.fileNameCopyButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    void onCopyName(authFileDisplayName);
                  }}
                  title={t('common.copy')}
                  aria-label={t('common.copy')}
                >
                  <IconCopy size={13} />
                </button>
              </div>
              {!compact && noteValue && (
                <div className={styles.noteText} title={noteValue}>
                  <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                  <span className={styles.noteValue}>{noteValue}</span>
                </div>
              )}
            </div>
            {rawStatusMessage && hasStatusWarning && (
              <AuthFileWarningIndicator message={rawStatusMessage} />
            )}
          </div>

          <div className={`${styles.cardMeta} ${compact ? styles.cardMetaCompact : ''}`}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_size')}</span>
              <span className={styles.metaValue}>
                {file.size ? formatFileSize(file.size) : '-'}
              </span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.file_modified')}</span>
              <span className={styles.metaValue}>{formatModified(file)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>{t('auth_files.last_refresh_label')}</span>
              <span className={styles.metaValue}>{formatLastRefresh(file)}</span>
            </div>
            {!isRuntimeOnly ? (
              <div className={`${styles.metaItem} ${styles.priorityControlItem}`}>
                <span className={styles.metaLabel}>{t('auth_files.priority_display')}</span>
                <div className={styles.priorityStepper}>
                  <button
                    type="button"
                    className={styles.priorityStepButton}
                    onClick={() => stepPriority(-1)}
                    disabled={disableControls || priorityUpdating}
                    title={t('auth_files.priority_decrement')}
                    aria-label={t('auth_files.priority_decrement')}
                  >
                    -
                  </button>
                  <input
                    className={styles.priorityInput}
                    type="number"
                    step={1}
                    inputMode="numeric"
                    value={priorityDraft}
                    disabled={disableControls || priorityUpdating}
                    aria-label={t('auth_files.priority_display')}
                    onChange={(event) => setPriorityDraft(event.target.value)}
                    onBlur={commitPriorityDraft}
                    onKeyDown={handlePriorityKeyDown}
                  />
                  <button
                    type="button"
                    className={styles.priorityStepButton}
                    onClick={() => stepPriority(1)}
                    disabled={disableControls || priorityUpdating}
                    title={t('auth_files.priority_increment')}
                    aria-label={t('auth_files.priority_increment')}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : priorityValue !== undefined ? (
              <div className={`${styles.metaItem} ${styles.priorityBadge}`}>
                <span className={styles.metaLabel}>{t('auth_files.priority_display')}</span>
                <span className={`${styles.metaValue} ${styles.priorityValue}`}>
                  {priorityValue}
                </span>
              </div>
            ) : null}
          </div>

          <div className={`${styles.cardInsights} ${compact ? styles.cardInsightsCompact : ''}`}>
            <div className={`${styles.cardStats} ${compact ? styles.cardStatsCompact : ''}`}>
              <div className={`${styles.statPill} ${styles.statSuccess}`}>
                <span className={styles.statIcon}>
                  <IconCheck size={10} />
                </span>
                <span className={styles.statLabel}>{t('stats.success')}</span>
                <span className={styles.statValue}>{fileStats.success}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statFailure}`}>
                <span className={styles.statIcon}>
                  <IconX size={10} />
                </span>
                <span className={styles.statLabel}>{t('stats.failure')}</span>
                <span className={styles.statValue}>{fileStats.failure}</span>
              </div>
              <div
                className={`${styles.statPill} ${styles.statToken}`}
                title={fileUsageStats.totalTokens.toLocaleString()}
              >
                <span className={styles.statIcon}>
                  <IconDatabase size={11} />
                </span>
                <span className={styles.statLabel}>{t('auth_files.tokens_stat_label')}</span>
                <span className={styles.statValue}>{tokenDisplay}</span>
              </div>
              <div className={`${styles.statPill} ${styles.statCost}`} title={costTitle}>
                <span className={styles.statIcon}>
                  <IconDollarSign size={10} />
                </span>
                <span className={styles.statLabel}>{t('auth_files.cost_stat_label')}</span>
                <span className={styles.statValue}>{costDisplay}</span>
              </div>
            </div>

            <div className={`${styles.statusPanel} ${compact ? styles.statusPanelCompact : ''}`}>
              <div className={styles.statusPanelLabel}>
                <span>{t('auth_files.health_status_label')}</span>
                <IconInfo className={styles.statusPanelIcon} size={12} />
              </div>
              <ProviderStatusBar statusData={statusData} styles={styles} />
            </div>

            {showQuotaLayout && quotaType && (
              <AuthFileQuotaSection
                file={file}
                quotaType={quotaType}
                disableControls={disableControls}
              />
            )}
          </div>

          <div className={styles.cardActions}>
            <div className={styles.cardActionsMain}>
              <div className={styles.cardActionCluster}>
                {!isRuntimeOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onOpenPrefixProxyEditor(file)}
                    className={styles.iconButton}
                    title={t('auth_files.prefix_proxy_button')}
                    disabled={disableControls}
                  >
                    <IconSettings className={styles.actionIcon} size={18} />
                  </Button>
                )}
                {!isRuntimeOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onCopyAccessToken(file)}
                    className={styles.iconButton}
                    title={t('auth_files.access_token_copy')}
                    disabled={disableControls || accessTokenCopying}
                  >
                    {accessTokenCopying ? (
                      <LoadingSpinner size={17} />
                    ) : (
                      <IconKey className={styles.actionIcon} size={18} />
                    )}
                  </Button>
                )}
                {showModelsButton && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onShowModels(file)}
                    className={`${styles.iconButton} ${styles.modelsActionButton}`}
                    title={t('auth_files.models_button', { defaultValue: '模型' })}
                    disabled={disableControls}
                  >
                    <IconModelCluster className={styles.actionIcon} size={18} />
                  </Button>
                )}
                {!isRuntimeOnly && (
                  <div className={styles.cardUtilityActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onDownload(file.name)}
                      className={styles.iconButton}
                      title={t('auth_files.download_button')}
                      disabled={disableControls}
                    >
                      <IconDownload className={styles.actionIcon} size={18} />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(file.name)}
                      className={styles.iconButton}
                      title={t('auth_files.delete_button')}
                      disabled={disableControls || deleting}
                    >
                      {deleting ? (
                        <LoadingSpinner size={17} />
                      ) : (
                        <IconTrash2 className={styles.actionIcon} size={18} />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              {!isRuntimeOnly && (
                <div className={styles.cardStatusActions}>
                  {showQuotaLayout && quotaType && (
                    <AuthFileQuotaRefreshButton
                      file={file}
                      quotaType={quotaType}
                      disableControls={disableControls}
                      className={`${styles.iconButton} ${styles.refreshActionButton}`}
                      iconClassName={styles.actionIcon}
                      iconSize={18}
                    />
                  )}
                  <div className={styles.statusToggle}>
                    <ToggleSwitch
                      ariaLabel={t('auth_files.status_toggle_label')}
                      checked={!file.disabled}
                      className={styles.cardToggleSwitch}
                      disabled={disableControls || statusUpdating}
                      label={t('auth_files.status_toggle_label')}
                      labelInside
                      onChange={(value) => onToggleStatus(file, value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
