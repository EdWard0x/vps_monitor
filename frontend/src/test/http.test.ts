import { describe, it, expect, beforeEach } from 'vitest';
import { AppError, isAppError, getErrorMessage } from '../lib/http/errors';
import { BusinessCode, BusinessCodeMessages } from '../types/error';
import { getAccessToken, setAccessToken } from '../lib/http/token';
import { getCsrfToken, setCsrfToken } from '../lib/http/csrf';

describe('HTTP and Error infrastructure tests', () => {
  beforeEach(() => {
    setAccessToken(null);
    setCsrfToken(null);
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
    expect(BusinessCode.SESSION_REVOKED).toBe(200004);
    expect(BusinessCode.REFRESH_REUSED).toBe(200010);
    expect(BusinessCode.CONFIG_VERSION_CONFLICT).toBe(300004);
    expect(BusinessCode.ANONYMOUS_DISABLED).toBe(400002);
    expect(BusinessCode.COMMENT_DEPTH_EXCEEDED).toBe(400004);
    expect(BusinessCode.LAST_ADMIN_REQUIRED).toBe(500001);

    expect(BusinessCodeMessages[BusinessCode.LAST_ADMIN_REQUIRED]).toBe('必须保留至少一个启用的管理员');
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
});
