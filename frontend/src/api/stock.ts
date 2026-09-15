import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { Stock } from '@/types/stock';

export async function getStock(vpsId: string): Promise<Envelope<Stock>> {
  return apiClient.get<Stock>(`/stock/info?vps_id=${encodeURIComponent(vpsId)}`);
}
