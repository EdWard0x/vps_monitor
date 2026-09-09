// 外部 API DTO 与类型契约（严格对齐 docs/openapi.yaml）
// 严禁自行增加或修改字段，严禁直接使用数据库内部模型。

export type ID = string;
export type Timestamp = string;
export type NullableTimestamp = Timestamp | null;

export type Role = 'user' | 'admin';
export type Visibility = 1 | 2 | 3 | 4; // 1=公开, 2=待审核, 3=隐藏, 4=已删除占位
export type BillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_time';
export type StockStatus = 1 | 2 | 3; // 1=有货, 2=缺货, 3=无法识别
export type DiskType = 'ssd' | 'nvme' | 'hdd' | 'unknown';

export interface FieldError {
  field: string;
  reason: string;
  limit?: number;
}

export interface Envelope<T> {
  code: number;
  message: string;
  data: T;
  request_id: string;
  errors?: FieldError[];
}

export interface PageMeta {
  total: number;
  page: number;
  page_size: number;
}

export interface CursorMeta {
  next_cursor: string | null;
  has_more: boolean;
}

export type PageData<T> = PageMeta & { items: T[] };
export type CursorPageData<T> = CursorMeta & { items: T[] };

export interface Settings {
  site_name: string;
  registration_enabled: boolean;
  comments_enabled: boolean;
  anonymous_comments_enabled: boolean;
  comment_review_required: boolean;
  comment_max_depth: number;
}

export interface SettingsPublic extends Settings {
  demo_mode: boolean;
}

export interface SettingsAdmin {
  settings: Settings;
  updated_at: Timestamp;
}

export type SettingsPatch = Partial<Settings>;

export interface Merchant {
  id: ID;
  code: string;
  name: string;
  website_url: string;
}

export interface MerchantAdmin extends Merchant {
  enabled: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface MerchantCreate {
  code: string;
  name: string;
  website_url: string;
  enabled?: boolean;
}

export interface MerchantPatch {
  name?: string;
  website_url?: string;
  enabled?: boolean;
}

export interface Stock {
  vps_id: ID;
  status: StockStatus;
  quantity: number | null;
  last_checked_at: NullableTimestamp;
  last_in_stock_at: NullableTimestamp;
  monitor_enabled: boolean;
  is_stale: boolean;
  last_error_code?: string | null;
}

export interface MonitorConfig {
  source_url: string;
  collector_code: string;
  poll_interval_seconds: number;
  timeout_seconds: number;
  enabled: boolean;
  next_check_at: Timestamp;
  config_version: number;
  updated_at: Timestamp;
  is_running: boolean;
}

export interface MonitorPut {
  source_url: string;
  collector_code: string;
  poll_interval_seconds: number;
  timeout_seconds: number;
  enabled: boolean;
  expected_version: number;
}

export interface Vps {
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
  price_amount: string;
  currency: string;
  billing_period: BillingPeriod;
  purchase_url: string;
  stock: Stock;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface VpsAdmin extends Vps {
  merchant_id: ID;
  enabled: boolean;
  monitor_config: MonitorConfig;
}

export interface VpsCreate {
  merchant_id: ID;
  code: string;
  name: string;
  description: string;
  cpu_cores: number;
  memory_mb: number;
  disk_gb: number;
  disk_type: string;
  transfer_gb?: number | null;
  port_mbps?: number | null;
  price_amount: string;
  currency: string;
  billing_period: BillingPeriod;
  enabled: boolean;
  monitor_config: {
    source_url: string;
    collector_code: string;
    poll_interval_seconds: number;
    timeout_seconds: number;
    enabled: boolean;
  };
}

export interface VpsPatch {
  name?: string;
  description?: string;
  cpu_cores?: number;
  memory_mb?: number;
  disk_gb?: number;
  disk_type?: string;
  transfer_gb?: number | null;
  port_mbps?: number | null;
  price_amount?: string;
  currency?: string;
  billing_period?: BillingPeriod;
  enabled?: boolean;
}

export interface User {
  id: ID;
  username: string;
  nickname: string;
  role: Role;
  enabled: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface UserPatch {
  role?: Role;
  enabled?: boolean;
}

export interface RegisterRequest {
  username: string;
  nickname: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export interface Token {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface LoginResult extends Token {
  user: User;
}

export interface Session {
  id: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  refresh_expires_at: Timestamp;
  is_current: boolean;
}

export interface CreateComment {
  content: string;
  is_anonymous?: boolean;
  parent_id?: ID | null;
}

export interface CommentPublic {
  id: ID;
  vps_id: ID;
  parent_id: ID | null;
  root_id: ID | null;
  depth: number;
  content: string;
  is_anonymous: boolean | null;
  display_nickname: string;
  is_placeholder: boolean;
  reply_count: number;
  created_at: Timestamp;
}

export interface CommentPrivate {
  id: ID;
  vps_id: ID;
  parent_id: ID | null;
  root_id: ID | null;
  depth: number;
  content: string;
  is_anonymous: boolean;
  visibility: Visibility;
  created_at: Timestamp;
  updated_at: Timestamp;
  can_delete: boolean;
}

export interface CommentAdmin extends CommentPrivate {
  author: {
    id: ID;
    username: string;
    nickname: string;
  };
}

export interface CommentSearchItem extends CommentPublic {
  root_comment_id: ID;
}

export interface MonitorRow extends MonitorConfig {
  vps_id: ID;
  vps_name: string;
  merchant_id: ID;
  merchant_name: string;
  stock: Stock;
}

export interface Collector {
  code: string;
  name: string;
  available: boolean;
}

export interface Dashboard {
  merchant_count: number;
  vps_count: number;
  user_count: number;
  enabled_user_count: number;
  stock_counts: {
    in_stock: number;
    out_of_stock: number;
    unknown: number;
  };
  pending_comment_count: number;
  monitor_due_count: number;
  last_checked_at: NullableTimestamp;
}

export interface QueuedCheck {
  vps_id: ID;
  next_check_at: Timestamp;
  queued: true;
}

export interface RevokedCount {
  revoked_count: number;
}

export interface CsrfResponse {
  csrf_token: string;
}
