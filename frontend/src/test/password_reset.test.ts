import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPasswordResetCode, confirmPasswordReset } from '../api/passwordReset';
import { setCsrfToken } from '../lib/http/csrf';

describe('Password reset HTTP contract', () => {
  beforeEach(() => setCsrfToken('test-csrf-token'));
  afterEach(() => {
    setCsrfToken(null);
    vi.unstubAllGlobals();
  });

  it('sends code and confirmation requests through the real client with CSRF', async () => {
    const requests: Request[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      requests.push(new Request(url, init));
      return Response.json({ code: 0, data: requests.length === 1
        ? { reset_id: 'reset-1', expires_in: 600, retry_after: 60 } : null });
    });
    const result = await requestPasswordResetCode({ mail: 'reader@example.com' });
    expect(result.data.reset_id).toBe('reset-1');
    expect(new URL(requests[0].url).pathname).toBe('/api/v1/auth/password-reset/code');
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(await requests[0].json()).toEqual({ mail: 'reader@example.com' });

    const input = { reset_id: result.data.reset_id, code: '012345', new_password: 'A-secure-password' };
    await expect(confirmPasswordReset(input)).resolves.toMatchObject({ data: null });
    expect(new URL(requests[1].url).pathname).toBe('/api/v1/auth/password-reset/confirm');
    expect(requests[1].method).toBe('POST');
    expect(requests[1].headers.get('X-CSRF-Token')).toBe('test-csrf-token');
    expect(await requests[1].json()).toEqual(input);
  });

  it('preserves invalid-code errors from the backend', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ code: 200016, message: '重置请求或验证码错误', data: null }, { status: 400 }));
    await expect(confirmPasswordReset({ reset_id: 'expired', code: '123456', new_password: 'A-secure-password' }))
      .rejects.toMatchObject({ status: 400, code: 200016 });
  });
});
