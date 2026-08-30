import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import { RefreshButton } from '@/components/ui/RefreshButton';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useTimeoutRegistry } from '@/hooks';
import {
  useAuthStore,
  useConfigStore,
  useNotificationStore,
  useModelsStore,
  useThemeStore,
} from '@/stores';
import { configApi, versionApi } from '@/services/api';
import { apiKeysApi } from '@/services/api/apiKeys';
import { classifyModels, type ModelGroup, type ModelInfo } from '@/utils/models';
import {
  STORAGE_KEY_AUTH,
  STORAGE_KEY_AUTH_SESSION,
  STORAGE_KEY_QUOTA_CACHE,
} from '@/utils/constants';
import iconGemini from '@/assets/icons/gemini.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconDeepseek from '@/assets/icons/deepseek.svg';
import iconMinimax from '@/assets/icons/minimax.svg';
import styles from './SystemPage.module.scss';

const MODEL_CATEGORY_ICONS: Record<string, string | { light: string; dark: string }> = {
  gpt: { light: iconOpenaiLight, dark: iconOpenaiDark },
  claude: iconClaude,
  gemini: iconGemini,
  qwen: iconQwen,
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  glm: iconGlm,
  grok: iconGrok,
  deepseek: iconDeepseek,
  minimax: iconMinimax,
};
const EMPTY_MODELS: ModelInfo[] = [];

const parseVersionSegments = (version?: string | null) => {
  if (!version) return null;
  const cleaned = version.trim().replace(/^v/i, '');
  if (!cleaned) return null;
  const parts = cleaned
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map((segment) => Number.parseInt(segment, 10))
    .filter(Number.isFinite);
  return parts.length ? parts : null;
};

const compareVersions = (latest?: string | null, current?: string | null) => {
  const latestParts = parseVersionSegments(latest);
  const currentParts = parseVersionSegments(current);
  if (!latestParts || !currentParts) return null;
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return 1;
    if (l < c) return -1;
  }
  return 0;
};

type SystemModelGroupsProps = {
  groups: ModelGroup[];
  resolvedTheme: 'light' | 'dark';
};

