import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { DashboardSummary } from '@/types/dashboard';

export async function adminGetDashboard(): Promise<Envelope<DashboardSummary>> {
  return apiClient.get<DashboardSummary>('/admin/dashboard/info');
}
