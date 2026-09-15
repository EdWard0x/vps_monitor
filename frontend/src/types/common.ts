// 通用基础类型定义（对齐 docs/backend.md 与 docs/openapi.yaml）

export type ID = string;
export type Timestamp = string;
export type NullableTimestamp = Timestamp | null;

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

export interface PageData<T> extends PageMeta {
  items: T[];
}

export interface PageQuery {
  page?: number;
  page_size?: number;
}
