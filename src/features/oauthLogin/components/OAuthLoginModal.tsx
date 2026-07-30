/**
 * OAuth 登录分步向导
 *
 * 支持两种形态：
 * - 支持回调回填的 provider（codex / anthropic / xai）：3 步
 * - 设备码流程（kimi）：2 步，没有回调粘贴步
 *
 * 反馈全部内联——本项目的 toast 已全局关闭。
 */

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  IconAlertTriangle,
  IconCheckCircle2,
  IconExternalLink,
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
  /** 由 useOAuthFlow 的秒级 tick 提供的当前时间戳 */
  now: number;
  onClose: () => void;
  onRestart: () => void;
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

function Step({
  index,
  title,
  status,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  children?: ReactNode;
}) {
  const indexClass = [
    styles.stepIndex,
    status === 'done' ? styles.stepIndexDone : '',
    status === 'pending' ? styles.stepIndexPending : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.step}>
      <div className={styles.stepHeader}>
        <span className={indexClass} aria-hidden="true">
          {status === 'done' ? '✓' : index}
        </span>
        <span
          className={`${styles.stepTitle} ${status === 'pending' ? styles.stepTitlePending : ''}`}
        >
          {title}
        </span>
      </div>
      {children ? <div className={styles.stepBody}>{children}</div> : null}
    </div>
  );
}

export function OAuthLoginModal({
  open,
  provider,
  state,
  now,
  onClose,
  onRestart,
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
  // `now` 由 useOAuthFlow 的秒级 tick 提供：时间戳在副作用里取，
  // 渲染期间不调 Date.now()（React 纯度规则，且会让计时值漂移）。
  const elapsedLabel =
    startedAt === undefined
      ? ''
      : `${formatDuration(now - startedAt)} / ${formatDuration(OAUTH_TIMEOUT_MS)}`;

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
      case 'start':
        return `${t(getProviderAuthKey(provider.id, 'oauth_start_error'))} ${state.message}`.trim();
      case 'poll':
      default:
        return `${t(getProviderAuthKey(provider.id, 'oauth_status_error'))} ${state.message}`.trim();
    }
  })();

  const linkStepStatus: StepStatus = authUrl ? 'done' : 'current';
  const authorizeStepStatus: StepStatus = (() => {
    if (state.phase === 'success') return 'done';
    if (isPolling) return 'current';
    return authUrl ? 'current' : 'pending';
  })();

  const showResultPanel =
    state.phase === 'success' || state.phase === 'timedOut' || state.phase === 'error';

  return (
    <Modal
      open={open}
      width={680}
      className={styles.oauthModal}
      onClose={onClose}
      title={t('auth_login.modal_title', { provider: t(provider.titleKey) })}
      footer={
        <div className={styles.footer}>
          <Button variant="ghost" size="sm" onClick={isPolling ? onCancel : onClose}>
            {t('common.cancel')}
          </Button>
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
        <p className={styles.providerHint}>{t(provider.hintKey)}</p>

        <div className={styles.steps}>
          <Step
            index={1}
            title={t('auth_login.step_open_link')}
            status={linkStepStatus}
          >
            {authUrl ? (
              <>
                <div className={styles.urlBox}>
                  <div className={styles.urlValue}>{authUrl}</div>
                </div>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    onClick={() => window.open(authUrl, '_blank', 'noopener,noreferrer')}
                  >
                    <IconExternalLink size={15} />
                    <span>{t(getProviderAuthKey(provider.id, 'open_link'))}</span>
                  </Button>
                  <CopyLinkButton
                    url={authUrl}
                    label={t(getProviderAuthKey(provider.id, 'copy_link'))}
                  />
                </div>
              </>
            ) : (
              <div className={styles.waiting} role="status" aria-busy="true">
                <IconLoader2 size={16} className={styles.waitingIcon} />
                <span>{t('common.loading')}</span>
              </div>
            )}
          </Step>

          <Step
            index={2}
            title={t('auth_login.step_authorize')}
            status={authorizeStepStatus}
          >
            {isPolling ? (
              <>
                <div className={styles.waiting} role="status" aria-live="polite">
                  <IconLoader2 size={16} className={styles.waitingIcon} />
                  <span>{t(getProviderAuthKey(provider.id, 'oauth_status_waiting'))}</span>
                  <span className={styles.elapsed}>
                    {t('auth_login.waiting_elapsed', { elapsed: elapsedLabel })}
                  </span>
                </div>
                <p className={styles.waitingHint}>{t('auth_login.waiting_hint')}</p>
              </>
            ) : null}
          </Step>

          {provider.supportsCallback && (
            <Step
              index={3}
              title={t('auth_login.step_paste_callback')}
              status={isPolling ? 'current' : 'pending'}
            >
              {authUrl ? (
                <>
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
                  <div className={styles.actions}>
                    <Button
                      size="sm"
                      onClick={handleSubmitCallback}
                      loading={state.phase === 'submitting'}
                      disabled={!callbackUrl.trim()}
                    >
                      {t('auth_login.oauth_callback_button')}
                    </Button>
                  </div>
                </>
              ) : null}
            </Step>
          )}
        </div>

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
                <IconCheckCircle2 size={16} className={styles.resultIcon} />
              ) : state.phase === 'timedOut' ? (
                <IconTimer size={16} className={styles.resultIcon} />
              ) : (
                <IconAlertTriangle size={16} className={styles.resultIcon} />
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
          </div>
        )}
      </div>
    </Modal>
  );
}
