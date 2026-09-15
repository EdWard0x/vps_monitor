import { http, HttpResponse } from 'msw';
import {
  mockSettings,
  mockMerchants,
  mockVpsList,
} from '../data';

const BASE_URL = '/api/v1';

export const publicHandlers = [
  // GET /settings/info
  http.get(`${BASE_URL}/settings/info`, () => {
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: mockSettings,
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /merchant/list
  http.get(`${BASE_URL}/merchant/list`, () => {
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

  // GET /merchant/info
  http.get(`${BASE_URL}/merchant/info`, ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const merchant = mockMerchants.find((m) => m.id === id);
    if (!merchant) {
      return HttpResponse.json(
        { code: 100005, message: '商家不存在', data: null, request_id: `req_${Date.now()}` },
        { status: 404 }
      );
    }
    return HttpResponse.json({
      code: 0,
      message: 'ok',
      data: merchant,
      request_id: `req_${Date.now()}`,
    });
  }),

  // GET /vps/list
  http.get(`${BASE_URL}/vps/list`, () => {
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

  // GET /vps/info
  http.get(`${BASE_URL}/vps/info`, ({ request }) => {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const vps = mockVpsList.find((v) => v.id === id);
    if (!vps) {
      return HttpResponse.json(
        { code: 100005, message: 'VPS 不存在或已下架', data: null, request_id: `req_${Date.now()}` },
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

  // GET /stock/info
  http.get(`${BASE_URL}/stock/info`, ({ request }) => {
    const url = new URL(request.url);
    const vpsId = url.searchParams.get('vps_id');
    const vps = mockVpsList.find((v) => v.id === vpsId);
    if (!vps) {
      return HttpResponse.json(
        { code: 100005, message: 'VPS 不存在', data: null, request_id: `req_${Date.now()}` },
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
];
