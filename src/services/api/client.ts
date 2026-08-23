/**
 * Axios API 客户端
 * 替代原项目 src/core/api-client.js
 */

import type { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { ApiClientConfig, ApiError } from '@/types';
import { BUILD_DATE_HEADER_KEYS, REQUEST_TIMEOUT_MS, VERSION_HEADER_KEYS } from '@/utils/constants';
import { computeApiUrl } from '@/utils/connection';

export type ApiRequestConfig = AxiosRequestConfig & {
  skipUnauthorizedLogout?: boolean;
};

type ManagementRequestConfig = ApiRequestConfig & {
  _managementAuthGeneration?: number;
  _managementSessionRequest?: boolean;
  _managementSessionRetry?: boolean;
};

const MANAGEMENT_SESSION_HEADER_KEYS = ['x-cpa-management-session'];
const MANAGEMENT_SESSION_STATUS_HEADER_KEYS = ['x-cpa-management-session-status'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const isAxiosError = (value: unknown): value is AxiosError =>
  isRecord(value) && value.isAxiosError === true;

class ApiClient {
  private instance: AxiosInstance | null = null;
  private instancePromise: Promise<AxiosInstance> | null = null;
  private apiBase: string = '';
  private managementKey: string = '';
  private managementSession: string = '';
  private managementAuthGeneration = 0;
  private timeout = REQUEST_TIMEOUT_MS;

  /**
   * 设置 API 配置
   */
  setConfig(config: ApiClientConfig): void {
    const apiBase = computeApiUrl(config.apiBase);
    if (this.apiBase !== apiBase || this.managementKey !== config.managementKey) {
      this.managementSession = '';
      this.managementAuthGeneration += 1;
    }

    this.apiBase = apiBase;
    this.managementKey = config.managementKey;
    this.timeout = config.timeout || REQUEST_TIMEOUT_MS;

    if (this.instance) {
      this.instance.defaults.timeout = this.timeout;
    }
  }

  private getInstance(): Promise<AxiosInstance> {
    if (!this.instancePromise) {
      this.instancePromise = import('axios').then(({ default: axios }) => {
        const instance = axios.create({
          timeout: this.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        });
        this.setupInterceptors(instance);
        this.instance = instance;
        return instance;
      });
    }

    return this.instancePromise;
  }

  private readHeader(headers: Record<string, unknown> | undefined, keys: string[]): string | null {
    if (!headers) return null;

    const normalizeValue = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      if (Array.isArray(value)) {
        const first = value.find(
          (entry) => entry !== undefined && entry !== null && String(entry).trim()
        );
        return first !== undefined ? String(first) : null;
      }
      const text = String(value);
      return text ? text : null;
    };

    const headerGetter = (headers as { get?: (name: string) => unknown }).get;
    if (typeof headerGetter === 'function') {
      for (const key of keys) {
        const match = normalizeValue(headerGetter.call(headers, key));
        if (match) return match;
      }
    }

    const entries =
      typeof (headers as { entries?: () => Iterable<[string, unknown]> }).entries === 'function'
        ? Array.from((headers as { entries: () => Iterable<[string, unknown]> }).entries())
        : Object.entries(headers);

    const normalized = Object.fromEntries(
      entries.map(([key, value]) => [String(key).toLowerCase(), value])
    );
    for (const key of keys) {
      const match = normalizeValue(normalized[key.toLowerCase()]);
      if (match) return match;
    }
    return null;
  }

  private captureManagementSession(
    headers: Record<string, unknown> | undefined,
    config: AxiosRequestConfig | undefined
  ): void {
    const requestConfig = config as ManagementRequestConfig | undefined;
    if (requestConfig?._managementAuthGeneration !== this.managementAuthGeneration) return;

    const session = this.readHeader(headers, MANAGEMENT_SESSION_HEADER_KEYS);
    if (session) this.managementSession = session;
  }

  /**
   * 设置请求/响应拦截器
   */
  private setupInterceptors(instance: AxiosInstance): void {
    // 请求拦截器
    instance.interceptors.request.use(
      (config) => {
        const requestConfig = config as ManagementRequestConfig;
        // 设置 baseURL
        config.baseURL = this.apiBase;
        if (config.url) {
          // Normalize deprecated Gemini endpoint to the current path.
          config.url = config.url.replace(/\/generative-language-api-key\b/g, '/gemini-api-key');
        }

        // 添加认证头
        requestConfig._managementAuthGeneration = this.managementAuthGeneration;
        requestConfig._managementSessionRequest = Boolean(this.managementSession);
        if (this.managementSession) {
          config.headers.Authorization = `CPA-Session ${this.managementSession}`;
        } else if (this.managementKey) {
          config.headers.Authorization = `Bearer ${this.managementKey}`;
        }

        return config;
      },
      (error) => Promise.reject(this.handleError(error))
    );

    // 响应拦截器
    instance.interceptors.response.use(
      (response) => {
        const headers = response.headers as Record<string, string | undefined>;
        this.captureManagementSession(headers, response.config);
        const version = this.readHeader(headers, VERSION_HEADER_KEYS);
        const buildDate = this.readHeader(headers, BUILD_DATE_HEADER_KEYS);

        // 触发版本更新事件（后续通过 store 处理）
        if (version || buildDate) {
          window.dispatchEvent(
            new CustomEvent('server-version-update', {
              detail: { version: version || null, buildDate: buildDate || null },
            })
          );
        }

        return response;
      },
      (error) => {
        if (isAxiosError(error)) {
          const headers = error.response?.headers as Record<string, unknown> | undefined;
          const requestConfig = error.config as ManagementRequestConfig | undefined;
          this.captureManagementSession(headers, requestConfig);

          const sessionStatus = this.readHeader(headers, MANAGEMENT_SESSION_STATUS_HEADER_KEYS);
          if (
            error.response?.status === 401 &&
            sessionStatus?.trim().toLowerCase() === 'invalid' &&
            requestConfig?._managementSessionRequest === true &&
            requestConfig._managementSessionRetry !== true &&
            requestConfig._managementAuthGeneration === this.managementAuthGeneration
          ) {
            this.managementSession = '';
            requestConfig._managementSessionRetry = true;
            return instance.request(requestConfig);
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * 错误处理
   */
  private handleError(error: unknown): ApiError {
    if (isAxiosError(error)) {
      const responseData: unknown = error.response?.data;
      const responseRecord = isRecord(responseData) ? responseData : null;
      const errorValue = responseRecord?.error;
      const message =
        typeof errorValue === 'string'
          ? errorValue
          : isRecord(errorValue) && typeof errorValue.message === 'string'
            ? errorValue.message
            : typeof responseRecord?.message === 'string'
              ? responseRecord.message
              : error.message || 'Request failed';
      const apiError = new Error(message) as ApiError;
      apiError.name = 'ApiError';
      apiError.status = error.response?.status;
      apiError.code = error.code;
      apiError.details = responseData;
      apiError.data = responseData;

      // 401 未授权 - 触发登出事件
      const skipUnauthorizedLogout =
        (error.config as ApiRequestConfig | undefined)?.skipUnauthorizedLogout === true;
      const requestGeneration = (error.config as ManagementRequestConfig | undefined)
        ?._managementAuthGeneration;
      const staleRequest =
        requestGeneration !== undefined && requestGeneration !== this.managementAuthGeneration;

      if (error.response?.status === 401 && !skipUnauthorizedLogout && !staleRequest) {
        window.dispatchEvent(new Event('unauthorized'));
      }

      return apiError;
    }

    const fallbackMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error occurred';
    const fallback = new Error(fallbackMessage) as ApiError;
    fallback.name = 'ApiError';
    return fallback;
  }

  /**
   * GET 请求
   */
  async get<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
    const response = await (await this.getInstance()).get<T>(url, config);
    return response.data;
  }

  /**
   * POST 请求
   */
  async post<T = unknown>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    const response = await (await this.getInstance()).post<T>(url, data, config);
    return response.data;
  }

  /**
   * PUT 请求
   */
  async put<T = unknown>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    const response = await (await this.getInstance()).put<T>(url, data, config);
    return response.data;
  }

  /**
   * PATCH 请求
   */
  async patch<T = unknown>(url: string, data?: unknown, config?: ApiRequestConfig): Promise<T> {
    const response = await (await this.getInstance()).patch<T>(url, data, config);
    return response.data;
  }

  /**
   * DELETE 请求
   */
  async delete<T = unknown>(url: string, config?: ApiRequestConfig): Promise<T> {
    const response = await (await this.getInstance()).delete<T>(url, config);
    return response.data;
  }

  /**
   * 获取原始响应（用于下载等场景）
   */
  async getRaw(url: string, config?: ApiRequestConfig): Promise<AxiosResponse> {
    return (await this.getInstance()).get(url, config);
  }

  /**
   * 发送 FormData
   */
  async postForm<T = unknown>(
    url: string,
    formData: FormData,
    config?: ApiRequestConfig
  ): Promise<T> {
    const response = await (
      await this.getInstance()
    ).post<T>(url, formData, {
      ...config,
      headers: {
        ...(config?.headers || {}),
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * 保留对 axios.request 的访问，便于下载等场景
   */
  async requestRaw(config: ApiRequestConfig): Promise<AxiosResponse> {
    return (await this.getInstance()).request(config);
  }
}

// 导出单例
export const apiClient = new ApiClient();
