// 邮箱验证相关类型契约

export interface MailCodeInput {
  mail: string;
  current_password?: string;
}

export interface MailCodeResult {
  verification_id: string;
  expires_in: number;
  retry_after: number;
}

export type RequestMailCodeResult = MailCodeResult;

export interface MailVerifyInput {
  verification_id: string;
  code: string;
}
