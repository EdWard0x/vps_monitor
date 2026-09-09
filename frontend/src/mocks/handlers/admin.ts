import { http, HttpResponse } from 'msw';
import {
  mockSettings,
  mockMerchants,
  mockVpsList,
  mockUsers,
  mockSessions,
  mockComments,
  mockCollectors,
} from '../data';
import { MerchantAdmin, VpsAdmin } from '@/types/api';
import { getCurrentMockUser } from './auth';

const BASE_URL = '/api/v1';

function requireAdmin() {
  const user = getCurrentMockUser();
  if (!user || !user.enabled) {
    return HttpResponse.json(
      { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
      { status: 401 }
    );
  }
  if (user.role !== 'admin') {
    return HttpResponse.json(
      { code: 200006, message: '没有操作权限', data: null, request_id: `req_${Date.now()}` },
      { status: 403 }
    );
  }
  return null;
}

export const adminHandlers = [
  // 1. GET /admin/dashboard
  http.get(`${BASE_URL}/admin/dashboard`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    const enabledUsers = mockUsers.filter((u) => u.enabled).length;
    const stockCounts = {
      in_stock: mockVpsList.filter((v) => v.enabled && v.stock.status === 1).length,
      out_of_stock: mockVpsList.filter((v) => v.enabled && v.stock.status === 2).length,
      unknown: mockVpsList.filter((v) => v.enabled && v.stock.status === 3).length,
    };
    const pendingComments = mockComments.filter((c) => c.visibility === 2).length;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        merchant_count: mockMerchants.length,
        vps_count: mockVpsList.length,
        user_count: mockUsers.length,
        enabled_user_count: enabledUsers,
        stock_counts: stockCounts,
        pending_comment_count: pendingComments,
        monitor_due_count: 0,
        last_checked_at: '2026-09-06T04:00:00Z',
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 2. GET /admin/merchants
  http.get(`${BASE_URL}/admin/merchants`, ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase();
    const enabled = url.searchParams.get('enabled');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    let list = mockMerchants;
    if (q) {
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q));
    }
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      list = list.filter((m) => m.enabled === (enabled === 'true'));
    }

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: list.slice(start, start + pageSize),
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 3. POST /admin/merchants
  http.post(`${BASE_URL}/admin/merchants`, async ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as any;
    const { code, name, website_url, enabled = true } = body;

    if (!code || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(code)) {
      return HttpResponse.json(
        {
          code: 100001,
          message: '商家标识格式不合法',
          data: null,
          request_id: `req_${Date.now()}`,
          errors: [{ field: 'code', reason: 'invalid_format' }],
        },
        { status: 400 }
      );
    }

    if (mockMerchants.some((m) => m.code === code)) {
      return HttpResponse.json(
        { code: 500002, message: '商家或 VPS 标识已存在', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    const newMerchant: MerchantAdmin = {
      id: (mockMerchants.length + 1).toString(),
      code,
      name,
      website_url,
      enabled: Boolean(enabled),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockMerchants.push(newMerchant);

    return HttpResponse.json(
      { code: 0, message: 'ok', data: newMerchant, request_id: `req_${Date.now()}` },
      { status: 201 }
    );
  }),

  // 4. PATCH /admin/merchants/:id
  http.patch(`${BASE_URL}/admin/merchants/:id`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const merchant = mockMerchants.find((m) => m.id === params.id);
    if (!merchant) {
      return HttpResponse.json(
        { code: 100005, message: '资源不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    const body = (await request.json()) as any;
    if (body.name !== undefined) merchant.name = body.name;
    if (body.website_url !== undefined) merchant.website_url = body.website_url;
    if (body.enabled !== undefined) merchant.enabled = Boolean(body.enabled);
    merchant.updated_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: merchant,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 5. GET /admin/vps
  http.get(`${BASE_URL}/admin/vps`, ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const merchantId = url.searchParams.get('merchant_id');
    const enabled = url.searchParams.get('enabled');
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.toLowerCase();
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    let list = mockVpsList;
    if (merchantId) list = list.filter((v) => v.merchant_id === merchantId);
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      list = list.filter((v) => v.enabled === (enabled === 'true'));
    }
    if (status) list = list.filter((v) => v.stock.status.toString() === status);
    if (q) list = list.filter((v) => v.name.toLowerCase().includes(q) || v.code.toLowerCase().includes(q));

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: list.slice(start, start + pageSize),
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 6. GET /admin/vps/:id
  http.get(`${BASE_URL}/admin/vps/:id`, ({ params }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const vps = mockVpsList.find((v) => v.id === params.id);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在或已下架', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: vps,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 7. POST /admin/vps
  http.post(`${BASE_URL}/admin/vps`, async ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as any;
    const {
      merchant_id,
      code,
      name,
      description,
      cpu_cores,
      memory_mb,
      disk_gb,
      disk_type,
      transfer_gb = null,
      port_mbps = null,
      price_amount,
      currency,
      billing_period,
      enabled = true,
      monitor_config,
    } = body;

    const merchant = mockMerchants.find((m) => m.id === merchant_id);
    if (!merchant) {
      return HttpResponse.json(
        { code: 100005, message: '指定商家不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 400 }
      );
    }

    if (mockVpsList.some((v) => v.merchant_id === merchant_id && v.code === code)) {
      return HttpResponse.json(
        { code: 500002, message: '该商家下已存在同名套餐标识', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    const newId = (mockVpsList.length + 1000 + 1).toString();
    const newVps: VpsAdmin = {
      id: newId,
      merchant_id,
      merchant: {
        id: merchant.id,
        code: merchant.code,
        name: merchant.name,
        website_url: merchant.website_url,
      },
      code,
      name,
      description,
      cpu_cores,
      memory_mb,
      disk_gb,
      disk_type,
      transfer_gb,
      port_mbps,
      price_amount,
      currency,
      billing_period,
      purchase_url: monitor_config.source_url,
      enabled: Boolean(enabled),
      stock: {
        vps_id: newId,
        status: 3,
        quantity: null,
        last_checked_at: null,
        last_in_stock_at: null,
        monitor_enabled: Boolean(merchant.enabled && enabled && monitor_config.enabled),
        is_stale: true,
      },
      monitor_config: {
        source_url: monitor_config.source_url,
        collector_code: monitor_config.collector_code,
        poll_interval_seconds: monitor_config.poll_interval_seconds,
        timeout_seconds: monitor_config.timeout_seconds,
        enabled: Boolean(monitor_config.enabled),
        next_check_at: new Date().toISOString(),
        config_version: 1,
        updated_at: new Date().toISOString(),
        is_running: false,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    mockVpsList.push(newVps);

    return HttpResponse.json(
      { code: 0, message: 'ok', data: newVps, request_id: `req_${Date.now()}` },
      { status: 201 }
    );
  }),

  // 8. PATCH /admin/vps/:id
  http.patch(`${BASE_URL}/admin/vps/:id`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const vps = mockVpsList.find((v) => v.id === params.id);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在或已下架', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    const body = (await request.json()) as any;
    Object.assign(vps, body);
    vps.updated_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: vps,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 9. GET /admin/collectors
  http.get(`${BASE_URL}/admin/collectors`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: mockCollectors,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 10. GET /admin/monitors
  http.get(`${BASE_URL}/admin/monitors`, ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const merchantId = url.searchParams.get('merchant_id');
    const enabled = url.searchParams.get('enabled');
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.toLowerCase();
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    let list = mockVpsList.map((v) => ({
      ...v.monitor_config,
      vps_id: v.id,
      vps_name: v.name,
      merchant_id: v.merchant_id,
      merchant_name: v.merchant.name,
      stock: v.stock,
    }));

    if (merchantId) list = list.filter((m) => m.merchant_id === merchantId);
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      list = list.filter((m) => m.enabled === (enabled === 'true'));
    }
    if (status) list = list.filter((m) => m.stock.status.toString() === status);
    if (q) list = list.filter((m) => m.vps_name.toLowerCase().includes(q));

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: list.slice(start, start + pageSize),
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 11. PUT /admin/vps/:id/monitor-config
  http.put(`${BASE_URL}/admin/vps/:id/monitor-config`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const vps = mockVpsList.find((v) => v.id === params.id);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    const body = (await request.json()) as any;
    const { expected_version, ...configFields } = body;

    // 版本冲突防护校验
    if (expected_version !== vps.monitor_config.config_version) {
      return HttpResponse.json(
        { code: 300004, message: '配置已更新，请刷新后重试', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    Object.assign(vps.monitor_config, configFields, {
      config_version: vps.monitor_config.config_version + 1,
      updated_at: new Date().toISOString(),
    });

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: vps.monitor_config,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 12. POST /admin/vps/:id/check (排程人工检查)
  http.post(`${BASE_URL}/admin/vps/:id/check`, ({ params }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const vps = mockVpsList.find((v) => v.id === params.id);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    if (!vps.enabled || !vps.monitor_config.enabled) {
      return HttpResponse.json(
        { code: 300002, message: '请先启用商家、VPS 和监控', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    // 模拟检查完成并更新 last_checked_at
    setTimeout(() => {
      vps.stock.last_checked_at = new Date().toISOString();
    }, 1500);

    return HttpResponse.json(
      {
        code: 0,
        message: 'ok',
        data: {
          vps_id: vps.id,
          next_check_at: new Date().toISOString(),
          queued: true,
        },
        request_id: `req_${Date.now()}`,
      },
      { status: 202 }
    );
  }),

  // 13. GET /admin/users
  http.get(`${BASE_URL}/admin/users`, ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.toLowerCase();
    const role = url.searchParams.get('role');
    const enabled = url.searchParams.get('enabled');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    let list = mockUsers.map(({ password: _, ...userSelf }) => userSelf);
    if (q) list = list.filter((u) => u.username.toLowerCase().includes(q) || u.nickname.toLowerCase().includes(q));
    if (role) list = list.filter((u) => u.role === role);
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      list = list.filter((u) => u.enabled === (enabled === 'true'));
    }

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: list.slice(start, start + pageSize),
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 14. PATCH /admin/users/:id (改角色/启禁用，带末位管理员保护)
  http.patch(`${BASE_URL}/admin/users/:id`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const user = mockUsers.find((u) => u.id === params.id);
    if (!user) {
      return HttpResponse.json(
        { code: 100005, message: '用户不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    const body = (await request.json()) as any;
    const willDemote = body.role && body.role !== 'admin' && user.role === 'admin';
    const willDisable = body.enabled === false && user.enabled && user.role === 'admin';

    if (willDemote || willDisable) {
      const activeAdminCount = mockUsers.filter((u) => u.role === 'admin' && u.enabled).length;
      if (activeAdminCount <= 1) {
        return HttpResponse.json(
          { code: 500001, message: '必须保留至少一个启用的管理员', data: null, request_id: `req_${Date.now()}` },
          { status: 409 }
        );
      }
    }

    if (body.role !== undefined) user.role = body.role;
    if (body.enabled !== undefined) user.enabled = Boolean(body.enabled);
    user.updated_at = new Date().toISOString();

    const { password: _, ...userSelf } = user;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: userSelf,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 15. POST /admin/users/:id/revoke-sessions
  http.post(`${BASE_URL}/admin/users/:id/revoke-sessions`, ({ params }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    let count = 0;
    mockSessions.forEach((s) => {
      if (s.user_id === params.id && !s.revoked_at) {
        s.revoked_at = new Date().toISOString();
        count++;
      }
    });

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: { revoked_count: count },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 16. POST /admin/users/:id/reset-password
  http.post(`${BASE_URL}/admin/users/:id/reset-password`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const user = mockUsers.find((u) => u.id === params.id);
    if (!user) {
      return HttpResponse.json(
        { code: 100005, message: '用户不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    const body = (await request.json()) as any;
    user.password = body.new_password;
    user.updated_at = new Date().toISOString();

    // 撤销目标用户所有会话
    mockSessions.forEach((s) => {
      if (s.user_id === user.id) s.revoked_at = new Date().toISOString();
    });

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: null,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 17. GET /admin/comments
  http.get(`${BASE_URL}/admin/comments`, ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const url = new URL(request.url);
    const vpsId = url.searchParams.get('vps_id');
    const userId = url.searchParams.get('user_id');
    const visibility = url.searchParams.get('visibility');
    const isAnonymous = url.searchParams.get('is_anonymous');
    const q = url.searchParams.get('q')?.toLowerCase();
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    let list = mockComments;
    if (vpsId) list = list.filter((c) => c.vps_id === vpsId);
    if (userId) list = list.filter((c) => c.author.id === userId);
    if (visibility) list = list.filter((c) => c.visibility.toString() === visibility);
    if (isAnonymous !== null && isAnonymous !== undefined && isAnonymous !== '') {
      list = list.filter((c) => c.is_anonymous === (isAnonymous === 'true'));
    }
    if (q) list = list.filter((c) => c.content.toLowerCase().includes(q));

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const start = (page - 1) * pageSize;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: list.slice(start, start + pageSize),
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 18. PATCH /admin/comments/:id/visibility (2->1, 2->3, 1<->3)
  http.patch(`${BASE_URL}/admin/comments/:id/visibility`, async ({ params, request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const comment = mockComments.find((c) => c.id === params.id);
    if (!comment) {
      return HttpResponse.json(
        { code: 100005, message: '评论不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

    if (comment.visibility === 4) {
      return HttpResponse.json(
        { code: 400006, message: '已删除评论不可恢复或更改可见性', data: null, request_id: `req_${Date.now()}` },
        { status: 409 }
      );
    }

    const body = (await request.json()) as any;
    comment.visibility = body.visibility;
    comment.updated_at = new Date().toISOString();

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: comment,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 19. DELETE /admin/comments/:id (管理端永久删除正文并占位)
  http.delete(`${BASE_URL}/admin/comments/:id`, ({ params }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const comment = mockComments.find((c) => c.id === params.id);
    if (!comment) {
      return HttpResponse.json(
        { code: 100005, message: '评论不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }

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

  // 20. GET /admin/settings
  http.get(`${BASE_URL}/admin/settings`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        settings: mockSettings,
        updated_at: new Date().toISOString(),
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 21. PATCH /admin/settings
  http.patch(`${BASE_URL}/admin/settings`, async ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as any;
    Object.assign(mockSettings, body);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        settings: mockSettings,
        updated_at: new Date().toISOString(),
      },
      request_id: `req_${Date.now()}`,
    });
  }),
];
