import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { AccountUser } from '@/types/auth';
import { MailCodeInput, MailCodeResult, MailVerifyInput } from '@/types/mail';

export async function sendMailCode(input: MailCodeInput): Promise<Envelope<MailCodeResult>> {
  return apiClient.post<MailCodeResult>('/me/mail/code', input);
}

export async function confirmMail(input: MailVerifyInput): Promise<Envelope<AccountUser>> {
  return apiClient.post<AccountUser>('/me/mail/verify', input);
}
