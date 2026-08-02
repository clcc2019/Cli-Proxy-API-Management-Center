/**
 * Provider 折叠态卡片
 *
 * 只负责展示与入口：认证流程本身在 OAuthLoginModal 里进行，
 * 因此卡片高度稳定、同行等高，不再像此前那样展开后横跨整行。
 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import type { OAuthProvider } from '@/services/api/oauth';
import type { ResolvedTheme } from '@/types';
import type { OAuthFlowState } from '../useOAuthFlow';
import {
  getProviderAuthKey,
  resolveProviderIcon,
  type OAuthProviderDescriptor,
} from '../providers';
import styles from '@/pages/OAuthPage.module.scss';

type OAuthProviderCardProps = {
  provider: OAuthProviderDescriptor;
  state: OAuthFlowState;
  theme: ResolvedTheme;
  onStart: (provider: OAuthProvider) => void;
  onOpen: (provider: OAuthProvider) => void;
};

export const OAuthProviderCard = memo(function OAuthProviderCard({
  provider,
  state,
  theme,
  onStart,
  onOpen,
}: OAuthProviderCardProps) {
  const { t } = useTranslation();

  const isLive =
    state.phase === 'starting' || state.phase === 'awaiting' || state.phase === 'submitting';

  const badge = (() => {
    if (isLive) {
      return {
        tone: '',
        text: t(getProviderAuthKey(provider.id, 'oauth_status_waiting')),
      };
    }
    if (state.phase === 'success') {
      return { tone: 'success', text: t('auth_login.success_title') };
    }
    if (state.phase === 'timedOut') {
      return { tone: 'warning', text: t('auth_login.timed_out_title') };
    }
    if (state.phase === 'error') {
      return { tone: 'error', text: t('common.error') };
    }
    return null;
  })();

  return (
    <div className={styles.providerCell} role="listitem">
      <Card
        className={`${styles.providerCard} ${isLive ? styles.providerCardWaiting : ''}`}
        title={
          <span className={styles.cardTitle}>
            <img
              src={resolveProviderIcon(provider.icon, theme)}
              alt=""
              className={`${styles.cardTitleIcon} ${
                provider.invertIconInDark ? styles.cardTitleIconDarkInvert : ''
              }`}
            />
            {t(provider.titleKey)}
          </span>
        }
        extra={
          badge ? (
            <span className={`status-badge ${badge.tone} ${styles.statusBadge}`} role="status">
              {badge.text}
            </span>
          ) : undefined
        }
      >
        <div className={styles.cardContent}>
          <div className={styles.cardHint}>{t(provider.hintKey)}</div>
          <div className={styles.cardFooter}>
            {state.phase === 'idle' ? (
              <Button onClick={() => onStart(provider.id)}>{t('common.login')}</Button>
            ) : (
              // 已有进行中/已结束的流程时，按钮回到弹窗而不是重新发起，
              // 避免误点作废一次正在等待的授权
              <Button
                variant="secondary"
                onClick={() => onOpen(provider.id)}
                loading={state.phase === 'starting'}
              >
                {t('auth_login.view_progress')}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
});
