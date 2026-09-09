import { http, HttpResponse } from 'msw';
import { mockUsers, mockSessions, MockUserRecord } from '../data';

const BASE_URL = '/api/v1';

let currentMockUserId: string | null = null;
let currentMockSessionId: string | null = null;

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
        data: { csrf_token: 'mock_csrf_valid_token_12345' },
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

    if (!username || !/^[a-z0-9_]{4,32}$/.test(username)) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '用户名须为 4~32 位小写字母、数字或下划线',
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

    const pwdRunes = password ? [...password].length : 0;
    const pwdBytes = password ? new TextEncoder().encode(password).length : 0;
    if (!password || pwdRunes < 12 || pwdRunes > 128 || pwdBytes > 512) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '密码长度须在 12~128 个字符之间',
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
        { code: 200007, message: '用户名已被使用', data: null, request_id: `req_${Date.now()}` },
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockUsers.push(newUser);

    const { password: _, ...userSelf } = newUser;
    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: { user: userSelf },
        request_id: `req_${Date.now()}`,
      },
      { status: 201 }
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
    currentMockSessionId = `mock_session_${Date.now()}`;

    mockSessions.push({
      id: currentMockSessionId,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      refresh_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      is_current: true,
    });

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
          'Set-Cookie': `vps_refresh=mock_refresh_${currentMockSessionId}; Path=/; HttpOnly; SameSite=Lax`,
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
    currentMockSessionId = null;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 6. POST /auth/logout-all
  http.post(`${BASE_URL}/auth/logout-all`, () => {
    if (currentMockUserId) {
      mockSessions.forEach((s) => {
        if (s.user_id === currentMockUserId) {
          s.revoked_at = new Date().toISOString();
        }
      });
    }
    currentMockUserId = null;
    currentMockSessionId = null;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),
];
