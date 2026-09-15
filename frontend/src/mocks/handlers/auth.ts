import { http, HttpResponse } from 'msw';
import { mockUsers, MockUserRecord } from '../data';
import { normalizeMail } from '@/lib/format/mail';

const BASE_URL = typeof window !== 'undefined' ? '/api/v1' : '*/api/v1';

let currentMockUserId: string | null = null;

export interface MockResetRecord {
  resetId: string;
  mail: string;
  code: string;
  userId?: string;
  attempts: number;
  expiresAt: number;
}

export const mockResetRequests: Map<string, MockResetRecord> = new Map();

export function setCurrentMockUser(userId: string | null) {
  currentMockUserId = userId;
}

export function getCurrentMockUser(): MockUserRecord | undefined {
  if (!currentMockUserId) return undefined;
  return mockUsers.find((u) => u.id === currentMockUserId);
}

export const authHandlers = [
  // 1. GET /auth/csrf
  http.get(`${BASE_URL}/auth/csrf`, () => {
    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: { token: 'mock_csrf_valid_token_12345' },
        request_id: `req_${Date.now()}`,
      },
      {
        headers: {
          'Set-Cookie': 'vps_csrf=mock_csrf_valid_token_12345; Path=/; SameSite=Lax',
        },
      }
    );
  }),

  // 2. POST /auth/register
  http.post(`${BASE_URL}/auth/register`, async ({ request }) => {
    const body = (await request.json()) as any;
    const { username, nickname, password } = body;

    if (!username || !/^[a-z0-9][a-z0-9_]{2,63}$/.test(username)) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '用户名须为 3~64 位，以小写字母或数字开头，仅包含小写字母、数字或下划线',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'username', reason: 'invalid_format' }],
        },
        { status: 400 }
      );
    }

    const cleanNick = nickname ? nickname.trim() : '';
    const nickRunes = [...cleanNick].length;
    if (!cleanNick || nickRunes < 1 || nickRunes > 32) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '昵称须为 1~32 个字符',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'nickname', reason: 'invalid_length' }],
        },
        { status: 400 }
      );
    }

    const pwdBytes = password ? new TextEncoder().encode(password).length : 0;
    if (!password || pwdBytes < 8 || pwdBytes > 72) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '密码的 UTF-8 长度须在 8~72 字节之间',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'password', reason: 'invalid_length' }],
        },
        { status: 400 }
      );
    }

    // 检查用户名冲突
    const exists = mockUsers.some((u) => u.username === username.toLowerCase().trim());
    if (exists) {
      return HttpResponse.json(
        { code: 300002, message: '用户名已被使用', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    const newUser: MockUserRecord = {
      id: (mockUsers.length + 1).toString(),
      username: username.toLowerCase().trim(),
      nickname: nickname.trim(),
      password,
      role: 'user',
      enabled: true,
      mail: null,
      mail_verified: false,
      mail_verified_at: null,
      mail_required: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockUsers.push(newUser);

    const { password: _, ...userSelf } = newUser;
    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: userSelf,
        request_id: `req_${Date.now()}`,
      },
      { status: 200 }
    );
  }),

  // 3. POST /auth/login
  http.post(`${BASE_URL}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as any;
    const { username, password } = body;

    const user = mockUsers.find(
      (u) => u.username === username?.toLowerCase().trim() && u.password === password
    );

    if (!user || !user.enabled) {
      return HttpResponse.json(
        { code: 200001, message: '用户名或密码错误，或账户不可用', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    currentMockUserId = user.id;

    const { password: _, ...userSelf } = user;

    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: {
          access_token: `mock_jwt_access_${user.id}_${Date.now()}`,
          token_type: 'Bearer',
          expires_in: 900,
          user: userSelf,
        },
        request_id: `req_${Date.now()}`,
      },
      {
        headers: {
          'Set-Cookie': `vps_refresh=mock_refresh_${user.id}_${Date.now()}; Path=/; HttpOnly; SameSite=Lax`,
        },
      }
    );
  }),

  // 4. POST /auth/refresh
  http.post(`${BASE_URL}/auth/refresh`, () => {
    if (!currentMockUserId) {
      return HttpResponse.json(
        { code: 200004, message: '登录会话已失效，请重新登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        access_token: `mock_jwt_access_${currentMockUserId}_${Date.now()}`,
        token_type: 'Bearer',
        expires_in: 900,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 5. POST /auth/logout
  http.post(`${BASE_URL}/auth/logout`, () => {
    currentMockUserId = null;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 6. POST /auth/logout-all
  http.post(`${BASE_URL}/auth/logout-all`, () => {
    currentMockUserId = null;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 7. POST /auth/password-reset/code
  http.post(`${BASE_URL}/auth/password-reset/code`, async ({ request }) => {
    const body = (await request.json()) as any;
    const { mail } = body || {};

    const { valid, normalized, error } = normalizeMail(mail || '');
    if (!valid) {
      return HttpResponse.json(
        {
          code: 100001,
          message: error || '邮箱格式不合法',
          data: null,
          request_id: `req_${Date.now()}`,
        },
        { status: 400 }
      );
    }

    const matchedUser = mockUsers.find(
      (u) => u.mail && u.mail.toLowerCase() === normalized && u.mail_verified && u.enabled
    );
    const resetId = `mock_reset_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const code = '123456';
    mockResetRequests.set(resetId, {
      resetId,
      mail: normalized,
      code,
      userId: matchedUser?.id,
      attempts: 0,
      expiresAt: Date.now() + 600 * 1000,
    });

    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: {
          reset_id: resetId,
          expires_in: 600,
          retry_after: 60,
          message: '如果该邮箱已绑定可用账号，将收到密码重置验证码。',
        },
        request_id: `req_${Date.now()}`,
      },
      { status: 202 }
    );
  }),

  // 8. POST /auth/password-reset/confirm
  http.post(`${BASE_URL}/auth/password-reset/confirm`, async ({ request }) => {
    const body = (await request.json()) as any;
    const { reset_id, code, new_password } = body || {};

    if (!reset_id || !code || !/^\d{6}$/.test(code)) {
      return HttpResponse.json(
        {
          code: 200016,
          message: '重置请求或验证码错误、过期、已失效或账号状态已改变',
          data: null,
          request_id: `req_${Date.now()}`,
        },
        { status: 400 }
      );
    }

    const pwdBytes = new_password ? new TextEncoder().encode(new_password).length : 0;
    if (!new_password || pwdBytes < 8 || pwdBytes > 72) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '密码的 UTF-8 长度须在 8~72 字节之间',
          data: null,
          request_id: `req_${Date.now()}`,
        },
        { status: 400 }
      );
    }

    const reqRecord = mockResetRequests.get(reset_id);
    if (!reqRecord || reqRecord.expiresAt < Date.now() || reqRecord.attempts >= 5 || !reqRecord.userId) {
      return HttpResponse.json(
        {
          code: 200016,
          message: '重置请求或验证码错误、过期、已失效或账号状态已改变',
          data: null,
          request_id: `req_${Date.now()}`,
        },
        { status: 400 }
      );
    }

    if (reqRecord.code !== code) {
      reqRecord.attempts += 1;
      return HttpResponse.json(
        {
          code: 200016,
          message: '重置请求或验证码错误、过期、已失效或账号状态已改变',
          data: null,
          request_id: `req_${Date.now()}`,
        },
        { status: 400 }
      );
    }

    // 成功完成：更新 mock 用户密码并撤销所有会话
    const user = mockUsers.find((u) => u.id === reqRecord.userId);
    if (user) {
      user.password = new_password;
      user.updated_at = new Date().toISOString();
    }

    if (currentMockUserId === reqRecord.userId) {
      currentMockUserId = null;
    }

    mockResetRequests.delete(reset_id);

    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: null,
        request_id: `req_${Date.now()}`,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': 'vps_refresh=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        },
      }
    );
  }),
];
