/**
 * OAuth 与设备码登录相关 API
 */

import { apiClient } from './client';

export type OAuthProvider = 'codex' | 'anthropic' | 'kimi' | 'xai';

export type CodexLoginMode = 'device' | 'browser';

export interface OAuthStartResponse {
  status?: 'ok';
  mode?: CodexLoginMode;
  url?: string;
  verification_url?: string;
  user_code?: string;
  state?: string;
  /** Device-flow lifetime, in seconds. */
  expires_in?: number;
  /** Recommended status-polling interval, in seconds. */
  interval?: number;
}

export interface OAuthCallbackResponse {
  status: 'ok';
}

const WEBUI_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'xai'];

export const oauthApi = {
  startAuth: (provider: OAuthProvider, mode?: CodexLoginMode) => {
    const params: Record<string, string | boolean> = {};
    if (WEBUI_SUPPORTED.includes(provider)) {
      params.is_webui = true;
    }
    // Device-code login is the Codex endpoint's default. Deliberately omit
    // `mode=device` so the frontend follows the same default contract as the
    // CLI and remains compatible with servers that introduced the default
    // before accepting an explicit mode parameter.
    if (provider === 'codex' && mode === 'browser') {
      params.mode = 'browser';
    }
    return apiClient.get<OAuthStartResponse>(`/${provider}-auth-url`, {
      params: Object.keys(params).length ? params : undefined,
    });
  },

  /**
   * OAuth 轮询最长可持续数分钟，期间管理密钥若过期，401 会经全局 unauthorized
   * 事件把用户直接登出（见 client.ts 的拦截器）。轮询属于后台请求，
   * 不应把人从后台踢出去，因此跳过该副作用——与认证文件凭据请求同样的处理。
   */
  getAuthStatus: (state: string) =>
    apiClient.get<{ status: 'ok' | 'wait' | 'error'; error?: string }>(`/get-auth-status`, {
      params: { state },
      skipUnauthorizedLogout: true,
    }),

  submitCallback: (provider: OAuthProvider, redirectUrl: string) => {
    return apiClient.post<OAuthCallbackResponse>('/oauth-callback', {
      provider,
      redirect_url: redirectUrl,
    });
  },
};
