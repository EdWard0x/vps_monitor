// 库存相关类型契约
import { ID, NullableTimestamp } from './common';

export type StockStatus = 1 | 2 | 3; // 1: 有货, 2: 缺货, 3: 未知

export interface Stock {
  vps_id: ID;
  status: StockStatus;
  quantity: number | null;
  last_checked_at: NullableTimestamp;
  last_in_stock_at: NullableTimestamp;
  is_stale: boolean;
}
