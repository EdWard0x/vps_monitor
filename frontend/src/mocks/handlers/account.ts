import { http, HttpResponse } from 'msw';
import {
  mockSessions,
  mockComments,
  mockSettings,
} from '../data';
import { CommentAdmin } from '@/types/api';
import { getCurrentMockUser, setCurrentMockUser } from './auth';

const BASE_URL = '/api/v1';

export const accountHandlers = [
  // 1. GET /me
  http.get(`${BASE_URL}/me`, () => {
    const user = getCurrentMockUser();
    if (!user || !user.enabled) {
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

  // 2. PATCH /me
  http.patch(`${BASE_URL}/me`, async ({ request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }
    const body = (await request.json()) as any;
    const { nickname } = body;
    const cleanNick = nickname ? nickname.trim() : '';
    const nickRunes = [...cleanNick].length;
    if (!cleanNick || nickRunes < 1 || nickRunes > 32) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '昵称长度须在 1~32 个字符之间',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'nickname', reason: 'invalid_length' }],
        },
        { status: 400 }
      );
    }

    user.nickname = cleanNick;
    user.updated_at = new Date().toISOString();

    const { password: _, ...userSelf } = user;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: userSelf,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 3. PATCH /me/password
  http.patch(`${BASE_URL}/me/password`, async ({ request }) => {
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
        { code: 200001, message: '用户名或密码错误，或账户不可用', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const pwdRunes = new_password ? [...new_password].length : 0;
    const pwdBytes = new_password ? new TextEncoder().encode(new_password).length : 0;
    if (!new_password || pwdRunes < 12 || pwdRunes > 128 || pwdBytes > 512) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '新密码长度须在 12~128 字符之间',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'new_password', reason: 'invalid_length' }],
        },
        { status: 400 }
      );
    }

    user.password = new_password;
    user.updated_at = new Date().toISOString();

    // 撤销该用户所有会话并退出
    mockSessions.forEach((s) => {
      if (s.user_id === user.id) {
        s.revoked_at = new Date().toISOString();
      }
    });
    setCurrentMockUser(null);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 4. GET /me/sessions
  http.get(`${BASE_URL}/me/sessions`, ({ request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    const activeSessions = mockSessions
      .filter((s) => s.user_id === user.id && !s.revoked_at)
      .map(({ user_id, revoked_at, ...sessionPublic }) => sessionPublic);

    const start = (page - 1) * pageSize;
    const items = activeSessions.slice(start, start + pageSize);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        total: activeSessions.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 5. DELETE /me/sessions/:id
  http.delete(`${BASE_URL}/me/sessions/:id`, ({ params }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const session = mockSessions.find((s) => s.id === params.id && s.user_id === user.id);
    if (!session) {
      return HttpResponse.json(
        { code: 100005, message: '资源不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    session.revoked_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 6. GET /me/comments
  http.get(`${BASE_URL}/me/comments`, ({ request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);
    const visibility = url.searchParams.get('visibility');

    let myComments = mockComments.filter((c) => c.author.id === user.id);
    if (visibility) {
      myComments = myComments.filter((c) => c.visibility.toString() === visibility);
    }

    myComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const start = (page - 1) * pageSize;
    const items = myComments.slice(start, start + pageSize).map((c) => {
      const { author: _, ...commentPrivate } = c;
      return commentPrivate;
    });

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        total: myComments.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 7. POST /vps/:id/comments
  http.post(`${BASE_URL}/vps/:id/comments`, async ({ params, request }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    if (!mockSettings.comments_enabled) {
      return HttpResponse.json(
        { code: 400001, message: '暂未开放评论', data: null, request_id: `req_${Date.now()}` },
        { status: 403 }
      );
    }

    const body = (await request.json()) as any;
    const { content, is_anonymous = false, parent_id = null } = body;

    if (!content || content.trim().length < 1 || content.length > 2000) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '评论内容须为 1~2000 字符',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'content', reason: 'invalid_length' }],
        },
        { status: 400 }
      );
    }

    if (is_anonymous && !mockSettings.anonymous_comments_enabled) {
      return HttpResponse.json(
        { code: 400002, message: '暂未开放匿名评论', data: null, request_id: `req_${Date.now()}` },
        { status: 403 }
      );
    }

    let depth = 0;
    let rootId = null;

    if (parent_id) {
      const parent = mockComments.find((c) => c.id === parent_id && c.vps_id === params.id);
      if (!parent) {
        return HttpResponse.json(
          { code: 400003, message: '回复的评论不存在', data: null, request_id: `req_${Date.now()}` },
          { status: 404 }
        );
      }
      if (parent.visibility === 4) {
        return HttpResponse.json(
          { code: 400007, message: '该评论暂不支持回复', data: null, request_id: `req_${Date.now()}` },
          { status: 409 }
        );
      }
      depth = parent.depth + 1;
      rootId = parent.root_id || parent.id;

      if (depth > mockSettings.comment_max_depth) {
        return HttpResponse.json(
          { code: 400004, message: '已达到评论嵌套层数上限', data: null, request_id: `req_${Date.now()}` },
          { status: 422 }
        );
      }
    }

    const newComment: CommentAdmin = {
      id: (mockComments.length + 5000 + 1).toString(),
      vps_id: params.id as string,
      parent_id,
      root_id: rootId,
      depth,
      content: content.trim(),
      is_anonymous: Boolean(is_anonymous),
      visibility: mockSettings.comment_review_required ? 2 : 1,
      can_delete: true,
      author: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockComments.push(newComment);

    const { author: _, ...commentPrivate } = newComment;
    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: commentPrivate,
        request_id: `req_${Date.now()}`,
      },
      { status: 201 }
    );
  }),

  // 8. DELETE /comments/:id
  http.delete(`${BASE_URL}/comments/:id`, ({ params }) => {
    const user = getCurrentMockUser();
    if (!user) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const comment = mockComments.find((c) => c.id === params.id);
    if (!comment) {
      return HttpResponse.json(
        { code: 100005, message: '资源不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    if (comment.author.id !== user.id) {
      return HttpResponse.json(
        { code: 400005, message: '只能删除自己的评论', data: null, request_id: `req_${Date.now()}` },
        { status: 403 }
      );
    }

    // 删除正文并标记为 visibility = 4（已删除占位）
    comment.content = '';
    comment.visibility = 4;
    comment.can_delete = false;
    comment.updated_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),
];
