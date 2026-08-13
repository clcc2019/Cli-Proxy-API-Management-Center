import {
  memo,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { Button } from '@/components/ui/Button';
import { IconAlertTriangle } from '@/components/ui/icons';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { useNotificationStore, useQuotaStore } from '@/stores';
import { authFilesApi } from '@/services/api';
import type {
  AuthFileItem,
  CodexQuotaState,
  CodexRateLimitResetConsumePayload,
  CodexRateLimitResetCredit,
} from '@/types';
import {
  getQuotaProgressLevel,
  normalizeQuotaProgressPercent,
  type QuotaProviderType,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import { resolveQuotaErrorMessage } from '@/features/authFiles/constants';
import { mergeAuthFileUpdatePreservingRequestStats } from '@/features/authFiles/stats';

import {
  getAuthFileQuotaConfig,
  refreshAuthFileQuota,
  useAuthFileQuotaRefreshing,
  type AuthFileQuotaState,
} from '@/features/authFiles/quotaRefresh';
import styles from '@/pages/AuthFilesPageRefresh.module.scss';

export type AuthFileQuotaSectionProps = {
  file: AuthFileItem;
  quotaType: QuotaProviderType;
  disableControls: boolean;
  onAuthFileUpdated?: (file: AuthFileItem) => void;
};

type AuthFileQuotaRefreshButtonProps = AuthFileQuotaSectionProps & {
  className?: string;
  iconClassName?: string;
  iconSize?: number;
};

type QuotaProgressBarProps = {
  percent: number | null;
  highThreshold?: number;
  mediumThreshold?: number;
  ariaLabel?: string;
  ariaValueText?: string;
};

const QuotaProgressBar = memo(function QuotaProgressBar({
  percent,
  highThreshold,
  mediumThreshold,
  ariaLabel,
  ariaValueText,
}: QuotaProgressBarProps) {
  const normalized = normalizeQuotaProgressPercent(percent);
  const progressLevel = getQuotaProgressLevel(percent, highThreshold, mediumThreshold);
  const fillClass =
    progressLevel === 'high'
      ? styles.quotaBarFillHigh
      : progressLevel === 'medium'
        ? styles.quotaBarFillMedium
        : progressLevel === 'low'
          ? styles.quotaBarFillLow
          : styles.quotaBarFillUnknown;
  const widthPercent = Math.round(normalized ?? 0);
  const ariaValue = normalized === null ? undefined : Math.round(normalized);
  const visualPercent = widthPercent > 0 ? Math.max(widthPercent, 2) : 0;
  const fillStyle = useMemo(
    () => ({ transform: `scaleX(${visualPercent / 100})` }),
    [visualPercent]
  );

  return (
    <div
      className={styles.quotaBar}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={ariaValue}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
    >
      <div className={`${styles.quotaBarFill} ${fillClass}`} style={fillStyle} />
    </div>
  );
});

const readResetCreditCount = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
};

const resolveResetCreditCountFromConsume = (
  payload: CodexRateLimitResetConsumePayload
): number | null => {
  const direct = readResetCreditCount(payload.available_count ?? payload.availableCount);
  if (direct !== null) return direct;
  const credits = payload.rate_limit_reset_credits ?? payload.rateLimitResetCredits;
  if (credits && typeof credits === 'object') {
    return readResetCreditCount(credits.available_count ?? credits.availableCount);
  }
  return null;
};

const resolveConsumeCode = (payload: CodexRateLimitResetConsumePayload): string => {
  const code = payload.code ?? payload.consume?.code ?? '';
  return String(code).trim();
};

const resetCreditExpirationTime = (credit: CodexRateLimitResetCredit): number | null => {
  const raw = credit.expires_at ?? credit.expiresAt;
  if (raw === null || raw === undefined || raw === '') return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const milliseconds = numeric < 1e12 ? numeric * 1000 : numeric;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const parsed = new Date(String(raw)).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const formatResetCreditExpiration = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const resolveAuthFileSnapshot = (
  file: AuthFileItem,
  payload: CodexRateLimitResetConsumePayload
): AuthFileItem | null => {
  const snapshot = payload.auth_file ?? payload.authFile;
  return snapshot && typeof snapshot === 'object'
    ? mergeAuthFileUpdatePreservingRequestStats(file, snapshot)
    : null;
};

function useAuthFileQuotaRefresh(props: AuthFileQuotaSectionProps) {
  const { file, quotaType, disableControls } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;

  const quota = useQuotaStore((state) => {
    if (!isCurrentLayer) return undefined;
    if (quotaType === 'claude') {
      return state.claudeQuota[file.name] as AuthFileQuotaState | undefined;
    }
    if (quotaType === 'codex') {
      return state.codexQuota[file.name] as AuthFileQuotaState | undefined;
    }
    return state.kimiQuota[file.name] as AuthFileQuotaState | undefined;
  });

  const refreshQuotaForFile = useCallback(async () => {
    if (!isCurrentLayer) return;
    const result = await refreshAuthFileQuota({
      file,
      quotaType,
      disableControls,
      t,
      onAuthFileUpdated: props.onAuthFileUpdated,
    });

    if (result.status === 'success') {
      showNotification(t('auth_files.quota_refresh_success', { name: file.name }), 'success');
    } else if (result.status === 'error') {
      showNotification(
        t('auth_files.quota_refresh_failed', { name: file.name, message: result.message }),
        'error'
      );
    }
  }, [
    disableControls,
    file,
    isCurrentLayer,
    props.onAuthFileUpdated,
    quotaType,
    showNotification,
    t,
  ]);

  const quotaStatus = quota?.status ?? 'idle';
  const isQuotaRefreshing = useAuthFileQuotaRefreshing(quotaType, file.name);
  const canRefreshQuota = isCurrentLayer && !disableControls && !file.disabled;
  const config = getAuthFileQuotaConfig(quotaType);

  return {
    canRefreshQuota,
    isQuotaRefreshing,
    quota,
    quotaStatus,
    refreshQuotaForFile,
    refreshLabel: t(`${config.i18nPrefix}.refresh_button`),
  };
}

export const AuthFileQuotaRefreshButton = memo(function AuthFileQuotaRefreshButton(
  props: AuthFileQuotaRefreshButtonProps
) {
  const { className, iconClassName, iconSize = 14 } = props;
  const { canRefreshQuota, isQuotaRefreshing, refreshQuotaForFile, refreshLabel } =
    useAuthFileQuotaRefresh(props);

  const handleRefreshClick = useCallback(() => {
    void refreshQuotaForFile();
  }, [refreshQuotaForFile]);

  return (
    <RefreshButton
      variant="secondary"
      size="sm"
      onClick={handleRefreshClick}
      disabled={!canRefreshQuota}
      className={className}
      loading={isQuotaRefreshing}
      label={refreshLabel}
      iconClassName={iconClassName}
      iconSize={iconSize}
    />
  );
});

export const AuthFileQuotaSection = memo(function AuthFileQuotaSection(
  props: AuthFileQuotaSectionProps
) {
  const { file, quotaType, onAuthFileUpdated } = props;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const setCodexQuota = useQuotaStore((state) => state.setCodexQuota);
  const [resetCreditConsuming, setResetCreditConsuming] = useState(false);
  const {
    canRefreshQuota,
    isQuotaRefreshing,
    quota,
    quotaStatus,
    refreshLabel,
    refreshQuotaForFile,
  } = useAuthFileQuotaRefresh(props);
  const config = getAuthFileQuotaConfig(quotaType);
  const quotaErrorMessage = resolveQuotaErrorMessage(
    t,
    quota?.errorStatus,
    quota?.error || t('common.unknown_error')
  );
  const quotaErrorDetails = t(`${config.i18nPrefix}.load_failed`, {
    message: quotaErrorMessage,
  });
  const isRefreshingCachedQuota =
    quotaStatus === 'loading' && quota?.__hasCachedQuotaSnapshot === true;
  const hasDisplayableQuotaSnapshot = quotaStatus === 'success' || isRefreshingCachedQuota;
  const suppressQuotaBodyDuringEmptyRefresh = isQuotaRefreshing && !hasDisplayableQuotaSnapshot;
  const codexQuota = quotaType === 'codex' ? (quota as CodexQuotaState | undefined) : undefined;
  const resetCreditCount = codexQuota?.rateLimitResetCreditsAvailable ?? null;
  const resetCreditExpiration = useMemo(() => {
    const credits = (codexQuota?.rateLimitResetCredits ?? [])
      .filter((credit) => {
        const status = String(credit.status ?? '')
          .trim()
          .toLowerCase();
        return status === '' || status === 'available';
      })
      .map((credit) => ({ credit, expiresAt: resetCreditExpirationTime(credit) }))
      .sort(
        (left, right) =>
          (left.expiresAt ?? Number.MAX_SAFE_INTEGER) - (right.expiresAt ?? Number.MAX_SAFE_INTEGER)
      );
    if (credits.length === 0) {
      return {
        nearestLabel: null,
        tooltip:
          resetCreditCount && resetCreditCount > 0
            ? t('codex_quota.reset_credit_expiry_unknown')
            : '',
      };
    }
    const lines = credits.map(({ expiresAt }, index) =>
      expiresAt === null
        ? t('codex_quota.reset_credit_never_expires_item', { index: index + 1 })
        : t('codex_quota.reset_credit_expires_item', {
            index: index + 1,
            time: formatResetCreditExpiration(expiresAt),
          })
    );
    if (resetCreditCount !== null && resetCreditCount > credits.length) {
      lines.push(
        t('codex_quota.reset_credit_expiry_partial', {
          count: resetCreditCount - credits.length,
        })
      );
    }
    const nearest = credits.find(({ expiresAt }) => expiresAt !== null)?.expiresAt ?? null;
    return {
      nearestLabel:
        nearest === null
          ? t('codex_quota.reset_credit_never_expires')
          : t('codex_quota.reset_credit_nearest_expiry', {
              time: formatResetCreditExpiration(nearest),
            }),
      tooltip: lines.join('\n'),
    };
  }, [codexQuota?.rateLimitResetCredits, resetCreditCount, t]);
  const showResetCredits =
    quotaType === 'codex' && (quotaStatus === 'success' || isRefreshingCachedQuota);
  const canConsumeResetCredit =
    showResetCredits &&
    quotaStatus !== 'loading' &&
    canRefreshQuota &&
    !resetCreditConsuming &&
    resetCreditCount !== null &&
    resetCreditCount > 0;

  const handleConsumeResetCredit = useCallback(async () => {
    if (!canConsumeResetCredit) return;
    setResetCreditConsuming(true);
    try {
      const authIndex = normalizeAuthIndex(file['auth_index'] ?? file.authIndex) ?? undefined;
      const payload = await authFilesApi.consumeCodexRateLimitResetCredit(file.name, authIndex);
      const code = resolveConsumeCode(payload);
      const nextCount = resolveResetCreditCountFromConsume(payload);
      if (nextCount !== null) {
        setCodexQuota((prev) => {
          const previous = prev[file.name] ?? { status: 'success', windows: [] };
          const nextStatus = previous.status === 'error' ? 'success' : previous.status;
          if (
            previous.status === nextStatus &&
            previous.rateLimitResetCreditsAvailable === nextCount
          ) {
            return prev;
          }
          return {
            ...prev,
            [file.name]: {
              ...previous,
              status: nextStatus,
              rateLimitResetCreditsAvailable: nextCount,
            },
          };
        });
      }
      const authFile = resolveAuthFileSnapshot(file, payload);
      if (authFile) {
        onAuthFileUpdated?.(authFile);
      }

      if (code === 'reset' || code === 'already_redeemed') {
        showNotification(
          t('codex_quota.reset_credit_consume_success', { count: nextCount ?? resetCreditCount }),
          'success'
        );
      } else if (code === 'no_credit') {
        showNotification(t('codex_quota.reset_credit_no_credit'), 'warning');
      } else if (code === 'nothing_to_reset') {
        showNotification(t('codex_quota.reset_credit_nothing_to_reset'), 'info');
      } else {
        showNotification(t('codex_quota.reset_credit_consume_result', { code }), 'info');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('common.unknown_error');
      showNotification(t('codex_quota.reset_credit_consume_failed', { message }), 'error');
    } finally {
      setResetCreditConsuming(false);
    }
  }, [
    canConsumeResetCredit,
    file,
    onAuthFileUpdated,
    resetCreditCount,
    setCodexQuota,
    showNotification,
    t,
  ]);
  const handleConsumeResetCreditClick = useCallback(() => {
    void handleConsumeResetCredit();
  }, [handleConsumeResetCredit]);
  const handleRefreshClick = useCallback(() => {
    void refreshQuotaForFile();
  }, [refreshQuotaForFile]);
  const quotaRenderHelpers = useMemo(() => ({ styles, QuotaProgressBar, item: file }), [file]);
  const renderedQuotaItems = useMemo(
    () => (quota ? (config.renderQuotaItems(quota, t, quotaRenderHelpers) as ReactNode) : null),
    [config, quota, quotaRenderHelpers, t]
  );

  return (
    <div className={styles.quotaSection}>
      <div className={styles.quotaSectionHeader}>
        <span className={styles.quotaSectionTitle}>{t(`${config.i18nPrefix}.title`)}</span>
        {showResetCredits && (
          <div className={styles.codexResetCredits}>
            <div className={styles.codexResetCreditsText}>
              <span className={styles.codexPlanLabel}>{t('codex_quota.reset_credit_label')}</span>
              <span
                className={styles.codexPlanValue}
                title={resetCreditExpiration.tooltip || undefined}
                aria-label={resetCreditExpiration.tooltip || undefined}
                tabIndex={resetCreditExpiration.tooltip ? 0 : undefined}
              >
                {resetCreditCount === null
                  ? t('codex_quota.reset_credit_unknown')
                  : t('codex_quota.reset_credit_count', { count: resetCreditCount })}
              </span>
              {resetCreditExpiration.nearestLabel ? (
                <span className={styles.codexResetCreditExpiry}>
                  {resetCreditExpiration.nearestLabel}
                </span>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConsumeResetCreditClick}
              disabled={!canConsumeResetCredit}
              className={styles.codexResetCreditButton}
              title={t('codex_quota.reset_credit_consume_button')}
              aria-label={t('codex_quota.reset_credit_consume_button')}
              aria-busy={resetCreditConsuming}
            >
              {resetCreditConsuming ? (
                <LoadingSpinner size={12} />
              ) : (
                t('codex_quota.reset_credit_consume_button')
              )}
            </Button>
          </div>
        )}
      </div>
      <div className={styles.quotaContent} aria-busy={isQuotaRefreshing || undefined}>
        <div
          className={`${styles.quotaContentBody} ${
            isQuotaRefreshing ? styles.quotaContentBodyHidden : ''
          }`}
          aria-hidden={isQuotaRefreshing || undefined}
        >
          {!suppressQuotaBodyDuringEmptyRefresh &&
            (quotaStatus === 'loading' && !isRefreshingCachedQuota ? (
              <div className={styles.quotaLoadingState} role="status" aria-busy="true">
                <LoadingSpinner size={16} />
                <span>{t(`${config.i18nPrefix}.loading`)}</span>
              </div>
            ) : quotaStatus === 'error' ? (
              <div className={styles.quotaError} role="alert">
                <button
                  type="button"
                  className={styles.cardErrorTrigger}
                  title={quotaErrorDetails}
                  aria-label={`${t('auth_files.quota_error_summary')}: ${quotaErrorDetails}`}
                >
                  <IconAlertTriangle size={13} aria-hidden="true" />
                  <span className={styles.cardErrorSummary}>
                    {t('auth_files.quota_error_summary')}
                  </span>
                  <span className={styles.cardErrorTooltip} role="tooltip">
                    {quotaErrorDetails}
                  </span>
                </button>
              </div>
            ) : quota && quotaStatus !== 'idle' ? (
              renderedQuotaItems
            ) : (
              <button
                type="button"
                className={`${styles.quotaMessage} ${styles.quotaMessageAction}`}
                onClick={handleRefreshClick}
                disabled={!canRefreshQuota}
                title={refreshLabel}
              >
                {t(`${config.i18nPrefix}.idle`)}
              </button>
            ))}
        </div>
        {isQuotaRefreshing && (
          <div
            className={styles.quotaRefreshingState}
            role="status"
            aria-label={t(`${config.i18nPrefix}.loading`)}
          >
            <LoadingSpinner size={16} />
          </div>
        )}
      </div>
    </div>
  );
});
