import { afterEach, describe, expect, it, vi } from 'vitest';
import * as noticeApi from '../api/notice';
import { AppError } from '../lib/http/errors';
import { changeAndConfirmNotice, isMissingServerKey, saveAndConfirmKey } from '../lib/noticeActions';
import {
  CALLBACK_PATH,
  captureServerChanCallback,
  clearCapturedCallback,
  makeServerChanUrl,
  saveCapturedCallback,
  validateCapturedCallback,
} from '../lib/serverchanBinding';

const ok = (data: unknown) => Response.json({ code: 0, message: 'ok', data, request_id: 'test' });

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => { items.set(key, value); },
    removeItem: (key: string) => { items.delete(key); },
  };
}

describe('微信通知前端契约', () => {
  afterEach(() => {
    clearCapturedCallback();
    vi.unstubAllGlobals();
  });

  it('puts the literal Key placeholder in the inner callback URL once', () => {
    const target = new URL(makeServerChanUrl('https://current.example', 'random state'));
    expect(target.origin).toBe('https://sct.ftqq.com');
    expect(target.searchParams.get('name')).toBe('vps-monitor');
    expect(target.searchParams.get('ref')).toBe('26797');
    expect(target.searchParams.has('key')).toBe(false);
    expect(target.searchParams.get('url')).toBe(`https://current.example${CALLBACK_PATH}?key={key}&state=random%20state`);
  });

  it('cleans the URL before validating state, TTL and user identity', () => {
    const storage = memoryStorage();
    const now = Date.now();
    storage.setItem('serverchan.bind.intent', JSON.stringify({ state: 'nonce', userId: 'user-1', createdAt: now }));
    const replaceState = vi.fn();
    const history = { state: null, replaceState };
    const url = `https://current.example${CALLBACK_PATH}?key=actual-key&state=nonce&extra=secret`;
    captureServerChanCallback({ href: url }, history);
    expect(replaceState).toHaveBeenCalledWith(null, '', CALLBACK_PATH);
    expect(validateCapturedCallback('user-1', storage, now)).toBe(true);
    expect(validateCapturedCallback('user-2', storage, now)).toBe(false);
    expect(validateCapturedCallback('user-1', storage, now + 16 * 60 * 1000)).toBe(false);
    captureServerChanCallback({ href: `https://current.example${CALLBACK_PATH}?key=one&key=two&state=nonce` }, history);
    expect(validateCapturedCallback('user-1', storage, now)).toBe(false);
    captureServerChanCallback({ href: `https://current.example${CALLBACK_PATH}?key=%7Bkey%7D&state=nonce` }, history);
    expect(validateCapturedCallback('user-1', storage, now)).toBe(false);
  });

  it('saves a valid callback once despite duplicate effects and keeps Key out of session storage', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    storage.setItem('serverchan.bind.intent', JSON.stringify({ state: 'nonce', userId: 'user-1', createdAt: Date.now() }));
    captureServerChanCallback({ href: `https://current.example${CALLBACK_PATH}?key=actual-key&state=nonce` }, { state: null, replaceState: vi.fn() });
    expect(storage.getItem('serverchan.bind.intent')).not.toContain('actual-key');
    let puts = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      expect(request.method).toBe('PUT');
      expect(new URL(url).pathname).toBe('/api/v1/me/notice/server-key');
      puts++;
      expect(await request.json()).toEqual({ send_key: 'actual-key' });
      return ok({ key_bound: true, notice_enabled: false });
    });
    await Promise.all([saveCapturedCallback(), saveCapturedCallback()]);
    expect(puts).toBe(1);
    expect(storage.getItem('serverchan.bind.intent')).toBeNull();
  });

  it('keeps the callback Key only in memory for an explicit save retry', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('sessionStorage', storage);
    storage.setItem('serverchan.bind.intent', JSON.stringify({ state: 'nonce', userId: 'user-1', createdAt: Date.now() }));
    captureServerChanCallback({ href: `https://current.example${CALLBACK_PATH}?key=retry-key&state=nonce` }, { state: null, replaceState: vi.fn() });
    let attempts = 0;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      expect(request.method).toBe('PUT');
      expect(new URL(url).pathname).toBe('/api/v1/me/notice/server-key');
      attempts++;
      expect(await request.json()).toEqual({ send_key: 'retry-key' });
      return attempts === 1
        ? Response.json({ code: 900001, message: 'failed', data: null }, { status: 500 })
        : ok({ key_bound: true, notice_enabled: false });
    });
    await expect(saveCapturedCallback()).rejects.toMatchObject({ code: 900001 });
    expect(validateCapturedCallback('user-1', storage)).toBe(true);
    await expect(saveCapturedCallback()).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(storage.getItem('serverchan.bind.intent')).toBeNull();
  });

  it('saves Key separately from enabling and confirms state from GET', async () => {
    const calls: string[] = [];
    let settings = { key_bound: false, notice_enabled: false };
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const request = new Request(url, init);
      calls.push(request.method);
      if (request.method === 'PUT') {
        expect(new URL(url).pathname).toBe('/api/v1/me/notice/server-key');
        expect(await request.json()).toEqual({ send_key: 'real-key' });
        settings = { ...settings, key_bound: true };
        return ok(settings);
      }
      if (request.method === 'POST') {
        expect(new URL(url).pathname).toBe('/api/v1/me/addNotice');
        settings = { ...settings, notice_enabled: true };
        return ok('success');
      }
      expect(request.method).toBe('GET');
      expect(new URL(url).pathname).toBe('/api/v1/me/notice');
      return ok(settings);
    });
    expect(await saveAndConfirmKey('real-key')).toEqual({ key_bound: true, notice_enabled: false });
    expect(calls).toEqual(['PUT', 'GET']);
    expect(await changeAndConfirmNotice(true)).toEqual({ key_bound: true, notice_enabled: true });
    expect(calls).toEqual(['PUT', 'GET', 'POST', 'GET']);
  });

  it('closes globally without vpsId and rejects an unconfirmed state', async () => {
    let settings = { key_bound: true, notice_enabled: true };
    vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method === 'DELETE') {
        expect(url.pathname).toBe('/api/v1/me/delNotice');
        expect(url.search).toBe('');
        expect(await request.text()).toBe('');
        return ok('success');
      }
      expect(request.method).toBe('GET');
      expect(url.pathname).toBe('/api/v1/me/notice');
      return ok(settings);
    });
    await expect(changeAndConfirmNotice(false)).rejects.toThrow('开关状态未确认');
    settings = { ...settings, notice_enabled: false };
    await expect(changeAndConfirmNotice(false)).resolves.toEqual(settings);
  });

  it('uses only business code 500005 for unbound guidance; other failures remain failures', async () => {
    expect(isMissingServerKey(new AppError(500, 500005, 'any message'))).toBe(true);
    expect(isMissingServerKey(new AppError(500, 900001, '未查询到ServerTurbo_key值'))).toBe(false);
    vi.stubGlobal('fetch', async () => Response.json({ code: 900001, message: 'failed', data: null }, { status: 500 }));
    await expect(changeAndConfirmNotice(true)).rejects.toMatchObject({ code: 900001 });
    vi.stubGlobal('fetch', async () => Response.json({ code: 900001, message: 'failed', data: null }, { status: 500 }));
    await expect(saveAndConfirmKey('real-key')).rejects.toMatchObject({ code: 900001 });
    vi.stubGlobal('fetch', async () => Response.json({ code: 900001, message: 'failed', data: null }, { status: 500 }));
    await expect(noticeApi.getNotice()).rejects.toMatchObject({ code: 900001 });
  });

  it('rejects a mismatched settings payload instead of displaying a fabricated status', async () => {
    vi.stubGlobal('fetch', async () => ok('success'));
    await expect(noticeApi.getNotice()).rejects.toThrow('响应格式不符');
  });
});
