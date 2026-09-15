import { Envelope } from '@/types/common';
import { BusinessCode } from '@/types/error';
import { AppError } from './errors';
import { getAccessToken, requestTokenRefresh, setAccessToken } from './token';
import { ensureCsrfToken, getCsrfToken, setCsrfToken } from './csrf';

export interface RequestOptions extends RequestInit {
  timeout?: number;
  skipAuth?: boolean;
  skipCsrf?: boolean;
  _isRetry?: boolean;
}

const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// 认证与身份事件通知
export const AUTH_UNAUTHORIZED_EVENT = 'vps:auth:unauthorized';
export const AUTH_FROZEN_EVENT = 'vps:auth:frozen';
export const AUTH_REVOKED_EVENT = 'vps:auth:revoked';

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
}

function notifyFrozen() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_FROZEN_EVENT));
  }
}

function notifyRevoked() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_REVOKED_EVENT));
  }
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<Envelope<T>> {
  const {
    timeout = 15000,
    skipAuth = false,
    skipCsrf = false,
    _isRetry = false,
    headers: customHeaders,
    ...fetchInit
  } = options;

  const rawUrl = path.startsWith('http') ? path : `${DEFAULT_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const url = typeof window === 'undefined' && !rawUrl.startsWith('http') ? `http://localhost${rawUrl}` : rawUrl;
  const headers = new Headers(customHeaders);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  // 1. 自动挂载 Access Token
  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // 2. 自动挂载 CSRF Token（认证相关写请求必须）
  const isAuthWrite =
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh') ||
    path.includes('/auth/logout') ||
    path.includes('/auth/password-reset');

  if (isAuthWrite && !skipCsrf) {
    try {
      let csrfToken = getCsrfToken();
      if (!csrfToken) {
        csrfToken = await ensureCsrfToken(DEFAULT_BASE_URL);
      }
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
    } catch {
      // 忽略 CSRF 获取异常，交给服务端拦截
    }
  }

  // 3. 超时控制
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  if (fetchInit.signal) {
    fetchInit.signal.addEventListener('abort', () => controller.abort());
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      ...fetchInit,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError(408, BusinessCode.INTERNAL_ERROR, '请求超时，请检查网络后重试');
    }
    throw new AppError(0, BusinessCode.INTERNAL_ERROR, '网络连接失败，请稍后重试');
  } finally {
    clearTimeout(timer);
  }

  // 4. 解析响应
  let data: any = null;
  const contentType = resp.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
  }

  // 5. 成功返回
  if (resp.ok && data && typeof data.code === 'number' && data.code === 0) {
    return data as Envelope<T>;
  }

  const statusCode = resp.status;
  let businessCode = data && typeof data.code === 'number' ? data.code : BusinessCode.INTERNAL_ERROR;
  if (statusCode === 501 && businessCode === BusinessCode.INTERNAL_ERROR) {
    businessCode = BusinessCode.NOT_IMPLEMENTED;
  }
  const message = data?.message || (statusCode === 501 ? '该功能尚未实现' : statusCode >= 500 ? '服务暂时异常，请稍后重试' : '请求失败');
  const requestId = data?.request_id;
  const errors = data?.errors;

  // 6. 受控 Token 刷新处理 (仅 401 且 code 为 200003 ACCESS_EXPIRED 时自动触发一次刷新重试)
  if (statusCode === 401 && businessCode === BusinessCode.ACCESS_EXPIRED && !_isRetry) {
    const refreshedToken = await requestTokenRefresh(DEFAULT_BASE_URL);
    if (refreshedToken) {
      return apiRequest<T>(path, {
        ...options,
        _isRetry: true,
      });
    } else {
      setAccessToken(null);
      notifyUnauthorized();
    }
  } else if (businessCode === BusinessCode.USER_FROZEN) {
    setAccessToken(null);
    notifyFrozen();
  } else if (businessCode === BusinessCode.TOKEN_REVOKED || businessCode === BusinessCode.INVALID_TOKEN) {
    setAccessToken(null);
    notifyRevoked();
  } else if (statusCode === 401) {
    setAccessToken(null);
    notifyUnauthorized();
  }

  // 7. CSRF 校验失败时重置内存中的 CSRF 缓存
  if (statusCode === 403 && businessCode === BusinessCode.CSRF_REJECTED) {
    setCsrfToken(null);
  }

  throw new AppError(statusCode, businessCode, message, requestId, errors);
}

export const apiClient = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : JSON.stringify({}),
    }),

  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : JSON.stringify({}),
    }),

  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, {
      ...options,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
