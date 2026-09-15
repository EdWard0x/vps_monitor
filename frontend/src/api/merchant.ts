import { apiClient } from '@/lib/http/client';
import { Envelope, PageData } from '@/types/common';
import {
  Merchant,
  AdminMerchant,
  MerchantQuery,
  AdminMerchantQuery,
  MerchantCreateInput,
  MerchantUpdateInput,
} from '@/types/merchant';

export async function listMerchants(query?: MerchantQuery): Promise<Envelope<PageData<Merchant>>> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.page_size) params.set('page_size', String(query.page_size));
  if (query?.q) params.set('q', query.q);

  const qs = params.toString();
  return apiClient.get<PageData<Merchant>>(`/merchant/list${qs ? `?${qs}` : ''}`);
}

export async function getMerchant(id: string): Promise<Envelope<Merchant>> {
  return apiClient.get<Merchant>(`/merchant/info?id=${encodeURIComponent(id)}`);
}

export async function adminListMerchants(query?: AdminMerchantQuery): Promise<Envelope<PageData<AdminMerchant>>> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.page_size) params.set('page_size', String(query.page_size));
  if (query?.q) params.set('q', query.q);
  if (query?.enabled !== undefined) params.set('enabled', String(query.enabled));

  const qs = params.toString();
  return apiClient.get<PageData<AdminMerchant>>(`/admin/merchant/list${qs ? `?${qs}` : ''}`);
}

export async function adminGetMerchant(id: string): Promise<Envelope<AdminMerchant>> {
  return apiClient.get<AdminMerchant>(`/admin/merchant/info?id=${encodeURIComponent(id)}`);
}

export async function adminCreateMerchant(input: MerchantCreateInput): Promise<Envelope<AdminMerchant>> {
  return apiClient.post<AdminMerchant>('/admin/merchant/create', input);
}

export async function adminUpdateMerchant(input: MerchantUpdateInput): Promise<Envelope<AdminMerchant>> {
  return apiClient.put<AdminMerchant>('/admin/merchant/update', input);
}

export async function adminDeleteMerchant(id: string): Promise<Envelope<null>> {
  return apiClient.delete<null>(`/admin/merchant/delete?id=${encodeURIComponent(id)}`);
}
