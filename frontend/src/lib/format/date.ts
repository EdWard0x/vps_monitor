// 时间格式化工具：统一接收 UTC RFC 3339 字符串，按用户本地时区格式化展示

export function formatDate(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return '—';
  try {
    const d = new Date(utcDateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export function formatRelativeTime(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return '—';
  try {
    const d = new Date(utcDateStr);
    if (isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diffMs = now - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 5) return '刚刚';
    if (diffSec < 60) return `${diffSec} 秒前`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} 小时前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays} 天前`;

    return formatDate(utcDateStr);
  } catch {
    return '—';
  }
}
