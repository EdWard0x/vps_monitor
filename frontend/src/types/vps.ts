// VPS 相关类型契约
import { ID, Timestamp, PageQuery } from './common';
import { Merchant } from './merchant';
import { Stock, StockStatus } from './stock';

export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_time';
export type DiskType = 'ssd' | 'nvme' | 'hdd' | 'unknown';
export type VPSSortOption = 'updated_desc' | 'price_asc' | 'price_desc';

export interface VPS {
  id: ID;
  merchant: Merchant;
  code: string;
  name: string;
  description: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  disk_type: DiskType;
  transfer_gb: number | null;
  port_mbps: number | null;
  has_ipv4: boolean;
  ipv4_count: number;
  has_ipv6: boolean;
  ipv6_count: number;
  price_amount: string;
  currency: string;
  billing_period: BillingPeriod;
  purchase_url: string;
  stock: Stock;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AdminVPS extends VPS {
  merchant_id: ID;
  enabled: boolean;
  collection_enabled: boolean;
}

export type Vps = VPS;
export type VpsAdmin = AdminVPS;

export interface VPSQuery extends PageQuery {
  q?: string;
  merchant_id?: string;
  currency?: string;
  billing_period?: BillingPeriod;
  status?: StockStatus;
  sort?: VPSSortOption;
}

export interface AdminVPSQuery extends VPSQuery {
  enabled?: boolean;
}

export interface VPSCreateInput {
  merchant_id: ID;
  code: string;
  name: string;
  description: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  disk_type: DiskType | string;
  transfer_gb?: number | null;
  port_mbps?: number | null;
  has_ipv4: boolean;
  ipv4_count: number;
  has_ipv6: boolean;
  ipv6_count: number;
  price_amount: string;
  currency: string;
  billing_period: BillingPeriod;
  purchase_url: string;
  enabled: boolean;
  collection_enabled: boolean;
}

export interface VPSUpdateInput extends VPSCreateInput {
  id: ID;
}
