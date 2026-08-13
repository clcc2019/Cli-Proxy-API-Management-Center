import { lazy, memo, Suspense, useCallback, useMemo, useState, type KeyboardEvent } from 'react';
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
import type { AuthFileItem, ResolvedTheme } from '@/types';
import {
  isRuntimeOnlyAuthFile,
  resolveQuotaProviderType,
  type QuotaProviderType,
} from '@/utils/quota';
import { formatMillionTokens, type KeyUsageBucket } from '@/utils/usage';
import {
  getAuthFileIcon,
  getTypeLabel,
  parsePriorityValue,
  readAuthFileServiceTierPassthrough,
  readAuthFileWebsockets,
} from '@/features/authFiles/constants';
import type { AuthFileStatusBarData } from '@/features/authFiles/hooks/useAuthFilesStatusBarCache';
import { AuthFileReauthorization } from '@/features/authFiles/components/AuthFileReauthorization';
import refreshStyles from '@/pages/AuthFilesPageRefresh.module.scss';

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
  const providerLabel = useMemo(() => getTypeLabel(t, typeKey), [t, typeKey]);
  const providerIconSrc = useMemo(
    () => getAuthFileIcon(typeKey, resolvedTheme),
    [resolvedTheme, typeKey]
  );

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
    return resolveQuotaProviderType(file) === quotaFilterType ? quotaFilterType : null;
  }, [file, quotaFilterType]);

  const showQuotaLayout = Boolean(quotaType) && !isRuntimeOnly;

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

  const cardClassName = useMemo(() => {
    const cls = [refreshStyles.credentialCard];
    if (selected) cls.push(refreshStyles.credentialCardSelected);
    if (file.disabled) cls.push(refreshStyles.credentialCardDisabled);
    return cls.join(' ');
  }, [selected, file.disabled]);

  const checkboxLabel = selected
    ? t('auth_files.deselect_file', { name: maskedAuthFileDisplayName })
    : t('auth_files.select_file', { name: maskedAuthFileDisplayName });

  return (
    <article
      className={cardClassName}
      aria-label={`${providerLabel}: ${maskedAuthFileDisplayName}`}
    >
      <div className={refreshStyles.cardMain}>
        <header className={refreshStyles.cardHeader}>
          {!isRuntimeOnly && (
            <SelectionCheckbox
              checked={selected}
              onChange={handleToggleSelect}
              className={refreshStyles.cardSelection}
              aria-label={checkboxLabel}
              title={checkboxLabel}
            />
          )}
          <div className={refreshStyles.cardIdentity}>
            <div className={refreshStyles.cardTitleRow}>
              <div className={refreshStyles.cardNameGroup}>
                <span className={refreshStyles.providerBadge} title={providerLabel}>
                  {providerIconSrc ? (
                    <img src={providerIconSrc} alt="" className={refreshStyles.providerBadgeIcon} />
                  ) : (
                    <span className={refreshStyles.providerBadgeFallback} aria-hidden="true">
                      {providerLabel.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className={refreshStyles.providerBadgeLabel}>{providerLabel}</span>
                </span>
                <button
                  type="button"
                  className={refreshStyles.cardNameButton}
                  onClick={handleCopyName}
                  title={`${maskedAuthFileDisplayName} - ${t('common.copy')}`}
                  aria-label={`${t('common.copy')}: ${maskedAuthFileDisplayName}`}
                >
                  <span className={refreshStyles.cardNameText}>{maskedAuthFileDisplayName}</span>
                  <IconCopy className={refreshStyles.cardCopyIcon} size={13} aria-hidden="true" />
                </button>
              </div>

              {!isRuntimeOnly || priorityValue !== undefined ? (
                <div className={refreshStyles.cardPriority}>
                  <div
                    className={`${refreshStyles.priorityControl} ${
                      isRuntimeOnly ? refreshStyles.priorityReadOnly : ''
                    }`}
                  >
                    <span className={refreshStyles.priorityLabel}>
                      {t('auth_files.priority_display')}
                    </span>
                    {!isRuntimeOnly ? (
                      <div className={refreshStyles.priorityStepper}>
                        <button
                          type="button"
                          className={refreshStyles.priorityStepButton}
                          onMouseDown={preventBlur}
                          onClick={handleStepDecrement}
                          disabled={priorityControlsDisabled}
                          title={t('auth_files.priority_decrement')}
                          aria-label={t('auth_files.priority_decrement')}
                        >
                          -
                        </button>
                        <input
                          className={refreshStyles.priorityInput}
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
                          className={refreshStyles.priorityStepButton}
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
                      <span className={refreshStyles.priorityValue}>{priorityValue}</span>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {noteValue && (
              <div className={refreshStyles.cardNote} title={noteValue}>
                <span className={refreshStyles.noteLabel}>{t('auth_files.note_display')}</span>
                <span className={refreshStyles.noteValue}>{noteValue}</span>
              </div>
            )}
          </div>
        </header>

        <section className={refreshStyles.metricsPanel}>
          <div className={refreshStyles.healthPanel}>
            <div className={refreshStyles.metricHeader}>
              <span className={refreshStyles.metricTitle}>
                {t('auth_files.health_status_label')}
              </span>
              {hasAuthFileBadges && (
                <div className={refreshStyles.metricBadges}>
                  <div className={refreshStyles.badgeGroup}>
                    {hasRefreshToken && (
                      <span
                        className={refreshStyles.refreshTokenBadge}
                        title={t('auth_files.refresh_token_badge')}
                        role="img"
                        aria-label={t('auth_files.refresh_token_badge')}
                      >
                        R
                      </span>
                    )}
                    {websocketsEnabled && (
                      <span
                        className={`${refreshStyles.featureBadge} ${refreshStyles.featureBadgeEnabled} ${refreshStyles.featureBadgeIconOnly}`}
                        title={t('ai_providers.codex_websockets_hint')}
                        role="img"
                        aria-label={t('auth_files.websockets_enabled_badge')}
                      >
                        <IconSatellite
                          className={refreshStyles.featureIcon}
                          size={13}
                          aria-hidden="true"
                        />
                      </span>
                    )}
                    {serviceTierPassthroughBadgeLabel && (
                      <span
                        className={`${refreshStyles.featureBadge} ${refreshStyles.featureBadgeFast}`}
                        title={t('auth_files.service_tier_passthrough_hint')}
                      >
                        {serviceTierPassthroughBadgeLabel}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <span className={refreshStyles.tokenMetric} title={tokenExactLabel}>
                <IconChartLine className={refreshStyles.tokenIcon} size={13} aria-hidden="true" />
                <strong className={refreshStyles.tokenValue}>{tokenDisplay}</strong>
              </span>
            </div>
            <ProviderStatusBar
              statusData={statusData}
              styles={refreshStyles}
              interactionMode="summary"
            />
          </div>

          {showQuotaLayout && quotaType && (
            <div className={refreshStyles.quotaSlot}>
              <Suspense
                fallback={
                  <div className={refreshStyles.quotaSection} aria-hidden="true">
                    <div className={refreshStyles.quotaContent} />
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

        {!isRuntimeOnly && fileType === 'codex' && (
          <AuthFileReauthorization
            file={file}
            disableControls={disableControls}
            onAuthFileUpdated={onAuthFileUpdated}
          />
        )}

        <footer className={refreshStyles.cardFooter}>
          <div className={refreshStyles.cardFooterMain}>
            <div className={refreshStyles.cardFooterLeft}>
              {!isRuntimeOnly && (
                <div className={refreshStyles.cardStatusControl}>
                  <div className={refreshStyles.cardStatusToggle}>
                    <ToggleSwitch
                      ariaLabel={t('auth_files.status_toggle_label')}
                      checked={!file.disabled}
                      className={refreshStyles.cardToggleSwitch}
                      disabled={disableControls || statusUpdating}
                      label={t('auth_files.status_toggle_label')}
                      labelInside
                      onChange={handleToggleStatus}
                    />
                  </div>
                </div>
              )}

              <div className={refreshStyles.cardActions}>
                {!isRuntimeOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleOpenPrefixProxy}
                    className={refreshStyles.cardActionButton}
                    title={t('auth_files.prefix_proxy_button')}
                    aria-label={t('auth_files.prefix_proxy_button')}
                    disabled={disableControls}
                  >
                    <IconSettings className={refreshStyles.cardActionIcon} size={18} />
                  </Button>
                )}
                {!isRuntimeOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyAccessToken}
                    className={refreshStyles.cardActionButton}
                    title={t('auth_files.access_token_copy')}
                    aria-label={t('auth_files.access_token_copy')}
                    disabled={disableControls || accessTokenCopying}
                  >
                    {accessTokenCopying ? (
                      <LoadingSpinner size={18} />
                    ) : (
                      <IconKey className={refreshStyles.cardActionIcon} size={18} />
                    )}
                  </Button>
                )}
                {showModelsButton && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleShowModels}
                    className={`${refreshStyles.cardActionButton} ${isRuntimeOnly ? refreshStyles.runtimeModelAction : ''}`}
                    title={t('auth_files.models_button')}
                    aria-label={t('auth_files.models_button')}
                    disabled={disableControls}
                  >
                    <IconModelCluster className={refreshStyles.cardActionIcon} size={18} />
                    {isRuntimeOnly && (
                      <span className={refreshStyles.runtimeModelActionLabel} aria-hidden="true">
                        {t('auth_files.models_button')}
                      </span>
                    )}
                  </Button>
                )}
                {!isRuntimeOnly && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDownload}
                      className={refreshStyles.cardActionButton}
                      title={t('auth_files.download_button')}
                      aria-label={t('auth_files.download_button')}
                      disabled={disableControls}
                    >
                      <IconDownload className={refreshStyles.cardActionIcon} size={18} />
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleDelete}
                      className={refreshStyles.cardActionButton}
                      title={t('auth_files.delete_button')}
                      aria-label={t('auth_files.delete_button')}
                      disabled={disableControls || deleting}
                    >
                      {deleting ? (
                        <LoadingSpinner size={18} />
                      ) : (
                        <IconTrash2 className={refreshStyles.cardActionIcon} size={18} />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!isRuntimeOnly && showQuotaLayout && quotaType && (
              <div className={refreshStyles.cardRefresh}>
                <Suspense fallback={null}>
                  <AuthFileQuotaRefreshButton
                    file={file}
                    quotaType={quotaType}
                    disableControls={disableControls}
                    onAuthFileUpdated={onAuthFileUpdated}
                    className={refreshStyles.cardActionButton}
                    iconClassName={refreshStyles.cardActionIcon}
                    iconSize={16}
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
