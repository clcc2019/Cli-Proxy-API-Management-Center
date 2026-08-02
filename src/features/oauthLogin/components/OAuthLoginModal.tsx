/**
 * OAuth 登录分步向导
 *
 * 支持两种形态：
 * - 浏览器回调流程（anthropic / xai，以及 Codex 兜底模式）：3 步
 * - 设备码流程（Codex 默认模式 / kimi）：2 步，没有回调粘贴步
 *
 * 反馈全部内联——本项目的 toast 已全局关闭。
 */

import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInterval } from '@/hooks';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconExternalLink,
  IconKey,
  IconLoader2,
  IconTimer,
} from '@/components/ui/icons';
import { OAUTH_TIMEOUT_MS, type OAuthFlowState } from '../useOAuthFlow';
import { getProviderAuthKey, type OAuthProviderDescriptor } from '../providers';
import { CopyLinkButton } from './CopyLinkButton';
import styles from './OAuthLoginModal.module.scss';

type OAuthLoginModalProps = {
  open: boolean;
  provider: OAuthProviderDescriptor | null;
  state: OAuthFlowState;
  onClose: () => void;
  onRestart: () => void;
  onUseBrowserFallback: () => void;
  onCancel: () => void;
  onSubmitCallback: (redirectUrl: string) => void;
  onGotoAuthFiles: () => void;
};

const formatDuration = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

type StepStatus = 'done' | 'current' | 'pending';

const ELAPSED_TICK_MS = 1_000;

interface OAuthElapsedTimeProps {
  open: boolean;
  startedAt: number;
  timeoutMs: number;
}

const OAuthElapsedTime = memo(function OAuthElapsedTime({
  open,
  startedAt,
  timeoutMs,
}: OAuthElapsedTimeProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useInterval(() => setNow(Date.now()), open ? ELAPSED_TICK_MS : null);

  const elapsedLabel = `${formatDuration(Math.min(now - startedAt, timeoutMs))} / ${formatDuration(timeoutMs)}`;

  return (
    <span className={styles.elapsed}>
      {t('auth_login.waiting_elapsed', { elapsed: elapsedLabel })}
    </span>
  );
});

function StepIndicator({
  index,
  title,
  status,
}: {
  index: number;
  title: string;
  status: StepStatus;
}) {
  const indexClass = [
    styles.stepIndex,
    status === 'done' ? styles.stepIndexDone : '',
    status === 'pending' ? styles.stepIndexPending : '',
  ]
    .filter(Boolean)
    .join(' ');
  const itemClass = [
    styles.stepItem,
    status === 'current' ? styles.stepItemCurrent : '',
    status === 'done' ? styles.stepItemDone : '',
    status === 'pending' ? styles.stepItemPending : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={itemClass} aria-current={status === 'current' ? 'step' : undefined}>
      <span className={indexClass} aria-hidden="true">
        {status === 'done' ? '✓' : index}
      </span>
      <span className={styles.stepTitle}>{title}</span>
    </li>
  );
}

