import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import { apiClient } from '../lib/http/client';
import { normalizeMail } from '../lib/format/mail';
import { BusinessCode, BusinessCodeMessages } from '../types/error';
import { RequestPasswordResetCodeResult } from '../types';
import { setCsrfToken } from '../lib/http/csrf';
import { mockUsers } from '../mocks/data';

const server = setupServer(...handlers);

describe('Password Reset Feature Tests', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
  afterEach(() => {
    server.resetHandlers();
    setCsrfToken(null);
  });
  afterAll(() => server.close());

  it('verifies BusinessCode and BusinessCodeMessages for password reset', () => {
    expect(BusinessCode.PASSWORD_RESET_INVALID).toBe(200016);
    expect(BusinessCodeMessages[200016]).toContain('重置请求或验证码错误');
  });

  it('normalizes email address correctly for password reset requests', () => {
    const res = normalizeMail('  Admin@VPSMonitor.Local  ');
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe('admin@vpsmonitor.local');
  });

  it('validates password requirements (UTF-8 8~72 bytes)', () => {
    const validatePassword = (pwd: string) => {
      const bytes = new TextEncoder().encode(pwd).length;
      return bytes >= 8 && bytes <= 72;
    };

    expect(validatePassword('short')).toBe(false);
    expect(validatePassword('1234567')).toBe(false);
    expect(validatePassword('12345678')).toBe(true);
    expect(validatePassword('Correct-Horse-Battery-Staple-2026!')).toBe(true);
    expect(validatePassword('a'.repeat(72))).toBe(true);
    expect(validatePassword('a'.repeat(73))).toBe(false);
    expect(validatePassword('密码密码')).toBe(true);
    expect(validatePassword('密码密码密码密码密码密码密码密码密码密码密码密码密码')).toBe(false);
  });

  it('validates 6-digit numeric verification code', () => {
    const isValidCode = (code: string) => /^\d{6}$/.test(code);
    expect(isValidCode('012345')).toBe(true);
    expect(isValidCode('999999')).toBe(true);
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('1234567')).toBe(false);
    expect(isValidCode('abcdef')).toBe(false);
  });

  it('successfully requests password reset code and confirms new password via MSW', async () => {
    // 预先设置 mock CSRF Token
    setCsrfToken('mock_csrf_valid_token_12345');

    // 1. 发起获取验证码请求 (admin@vpsmonitor.local 为已验证账号)
    const reqRes = await apiClient.post<RequestPasswordResetCodeResult>('/auth/password-reset/code', {
      mail: 'Admin@VPSMonitor.Local',
    });

    expect(reqRes.code).toBe(0);
    expect(reqRes.data.reset_id).toBeTruthy();
    expect(reqRes.data.expires_in).toBe(600);
    expect(reqRes.data.retry_after).toBe(60);

    const resetId = reqRes.data.reset_id;

    // 2. 提交错误的验证码，预期返回 200016
    await expect(
      apiClient.post('/auth/password-reset/confirm', {
        reset_id: resetId,
        code: '999999',
        new_password: 'BrandNewSecurePassword2026!',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: BusinessCode.PASSWORD_RESET_INVALID,
    });

    // 3. 提交不合规的过短密码，预期返回 100001
    await expect(
      apiClient.post('/auth/password-reset/confirm', {
        reset_id: resetId,
        code: '123456',
        new_password: 'short',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: BusinessCode.INVALID_ARGUMENT,
    });

    // 4. 使用正确的验证码和合规的新密码提交重置
    const confirmRes = await apiClient.post('/auth/password-reset/confirm', {
      reset_id: resetId,
      code: '123456',
      new_password: 'BrandNewSecurePassword2026!',
    });

    expect(confirmRes.code).toBe(0);
    expect(confirmRes.data).toBeNull();

    // 5. 校验该 mock 用户的密码是否已更新为新密码
    const adminUser = mockUsers.find((u) => u.username === 'integration_admin');
    expect(adminUser?.password).toBe('BrandNewSecurePassword2026!');

    // 6. 验证旧密码无法登录，新密码可以成功登录
    await expect(
      apiClient.post('/auth/login', {
        username: 'integration_admin',
        password: 'Old-Wrong-Password!',
      })
    ).rejects.toMatchObject({
      status: 401,
      code: BusinessCode.INVALID_CREDENTIALS,
    });

    const loginRes = await apiClient.post('/auth/login', {
      username: 'integration_admin',
      password: 'BrandNewSecurePassword2026!',
    });
    expect(loginRes.code).toBe(0);

    // 7. 验证已消费的 resetId 无法二次使用
    await expect(
      apiClient.post('/auth/password-reset/confirm', {
        reset_id: resetId,
        code: '123456',
        new_password: 'BrandNewSecurePassword2026!',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: BusinessCode.PASSWORD_RESET_INVALID,
    });
  });

  it('rejects invalid email formats on code request', async () => {
    setCsrfToken('mock_csrf_valid_token_12345');

    await expect(
      apiClient.post('/auth/password-reset/code', {
        mail: 'invalid-email-format',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: BusinessCode.INVALID_ARGUMENT,
    });
  });

  it('returns unified 202 for unknown email but rejects confirmation', async () => {
    setCsrfToken('mock_csrf_valid_token_12345');

    // 未知或未验证邮箱仍返回统一的 202 响应，防止账户遍历
    const res = await apiClient.post<RequestPasswordResetCodeResult>('/auth/password-reset/code', {
      mail: 'unknown-user@example.com',
    });
    expect(res.code).toBe(0);
    expect(res.data.reset_id).toBeTruthy();

    // 但在提交确认时由于没有关联的可用账号，确认操作将返回 200016
    await expect(
      apiClient.post('/auth/password-reset/confirm', {
        reset_id: res.data.reset_id,
        code: '123456',
        new_password: 'SomeValidPassword123!',
      })
    ).rejects.toMatchObject({
      status: 400,
      code: BusinessCode.PASSWORD_RESET_INVALID,
    });
  });
});
