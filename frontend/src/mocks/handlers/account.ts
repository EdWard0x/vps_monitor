import { http, HttpResponse } from 'msw';
import { getCurrentMockUser } from './auth';
import { mockVpsList, mockMerchants } from '../data';
import { VPS } from '@/types/vps';

const BASE_URL = typeof window !== 'undefined' ? '/api/v1' : '*/api/v1';

// 按用户 ID 隔离的收藏数据集合
export const mockUserFavors: Map<string, Set<string>> = new Map();

// 初始化默认用户收藏数据：用户 2 收藏 1001
mockUserFavors.set('2', new Set(['1001']));

export function resetMockUserFavors() {
  mockUserFavors.clear();
  mockUserFavors.set('2', new Set(['1001']));
}

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

  // POST /me/addFavor?vpsId=<id>
  http.post(`${BASE_URL}/me/addFavor`, ({ request }) => {
    const user = getCurrentMockUser();
    if (!user || user.frozen) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const vpsId = url.searchParams.get('vpsId');
    if (!vpsId) {
      return HttpResponse.json(
        { code: 100001, message: '请求参数缺少 vpsId', data: null, request_id: `req_${Date.now()}` },
        { status: 400 }
      );
    }

    let set = mockUserFavors.get(user.id);
    if (!set) {
      set = new Set();
      mockUserFavors.set(user.id, set);
    }
    set.add(vpsId);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: 'success',
      request_id: `req_${Date.now()}`,
    });
  }),

  // DELETE /me/delFavor?vpsId=<id>
  http.delete(`${BASE_URL}/me/delFavor`, ({ request }) => {
    const user = getCurrentMockUser();
    if (!user || user.frozen) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const vpsId = url.searchParams.get('vpsId');
    if (!vpsId) {
      return HttpResponse.json(
        { code: 100001, message: '请求参数缺少 vpsId', data: null, request_id: `req_${Date.now()}` },
        { status: 400 }
      );
    }

    const set = mockUserFavors.get(user.id);
    if (set) {
      set.delete(vpsId);
    }

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: 'success',
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /me/listFavors
  http.get(`${BASE_URL}/me/listFavors`, ({ request }) => {
    const user = getCurrentMockUser();
    if (!user || user.frozen) {
      return HttpResponse.json(
        { code: 200002, message: '请先登录', data: null, request_id: `req_${Date.now()}` },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const rawPageSize = parseInt(url.searchParams.get('page_size') || '20', 10);
    const pageSize = Math.min(100, Math.max(1, isNaN(rawPageSize) ? 20 : rawPageSize));
    const q = url.searchParams.get('q')?.toLowerCase();
    const merchantId = url.searchParams.get('merchant_id');
    const currency = url.searchParams.get('currency')?.toUpperCase();
    const billingPeriod = url.searchParams.get('billing_period');
    const statusStr = url.searchParams.get('status');
    const sort = url.searchParams.get('sort') || 'updated_desc';

    const userFavorSet = mockUserFavors.get(user.id) || new Set();

    let favoritedVps: VPS[] = Array.from(userFavorSet).map((id) => {
      const existing = mockVpsList.find((v) => v.id === id);
      if (existing) return existing;
      // 为测试中生成的 ID 构造合法的回退公开 VPS
      return {
        id,
        merchant_id: '1',
        merchant: mockMerchants[0] || {
          id: '1',
          code: 'dmit',
          name: 'DMIT（模拟）',
          website_url: 'https://dmit.tio',
        },
        code: `plan-${id}`,
        name: `VPS Plan ${id}`,
        description: `模拟测试套餐 ${id}`,
        cpu_cores: 2,
        memory_mb: 2048,
        disk_gb: 40,
        disk_type: 'nvme',
        transfer_gb: 1000,
        port_mbps: 1000,
        has_ipv4: true,
        ipv4_count: 1,
        has_ipv6: false,
        ipv6_count: 0,
        price_amount: '15.00',
        currency: 'USD',
        billing_period: 'monthly',
        purchase_url: 'https://example.com/cart',
        stock: {
          vps_id: id,
          status: 1,
          quantity: 5,
          last_checked_at: '2026-09-20T00:00:00Z',
          last_in_stock_at: '2026-09-20T00:00:00Z',
          is_stale: false,
        },
        created_at: '2026-09-20T00:00:00Z',
        updated_at: '2026-09-20T00:00:00Z',
      } as VPS;
    });

    // 筛选过滤
    if (q) {
      favoritedVps = favoritedVps.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.code.toLowerCase().includes(q) ||
          (v.description && v.description.toLowerCase().includes(q))
      );
    }
    if (merchantId) {
      favoritedVps = favoritedVps.filter((v) => v.merchant.id === merchantId);
    }
    if (currency) {
      favoritedVps = favoritedVps.filter((v) => v.currency.toUpperCase() === currency);
    }
    if (billingPeriod) {
      favoritedVps = favoritedVps.filter((v) => v.billing_period === billingPeriod);
    }
    if (statusStr !== null && statusStr !== undefined && statusStr !== '') {
      const st = Number(statusStr);
      favoritedVps = favoritedVps.filter((v) => v.stock?.status === st || (st === 1 && v.stock?.status === 4));
    }

    // 排序
    if (sort === 'price_asc') {
      favoritedVps.sort((a, b) => parseFloat(a.price_amount) - parseFloat(b.price_amount));
    } else if (sort === 'price_desc') {
      favoritedVps.sort((a, b) => parseFloat(b.price_amount) - parseFloat(a.price_amount));
    } else {
      // updated_desc
      favoritedVps.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    }

    const total = favoritedVps.length;
    const offset = (page - 1) * pageSize;
    const items = favoritedVps.slice(offset, offset + pageSize);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        total,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),
];
