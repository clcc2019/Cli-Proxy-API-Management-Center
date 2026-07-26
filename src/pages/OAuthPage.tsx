import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores';
import type { OAuthProvider } from '@/services/api/oauth';
import { OAUTH_PROVIDERS, getOAuthProviderDescriptor } from '@/features/oauthLogin/providers';
import { useOAuthFlow } from '@/features/oauthLogin/useOAuthFlow';
import { OAuthProviderCard } from '@/features/oauthLogin/components/OAuthProviderCard';
import { OAuthLoginModal } from '@/features/oauthLogin/components/OAuthLoginModal';
import styles from './OAuthPage.module.scss';

export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const { getState, start, submitCallback, cancel, now } = useOAuthFlow();
  const [activeProvider, setActiveProvider] = useState<OAuthProvider | null>(null);

  const activeDescriptor = activeProvider ? getOAuthProviderDescriptor(activeProvider) : undefined;
  const activeState = activeProvider ? getState(activeProvider) : { phase: 'idle' as const };

  const handleStart = useCallback(
    (provider: OAuthProvider) => {
      setActiveProvider(provider);
      void start(provider);
    },
    [start]
  );

  // 关闭弹窗不影响轮询：授权在外部浏览器完成，用户可能关掉弹窗去别处等待，
  // 卡片上的状态徽标会继续反映进度。
  const handleClose = useCallback(() => {
    setActiveProvider(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (activeProvider) cancel(activeProvider);
    setActiveProvider(null);
  }, [activeProvider, cancel]);

  const handleRestart = useCallback(() => {
    if (activeProvider) void start(activeProvider);
  }, [activeProvider, start]);

  const handleSubmitCallback = useCallback(
    (redirectUrl: string) => {
      if (activeProvider) void submitCallback(activeProvider, redirectUrl);
    },
    [activeProvider, submitCallback]
  );

  const handleGotoAuthFiles = useCallback(() => {
    setActiveProvider(null);
    navigate('/auth-files');
  }, [navigate]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth')}</h1>

      <div className={styles.content}>
        <div className={styles.providerGrid}>
          {OAUTH_PROVIDERS.map((provider) => (
            <OAuthProviderCard
              key={provider.id}
              provider={provider}
              state={getState(provider.id)}
              theme={resolvedTheme}
              onStart={() => handleStart(provider.id)}
              onOpen={() => setActiveProvider(provider.id)}
            />
          ))}
        </div>
      </div>

      {/* key 绑定 provider：切换 provider 时重新挂载，回调输入框的草稿自然清空 */}
      <OAuthLoginModal
        key={activeProvider ?? 'none'}
        open={activeProvider !== null}
        provider={activeDescriptor ?? null}
        state={activeState}
        now={now}
        onClose={handleClose}
        onCancel={handleCancel}
        onRestart={handleRestart}
        onSubmitCallback={handleSubmitCallback}
        onGotoAuthFiles={handleGotoAuthFiles}
      />
    </div>
  );
}
