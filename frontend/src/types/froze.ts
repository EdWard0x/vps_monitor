// 用户冻结/解冻相关类型契约
import { ID } from './common';

export interface FreezeInput {
  user_id: ID;
}

export interface FreezeResult {
  user_id: ID;
  frozen: boolean;
  cache_synced: boolean;
}
