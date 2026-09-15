import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import {
  PasswordResetCodeInput,
  PasswordResetCodeResult,
  PasswordResetConfirmInput,
} from '@/types/passwordReset';

export async function requestPasswordResetCode(
  input: PasswordResetCodeInput
): Promise<Envelope<PasswordResetCodeResult>> {
  return apiClient.post<PasswordResetCodeResult>('/auth/password-reset/code', input);
}

export async function confirmPasswordReset(input: PasswordResetConfirmInput): Promise<Envelope<null>> {
  return apiClient.post<null>('/auth/password-reset/confirm', input);
}
