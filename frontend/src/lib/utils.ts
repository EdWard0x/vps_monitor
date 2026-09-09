import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 校验是否为安全的外链 (仅允许 HTTP/HTTPS)
 */
export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 校验并清理站内 returnTo 路径，防止开放重定向攻击
 */
export function sanitizeReturnTo(path: string | null | undefined): string {
  if (!path) return '/';
  const trimmed = path.trim();
  // 必须以单个 / 开头，不能以 // 开头，不能包含协议如 http: 或 javascript:
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('://')) {
    return trimmed;
  }
  return '/';
}
