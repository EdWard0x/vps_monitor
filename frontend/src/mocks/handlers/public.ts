import { http, HttpResponse } from 'msw';
import {
  mockSettings,
  mockMerchants,
  mockVpsList,
  mockComments,
} from '../data';
import { CommentPublic, CommentSearchItem } from '@/types/api';

const BASE_URL = '/api/v1';

// 计算某评论公开可渲染的直接子节点数
function getReplyCount(commentId: string): number {
  return mockComments.filter((c) => c.parent_id === commentId && (c.visibility === 1 || hasVisibleDescendant(c.id))).length;
}

// 检查某个节点是否有公开后代 (visibility === 1)
function hasVisibleDescendant(commentId: string): boolean {
  const children = mockComments.filter((c) => c.parent_id === commentId);
  for (const child of children) {
    if (child.visibility === 1 || hasVisibleDescendant(child.id)) {
      return true;
    }
  }
  return false;
}

// 转换为公开 CommentPublic DTO
function toCommentPublic(c: (typeof mockComments)[0]): CommentPublic {
  const isPlaceholder = c.visibility !== 1;
  return {
    id: c.id,
    vps_id: c.vps_id,
    parent_id: c.parent_id,
    root_id: c.root_id,
    depth: c.depth,
    content: isPlaceholder ? '该评论暂不可见' : c.content,
    is_anonymous: isPlaceholder ? null : c.is_anonymous,
    display_nickname: isPlaceholder ? '用户' : c.is_anonymous ? '匿名用户' : c.author.nickname,
    is_placeholder: isPlaceholder,
    reply_count: getReplyCount(c.id),
    created_at: c.created_at,
  };
}

export const publicHandlers = [
  // 1. GET /settings
  http.get(`${BASE_URL}/settings`, () => {
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        ...mockSettings,
        demo_mode: true,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 2. GET /merchants
  http.get(`${BASE_URL}/merchants`, ({ request }) => {
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    const activeMerchants = mockMerchants
      .filter((m) => m.enabled)
      .map(({ id, code, name, website_url }) => ({ id, code, name, website_url }));

    const start = (page - 1) * pageSize;
    const items = activeMerchants.slice(start, start + pageSize);

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        total: activeMerchants.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 3. GET /merchants/:id
  http.get(`${BASE_URL}/merchants/:id`, ({ params }) => {
    const merchant = mockMerchants.find((m) => m.id === params.id && m.enabled);
    if (!merchant) {
      return HttpResponse.json(
        { code: 100005, message: '资源不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    const { id, code, name, website_url } = merchant;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: { id, code, name, website_url },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 4. GET /vps
  http.get(`${BASE_URL}/vps`, ({ request }) => {
    const url = new URL(request.url);
    const merchantId = url.searchParams.get('merchant_id');
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q')?.toLowerCase();
    const currency = url.searchParams.get('currency');
    const billingPeriod = url.searchParams.get('billing_period');
    const sort = url.searchParams.get('sort') || 'created_desc';
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('page_size') || '20', 10);

    // 价格排序校验
    if ((sort === 'price_asc' || sort === 'price_desc') && (!currency || !billingPeriod)) {
      return HttpResponse.json(
        { code: 100001, message: '价格排序必须同时指定币种和计费周期', data: null, request_id: `req_${Date.now()}` },
        { status: 400 }
      );
    }

    let list = mockVpsList.filter((v) => {
      const merchant = mockMerchants.find((m) => m.id === v.merchant_id);
      if (!merchant || !merchant.enabled || !v.enabled) return false;
      if (merchantId && v.merchant_id !== merchantId) return false;
      if (status && v.stock.status.toString() !== status) return false;
      if (q && !v.name.toLowerCase().includes(q) && !v.code.toLowerCase().includes(q)) return false;
      if (currency && v.currency !== currency) return false;
      if (billingPeriod && v.billing_period !== billingPeriod) return false;
      return true;
    });

    if (sort === 'price_asc') {
      list.sort((a, b) => parseFloat(a.price_amount) - parseFloat(b.price_amount) || a.id.localeCompare(b.id));
    } else if (sort === 'price_desc') {
      list.sort((a, b) => parseFloat(b.price_amount) - parseFloat(a.price_amount) || b.id.localeCompare(a.id));
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id));
    }

    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize).map((v) => {
      const { merchant_id, enabled, monitor_config, ...publicVps } = v;
      return publicVps;
    });

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        total: list.length,
        page,
        page_size: pageSize,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 5. GET /vps/:id
  http.get(`${BASE_URL}/vps/:id`, ({ params }) => {
    const vps = mockVpsList.find((v) => v.id === params.id && v.enabled);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在或已下架', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    const { merchant_id, enabled, monitor_config, ...publicVps } = vps;
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: publicVps,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 6. GET /vps/:id/stock
  http.get(`${BASE_URL}/vps/:id/stock`, ({ params }) => {
    const vps = mockVpsList.find((v) => v.id === params.id && v.enabled);
    if (!vps) {
      return HttpResponse.json(
        { code: 300001, message: 'VPS 不存在或已下架', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: vps.stock,
      request_id: `req_${Date.now()}`,
    });
  }),

  // 7. GET /vps/:id/comments
  http.get(`${BASE_URL}/vps/:id/comments`, ({ params, request }) => {
    const url = new URL(request.url);
    const parentId = url.searchParams.get('parent_id') || null;
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const candidates = mockComments.filter((c) => {
      if (c.vps_id !== params.id) return false;
      if (parentId) {
        return c.parent_id === parentId;
      }
      return c.parent_id === null;
    });

    // 过滤可渲染节点 (本身 visibility === 1 或有公开后代)
    const renderable = candidates.filter((c) => c.visibility === 1 || hasVisibleDescendant(c.id));

    // 排序：根评论倒序，子回复正序
    if (!parentId) {
      renderable.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id));
    } else {
      renderable.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id));
    }

    const items = renderable.slice(0, limit).map(toCommentPublic);
    const hasMore = renderable.length > limit;

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        next_cursor: hasMore ? `cursor_${items[items.length - 1].id}` : null,
        has_more: hasMore,
      },
      request_id: `req_${Date.now()}`,
    });
  }),

  // 8. GET /comments/:id
  http.get(`${BASE_URL}/comments/:id`, ({ params }) => {
    const c = mockComments.find((item) => item.id === params.id);
    if (!c || (c.visibility !== 1 && !hasVisibleDescendant(c.id))) {
      return HttpResponse.json(
        { code: 100005, message: '资源不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: toCommentPublic(c),
      request_id: `req_${Date.now()}`,
    });
  }),

  // 9. GET /vps/:id/comments/search
  http.get(`${BASE_URL}/vps/:id/comments/search`, ({ params, request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    if (q.length < 2 || q.length > 100) {
      return HttpResponse.json(
        { code: 100001, message: '搜索关键词长度应在 2~100 字符', data: null, request_id: `req_${Date.now()}` },
        { status: 400 }
      );
    }

    const matches = mockComments.filter(
      (c) => c.vps_id === params.id && c.visibility === 1 && c.content.toLowerCase().includes(q.toLowerCase())
    );

    matches.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id.localeCompare(a.id));

    const items: CommentSearchItem[] = matches.map((c) => ({
      ...toCommentPublic(c),
      root_comment_id: c.root_id || c.id,
    }));

    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: {
        items,
        next_cursor: null,
        has_more: false,
      },
      request_id: `req_${Date.now()}`,
    });
  }),
];
