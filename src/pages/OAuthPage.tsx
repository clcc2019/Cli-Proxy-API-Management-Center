import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import iconVertex from '@/assets/icons/vertex.svg';
import type { OAuthProvider } from '@/services/api/oauth';
import type { ResolvedTheme } from '@/types';
import { OAUTH_PROVIDERS, getOAuthProviderDescriptor } from '@/features/oauthLogin/providers';
import {
  getOAuthFlowMode,
  useOAuthFlow,
  type OAuthFlowState,
} from '@/features/oauthLogin/useOAuthFlow';
import { OAuthProviderCard } from '@/features/oauthLogin/components/OAuthProviderCard';
import { OAuthLoginModal } from '@/features/oauthLogin/components/OAuthLoginModal';
import { VertexImportModal } from '@/features/oauthLogin/components/VertexImportModal';
import { ManagementPageHeader } from '@/components/ui/ManagementPageHeader';
import styles from './OAuthPage.module.scss';

type OAuthProviderGridProps = {
  getState: (provider: OAuthProvider) => OAuthFlowState;
  theme: ResolvedTheme;
  onStart: (provider: OAuthProvider) => void;
  onOpen: (provider: OAuthProvider) => void;
};

const OAuthProviderGrid = memo(function OAuthProviderGrid({
  getState,
  theme,
  onStart,
  onOpen,
}: OAuthProviderGridProps) {
  return (
    <div className={styles.providerGrid} role="list">
      {OAUTH_PROVIDERS.map((provider) => (
        <OAuthProviderCard
          key={provider.id}
          provider={provider}
          state={getState(provider.id)}
          theme={theme}
          onStart={onStart}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
});

export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const { getState, start, submitCallback, cancel } = useOAuthFlow();
  const [activeProvider, setActiveProvider] = useState<OAuthProvider | null>(null);
  const [vertexImportOpen, setVertexImportOpen] = useState(false);

  const activeDescriptor = activeProvider ? getOAuthProviderDescriptor(activeProvider) : undefined;
  const activeState = activeProvider ? getState(activeProvider) : { phase: 'idle' as const };
  const activeMode = getOAuthFlowMode(activeState);

  const handleStart = useCallback(
    (provider: OAuthProvider) => {
      setActiveProvider(provider);
      void start(provider);
    },
    [start]
  );

  const handleOpen = useCallback((provider: OAuthProvider) => {
    setActiveProvider(provider);
  }, []);

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
    if (activeProvider) void start(activeProvider, activeMode);
  }, [activeMode, activeProvider, start]);

  const handleBrowserFallback = useCallback(() => {
    if (activeProvider === 'codex') void start(activeProvider, 'browser');
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
      <ManagementPageHeader title={t('nav.oauth')} description={t('auth_login.page_subtitle')} />

      <section className={styles.content} aria-label={t('nav.oauth')}>
        <OAuthProviderGrid
          getState={getState}
          theme={resolvedTheme}
          onStart={handleStart}
          onOpen={handleOpen}
        />
      </section>

      <section className={styles.vertexSection} aria-label={t('vertex_import.title')}>
        <Card
          className={styles.vertexCard}
          title={
            <span className={styles.vertexTitle}>
              <img src={iconVertex} alt="" width={28} height={28} />
              {t('vertex_import.title')}
            </span>
          }
        >
          <div className={styles.vertexContent}>
            <p className={styles.vertexHint}>{t('vertex_import.description')}</p>
            <div className={styles.vertexFooter}>
              <Button onClick={() => setVertexImportOpen(true)}>
                {t('vertex_import.import_button')}
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* key 绑定 provider：切换 provider 时重新挂载，回调输入框的草稿自然清空 */}
      <OAuthLoginModal
        key={activeProvider ?? 'none'}
        open={activeProvider !== null}
        provider={activeDescriptor ?? null}
        state={activeState}
        onClose={handleClose}
        onCancel={handleCancel}
        onRestart={handleRestart}
        onUseBrowserFallback={handleBrowserFallback}
        onSubmitCallback={handleSubmitCallback}
        onGotoAuthFiles={handleGotoAuthFiles}
      />

      <VertexImportModal
        open={vertexImportOpen}
        onClose={() => setVertexImportOpen(false)}
        onGotoAuthFiles={() => {
          setVertexImportOpen(false);
          navigate('/auth-files');
        }}
      />
    </div>
  );
}