export function OAuthLoginModal({
  open,
  provider,
  state,
  onClose,
  onRestart,
  onUseBrowserFallback,
  onCancel,
  onSubmitCallback,
  onGotoAuthFiles,
}: OAuthLoginModalProps) {
  const { t } = useTranslation();
  // 上一次的输入不应带到下一次：调用方用 key 绑定当前 provider，
  // 关闭或切换 provider 会重新挂载本组件，草稿随之清空（无需 effect 里 setState）。
  const [callbackUrl, setCallbackUrl] = useState('');

  const authUrl =
    state.phase === 'awaiting' || state.phase === 'submitting'
      ? state.url
      : state.phase === 'timedOut'
        ? state.url
        : state.phase === 'error'
          ? state.url
          : undefined;

  const isPolling = state.phase === 'awaiting' || state.phase === 'submitting';
  const startedAt = isPolling ? state.startedAt : undefined;
  const timeoutMs = isPolling ? state.timeoutMs : OAUTH_TIMEOUT_MS;
  const flowMode = 'mode' in state ? state.mode : undefined;
  const userCode = 'userCode' in state ? state.userCode : undefined;
  const isDeviceFlow = flowMode === 'device';

  const callbackError = state.phase === 'awaiting' ? state.callbackError : undefined;

  const handleSubmitCallback = useCallback(() => {
    const trimmed = callbackUrl.trim();
    if (!trimmed) return;
    onSubmitCallback(trimmed);
  }, [callbackUrl, onSubmitCallback]);

  if (!provider) return null;

  const errorMessage = (() => {
    if (state.phase !== 'error') return '';
    switch (state.kind) {
      case 'missingState':
        return t('auth_login.missing_state');
      case 'unauthorized':
        return t('auth_login.oauth_unauthorized');
      case 'deviceStart':
        return `${t('auth_login.codex_device_start_error')} ${state.message}`.trim();
      case 'invalidResponse':
        return t('auth_login.invalid_start_response');
      case 'start':
        return `${t(getProviderAuthKey(provider.id, 'oauth_start_error'))} ${state.message}`.trim();
      case 'poll':
      default:
        return `${t(getProviderAuthKey(provider.id, 'oauth_status_error'))} ${state.message}`.trim();
    }
  })();

  const hasAuthInstructions = Boolean(authUrl && (!isDeviceFlow || userCode));
  const linkStepStatus: StepStatus =
    state.phase === 'success' || hasAuthInstructions ? 'done' : 'current';
  const authorizeStepStatus: StepStatus = (() => {
    if (state.phase === 'success') return 'done';
    if (isPolling) return 'current';
    return authUrl ? 'current' : 'pending';
  })();

  const showResultPanel =
    state.phase === 'success' || state.phase === 'timedOut' || state.phase === 'error';
  const canUseBrowserFallback =
    provider.id === 'codex' &&
    flowMode !== 'browser' &&
    state.phase !== 'idle' &&
    state.phase !== 'success';
  const callbackStepStatus: StepStatus =
    state.phase === 'success' ? 'done' : isPolling ? 'current' : 'pending';
  const workspaceTitle =
    state.phase === 'success'
      ? t('auth_login.success_title')
      : state.phase === 'timedOut'
        ? t('auth_login.timed_out_title')
        : state.phase === 'error'
          ? t('common.error')
          : authUrl
            ? t(
                isDeviceFlow
                  ? 'auth_login.step_enter_device_code'
                  : 'auth_login.step_authorize'
              )
            : t('auth_login.step_open_link');

  return (
    <Modal
      open={open}
      width={860}
      className={styles.oauthModal}
      onClose={onClose}
      ariaDescribedBy="oauth-modal-description"
      title={
        <div className={styles.modalTitleBlock}>
          <span className={styles.modalTitleEyebrow}>
            <span className={styles.modalTitleDot} aria-hidden="true" />
            {t('nav.oauth')}
          </span>
          <span className={styles.modalTitleText}>
            {t('auth_login.modal_title', { provider: t(provider.titleKey) })}
          </span>
        </div>
      }
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" size="sm" onClick={isPolling ? onCancel : onClose}>
            {t('common.cancel')}
          </Button>
          {canUseBrowserFallback && (
            <Button variant="ghost" size="sm" onClick={onUseBrowserFallback}>
              {t('auth_login.codex_browser_fallback')}
            </Button>
          )}
          {state.phase === 'success' ? (
            <Button size="sm" className={styles.footerSpacer} onClick={onGotoAuthFiles}>
              {t('auth_login.goto_auth_files')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className={styles.footerSpacer}
              onClick={onRestart}
              loading={state.phase === 'starting'}
            >
              {t('auth_login.oauth_restart')}
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.body}>
        <div className={styles.flowShell}>
          <aside className={styles.flowRail} aria-label={t('nav.oauth')}>
            <div className={styles.railIntro}>
              <span className={styles.railEyebrow}>{t(provider.titleKey)}</span>
              <p id="oauth-modal-description" className={styles.providerHint}>
                {t(provider.hintKey)}
              </p>
            </div>

            <ol className={styles.stepList}>
              <StepIndicator
                index={1}
                title={t('auth_login.step_open_link')}
                status={linkStepStatus}
              />
              <StepIndicator
                index={2}
                title={t(
                  isDeviceFlow
                    ? 'auth_login.step_enter_device_code'
                    : 'auth_login.step_authorize'
                )}
                status={authorizeStepStatus}
              />
              {provider.supportsCallback && !isDeviceFlow && (
                <StepIndicator
                  index={3}
                  title={t('auth_login.step_paste_callback')}
                  status={callbackStepStatus}
                />
              )}
            </ol>
          </aside>

          <section className={styles.workspace} aria-labelledby="oauth-workspace-title">
            <header className={styles.workspaceHeader}>
              <div>
                <span className={styles.workspaceEyebrow}>{t(provider.titleKey)}</span>
                <h3 id="oauth-workspace-title" className={styles.workspaceTitle}>
                  {workspaceTitle}
                </h3>
              </div>
              {isPolling && (
                <OAuthElapsedTime
                  key={`${startedAt}-${open ? 'open' : 'closed'}`}
                  open={open}
                  startedAt={startedAt!}
                  timeoutMs={timeoutMs}
                />
              )}
            </header>

            <div className={styles.taskContent}>
              {state.phase === 'starting' && (
                <div className={styles.loadingPanel} role="status" aria-busy="true">
                  <span className={styles.loadingMark} aria-hidden="true">
                    <IconLoader2 size={18} className={styles.waitingIcon} />
                  </span>
                  <span>{t('common.loading')}</span>
                </div>
              )}

              {authUrl && isDeviceFlow && (
                <>
                  <div
                    className={`${styles.deviceWorkspace} ${
                      userCode ? '' : styles.deviceWorkspaceSingle
                    }`}
                  >
                    {userCode && (
                      <section className={styles.codePanel}>
                        <span className={styles.sectionLabel}>
                          <IconKey size={14} aria-hidden="true" />
                          {t('auth_login.codex_device_code_label')}
                        </span>
                        <p className={styles.deviceIntro}>
                          {t('auth_login.codex_device_instructions')}
                        </p>
                        <code
                          className={styles.deviceCodeValue}
                          aria-label={t('auth_login.codex_device_code_label')}
                        >
                          {userCode}
                        </code>
                        <CopyLinkButton
                          value={userCode}
                          label={t('auth_login.codex_copy_code')}
                          className={styles.panelAction}
                        />
                      </section>
                    )}

                    <section className={styles.linkPanel}>
                      <span className={styles.sectionLabel}>
                        <IconExternalLink size={14} aria-hidden="true" />
                        {t('auth_login.codex_verification_url_label')}
                      </span>
                      <div className={styles.urlBox}>
                        <div className={styles.urlValue}>{authUrl}</div>
                      </div>
                      <div className={styles.panelActions}>
                        <Button
                          size="sm"
                          onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}
                        >
                          <IconExternalLink size={15} />
                          <span>{t('auth_login.codex_open_verification')}</span>
                        </Button>
                        <CopyLinkButton
                          value={authUrl}
                          label={t(getProviderAuthKey(provider.id, 'copy_link'))}
                        />
                      </div>
                    </section>
                  </div>

                  {isPolling && (
                    <div className={styles.waiting} role="status" aria-live="polite">
                      <IconLoader2 size={16} className={styles.waitingIcon} />
                      <div>
                        <strong>{t(getProviderAuthKey(provider.id, 'oauth_status_waiting'))}</strong>
                        <p>{t('auth_login.codex_device_waiting_hint')}</p>
                      </div>
                    </div>
                  )}

                  <p className={styles.browserFallbackHint}>
                    {t('auth_login.codex_browser_fallback_hint')}
                  </p>
                </>
              )}

              {authUrl && !isDeviceFlow && (
                <>
                  <section className={styles.linkPanel}>
                    <span className={styles.sectionLabel}>
                      <IconExternalLink size={14} aria-hidden="true" />
                      {t('auth_login.step_open_link')}
                    </span>
                    <div className={styles.urlBox}>
                      <div className={styles.urlValue}>{authUrl}</div>
                    </div>
                    <div className={styles.panelActions}>
                      <Button
                        size="sm"
                        onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}
                      >
                        <IconExternalLink size={15} />
                        <span>{t(getProviderAuthKey(provider.id, 'open_link'))}</span>
                      </Button>
                      <CopyLinkButton
                        value={authUrl}
                        label={t(getProviderAuthKey(provider.id, 'copy_link'))}
                      />
                    </div>
                  </section>

                  {isPolling && (
                    <div className={styles.waiting} role="status" aria-live="polite">
                      <IconLoader2 size={16} className={styles.waitingIcon} />
                      <div>
                        <strong>{t(getProviderAuthKey(provider.id, 'oauth_status_waiting'))}</strong>
                        <p>{t('auth_login.waiting_hint')}</p>
                      </div>
                    </div>
                  )}

                  {provider.supportsCallback && (
                    <section className={styles.callbackPanel}>
                      <span className={styles.sectionLabel}>
                        {t('auth_login.step_paste_callback')}
                      </span>
                      <Input
                        hint={t('auth_login.oauth_callback_hint')}
                        placeholder={t('auth_login.oauth_callback_placeholder')}
                        value={callbackUrl}
                        onChange={(event) => setCallbackUrl(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleSubmitCallback();
                          }
                        }}
                      />
                      {callbackError && (
                        <div className={styles.inlineError} role="alert">
                          <IconAlertTriangle size={14} className={styles.resultIcon} />
                          <span>
                            {callbackError.kind === 'unsupported'
                              ? t('auth_login.oauth_callback_upgrade_hint')
                              : `${t('auth_login.oauth_callback_error')} ${callbackError.message}`.trim()}
                          </span>
                        </div>
                      )}
                      <div className={styles.callbackAction}>
                        <Button
                          size="sm"
                          onClick={handleSubmitCallback}
                          loading={state.phase === 'submitting'}
                          disabled={!callbackUrl.trim()}
                        >
                          {t('auth_login.oauth_callback_button')}
                        </Button>
                      </div>
                    </section>
                  )}
                </>
              )}

              {showResultPanel && (
                <div
                  className={`${styles.resultPanel} ${
                    state.phase === 'success'
                      ? styles.resultSuccess
                      : state.phase === 'timedOut'
                        ? styles.resultWarning
                        : styles.resultError
                  }`}
                  role={state.phase === 'success' ? 'status' : 'alert'}
                >
                  <div className={styles.resultHeader}>
                    {state.phase === 'success' ? (
                      <IconCheckCircle2 size={18} className={styles.resultIcon} />
                    ) : state.phase === 'timedOut' ? (
                      <IconTimer size={18} className={styles.resultIcon} />
                    ) : (
                      <IconAlertTriangle size={18} className={styles.resultIcon} />
                    )}
                    <span>
                      {state.phase === 'success'
                        ? t('auth_login.success_title')
                        : state.phase === 'timedOut'
                          ? t('auth_login.timed_out_title')
                          : t('common.error')}
                    </span>
                  </div>
                  <p className={styles.resultMessage}>
                    {state.phase === 'success'
                      ? t('auth_login.success_hint')
                      : state.phase === 'timedOut'
                        ? t('auth_login.timed_out_hint')
                        : errorMessage}
                  </p>
                  {state.phase === 'error' && state.kind === 'deviceStart' && (
                    <p className={styles.resultMessage}>
                      {t('auth_login.codex_browser_fallback_hint')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  );
}
