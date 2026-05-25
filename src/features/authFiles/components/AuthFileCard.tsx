import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useEventCallback } from '@/hooks';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { SelectionCheckbox } from '@/components/ui/SelectionCheckbox';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDatabase,
  IconDownload,
  IconDollarSign,
  IconInfo,
  IconKey,
  IconModelCluster,
  IconSettings,
  IconTrash2,
  IconX,
  IconZap,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import {
  formatMillionTokens,
  formatUsd,
  type KeyStatBucket,
  type KeyUsageBucket,
} from '@/utils/usage';
import {
  QUOTA_PROVIDER_TYPES,
  getAuthFileIcon,
  getAuthFileStatusMessage,
  getTypeColor,
  getTypeLabel,
  isRuntimeOnlyAuthFile,
  parsePriorityValue,
  readAuthFileServiceTierPassthrough,
  readAuthFileWebsockets,
  type QuotaProviderType,
  type ResolvedTheme,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import {
  AuthFileQuotaRefreshButton,
  AuthFileQuotaSection,
} from '@/features/authFiles/components/AuthFileQuotaSection';
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
  selected: boolean;
  resolvedTheme: ResolvedTheme;
  disableControls: boolean;
  deleting: boolean;
  statusUpdating: boolean;
  accessTokenCopying: boolean;
  priorityUpdating: boolean;
  serviceTierPassthroughUpdating: boolean;
  quotaFilterType: QuotaProviderType | null;
  // 由父组件预计算并按文件名缓存，stats 不变时引用稳定，避免列表大规模重渲染
  fileStats: KeyStatBucket;
  fileUsageStats: KeyUsageBucket;
  statusData: AuthFileStatusBarData;
  enterDelayMs?: number;
  onShowModels: (file: AuthFileItem) => void;
  onCopyName: (name: string) => void | Promise<void>;
  onDownload: (name: string) => void;
  onCopyAccessToken: (file: AuthFileItem) => void;
  onPriorityChange: (file: AuthFileItem, priority: number) => void;
  onServiceTierPassthroughChange: (file: AuthFileItem, enabled: boolean) => void;
  onOpenPrefixProxyEditor: (file: AuthFileItem) => void;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
  onDelete: (name: string) => void;
  onToggleStatus: (file: AuthFileItem, enabled: boolean) => void;
  onToggleSelect: (name: string) => void;
};

