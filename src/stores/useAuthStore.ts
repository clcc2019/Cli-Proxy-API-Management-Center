/**
 * 认证状态管理
 * 从原项目 src/modules/login.js 和 src/core/connection.js 迁移
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthState, LoginCredentials, ConnectionStatus } from '@/types';
import { AUTH_SESSION_DURATION_MS, STORAGE_KEY_AUTH } from '@/utils/constants';
import { obfuscatedStorage } from '@/services/storage/secureStorage';
import { apiClient } from '@/services/api/client';
import { useConfigStore } from './useConfigStore';
import { useUsageStatsStore } from './useUsageStatsStore';
import { useModelsStore } from './useModelsStore';
import { useQuotaStore } from './useQuotaStore';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';

interface AuthStoreState extends AuthState {
  connectionStatus: ConnectionStatus;
  connectionError: string | null;

  // 操作
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
  restoreSession: () => Promise<boolean>;
  updateServerVersion: (version: string | null, buildDate?: string | null) => void;
  updateConnectionStatus: (status: ConnectionStatus, error?: string | null) => void;
}

let restoreSessionPromise: Promise<boolean> | null = null;
const LEGACY_LOGGED_IN_KEY = 'isLoggedIn';

const createLoginExpiresAt = () => Date.now() + AUTH_SESSION_DURATION_MS;

const isLoginSessionValid = (expiresAt: number | null | undefined): expiresAt is number =>
  typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > Date.now();

export const useAuthStore = create<AuthStoreState>()(
  persist(
    (set, get) => ({
      // 初始状态
      isAuthenticated: false,
      apiBase: '',
      managementKey: '',
      rememberPassword: true,
      loginExpiresAt: null,
      serverVersion: null,
      serverBuildDate: null,
      connectionStatus: 'disconnected',
      connectionError: null,

      // 恢复会话并自动登录
      restoreSession: () => {
        if (restoreSessionPromise) return restoreSessionPromise;

        restoreSessionPromise = (async () => {
          obfuscatedStorage.migratePlaintextKeys(['apiBase', 'apiUrl', 'managementKey']);

          const wasLoggedIn = localStorage.getItem(LEGACY_LOGGED_IN_KEY) === 'true';
          const legacyBase =
            obfuscatedStorage.getItem<string>('apiBase') ||
            obfuscatedStorage.getItem<string>('apiUrl', { encrypt: true });
          const legacyKey = obfuscatedStorage.getItem<string>('managementKey');

          const { apiBase, managementKey, rememberPassword, loginExpiresAt } = get();
          const hasValidSession = isLoginSessionValid(loginExpiresAt);
          const shouldMigrateLegacySession = wasLoggedIn && !loginExpiresAt;
          const resolvedBase = normalizeApiBase(
            apiBase || legacyBase || detectApiBaseFromLocation()
          );
          const resolvedKey = managementKey || legacyKey || '';
          const resolvedRememberPassword =
            rememberPassword ||
            Boolean(managementKey) ||
            Boolean(legacyKey) ||
            shouldMigrateLegacySession;

          if (loginExpiresAt && !hasValidSession) {
            localStorage.removeItem(LEGACY_LOGGED_IN_KEY);
            useQuotaStore.getState().clearQuotaCache();
            set({
              isAuthenticated: false,
              apiBase: resolvedBase,
              managementKey: '',
              loginExpiresAt: null,
              connectionStatus: 'disconnected',
              connectionError: null,
            });
            apiClient.setConfig({ apiBase: resolvedBase, managementKey: '' });
            return false;
          }

          set({
            apiBase: resolvedBase,
            managementKey: resolvedKey,
            rememberPassword: resolvedRememberPassword,
            loginExpiresAt: shouldMigrateLegacySession ? createLoginExpiresAt() : loginExpiresAt,
          });
          apiClient.setConfig({ apiBase: resolvedBase, managementKey: resolvedKey });

          if ((hasValidSession || shouldMigrateLegacySession) && resolvedBase && resolvedKey) {
            try {
              await get().login({
                apiBase: resolvedBase,
                managementKey: resolvedKey,
                rememberPassword: resolvedRememberPassword,
              });
              return true;
            } catch (error) {
              console.warn('Auto login failed:', error);
              return false;
            }
          }

          return false;
        })();

        return restoreSessionPromise;
      },

      // 登录
      login: async (credentials) => {
        const apiBase = normalizeApiBase(credentials.apiBase);
        const managementKey = credentials.managementKey.trim();
        const rememberPassword = credentials.rememberPassword ?? get().rememberPassword ?? false;
        const previous = get();
        const connectionChanged =
          previous.apiBase !== apiBase || previous.managementKey !== managementKey;

        try {
          set({ connectionStatus: 'connecting' });
          useModelsStore.getState().clearCache();

          // 配置 API 客户端
          apiClient.setConfig({
            apiBase,
            managementKey,
          });

          // 测试连接 - 获取配置
          await useConfigStore.getState().fetchConfig(undefined, true);

          if (connectionChanged) {
            useQuotaStore.getState().clearQuotaCache();
          }

          const loginExpiresAt = rememberPassword ? createLoginExpiresAt() : null;

          // 登录成功
          set({
            isAuthenticated: true,
            apiBase,
            managementKey,
            rememberPassword,
            loginExpiresAt,
            connectionStatus: 'connected',
            connectionError: null,
          });
          if (rememberPassword) {
            localStorage.setItem(LEGACY_LOGGED_IN_KEY, 'true');
          } else {
            localStorage.removeItem(LEGACY_LOGGED_IN_KEY);
          }
        } catch (error: unknown) {
          const message =
            error instanceof Error
              ? error.message
              : typeof error === 'string'
                ? error
                : 'Connection failed';
          set({
            connectionStatus: 'error',
            connectionError: message || 'Connection failed',
          });
          throw error;
        }
      },

      // 登出
      logout: () => {
        restoreSessionPromise = null;
        useConfigStore.getState().clearCache();
        useUsageStatsStore.getState().clearUsageStats();
        useModelsStore.getState().clearCache();
        useQuotaStore.getState().clearQuotaCache();
        set({
          isAuthenticated: false,
          apiBase: '',
          managementKey: '',
          loginExpiresAt: null,
          serverVersion: null,
          serverBuildDate: null,
          connectionStatus: 'disconnected',
          connectionError: null,
        });
        localStorage.removeItem(LEGACY_LOGGED_IN_KEY);
      },

      // 检查认证状态
      checkAuth: async () => {
        const { managementKey, apiBase, rememberPassword, loginExpiresAt } = get();

        if (!managementKey || !apiBase) {
          return false;
        }

        if (rememberPassword && !isLoginSessionValid(loginExpiresAt)) {
          localStorage.removeItem(LEGACY_LOGGED_IN_KEY);
          useQuotaStore.getState().clearQuotaCache();
          set({
            isAuthenticated: false,
            managementKey: '',
            loginExpiresAt: null,
            connectionStatus: 'disconnected',
          });
          apiClient.setConfig({ apiBase, managementKey: '' });
          return false;
        }

        try {
          // 重新配置客户端
          apiClient.setConfig({ apiBase, managementKey });

          // 验证连接
          await useConfigStore.getState().fetchConfig();

          set({
            isAuthenticated: true,
            connectionStatus: 'connected',
          });

          return true;
        } catch {
          set({
            isAuthenticated: false,
            connectionStatus: 'error',
          });
          return false;
        }
      },

      // 更新服务器版本
      updateServerVersion: (version, buildDate) => {
        set({ serverVersion: version || null, serverBuildDate: buildDate || null });
      },

      // 更新连接状态
      updateConnectionStatus: (status, error = null) => {
        set({
          connectionStatus: status,
          connectionError: error,
        });
      },
    }),
    {
      name: STORAGE_KEY_AUTH,
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          const data = obfuscatedStorage.getItem<AuthStoreState>(name);
          return data ? JSON.stringify(data) : null;
        },
        setItem: (name, value) => {
          obfuscatedStorage.setItem(name, JSON.parse(value));
        },
        removeItem: (name) => {
          obfuscatedStorage.removeItem(name);
        },
      })),
      partialize: (state) => ({
        apiBase: state.apiBase,
        ...(state.rememberPassword &&
        (state.loginExpiresAt === null || isLoginSessionValid(state.loginExpiresAt))
          ? { managementKey: state.managementKey }
          : {}),
        rememberPassword: state.rememberPassword,
        loginExpiresAt: state.rememberPassword ? state.loginExpiresAt : null,
        serverVersion: state.serverVersion,
        serverBuildDate: state.serverBuildDate,
      }),
    }
  )
);

// 监听全局未授权事件
if (typeof window !== 'undefined') {
  window.addEventListener('unauthorized', () => {
    useAuthStore.getState().logout();
  });

  window.addEventListener('server-version-update', ((e: CustomEvent) => {
    const detail = e.detail || {};
    useAuthStore.getState().updateServerVersion(detail.version || null, detail.buildDate || null);
  }) as EventListener);
}
