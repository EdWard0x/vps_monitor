import { describe, it, expect } from 'vitest';
import { formatPrice } from '../lib/format/money';
import { formatTransfer, formatPort, formatMemory, formatDisk } from '../lib/format/specs';
import { sanitizeReturnTo, isSafeExternalUrl } from '../lib/utils';

describe('Format and Utils tests', () => {
  it('formatPrice preserves fixed-point string representation', () => {
    expect(formatPrice('9.90', 'USD', 'monthly')).toBe('USD 9.90 / 月');
    expect(formatPrice('19.90', 'USD', 'yearly')).toBe('USD 19.90 / 年');
    expect(formatPrice('0.00', 'CNY')).toBe('CNY 0.00');
    expect(formatPrice(null)).toBe('—');
  });

  it('formatTransfer strictly respects 0, null, and positive integers', () => {
    expect(formatTransfer(0)).toBe('不限量');
    expect(formatTransfer(null)).toBe('未知');
    expect(formatTransfer(undefined)).toBe('未知');
    expect(formatTransfer(1000)).toBe('1000 GB');
    expect(formatTransfer(1024)).toBe('1 TB');
    expect(formatTransfer(2048)).toBe('2 TB');
  });

  it('formatPort respects null and positive bandwidth', () => {
    expect(formatPort(null)).toBe('未知');
    expect(formatPort(undefined)).toBe('未知');
    expect(formatPort(100)).toBe('100 Mbps');
    expect(formatPort(1000)).toBe('1 Gbps');
    expect(formatPort(2500)).toBe('2500 Mbps');
  });

  it('formatMemory formats MB and GB', () => {
    expect(formatMemory(512)).toBe('512 MB');
    expect(formatMemory(1024)).toBe('1 GB');
    expect(formatMemory(4096)).toBe('4 GB');
  });

  it('formatDisk includes disk type', () => {
    expect(formatDisk(20, 'ssd')).toBe('20 GB SSD');
    expect(formatDisk(40, 'nvme')).toBe('40 GB NVME');
    expect(formatDisk(500, 'hdd')).toBe('500 GB HDD');
    expect(formatDisk(10, 'unknown')).toBe('10 GB');
  });

  it('sanitizeReturnTo prevents open redirection attacks', () => {
    expect(sanitizeReturnTo('/account')).toBe('/account');
    expect(sanitizeReturnTo('/vps/1001')).toBe('/vps/1001');
    expect(sanitizeReturnTo('//evil.com')).toBe('/');
    expect(sanitizeReturnTo('https://evil.com')).toBe('/');
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe('/');
    expect(sanitizeReturnTo(null)).toBe('/');
  });

  it('isSafeExternalUrl validates safe http/https external links', () => {
    expect(isSafeExternalUrl('https://dmit.tio/cart/1')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeExternalUrl(null)).toBe(false);
  });
});
