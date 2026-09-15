// 商家相关类型契约
import { ID, Timestamp, PageQuery } from './common';

export interface Merchant {
  id: ID;
  code: string;
  name: string;
  website_url: string;
}

export interface AdminMerchant extends Merchant {
  enabled: boolean;
  collection_enabled: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type MerchantAdmin = AdminMerchant;

export interface MerchantQuery extends PageQuery {
  q?: string;
}

export interface AdminMerchantQuery extends PageQuery {
  q?: string;
  enabled?: boolean;
}

export interface MerchantCreateInput {
  code: string;
  name: string;
  website_url: string;
  enabled: boolean;
  collection_enabled: boolean;
}

export interface MerchantUpdateInput {
  id: ID;
  name: string;
  website_url: string;
  enabled: boolean;
  collection_enabled: boolean;
}
