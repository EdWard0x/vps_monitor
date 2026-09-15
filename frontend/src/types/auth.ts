// 认证相关类型契约
import { ID, Timestamp, NullableTimestamp } from './common';

export type Role = 'user' | 'admin';

export interface PublicUser {
  id: ID;
  username: string;
  nickname: string;
  role: Role;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface AccountUser extends PublicUser {
  mail: string | null;
  mail_verified: boolean;
  mail_verified_at: NullableTimestamp;
  mail_required: boolean;
}

export type User = AccountUser;

export interface TokenResult {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
}

export interface LoginResult extends TokenResult {
  user: AccountUser;
}

export interface RegisterInput {
  username: string;
  nickname: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
}