const SystemModelGroups = memo(function SystemModelGroups({
  groups,
  resolvedTheme,
}: SystemModelGroupsProps) {
  const { t } = useTranslation();

  const getIconForCategory = (categoryId: string): string | null => {
    const iconEntry = MODEL_CATEGORY_ICONS[categoryId];
    if (!iconEntry) return null;
    if (typeof iconEntry === 'string') return iconEntry;
    return resolvedTheme === 'dark' ? iconEntry.dark : iconEntry.light;
  };

  return (
    <div className="item-list">
      {groups.map((group) => {
        const iconSrc = getIconForCategory(group.id);
        return (
          <div key={group.id} className="item-row">
            <div className="item-meta">
              <div className={styles.groupTitle}>
                {iconSrc && <img src={iconSrc} alt="" className={styles.groupIcon} />}
                <span className="item-title">{group.label}</span>
              </div>
              <div className="item-subtitle">
                {t('system_info.models_count', { count: group.items.length })}
              </div>
            </div>
            <div className={styles.modelTags}>
              {group.items.map((model) => (
                <span
                  key={`${model.name}-${model.alias ?? 'default'}`}
                  className={styles.modelTag}
                  title={model.description || ''}
                >
                  <span className={styles.modelName}>{model.name}</span>
                  {model.alias && <span className={styles.modelAlias}>{model.alias}</span>}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
});

SystemModelGroups.displayName = 'SystemModelGroups';

function SystemModelGroupsSkeleton() {
  return (
    <div className={styles.modelsLoadingList} aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className={styles.modelsLoadingRow}>
          <div className={styles.modelsLoadingMeta}>
            <span className={`${styles.modelsLoadingLine} ${styles.modelsLoadingLinePrimary}`} />
            <span className={`${styles.modelsLoadingLine} ${styles.modelsLoadingLineSecondary}`} />
          </div>
          <div className={styles.modelsLoadingTags}>
            <span className={styles.modelsLoadingTag} />
            <span className={styles.modelsLoadingTag} />
            <span className={styles.modelsLoadingTag} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SystemPage() {
  const { t, i18n } = useTranslation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer?.isCurrentLayer ?? true;
  const requestLogWarningId = useId();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const showConfirmation = useNotificationStore((state) => state.showConfirmation);
  const resolvedTheme = useThemeStore((state) => (isCurrentLayer ? state.resolvedTheme : 'light'));
  // 窄选择器：整店订阅会让任何无关字段变化（如全局 unauthorized 事件
  // 翻转 connectionStatus 之外的状态）都重渲染整个 SystemPage。
  const connectionStatus = useAuthStore((state) =>
    isCurrentLayer ? state.connectionStatus : 'disconnected'
  );
  const serverVersion = useAuthStore((state) => (isCurrentLayer ? state.serverVersion : ''));
  const serverBuildDate = useAuthStore((state) => (isCurrentLayer ? state.serverBuildDate : ''));
  const apiBase = useAuthStore((state) => (isCurrentLayer ? state.apiBase : ''));
  const logout = useAuthStore((state) => state.logout);
  const config = useConfigStore((state) => (isCurrentLayer ? state.config : null));
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);

  const models = useModelsStore((state) => (isCurrentLayer ? state.models : EMPTY_MODELS));
  const modelsLoading = useModelsStore((state) => (isCurrentLayer ? state.loading : false));
  const modelsError = useModelsStore((state) => (isCurrentLayer ? state.error : null));
  const fetchModelsFromStore = useModelsStore((state) => state.fetchModels);

  const [modelStatus, setModelStatus] = useState<{
    type: 'success' | 'warning' | 'error' | 'muted';
    message: string;
  }>();
  const [requestLogModalOpen, setRequestLogModalOpen] = useState(false);
  const [requestLogDraft, setRequestLogDraft] = useState(false);
  const [requestLogTouched, setRequestLogTouched] = useState(false);
  const [requestLogSaving, setRequestLogSaving] = useState(false);
  const [checkingVersion, setCheckingVersion] = useState(false);

  const apiKeysCache = useRef<string[]>([]);
  const versionTapCount = useRef(0);
  const cancelVersionTapResetRef = useRef<(() => void) | null>(null);
  const { scheduleTimeout } = useTimeoutRegistry();

  const otherLabel = useMemo(
    () => (i18n.language?.toLowerCase().startsWith('zh') ? '其他' : 'Other'),
    [i18n.language]
  );
  const groupedModels = useMemo(() => classifyModels(models, { otherLabel }), [models, otherLabel]);
  const requestLogEnabled = config?.requestLog ?? false;
  const effectiveRequestLogDraft = requestLogTouched ? requestLogDraft : requestLogEnabled;
  const requestLogDirty = effectiveRequestLogDraft !== requestLogEnabled;
  const canEditRequestLog = connectionStatus === 'connected' && Boolean(config);

  const appVersion = __APP_VERSION__ || t('system_info.version_unknown');
  const apiVersion = serverVersion || t('system_info.version_unknown');
  const buildTime = serverBuildDate
    ? new Date(serverBuildDate).toLocaleString(i18n.language)
    : t('system_info.version_unknown');

  const normalizeApiKeyList = (input: unknown): string[] => {
    if (!Array.isArray(input)) return [];
    const seen = new Set<string>();
    const keys: string[] = [];

    const readBooleanFlag = (raw: unknown): boolean | undefined => {
      if (typeof raw === 'boolean') return raw;
      if (typeof raw === 'number') return raw !== 0;
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
      }
      return undefined;
    };

    input.forEach((item) => {
      const record =
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : null;
      const disabled = readBooleanFlag(record?.disabled ?? record?.disable ?? record?.isDisabled);
      const enabled = readBooleanFlag(record?.enabled ?? record?.enable ?? record?.isEnabled);
      if (disabled === true || (disabled === undefined && enabled === false)) return;
      const value =
        typeof item === 'string'
          ? item
          : record
            ? (record['api-key'] ?? record['apiKey'] ?? record.key ?? record.Key)
            : '';
      const trimmed = String(value ?? '').trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      keys.push(trimmed);
    });

    return keys;
  };

  const resolveApiKeysForModels = useCallback(async () => {
    if (apiKeysCache.current.length) {
      return apiKeysCache.current;
    }

    const configKeys = normalizeApiKeyList(config?.apiKeys);
    if (configKeys.length) {
      apiKeysCache.current = configKeys;
      return configKeys;
    }

    try {
      const list = await apiKeysApi.list();
      const normalized = normalizeApiKeyList(list);
      if (normalized.length) {
        apiKeysCache.current = normalized;
      }
      return normalized;
    } catch (err) {
      console.warn('Auto loading API keys for models failed:', err);
      return [];
    }
  }, [config?.apiKeys]);

  const fetchModels = async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}) => {
    if (connectionStatus !== 'connected') {
      setModelStatus({
        type: 'warning',
        message: t('notification.connection_required'),
      });
      return;
    }

    if (!apiBase) {
      showNotification(t('notification.connection_required'), 'warning');
      return;
    }

    if (forceRefresh) {
      apiKeysCache.current = [];
    }

    setModelStatus({ type: 'muted', message: t('system_info.models_loading') });
    try {
      const apiKeys = await resolveApiKeysForModels();
      const primaryKey = apiKeys[0];
      const list = await fetchModelsFromStore(apiBase, primaryKey, forceRefresh);
      const hasModels = list.length > 0;
      setModelStatus({
        type: hasModels ? 'success' : 'warning',
        message: hasModels
          ? t('system_info.models_count', { count: list.length })
          : t('system_info.models_empty'),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
      const suffix = message ? `: ${message}` : '';
      const text = `${t('system_info.models_error')}${suffix}`;
      setModelStatus({ type: 'error', message: text });
    }
  };

  const handleClearLoginStorage = () => {
    showConfirmation({
      title: t('system_info.clear_login_title'),
      message: t('system_info.clear_login_confirm'),
      variant: 'danger',
      confirmText: t('common.confirm'),
      onConfirm: () => {
        logout();
        if (typeof localStorage === 'undefined') return;
        const keysToRemove = [
          STORAGE_KEY_AUTH,
          STORAGE_KEY_QUOTA_CACHE,
          'isLoggedIn',
          'apiBase',
          'apiUrl',
          'managementKey',
        ];
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_KEY_AUTH_SESSION);
        }
        showNotification(t('notification.login_storage_cleared'), 'success');
      },
    });
  };

  const openRequestLogModal = useCallback(() => {
    setRequestLogTouched(false);
    setRequestLogModalOpen(true);
  }, []);

  const clearVersionTapReset = useCallback(() => {
    cancelVersionTapResetRef.current?.();
    cancelVersionTapResetRef.current = null;
  }, []);

  const handleInfoVersionTap = useCallback(() => {
    versionTapCount.current += 1;
    clearVersionTapReset();

    if (versionTapCount.current >= 7) {
      versionTapCount.current = 0;
      openRequestLogModal();
      return;
    }

    cancelVersionTapResetRef.current = scheduleTimeout(() => {
      versionTapCount.current = 0;
      cancelVersionTapResetRef.current = null;
    }, 1500);
  }, [clearVersionTapReset, openRequestLogModal, scheduleTimeout]);

  const handleRequestLogClose = useCallback(() => {
    setRequestLogModalOpen(false);
    setRequestLogTouched(false);
  }, []);

  const handleRequestLogSave = async () => {
    if (!canEditRequestLog) return;
    if (!requestLogDirty) {
      setRequestLogModalOpen(false);
      return;
    }

    const previous = requestLogEnabled;
    setRequestLogSaving(true);
    updateConfigValue('request-log', effectiveRequestLogDraft);

    try {
      await configApi.updateRequestLog(effectiveRequestLogDraft);
      clearCache('request-log');
      showNotification(t('notification.request_log_updated'), 'success');
      setRequestLogModalOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      updateConfigValue('request-log', previous);
      showNotification(
        `${t('notification.update_failed')}${message ? `: ${message}` : ''}`,
        'error'
      );
    } finally {
      setRequestLogSaving(false);
    }
  };

  const handleVersionCheck = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const data = await versionApi.checkLatest();
      const latestRaw = data?.['latest-version'] ?? data?.latest_version ?? data?.latest ?? '';
      const latest = typeof latestRaw === 'string' ? latestRaw : String(latestRaw ?? '');
      const comparison = compareVersions(latest, serverVersion);

      if (!latest) {
        showNotification(t('system_info.version_check_error'), 'error');
        return;
      }

      if (comparison === null) {
        showNotification(t('system_info.version_current_missing'), 'warning');
        return;
      }

      if (comparison > 0) {
        showNotification(t('system_info.version_update_available', { version: latest }), 'warning');
      } else {
        showNotification(t('system_info.version_is_latest'), 'success');
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : '';
      const suffix = message ? `: ${message}` : '';
      showNotification(`${t('system_info.version_check_error')}${suffix}`, 'error');
    } finally {
      setCheckingVersion(false);
    }
  }, [serverVersion, showNotification, t]);

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    fetchConfig().catch(() => {
      // ignore
    });
  }, [fetchConfig, isCurrentLayer]);

  useEffect(() => {
    if (!isCurrentLayer) return undefined;

    const taskId = window.setTimeout(() => {
      void fetchModels();
    }, 0);

    return () => window.clearTimeout(taskId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, connectionStatus, isCurrentLayer]);

  return (
    <div className={styles.container}>
      <ManagementPageHeader
        className={styles.pageHeader}
        title={t('system_info.title')}
      />
      <div className={styles.content}>
        <section className={styles.systemOverview} aria-label={t('system_info.about_title')}>
          <div className={styles.versionGrid}>
            <button
              type="button"
              className={`${styles.versionCard} ${styles.tapTile}`}
              onClick={handleInfoVersionTap}
            >
              <span className={styles.versionLabel}>{t('footer.version')}</span>
              <strong className={styles.versionValue}>{appVersion}</strong>
            </button>

            <div className={styles.versionCard}>
              <div className={styles.versionCardHeader}>
                <span className={styles.versionLabel}>{t('footer.api_version')}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={styles.tileAction}
                  onClick={() => void handleVersionCheck()}
                  loading={checkingVersion}
                  title={t('system_info.version_check_button')}
                  aria-label={t('system_info.version_check_button')}
                >
                  {t('system_info.version_check_button')}
                </Button>
              </div>
              <strong className={styles.versionValue}>{apiVersion}</strong>
            </div>

            <div className={styles.versionCard}>
              <span className={styles.versionLabel}>{t('footer.build_date')}</span>
              <strong className={styles.versionValue}>{buildTime}</strong>
            </div>
          </div>
        </section>

        <Card
          className={styles.modelsCard}
          title={t('system_info.models_title')}
          extra={
            <RefreshButton
              variant="secondary"
              size="sm"
              onClick={() => fetchModels({ forceRefresh: true })}
              loading={modelsLoading}
              label={t('common.refresh')}
            >
              {t('common.refresh')}
            </RefreshButton>
          }
        >
          <p className={styles.sectionDescription}>{t('system_info.models_desc')}</p>
          {modelStatus && !modelsLoading && !modelsError && (
            <div
              className={`status-badge ${modelStatus.type}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {modelStatus.message}
            </div>
          )}
          {modelsError && (
            <div className="error-box" role="alert">
              {modelsError}
            </div>
          )}
          {modelsLoading ? (
            <div
              className={styles.modelsLoadingState}
              role="status"
              aria-busy="true"
              aria-label={t('common.loading')}
            >
              <SystemModelGroupsSkeleton />
            </div>
          ) : models.length === 0 && !modelsError ? (
            <div className="hint">{t('system_info.models_empty')}</div>
          ) : (
            <SystemModelGroups groups={groupedModels} resolvedTheme={resolvedTheme} />
          )}
        </Card>

        <Card className={styles.dangerCard} title={t('system_info.clear_login_title')}>
          <p className={styles.sectionDescription}>{t('system_info.clear_login_desc')}</p>
          <div className={styles.clearLoginActions}>
            <Button variant="danger" onClick={handleClearLoginStorage}>
              {t('system_info.clear_login_button')}
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={requestLogModalOpen}
        onClose={handleRequestLogClose}
        title={t('basic_settings.request_log_title')}
        className={styles.requestLogModal}
        ariaDescribedBy={requestLogWarningId}
        footer={
          <>
            <Button variant="secondary" onClick={handleRequestLogClose} disabled={requestLogSaving}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRequestLogSave}
              loading={requestLogSaving}
              disabled={!canEditRequestLog || !requestLogDirty}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="request-log-modal">
          <div id={requestLogWarningId} className="status-badge warning">
            {t('basic_settings.request_log_warning')}
          </div>
          <ToggleSwitch
            label={t('basic_settings.request_log_enable')}
            labelPosition="left"
            checked={effectiveRequestLogDraft}
            disabled={!canEditRequestLog || requestLogSaving}
            onChange={(value) => {
              setRequestLogDraft(value);
              setRequestLogTouched(true);
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
