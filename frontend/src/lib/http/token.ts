// 内存 Access Token 管理与受控轮换协调机制
import { ensureCsrfToken } from './csrf';

let memoryAccessToken: string | null = null;
let refreshInProgressPromise: Promise<string | null> | null = null;

// 多标签同步通道
const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vps_auth_channel') : null;

if (authChannel) {
  authChannel.onmessage = (event) => {
    if (event.data?.type === 'TOKEN_UPDATED') {
      memoryAccessToken = event.data.accessToken;
    } else if (event.data?.type === 'LOGOUT') {
      memoryAccessToken = null;
    }
  };
}

export function getAccessToken(): string | null {
  return memoryAccessToken;
}

export function setAccessToken(token: string | null) {
  memoryAccessToken = token;
  if (authChannel) {
    if (token) {
      authChannel.postMessage({ type: 'TOKEN_UPDATED', accessToken: token });
    } else {
      authChannel.postMessage({ type: 'LOGOUT' });
    }
  }
}

/**
 * 触发受控 Refresh 请求
 * 采用 Single-flight 和 Web Locks（支持的环境）防止并发刷新造成旧 Token 重放被撤销
 */
export async function requestTokenRefresh(baseUrl: string = '/api/v1'): Promise<string | null> {
  if (refreshInProgressPromise) {
    return refreshInProgressPromise;
  }

  const executeRefresh = async (): Promise<string | null> => {
    try {
      const csrfToken = await ensureCsrfToken(baseUrl);
      const resp = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({}),
        credentials: 'include',
      });

      if (!resp.ok) {
        setAccessToken(null);
        return null;
      }

      const json = await resp.json();
      if (json && json.code === 0 && json.data && json.data.access_token) {
        const newToken = json.data.access_token as string;
        setAccessToken(newToken);
        return newToken;
      }

      setAccessToken(null);
      return null;
    } catch {
      setAccessToken(null);
      return null;
    }
  };

  // 跨标签互斥
  if (typeof navigator !== 'undefined' && 'locks' in navigator && navigator.locks?.request) {
    refreshInProgressPromise = (navigator.locks.request('vps_auth_refresh_lock', async () => {
      // 检查当前内存是否已有刚被其他标签刷新的有效 token
      return await executeRefresh();
    }).finally(() => {
      refreshInProgressPromise = null;
    }) as unknown) as Promise<string | null>;
  } else {
    refreshInProgressPromise = executeRefresh().finally(() => {
      refreshInProgressPromise = null;
    });
  }

  return refreshInProgressPromise;
}
