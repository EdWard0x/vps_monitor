import * as noticeApi from '@/api/notice';

export const CALLBACK_PATH = '/account/notifications/serverchan/callback';
const INTENT_KEY = 'serverchan.bind.intent';
const TTL_MS = 15 * 60 * 1000;

interface BindIntent {
  state: string;
  userId: string;
  createdAt: number;
}

interface CapturedCallback {
  key: string | null;
  state: string | null;
  validParameters: boolean;
}

let captured: CapturedCallback | null = null;
let saving: Promise<void> | null = null;

export function makeServerChanUrl(origin: string, state: string): string {
  const callback = `${origin}${CALLBACK_PATH}?key={key}&state=${encodeURIComponent(state)}`;
  const target = new URL('https://sct.ftqq.com/appkey/create/forward');
  target.searchParams.set('name', 'vps-monitor');
  target.searchParams.set('url', callback);
  target.searchParams.set('ref', '26797');
  return target.toString();
}

export function beginServerChanBinding(userId: string): void {
  const state = crypto.randomUUID();
  const intent: BindIntent = { state, userId, createdAt: Date.now() };
  sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  window.location.assign(makeServerChanUrl(window.location.origin, state));
}

// Called by the bootstrap entry before loading the router or any other application module.
export function captureServerChanCallback(
  location: Pick<Location, 'href'>,
  history: Pick<History, 'replaceState' | 'state'>
): void {
  const url = new URL(location.href);
  if (url.pathname !== CALLBACK_PATH) return;
  const keys = url.searchParams.getAll('key');
  const states = url.searchParams.getAll('state');
  const key = keys.length === 1 ? keys[0] : null;
  captured = {
    key: key && key.trim() && key !== '{key}' ? key : null,
    state: states.length === 1 ? states[0] : null,
    validParameters: keys.length === 1 && states.length === 1 && Boolean(key?.trim()) && key !== '{key}' && Boolean(states[0]),
  };
  // Remove the complete query and fragment, including unexpected sensitive parameters.
  history.replaceState(history.state, '', url.pathname);
}

export function validateCapturedCallback(userId: string, storage: Pick<Storage, 'getItem'>, now = Date.now()): boolean {
  if (!captured?.validParameters || !captured.key || !captured.state) return false;
  try {
    const raw = storage.getItem(INTENT_KEY);
    if (!raw) return false;
    const intent = JSON.parse(raw) as Partial<BindIntent>;
    return intent.userId === userId && intent.state === captured.state &&
      typeof intent.createdAt === 'number' && now >= intent.createdAt && now - intent.createdAt <= TTL_MS;
  } catch {
    return false;
  }
}

export function hasCapturedCallback(): boolean {
  return Boolean(captured?.key);
}

export function clearCapturedCallback(storage?: Pick<Storage, 'removeItem'>): void {
  captured = null;
  saving = null;
  try { storage?.removeItem(INTENT_KEY); } catch { /* Key is already gone from memory. */ }
}

// A shared promise survives React StrictMode's effect replay and prevents duplicate PUTs.
export function saveCapturedCallback(): Promise<void> {
  if (saving) return saving;
  if (!captured?.key) return Promise.reject(new Error('回跳 Key 已失效'));
  const key = captured.key;
  saving = noticeApi.saveServerKey(key).then(() => {
    captured = null;
    saving = null;
    try { sessionStorage.removeItem(INTENT_KEY); } catch { /* The server save still succeeded. */ }
  }).catch((error: unknown) => {
    saving = null;
    throw error;
  });
  return saving;
}