const resolveQuotaType = (file: AuthFileItem): QuotaProviderType | null => {
  const provider = resolveAuthProvider(file);
  if (!QUOTA_PROVIDER_TYPES.has(provider as QuotaProviderType)) return null;
  return provider as QuotaProviderType;
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isTruthyFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || String(value).trim().toLowerCase() === 'true';

const hasRefreshTokenValue = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0;

const authFileHasRefreshToken = (file: AuthFileItem): boolean => {
  if (isTruthyFlag(file.has_refresh_token) || isTruthyFlag(file.hasRefreshToken)) return true;

  for (const key of ['refresh_token', 'refreshToken'] as const) {
    if (hasRefreshTokenValue(file[key])) return true;
  }

  for (const key of ['token', 'tokens', 'token_data', 'tokenData'] as const) {
    const nested = file[key];
    if (!isRecordObject(nested)) continue;
    if (hasRefreshTokenValue(nested.refresh_token) || hasRefreshTokenValue(nested.refreshToken)) {
      return true;
    }
  }

  return false;
};

export const AuthFileCard = memo(function AuthFileCard(props: AuthFileCardProps) {
  const { t } = useTranslation();
  const {
    file,
    selected,
    resolvedTheme,
    disableControls,
    deleting,
    statusUpdating,
    accessTokenCopying,
    priorityUpdating,
    serviceTierPassthroughUpdating,
    quotaFilterType,
    fileStats,
    fileUsageStats,
    statusData,
    enterDelayMs,
    onShowModels,
    onCopyName,
    onDownload,
    onCopyAccessToken,
    onPriorityChange,
    onServiceTierPassthroughChange,
    onOpenPrefixProxyEditor,
    onAuthFileUpdated,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  // fileStats / fileUsageStats 已由父组件预计算（按文件名稳定引用）
  const isRuntimeOnly = useMemo(() => isRuntimeOnlyAuthFile(file), [file]);
  const fileType = (file.type || 'unknown').toLowerCase();
  const isCodexFile = fileType === 'codex' || String(file.provider ?? '').toLowerCase() === 'codex';
  const isAistudio = fileType === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;

  const typeKey = file.type || 'unknown';
  const typeColor = useMemo(() => getTypeColor(typeKey, resolvedTheme), [typeKey, resolvedTheme]);
  const typeLabel = useMemo(() => getTypeLabel(t, typeKey), [t, typeKey]);
  const providerIcon = useMemo(
    () => getAuthFileIcon(typeKey, resolvedTheme),
    [typeKey, resolvedTheme]
  );

  const websocketsEnabled = useMemo(() => readAuthFileWebsockets(file), [file]);
  const serviceTierPassthroughEnabled = useMemo(
    () => readAuthFileServiceTierPassthrough(file),
    [file]
  );
  const hasRefreshToken = useMemo(() => authFileHasRefreshToken(file), [file]);
  const websocketsBadgeLabel = websocketsEnabled ? t('auth_files.websockets_enabled_badge') : null;
  const serviceTierPassthroughBadgeLabel = serviceTierPassthroughEnabled
    ? t('auth_files.service_tier_passthrough_badge')
    : null;

  const quotaType = useMemo(() => {
    if (!quotaFilterType) return null;
    return resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;
  }, [file, quotaFilterType]);

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly;

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

  const rawStatusMessage = getAuthFileStatusMessage(file);
  const hasStatusWarning =
    Boolean(rawStatusMessage) && !HEALTHY_STATUS_MESSAGES.has(rawStatusMessage.toLowerCase());

  const priorityValue = useMemo(
    () => parsePriorityValue(file.priority ?? file['priority']),
    [file]
  );
  const currentPriority = priorityValue ?? 0;
  const [priorityDraft, setPriorityDraft] = useState(String(currentPriority));
  const [actionsExpanded, setActionsExpanded] = useState(false);

  useEffect(() => {
    setPriorityDraft(String(currentPriority));
  }, [currentPriority]);

  // 用 useEventCallback 让 handler 引用稳定，同时闭包总能拿到最新值
  const commitPriorityDraft = useEventCallback(() => {
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
  });

  const stepPriority = useEventCallback((delta: number) => {
    const draftPriority = parsePriorityValue(priorityDraft);
    const nextPriority = (draftPriority ?? currentPriority) + delta;
    setPriorityDraft(String(nextPriority));
    onPriorityChange(file, nextPriority);
  });

  const handleStepDecrement = useCallback(() => stepPriority(-1), [stepPriority]);
  const handleStepIncrement = useCallback(() => stepPriority(1), [stepPriority]);
  const handleToggleActionsExpanded = useCallback(() => {
    setActionsExpanded((expanded) => !expanded);
  }, []);
  const preventBlur = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const handlePriorityKeyDown = useEventCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      setPriorityDraft(String(currentPriority));
      event.currentTarget.blur();
    }
  });

  const handlePriorityInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPriorityDraft(event.target.value);
  }, []);

  // 行内交互的稳定化封装
  const handleToggleSelect = useEventCallback(() => onToggleSelect(file.name));
  const handleShowModels = useEventCallback(() => onShowModels(file));
  const handleDownload = useEventCallback(() => onDownload(file.name));
  const handleCopyAccessToken = useEventCallback(() => onCopyAccessToken(file));
  const handleOpenPrefixProxy = useEventCallback(() => onOpenPrefixProxyEditor(file));
  const handleToggleServiceTierPassthrough = useEventCallback(() => {
    onServiceTierPassthroughChange(file, !serviceTierPassthroughEnabled);
  });
  const handleDelete = useEventCallback(() => onDelete(file.name));
  const handleToggleStatus = useEventCallback((value: boolean) => onToggleStatus(file, value));

  const noteValue = typeof file.note === 'string' ? file.note.trim() : '';
  const totalRequests = fileUsageStats.success + fileUsageStats.failure;
  const tokenDisplay = formatMillionTokens(fileUsageStats.totalTokens);
  const authFileDisplayName = useMemo(() => file.name.replace(/\.json$/i, ''), [file.name]);
  const maskedAuthFileDisplayName = useMemo(
    () => maskAuthFileDisplayName(authFileDisplayName),
    [authFileDisplayName]
  );

  const handleCopyName = useEventCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    void onCopyName(authFileDisplayName);
  });

  const canDisplayCost = totalRequests === 0 || fileUsageStats.pricedRequests > 0;
  const costDisplay = canDisplayCost ? formatUsd(fileUsageStats.totalCost) : '--';
  const costTitle = canDisplayCost
    ? t('usage_stats.total_cost_hint')
    : t('usage_stats.cost_need_price');
  const avatarStyle = useMemo<CSSProperties>(
    () => ({
      backgroundColor: typeColor.bg,
      color: typeColor.text,
      ...(typeColor.border ? { border: typeColor.border } : {}),
    }),
    [typeColor]
  );
  // typeBadge 与 avatar 视觉相同，复用同一个对象引用
  const typeBadgeStyle = avatarStyle;
  const cardStyle = useMemo<CSSProperties | undefined>(() => {
    if (!enterDelayMs) return undefined;
    return { '--auth-file-card-enter-delay': `${enterDelayMs}ms` } as CSSProperties;
  }, [enterDelayMs]);

  const cardClassName = useMemo(() => {
    const cls = [styles.fileCard];
    if (providerCardClass) cls.push(providerCardClass);
    if (selected) cls.push(styles.fileCardSelected);
    if (file.disabled) cls.push(styles.fileCardDisabled);
    return cls.join(' ');
  }, [providerCardClass, selected, file.disabled]);

  const checkboxLabel = selected
    ? t('auth_files.batch_deselect')
    : t('auth_files.batch_select_all');
  const actionsToggleLabel = actionsExpanded ? t('common.collapse') : t('common.expand');

  return (
    <div className={cardClassName} style={cardStyle}>
      <div className={styles.fileCardLayout}>
        <div className={styles.fileCardMain}>
          <div className={styles.cardHeader}>
            {!isRuntimeOnly && (
              <SelectionCheckbox
                checked={selected}
                onChange={handleToggleSelect}
                className={styles.cardSelection}
                aria-label={checkboxLabel}
                title={checkboxLabel}
              />
            )}
            <div className={styles.providerAvatar} style={avatarStyle}>
              {providerIcon ? (
                <img src={providerIcon} alt="" className={styles.providerAvatarImage} />
              ) : (
                <span className={styles.providerAvatarFallback}>
                  {typeLabel.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className={styles.cardHeaderContent}>
              <div
                className={`${styles.cardIdentityRow} ${hasStatusWarning ? styles.cardIdentityRowWithWarning : ''}`}
              >
                <div className={styles.cardTypeGroup}>
                  <span className={styles.typeBadge} style={typeBadgeStyle}>
                    {typeLabel}
                  </span>
                  {hasRefreshToken && (
                    <span
                      className={styles.refreshTokenBadge}
                      title={t('auth_files.refresh_token_badge')}
                      role="img"
                      aria-label={t('auth_files.refresh_token_badge')}
                    >
                      R
                    </span>
                  )}
                  {websocketsBadgeLabel && (
                    <span
                      className={`${styles.featureBadge} ${styles.featureBadgeEnabled}`}
                      title={t('ai_providers.codex_websockets_hint')}
                    >
                      {websocketsBadgeLabel}
                    </span>
                  )}
                  {serviceTierPassthroughBadgeLabel && (
                    <span
                      className={`${styles.featureBadge} ${styles.featureBadgeFast}`}
                      title={t('auth_files.service_tier_passthrough_hint')}
                    >
                      {serviceTierPassthroughBadgeLabel}
                    </span>
                  )}
                </div>

                <div className={styles.fileNameRow}>
                  <button
                    type="button"
                    className={styles.fileName}
                    onClick={handleCopyName}
                    title={`${maskedAuthFileDisplayName} - ${t('common.copy')}`}
                    aria-label={t('common.copy')}
                  >
                    {maskedAuthFileDisplayName}
                  </button>
                </div>

                {!isRuntimeOnly ? (
                  <div className={styles.priorityInlineRow}>
                    <span className={styles.priorityInlineLabel}>
                      {t('auth_files.priority_display')}
                    </span>
                    <div className={styles.priorityStepper}>
                      <button
                        type="button"
                        className={styles.priorityStepButton}
                        onMouseDown={preventBlur}
                        onClick={handleStepDecrement}
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
                        onChange={handlePriorityInputChange}
                        onBlur={commitPriorityDraft}
                        onKeyDown={handlePriorityKeyDown}
                      />
                      <button
                        type="button"
                        className={styles.priorityStepButton}
                        onMouseDown={preventBlur}
                        onClick={handleStepIncrement}
                        disabled={disableControls || priorityUpdating}
                        title={t('auth_files.priority_increment')}
                        aria-label={t('auth_files.priority_increment')}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : priorityValue !== undefined ? (
                  <div className={`${styles.priorityInlineRow} ${styles.priorityInlineReadOnly}`}>
                    <span className={styles.priorityInlineLabel}>
                      {t('auth_files.priority_display')}
                    </span>
                    <span className={`${styles.metaValue} ${styles.priorityValue}`}>
                      {priorityValue}
                    </span>
                  </div>
                ) : null}

                {rawStatusMessage && hasStatusWarning && (
                  <div className={styles.cardIdentityWarning}>
                    <AuthFileWarningIndicator message={rawStatusMessage} />
                  </div>
                )}
              </div>
              {noteValue && (
                <div className={styles.noteText} title={noteValue}>
                  <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                  <span className={styles.noteValue}>{noteValue}</span>
                </div>
              )}
            </div>
          </div>

          <div className={styles.cardInsights}>
            <div className={styles.cardStats}>
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

            <div className={styles.statusPanel}>
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
                onAuthFileUpdated={onAuthFileUpdated}
              />
            )}
          </div>

          <div className={styles.cardActions}>
            <div
              className={`${styles.cardActionsMain} ${actionsExpanded ? styles.cardActionsMainExpanded : ''}`}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={handleToggleActionsExpanded}
                className={`${styles.iconButton} ${styles.mobileActionsToggle}`}
                title={actionsToggleLabel}
                aria-label={actionsToggleLabel}
                aria-expanded={actionsExpanded}
              >
                {actionsExpanded ? (
                  <IconChevronUp className={styles.actionIcon} size={18} />
                ) : (
                  <IconChevronDown className={styles.actionIcon} size={18} />
                )}
              </Button>

              <div className={styles.cardActionsContent}>
                {!isRuntimeOnly && (
                  <div className={styles.cardStatusActions}>
                    <div className={styles.statusToggle}>
                      <ToggleSwitch
                        ariaLabel={t('auth_files.status_toggle_label')}
                        checked={!file.disabled}
                        className={styles.cardToggleSwitch}
                        disabled={disableControls || statusUpdating}
                        label={t('auth_files.status_toggle_label')}
                        labelInside
                        onChange={handleToggleStatus}
                      />
                    </div>
                  </div>
                )}

                <div className={styles.cardActionCluster}>
                  {!isRuntimeOnly && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleOpenPrefixProxy}
                      className={styles.iconButton}
                      title={t('auth_files.prefix_proxy_button')}
                      disabled={disableControls}
                    >
                      <IconSettings className={styles.actionIcon} size={18} />
                    </Button>
                  )}
                  {!isRuntimeOnly && isCodexFile && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleToggleServiceTierPassthrough}
                      className={`${styles.iconButton} ${serviceTierPassthroughEnabled ? styles.fastActionButtonActive : styles.fastActionButton}`}
                      title={t('auth_files.service_tier_passthrough_hint')}
                      aria-pressed={Boolean(serviceTierPassthroughEnabled)}
                      disabled={disableControls || serviceTierPassthroughUpdating}
                    >
                      {serviceTierPassthroughUpdating ? (
                        <LoadingSpinner size={18} />
                      ) : (
                        <IconZap className={styles.actionIcon} size={18} />
                      )}
                    </Button>
                  )}
                  {!isRuntimeOnly && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleCopyAccessToken}
                      className={styles.iconButton}
                      title={t('auth_files.access_token_copy')}
                      disabled={disableControls || accessTokenCopying}
                    >
                      {accessTokenCopying ? (
                        <LoadingSpinner size={18} />
                      ) : (
                        <IconKey className={styles.actionIcon} size={18} />
                      )}
                    </Button>
                  )}
                  {showModelsButton && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleShowModels}
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
                        onClick={handleDownload}
                        className={styles.iconButton}
                        title={t('auth_files.download_button')}
                        disabled={disableControls}
                      >
                        <IconDownload className={styles.actionIcon} size={18} />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleDelete}
                        className={styles.iconButton}
                        title={t('auth_files.delete_button')}
                        disabled={disableControls || deleting}
                      >
                        {deleting ? (
                          <LoadingSpinner size={18} />
                        ) : (
                          <IconTrash2 className={styles.actionIcon} size={18} />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {!isRuntimeOnly && showQuotaLayout && quotaType && (
                <div className={styles.cardRefreshActions}>
                  <AuthFileQuotaRefreshButton
                    file={file}
                    quotaType={quotaType}
                    disableControls={disableControls}
                    onAuthFileUpdated={onAuthFileUpdated}
                    className={`${styles.iconButton} ${styles.refreshActionButton}`}
                    iconClassName={styles.actionIcon}
                    iconSize={18}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
