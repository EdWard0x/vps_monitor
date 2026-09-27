import * as noticeApi from '@/api/notice';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { NoticeSettings } from '@/types/notice';

export const isMissingServerKey = (error: unknown): boolean =>
  isAppError(error) && error.code === BusinessCode.SERVER_TURBO_NO_RECORD;

export async function saveAndConfirmKey(key: string): Promise<NoticeSettings> {
  await noticeApi.saveServerKey(key);
  const settings = (await noticeApi.getNotice()).data;
  if (!settings.key_bound) throw new Error('保存后未确认绑定状态');
  return settings;
}

export async function changeAndConfirmNotice(enabled: boolean): Promise<NoticeSettings> {
  if (enabled) await noticeApi.enableNotice();
  else await noticeApi.disableNotice();
  const settings = (await noticeApi.getNotice()).data;
  if (settings.notice_enabled !== enabled) throw new Error('开关状态未确认');
  return settings;
}
