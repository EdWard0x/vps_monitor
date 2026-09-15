// 用户与管理员用户类型契约
import { ID, PageQuery } from './common';
import { PublicUser, Role } from './auth';

export interface AdminUser extends PublicUser {
  frozen: boolean;
}

export interface AdminUserQuery extends PageQuery {
  q?: string;
  role?: Role;
  frozen?: boolean;
}

export interface UpdateMeInput {
  nickname: string;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface AdminUpdateUserInput {
  id: ID;
  nickname: string;
}

export interface AdminUpdateRoleInput {
  id: ID;
  role: Role;
}

export interface AdminResetPasswordInput {
  user_id: ID;
  new_password: string;
}
