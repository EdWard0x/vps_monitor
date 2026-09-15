import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppError, isAppError, getErrorMessage } from '../lib/http/errors';
import { BusinessCode, BusinessCodeMessages } from '../types/error';
import { getAccessToken, setAccessToken } from '../lib/http/token';
import { ensureCsrfToken, getCsrfToken, setCsrfToken } from '../lib/http/csrf';

describe('HTTP and Error infrastructure tests', () => {
  beforeEach(() => {
    setAccessToken(null);
    setCsrfToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AppError correctly preserves status, code, requestId and field errors', () => {
    const err = new AppError(
      400,
      BusinessCode.INVALID_ARGUMENT,
      '请求参数不合法',
      'req_12345',
      [{ field: 'content', reason: 'max_length', limit: 2000 }]
    );

    expect(isAppError(err)).toBe(true);
    expect(err.status).toBe(400);
    expect(err.code).toBe(100001);
    expect(err.requestId).toBe('req_12345');
    expect(err.errors?.[0].field).toBe('content');
    expect(getErrorMessage(err)).toBe('content: max_length (2000)');
  });

  it('Business code registry covers key codes from docs', () => {
    expect(BusinessCode.OK).toBe(0);
    expect(BusinessCode.CSRF_REJECTED).toBe(100004);
    expect(BusinessCode.INVALID_CREDENTIALS).toBe(200001);
    expect(BusinessCode.ACCESS_EXPIRED).toBe(200003);
    expect(BusinessCode.USER_FROZEN).toBe(200005);
    expect(BusinessCode.TOKEN_REVOKED).toBe(200017);
    expect(BusinessCode.NOT_IMPLEMENTED).toBe(900005);
    expect(BusinessCode.DEPENDENCY_UNAVAILABLE).toBe(900004);
    expect(BusinessCode.RESOURCE_CONFLICT).toBe(100006);
    expect(BusinessCode.INVALID_USERNAME).toBe(300001);
    expect(BusinessCode.USERNAME_EXISTS).toBe(300002);
    expect(BusinessCode.REGISTRATION_DISABLED).toBe(200018);

    expect(BusinessCodeMessages[BusinessCode.RESOURCE_CONFLICT]).toBe('资源冲突或仍被引用');
    expect(BusinessCodeMessages[BusinessCode.USER_FROZEN]).toBe('账号已被冻结，请联系管理员');
    expect(BusinessCodeMessages[BusinessCode.NOT_IMPLEMENTED]).toBe('该功能尚未实现');
  });

  it('In-memory Access Token is isolated from persistent storage', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('test_memory_jwt_token');
    expect(getAccessToken()).toBe('test_memory_jwt_token');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });

  it('In-memory CSRF Token is properly stored and cleared', () => {
    expect(getCsrfToken()).toBeNull();
    setCsrfToken('mock_csrf_abc');
    expect(getCsrfToken()).toBe('mock_csrf_abc');
    setCsrfToken(null);
    expect(getCsrfToken()).toBeNull();
  });

  it('loads the documented data.token CSRF response field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: 'ok', data: { token: 'signed-csrf-token' }, request_id: 'req_csrf' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(ensureCsrfToken('/api/v1')).resolves.toBe('signed-csrf-token');
    expect(getCsrfToken()).toBe('signed-csrf-token');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/csrf', expect.objectContaining({ credentials: 'include' }));
  });

  it('cleanupProjectMockServiceWorker only unregisters mockServiceWorker registrations', async () => {
    const { cleanupProjectMockServiceWorker } = await import('../lib/cleanMockWorker');

    const mockUnregister = vi.fn().mockResolvedValue(true);
    const otherUnregister = vi.fn().mockResolvedValue(true);

    const mockRegistration = {
      active: { scriptURL: 'https://example.com/mockServiceWorker.js' },
      unregister: mockUnregister,
    };
    const otherRegistration = {
      active: { scriptURL: 'https://example.com/sw-pwa.js' },
      unregister: otherUnregister,
    };

    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([mockRegistration, otherRegistration]),
      },
    });

    await cleanupProjectMockServiceWorker();

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(otherUnregister).not.toHaveBeenCalled();
  });
});
