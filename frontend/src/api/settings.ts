import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { PublicSettings, AdminSettings, AdminSettingsUpdateInput } from '@/types/settings';

export async function getPublicSettings(): Promise<Envelope<PublicSettings>> {
  return apiClient.get<PublicSettings>('/settings/info');
}

export async function adminGetSettings(): Promise<Envelope<AdminSettings>> {
  return apiClient.get<AdminSettings>('/admin/settings/info');
}

export async function adminUpdateSettings(
  input: AdminSettingsUpdateInput
): Promise<Envelope<AdminSettings>> {
  return apiClient.put<AdminSettings>('/admin/settings/update', input);
}
