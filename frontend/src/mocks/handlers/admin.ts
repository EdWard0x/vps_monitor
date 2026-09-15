import { http, HttpResponse } from 'msw';
import {
  mockSettings,
  mockMerchants,
  mockVpsList,
  mockUsers,
} from '../data';
import { getCurrentMockUser } from './auth';

const BASE_URL = '/api/v1';

function requireAdmin() {
  const user = getCurrentMockUser();
  if (!user || user.frozen) {
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
  // GET /admin/dashboard/info
  http.get(`${BASE_URL}/admin/dashboard/info`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    const frozenCount = mockUsers.filter((u) => u.frozen).length;
    const inStock = mockVpsList.filter((v) => v.stock?.status === 1).length;
    const unknownStock = mockVpsList.filter((v) => v.stock?.status === 3).length;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        user_count: mockUsers.length,
        frozen_user_count: frozenCount,
        merchant_count: mockMerchants.length,
        vps_count: mockVpsList.length,
        in_stock_count: inStock,
        unknown_stock_count: unknownStock,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /admin/merchant/list
  http.get(`${BASE_URL}/admin/merchant/list`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: mockMerchants,
        total: mockMerchants.length,
        page: 1,
        page_size: 20,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /admin/vps/list
  http.get(`${BASE_URL}/admin/vps/list`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: mockVpsList,
        total: mockVpsList.length,
        page: 1,
        page_size: 20,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /admin/user/list
  http.get(`${BASE_URL}/admin/user/list`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    const safeUsers = mockUsers.map(({ password: _, ...rest }) => ({
      ...rest,
      frozen: Boolean(rest.frozen),
    }));

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items: safeUsers,
        total: safeUsers.length,
        page: 1,
        page_size: 20,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // POST /admin/froze/freeze
  http.post(`${BASE_URL}/admin/froze/freeze`, async ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as any;
    const target = mockUsers.find((u) => u.id === body.user_id);
    if (target) {
      target.frozen = true;
    }

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        user_id: body.user_id,
        frozen: true,
        cache_synced: true,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // POST /admin/froze/unfreeze
  http.post(`${BASE_URL}/admin/froze/unfreeze`, async ({ request }) => {
    const authError = requireAdmin();
    if (authError) return authError;

    const body = (await request.json()) as any;
    const target = mockUsers.find((u) => u.id === body.user_id);
    if (target) {
      target.frozen = false;
    }

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        user_id: body.user_id,
        frozen: false,
        cache_synced: true,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /admin/settings/info
  http.get(`${BASE_URL}/admin/settings/info`, () => {
    const authError = requireAdmin();
    if (authError) return authError;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        settings: mockSettings,
        collection_enabled: false,
        collector_implemented: false,
        updated_at: new Date().toISOString(),
      },
      request_id: `req_${Date.now()}`,
    });
  }),
];
