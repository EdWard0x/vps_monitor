// CSRF Token 内存状态与操作封装

let memoryCsrfToken: string | null = null;
let fetchingCsrfPromise: Promise<string> | null = null;

export function getCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setCsrfToken(token: string | null) {
  memoryCsrfToken = token;
}

/**
 * 获取 CSRF Token。若内存中已存在直接返回；不存在时从服务端获取
 */
export async function ensureCsrfToken(baseUrl: string = '/api/v1'): Promise<string> {
  if (memoryCsrfToken) {
    return memoryCsrfToken;
  }
  if (fetchingCsrfPromise) {
    return fetchingCsrfPromise;
  }

  fetchingCsrfPromise = (async () => {
    try {
      const resp = await fetch(`${baseUrl}/auth/csrf`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        credentials: 'include',
      });
      if (!resp.ok) {
        throw new Error(`获取 CSRF Token 失败: HTTP ${resp.status}`);
      }
      const json = await resp.json();
      if (json && json.data && typeof json.data.token === 'string') {
        memoryCsrfToken = json.data.token;
        return memoryCsrfToken!;
      }
      throw new Error('CSRF 响应格式不匹配');
    } finally {
      fetchingCsrfPromise = null;
    }
  })();

  return fetchingCsrfPromise;
}
