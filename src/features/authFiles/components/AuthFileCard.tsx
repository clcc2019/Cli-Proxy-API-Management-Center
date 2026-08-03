import {
  lazy,
  memo,
  Suspense,
  useCallback,
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
  IconChartLine,
  IconCopy,
  IconDownload,
  IconKey,
  IconModelCluster,
  IconSatellite,
  IconSettings,
  IconTrash2,
} from '@/components/ui/icons';
import { ProviderStatusBar } from '@/components/providers/ProviderStatusBar';
import type { AuthFileItem } from '@/types';
import { resolveAuthProvider } from '@/utils/quota';
import { formatMillionTokens, type KeyUsageBucket } from '@/utils/usage';
import {
  QUOTA_PROVIDER_TYPES,
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
import styles from '@/pages/AuthFilesPage.module.scss';

const AuthFileQuotaSection = lazy(() =>
  import('@/features/authFiles/components/AuthFileQuotaSection').then((module) => ({
    default: module.AuthFileQuotaSection,
  }))
);
const AuthFileQuotaRefreshButton = lazy(() =>
  import('@/features/authFiles/components/AuthFileQuotaSection').then((module) => ({
    default: module.AuthFileQuotaRefreshButton,
  }))
);

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
  quotaFilterType: QuotaProviderType | null;
  // 由父组件预计算并按文件名缓存，usage stats 不变时引用稳定，避免列表大规模重渲染
  fileUsageStats: KeyUsageBucket;
  statusData: AuthFileStatusBarData;
  onShowModels: (file: AuthFileItem) => void;
  onCopyName: (name: string) => void | Promise<void>;
  onDownload: (name: string) => void;
  onCopyAccessToken: (file: AuthFileItem) => void;
  onPriorityChange: (file: AuthFileItem, priority: number) => void;
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
    quotaFilterType,
    fileUsageStats,
    statusData,
    onShowModels,
    onCopyName,
    onDownload,
    onCopyAccessToken,
    onPriorityChange,
    onOpenPrefixProxyEditor,
    onAuthFileUpdated,
    onDelete,
    onToggleStatus,
    onToggleSelect,
  } = props;

  // fileUsageStats 已由父组件预计算（按文件名稳定引用）
  const isRuntimeOnly = useMemo(() => isRuntimeOnlyAuthFile(file), [file]);
  const fileType = (file.type || 'unknown').toLowerCase();
  const isAistudio = fileType === 'aistudio';
  const showModelsButton = !isRuntimeOnly || isAistudio;

  const typeKey = file.type || 'unknown';
  const typeColor = useMemo(() => getTypeColor(typeKey, resolvedTheme), [typeKey, resolvedTheme]);
  const providerLabel = useMemo(() => getTypeLabel(t, typeKey), [t, typeKey]);

  const websocketsEnabled = useMemo(() => readAuthFileWebsockets(file), [file]);
  const serviceTierPassthroughEnabled = useMemo(
    () => readAuthFileServiceTierPassthrough(file),
    [file]
  );
  const hasRefreshToken = useMemo(() => authFileHasRefreshToken(file), [file]);
  const serviceTierPassthroughBadgeLabel = serviceTierPassthroughEnabled
    ? t('auth_files.service_tier_passthrough_badge')
    : null;
  const hasAuthFileBadges =
    hasRefreshToken || Boolean(websocketsEnabled) || Boolean(serviceTierPassthroughBadgeLabel);
  const quotaType = useMemo(() => {
    if (!quotaFilterType) return null;
    return resolveQuotaType(file) === quotaFilterType ? quotaFilterType : null;
  }, [file, quotaFilterType]);

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly;

  const providerCardClass =
    quotaType === 'claude'
      ? styles.claudeCard
      : quotaType === 'codex'
        ? styles.codexCard
        : quotaType === 'kimi'
          ? styles.kimiCard
          : '';

  const priorityValue = useMemo(
    () => parsePriorityValue(file.priority ?? file['priority']),
    [file]
  );
  const currentPriority = priorityValue ?? 0;
  const [priorityDraftState, setPriorityDraftState] = useState(() => ({
    sourcePriority: currentPriority,
    value: String(currentPriority),
  }));
  const priorityDraft =
    priorityDraftState.sourcePriority === currentPriority
      ? priorityDraftState.value
      : String(currentPriority);
  const priorityControlsDisabled = disableControls || priorityUpdating;

  const resetPriorityDraft = useCallback(() => {
    const value = String(currentPriority);
    setPriorityDraftState((prev) =>
      prev.sourcePriority === currentPriority && prev.value === value
        ? prev
        : { sourcePriority: currentPriority, value }
    );
  }, [currentPriority]);

  // 用 useEventCallback 让 handler 引用稳定，同时闭包总能拿到最新值
  const commitPriorityDraft = useEventCallback(() => {
    const nextPriority = parsePriorityValue(priorityDraft);
    if (nextPriority === undefined) {
      resetPriorityDraft();
      return;
    }
    if (nextPriority !== currentPriority) {
      onPriorityChange(file, nextPriority);
      return;
    }
    resetPriorityDraft();
  });

  const stepPriority = useEventCallback((delta: number) => {
    const draftPriority = parsePriorityValue(priorityDraft);
    const nextPriority = (draftPriority ?? currentPriority) + delta;
    setPriorityDraftState({
      sourcePriority: currentPriority,
      value: String(nextPriority),
    });
    onPriorityChange(file, nextPriority);
  });

  const handleStepDecrement = useCallback(() => stepPriority(-1), [stepPriority]);
  const handleStepIncrement = useCallback(() => stepPriority(1), [stepPriority]);
  const preventBlur = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
  }, []);

  const handlePriorityKeyDown = useEventCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      resetPriorityDraft();
      event.currentTarget.blur();
    }
  });

  const handlePriorityInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setPriorityDraftState((prev) =>
        prev.sourcePriority === currentPriority && prev.value === value
          ? prev
          : { sourcePriority: currentPriority, value }
      );
    },
    [currentPriority]
  );

  // 行内交互的稳定化封装
  const handleToggleSelect = useEventCallback(() => onToggleSelect(file.name));
  const handleShowModels = useEventCallback(() => onShowModels(file));
  const handleDownload = useEventCallback(() => onDownload(file.name));
  const handleCopyAccessToken = useEventCallback(() => onCopyAccessToken(file));
  const handleOpenPrefixProxy = useEventCallback(() => onOpenPrefixProxyEditor(file));
  const handleDelete = useEventCallback(() => onDelete(file.name));
  const handleToggleStatus = useEventCallback((value: boolean) => onToggleStatus(file, value));

  const noteValue = useMemo(() => (typeof file.note === 'string' ? file.note.trim() : ''), [file]);
  const tokenDisplay = useMemo(
    () => formatMillionTokens(fileUsageStats.totalTokens),
    [fileUsageStats.totalTokens]
  );
  // toLocaleString 走 ICU 数字格式化，是较慢的内建方法；它只用于 title，
  // 没有理由每次渲染重算。
  const tokenExactLabel = useMemo(
    () => fileUsageStats.totalTokens.toLocaleString(),
    [fileUsageStats.totalTokens]
  );
  const authFileDisplayName = useMemo(() => file.name.replace(/\.json$/i, ''), [file.name]);
  const maskedAuthFileDisplayName = useMemo(
    () => maskAuthFileDisplayName(authFileDisplayName),
    [authFileDisplayName]
  );

  const handleCopyName = useEventCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    void onCopyName(authFileDisplayName);
  });

  const cardStyle = useMemo<CSSProperties>(() => {
    return {
      '--provider-accent': typeColor.text,
      '--provider-soft': typeColor.bg,
    } as CSSProperties;
  }, [typeColor]);

  const cardClassName = useMemo(() => {
    const cls = [styles.authCardShell];
    if (providerCardClass) cls.push(providerCardClass);
    if (selected) cls.push(styles.fileCardSelected);
    if (file.disabled) cls.push(styles.fileCardDisabled);
    return cls.join(' ');
  }, [providerCardClass, selected, file.disabled]);

  const checkboxLabel = selected
    ? t('auth_files.batch_deselect')
    : t('auth_files.batch_select_all');

  return (
    <article
      className={cardClassName}
      style={cardStyle}
      data-auth-file-name={file.name}
      aria-label={`${providerLabel}: ${maskedAuthFileDisplayName}`}
    >
      <div className={styles.authCardMain}>
        <header className={styles.authCardHeader}>
          {!isRuntimeOnly && (
            <SelectionCheckbox
              checked={selected}
              onChange={handleToggleSelect}
              className={`${styles.cardSelection} ${styles.authCardSelection}`}
              aria-label={checkboxLabel}
              title={checkboxLabel}
            />
          )}
          <div className={styles.authCardIdentityBody}>
            <div className={styles.authCardTitleRow}>
              <div className={styles.authCardNameGroup}>
                <button
                  type="button"
                  className={`${styles.fileName} ${styles.authCardName}`}
                  onClick={handleCopyName}
                  title={`${maskedAuthFileDisplayName} - ${t('common.copy')}`}
                  aria-label={`${t('common.copy')}: ${maskedAuthFileDisplayName}`}
                >
                  <span className={styles.fileNameText}>{maskedAuthFileDisplayName}</span>
                  <IconCopy
                    className={`${styles.fileNameCopyIcon} ${styles.authCardIconCopy}`}
                    size={13}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {!isRuntimeOnly || priorityValue !== undefined ? (
                <div className={styles.authCardPriority}>
                  <div
                    className={`${styles.priorityInlineRow} ${
                      isRuntimeOnly ? styles.priorityInlineReadOnly : ''
                    }`}
                  >
                    <span className={styles.priorityInlineLabel}>
                      {t('auth_files.priority_display')}
                    </span>
                    {!isRuntimeOnly ? (
                      <div className={styles.priorityStepper}>
                        <button
                          type="button"
                          className={styles.priorityStepButton}
                          onMouseDown={preventBlur}
                          onClick={handleStepDecrement}
                          disabled={priorityControlsDisabled}
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
                          disabled={priorityControlsDisabled}
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
                          disabled={priorityControlsDisabled}
                          title={t('auth_files.priority_increment')}
                          aria-label={t('auth_files.priority_increment')}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <span className={`${styles.metaValue} ${styles.priorityValue}`}>
                        {priorityValue}
                      </span>
                    )}
                  </div>
                </div>
              ) : null}

            </div>

            {noteValue && (
              <div className={`${styles.noteText} ${styles.authCardNote}`} title={noteValue}>
                <span className={styles.noteLabel}>{t('auth_files.note_display')}</span>
                <span className={styles.noteValue}>{noteValue}</span>
              </div>
            )}
          </div>
        </header>

        <section className={styles.authCardMetrics}>
          <div className={styles.authCardHealthPanel}>
            <div className={styles.authCardMetricHeader}>
              <span className={styles.authCardMetricTitle}>
                {t('auth_files.health_status_label')}
              </span>
              {hasAuthFileBadges && (
                <div className={`${styles.authCardMetaRail} ${styles.authCardMetricBadges}`}>
                  <div className={styles.authCardBadgeGroup}>
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
                    {websocketsEnabled && (
                      <span
                        className={`${styles.featureBadge} ${styles.featureBadgeEnabled} ${styles.featureBadgeIconOnly}`}
                        title={t('ai_providers.codex_websockets_hint')}
                        role="img"
                        aria-label={t('auth_files.websockets_enabled_badge')}
                      >
                        <IconSatellite
                          className={styles.authCardFeatureIcon}
                          size={13}
                          aria-hidden="true"
                        />
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
                </div>
              )}
              <span className={styles.authCardTokenMetric} title={tokenExactLabel}>
                <IconChartLine
                  className={styles.authCardTokenIcon}
                  size={13}
                  aria-hidden="true"
                />
                <strong className={styles.authCardTokenValue}>{tokenDisplay}</strong>
              </span>
            </div>
            <ProviderStatusBar statusData={statusData} styles={styles} interactionMode="summary" />
          </div>

          {showQuotaLayout && quotaType && (
            <div className={styles.authCardQuotaSlot}>
              <Suspense
                fallback={
                  <div
                    className={`${styles.quotaSection} ${styles.authCardQuota}`}
                    aria-hidden="true"
                  >
                    <div className={styles.quotaContent} />
                  </div>
                }
              >
                <AuthFileQuotaSection
                  file={file}
                  quotaType={quotaType}
                  disableControls={disableControls}
                  onAuthFileUpdated={onAuthFileUpdated}
                />
              </Suspense>
            </div>
          )}
        </section>

        <footer className={styles.authCardFooter}>
          <div className={styles.authCardFooterMain}>
            {!isRuntimeOnly && (
              <div className={styles.authCardStatusControl}>
                <div className={styles.statusToggle}>
                  <ToggleSwitch
                    ariaLabel={t('auth_files.status_toggle_label')}
                    checked={!file.disabled}
                    className={`${styles.cardToggleSwitch} ${styles.authCardToggleSwitch}`}
                    disabled={disableControls || statusUpdating}
                    label={t('auth_files.status_toggle_label')}
                    labelInside
                    onChange={handleToggleStatus}
                  />
                </div>
              </div>
            )}

            <div className={styles.authCardPrimaryActions}>
              {!isRuntimeOnly && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleOpenPrefixProxy}
                  className={styles.authCardActionButton}
                  title={t('auth_files.prefix_proxy_button')}
                  aria-label={t('auth_files.prefix_proxy_button')}
                  disabled={disableControls}
                >
                  <IconSettings
                    className={`${styles.actionIcon} ${styles.authCardActionIcon}`}
                    size={18}
                  />
                </Button>
              )}
              {!isRuntimeOnly && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyAccessToken}
                  className={styles.authCardActionButton}
                  title={t('auth_files.access_token_copy')}
                  aria-label={t('auth_files.access_token_copy')}
                  disabled={disableControls || accessTokenCopying}
                >
                  {accessTokenCopying ? (
                    <LoadingSpinner size={18} />
                  ) : (
                    <IconKey
                      className={`${styles.actionIcon} ${styles.authCardActionIcon}`}
                      size={18}
                    />
                  )}
                </Button>
              )}
              {showModelsButton && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleShowModels}
                  className={styles.authCardActionButton}
                  title={t('auth_files.models_button')}
                  aria-label={t('auth_files.models_button')}
                  disabled={disableControls}
                >
                  <IconModelCluster
                    className={`${styles.actionIcon} ${styles.authCardActionIcon}`}
                    size={18}
                  />
                </Button>
              )}
              {!isRuntimeOnly && (
                <div className={styles.authCardUtilityActions}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDownload}
                    className={styles.authCardActionButton}
                    title={t('auth_files.download_button')}
                    aria-label={t('auth_files.download_button')}
                    disabled={disableControls}
                  >
                    <IconDownload
                      className={`${styles.actionIcon} ${styles.authCardActionIcon}`}
                      size={18}
                    />
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDelete}
                    className={styles.authCardActionButton}
                    title={t('auth_files.delete_button')}
                    aria-label={t('auth_files.delete_button')}
                    disabled={disableControls || deleting}
                  >
                    {deleting ? (
                      <LoadingSpinner size={18} />
                    ) : (
                      <IconTrash2
                        className={styles.actionIcon}
                        size={18}
                      />
                    )}
                  </Button>
                </div>
              )}
            </div>

            {!isRuntimeOnly && showQuotaLayout && quotaType && (
              <div className={styles.authCardRefresh}>
                <Suspense fallback={null}>
                  <AuthFileQuotaRefreshButton
                    file={file}
                    quotaType={quotaType}
                    disableControls={disableControls}
                    onAuthFileUpdated={onAuthFileUpdated}
                    className={`${styles.authCardActionButton} ${styles.authCardRefreshButton}`}
                    iconClassName={`${styles.actionIcon} ${styles.authCardActionIcon}`}
                    iconSize={18}
                  />
                </Suspense>
              </div>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
});
