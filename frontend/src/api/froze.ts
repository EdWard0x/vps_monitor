import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { FreezeInput, FreezeResult } from '@/types/froze';

export async function freezeUser(input: FreezeInput): Promise<Envelope<FreezeResult>> {
  return apiClient.post<FreezeResult>('/admin/froze/freeze', input);
}

export async function unfreezeUser(input: FreezeInput): Promise<Envelope<FreezeResult>> {
  return apiClient.post<FreezeResult>('/admin/froze/unfreeze', input);
}
