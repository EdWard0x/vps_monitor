import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { PublicUser, LoginResult, TokenResult, RegisterInput, LoginInput } from '@/types/auth';

export async function issueCSRF(): Promise<Envelope<{ token: string }>> {
  return apiClient.get<{ token: string }>('/auth/csrf');
}

export async function register(input: RegisterInput): Promise<Envelope<PublicUser>> {
  return apiClient.post<PublicUser>('/auth/register', input);
}

export async function login(input: LoginInput): Promise<Envelope<LoginResult>> {
  return apiClient.post<LoginResult>('/auth/login', input);
}

export async function refresh(): Promise<Envelope<TokenResult>> {
  return apiClient.post<TokenResult>('/auth/refresh', {});
}

export async function logout(): Promise<Envelope<null>> {
  return apiClient.post<null>('/auth/logout', {});
}
