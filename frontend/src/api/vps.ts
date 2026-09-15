import { apiClient } from '@/lib/http/client';
import { Envelope, PageData } from '@/types/common';
import {
  VPS,
  AdminVPS,
  VPSQuery,
  AdminVPSQuery,
  VPSCreateInput,
  VPSUpdateInput,
} from '@/types/vps';

export async function listVPS(query?: VPSQuery): Promise<Envelope<PageData<VPS>>> {
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
  return apiClient.get<PageData<VPS>>(`/vps/list${qs ? `?${qs}` : ''}`);
}

export async function getVPS(id: string): Promise<Envelope<VPS>> {
  return apiClient.get<VPS>(`/vps/info?id=${encodeURIComponent(id)}`);
}

export async function adminListVPS(query?: AdminVPSQuery): Promise<Envelope<PageData<AdminVPS>>> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.page_size) params.set('page_size', String(query.page_size));
  if (query?.q) params.set('q', query.q);
  if (query?.merchant_id) params.set('merchant_id', query.merchant_id);
  if (query?.currency) params.set('currency', query.currency);
  if (query?.billing_period) params.set('billing_period', query.billing_period);
  if (query?.status !== undefined) params.set('status', String(query.status));
  if (query?.sort) params.set('sort', query.sort);
  if (query?.enabled !== undefined) params.set('enabled', String(query.enabled));

  const qs = params.toString();
  return apiClient.get<PageData<AdminVPS>>(`/admin/vps/list${qs ? `?${qs}` : ''}`);
}

export async function adminGetVPS(id: string): Promise<Envelope<AdminVPS>> {
  return apiClient.get<AdminVPS>(`/admin/vps/info?id=${encodeURIComponent(id)}`);
}

export async function adminCreateVPS(input: VPSCreateInput): Promise<Envelope<AdminVPS>> {
  return apiClient.post<AdminVPS>('/admin/vps/create', input);
}

export async function adminUpdateVPS(input: VPSUpdateInput): Promise<Envelope<AdminVPS>> {
  return apiClient.put<AdminVPS>('/admin/vps/update', input);
}

export async function adminDeleteVPS(id: string): Promise<Envelope<null>> {
  return apiClient.delete<null>(`/admin/vps/delete?id=${encodeURIComponent(id)}`);
}
