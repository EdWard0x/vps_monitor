import { apiClient } from '@/lib/http/client';
import { Envelope, PageData } from '@/types/common';
import { AccountUser } from '@/types/auth';
import {
  AdminUser,
  AdminUserQuery,
  UpdateMeInput,
  ChangePasswordInput,
  AdminUpdateUserInput,
  AdminUpdateRoleInput,
  AdminResetPasswordInput,
} from '@/types/user';

export async function getMe(): Promise<Envelope<AccountUser>> {
  return apiClient.get<AccountUser>('/me/info');
}

export async function updateMe(input: UpdateMeInput): Promise<Envelope<AccountUser>> {
  return apiClient.put<AccountUser>('/me/update', input);
}

export async function changePassword(input: ChangePasswordInput): Promise<Envelope<null>> {
  return apiClient.put<null>('/me/password', input);
}

export async function adminListUsers(query?: AdminUserQuery): Promise<Envelope<PageData<AdminUser>>> {
  const params = new URLSearchParams();
  if (query?.page) params.set('page', String(query.page));
  if (query?.page_size) params.set('page_size', String(query.page_size));
  if (query?.q) params.set('q', query.q);
  if (query?.role) params.set('role', query.role);
  if (query?.frozen !== undefined) params.set('frozen', String(query.frozen));

  const qs = params.toString();
  return apiClient.get<PageData<AdminUser>>(`/admin/user/list${qs ? `?${qs}` : ''}`);
}

export async function adminGetUserInfo(id: string): Promise<Envelope<AdminUser>> {
  return apiClient.get<AdminUser>(`/admin/user/info?id=${encodeURIComponent(id)}`);
}

export async function adminUpdateUser(input: AdminUpdateUserInput): Promise<Envelope<AdminUser>> {
  return apiClient.put<AdminUser>('/admin/user/update', input);
}

export async function adminUpdateUserRole(input: AdminUpdateRoleInput): Promise<Envelope<AdminUser>> {
  return apiClient.put<AdminUser>('/admin/user/role', input);
}

export async function adminResetUserPassword(input: AdminResetPasswordInput): Promise<Envelope<null>> {
  return apiClient.post<null>('/admin/user/resetPassword', input);
}
