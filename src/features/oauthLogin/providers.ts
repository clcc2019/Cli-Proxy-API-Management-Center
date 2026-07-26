/**
 * OAuth 登录的 provider 描述符
 *
 * 页面与向导都只读这里，新增一个 provider 只需在 OAUTH_PROVIDERS 里加一项
 * （前提是 src/services/api/oauth.ts 的 OAuthProvider 已包含它）。
 *
 * `supportsCallback` 取代此前散落在页面里的 CALLBACK_SUPPORTED.includes()：
 * 支持回填回调 URL 的 provider 走三步向导，设备码流程（kimi / qwen）走两步。
 */

import type { OAuthProvider } from '@/services/api/oauth';
import type { ResolvedTheme } from '@/types';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconGrok from '@/assets/icons/grok.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';

type ThemedIcon = { light: string; dark: string };

export type OAuthProviderDescriptor = {
  id: OAuthProvider;
  titleKey: string;
  hintKey: string;
  /** 单图标，或按主题取用的 light / dark 两份 */
  icon: string | ThemedIcon;
  /** 是否支持粘贴回调 URL（决定向导是 3 步还是 2 步） */
  supportsCallback: boolean;
  /** 单色图标在暗色主题下需要反色（目前只有 xAI） */
  invertIconInDark?: boolean;
};

export const OAUTH_PROVIDERS: readonly OAuthProviderDescriptor[] = [
  {
    id: 'codex',
    titleKey: 'auth_login.codex_oauth_title',
    hintKey: 'auth_login.codex_oauth_hint',
    icon: iconCodex,
    supportsCallback: true,
  },
  {
    id: 'anthropic',
    titleKey: 'auth_login.anthropic_oauth_title',
    hintKey: 'auth_login.anthropic_oauth_hint',
    icon: iconClaude,
    supportsCallback: true,
  },
  {
    id: 'kimi',
    titleKey: 'auth_login.kimi_oauth_title',
    hintKey: 'auth_login.kimi_oauth_hint',
    icon: { light: iconKimiLight, dark: iconKimiDark },
    supportsCallback: false,
  },
  {
    id: 'qwen',
    titleKey: 'auth_login.qwen_oauth_title',
    hintKey: 'auth_login.qwen_oauth_hint',
    icon: iconQwen,
    supportsCallback: false,
  },
  {
    id: 'xai',
    titleKey: 'auth_login.xai_oauth_title',
    hintKey: 'auth_login.xai_oauth_hint',
    icon: iconGrok,
    supportsCallback: true,
    invertIconInDark: true,
  },
];

export const getOAuthProviderDescriptor = (
  provider: OAuthProvider
): OAuthProviderDescriptor | undefined => OAUTH_PROVIDERS.find((item) => item.id === provider);

export const resolveProviderIcon = (
  icon: string | ThemedIcon,
  theme: ResolvedTheme
): string => (typeof icon === 'string' ? icon : icon[theme]);

/**
 * i18n 键的 provider 前缀：'gemini-cli' 这类带连字符的 id 在语言文件里是下划线形式。
 * 当前 5 个 provider 都不含连字符，保留转换是为了新增时不必再想起这条规则。
 */
export const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace(/-/g, '_');

export const getProviderAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;
