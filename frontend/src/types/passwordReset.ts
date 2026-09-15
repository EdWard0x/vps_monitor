// 密码重置相关类型契约

export interface PasswordResetCodeInput {
  mail: string;
}

export interface PasswordResetCodeResult {
  reset_id: string;
  expires_in: number;
  retry_after: number;
  message: string;
}

export type RequestPasswordResetCodeResult = PasswordResetCodeResult;

export interface PasswordResetConfirmInput {
  reset_id: string;
  code: string;
  new_password: string;
}
