import { apiClient } from '@/lib/http/client';
import { Envelope } from '@/types/common';
import { NoticeSettings } from '@/types/notice';

function assertSettings(response: Envelope<NoticeSettings>): Envelope<NoticeSettings> {
  if (typeof response.data?.notice_enabled !== 'boolean' || typeof response.data?.key_bound !== 'boolean') {
    throw new Error('通知设置接口响应格式不符，请核对后端版本。');
  }
  return response;
}

function assertSuccess(response: Envelope<string>): Envelope<string> {
  if (response.data !== 'success') {
    throw new Error('通知操作接口响应格式不符，请核对后端版本。');
  }
  return response;
}

export const getNotice = async (): Promise<Envelope<NoticeSettings>> =>
  assertSettings(await apiClient.get<NoticeSettings>('/me/notice'));

export const saveServerKey = async (sendKey: string): Promise<Envelope<NoticeSettings>> =>
  assertSettings(await apiClient.put<NoticeSettings>('/me/notice/server-key', { send_key: sendKey }));

export const enableNotice = async (): Promise<Envelope<string>> =>
  assertSuccess(await apiClient.post<string>('/me/addNotice'));

export const disableNotice = async (): Promise<Envelope<string>> =>
  assertSuccess(await apiClient.delete<string>('/me/delNotice'));
