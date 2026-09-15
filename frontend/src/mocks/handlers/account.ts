import { http, HttpResponse } from 'msw';
import { getCurrentMockUser } from './auth';

const BASE_URL = '/api/v1';

export const accountHandlers = [
  // GET /me/info
  http.get(`${BASE_URL}/me/info`, () => {
    const user = getCurrentMockUser();
    if (!user || user.frozen) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }
    const { password: _, ...userSelf } = user;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: userSelf,
      request_id: `req_${Date.now()}`,
    });
  }),

  // PUT /me/update
  http.put(`${BASE_URL}/me/update`, async ({ request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }
    const body = (await request.json()) as any;
    const { nickname } = body;
    user.nickname = nickname ? nickname.trim() : user.nickname;
    user.updated_at = new Date().toISOString();

    const { password: _, ...userSelf } = user;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: userSelf,
      request_id: `req_${Date.now()}`,
    });
  }),

  // PUT /me/password
  http.put(`${BASE_URL}/me/password`, async ({ request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }
    const body = (await request.json()) as any;
    const { current_password, new_password } = body;

    if (user.password !== current_password) {
      return HttpResponse.json(
        { code: 200001, message: '当前密码错误', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    user.password = new_password;
    user.updated_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),
];
