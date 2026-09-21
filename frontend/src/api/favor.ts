import { apiClient } from '@/lib/http/client';
import { Envelope, PageData } from '@/types/common';
import { VPS, VPSQuery } from '@/types/vps';

export async function addFavor(vpsId: string): Promise<Envelope<string>> {
  return apiClient.post<string>(`/me/addFavor?vpsId=${encodeURIComponent(vpsId)}`);
}

export async function delFavor(vpsId: string): Promise<Envelope<string>> {
  return apiClient.delete<string>(`/me/delFavor?vpsId=${encodeURIComponent(vpsId)}`);
}

export async function listFavors(query?: VPSQuery): Promise<Envelope<PageData<VPS>>> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.page_size) params.set('page_size', String(query.page_size));
  if (query?.q) params.set('q', query.q);
  if (query?.merchant_id) params.set('merchant_id', query.merchant_id);
  if (query?.currency) params.set('currency', query.currency);
  if (query?.billing_period) params.set('billing_period', query.billing_period);
  if (query?.status !== undefined) params.set('status', String(query.status));
  if (query?.sort) params.set('sort', query.sort);

  const qs = params.toString();
  return apiClient.get<PageData<VPS>>(`/me/listFavors${qs ? `?${qs}` : ''}`);
}
