import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockBadge } from '../components/common/StockBadge';
import { StaleAlert } from '../components/common/StaleAlert';
import { Stock } from '../types/stock';

describe('Stock display & collection sync unit tests', () => {
  it('StockBadge renders in-stock with quantity correctly', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 1,
      quantity: 5,
      last_checked_at: '2026-09-18T12:00:00Z',
      last_in_stock_at: '2026-09-18T12:00:00Z',
      is_stale: false,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('有货 · 剩余 5 台');
    expect(html).not.toContain('数量未知');
  });

  it('StockBadge renders in-stock without quantity (null) as "有货" without rendering 0 or 数量未知', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 1,
      quantity: null,
      last_checked_at: '2026-09-18T12:00:00Z',
      last_in_stock_at: '2026-09-18T12:00:00Z',
      is_stale: false,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('有货');
    expect(html).not.toContain('0 台');
    expect(html).not.toContain('数量未知');
  });

  it('StockBadge renders out-of-stock as "暂时无货" and does not render 0', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 2,
      quantity: 0,
      last_checked_at: '2026-09-18T12:00:00Z',
      last_in_stock_at: '2026-09-17T12:00:00Z',
      is_stale: false,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('暂时无货');
    expect(html).not.toContain('缺货 · 0 台');
  });

  it('StockBadge renders status=3 with last_checked_at as "库存未知"', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 3,
      quantity: null,
      last_checked_at: '2026-09-18T12:00:00Z',
      last_in_stock_at: null,
      is_stale: false,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('库存未知');
  });

  it('StockBadge renders status=3 without last_checked_at as "尚未获得采集结果"', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 3,
      quantity: null,
      last_checked_at: null,
      last_in_stock_at: null,
      is_stale: true,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('尚未获得采集结果');
    expect(html).toContain('数据可能已过期');
    expect(html).not.toContain('库存可能过期');
  });

  it('StockBadge renders stale notice alongside valid status', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 1,
      quantity: 2,
      last_checked_at: '2026-09-18T10:00:00Z',
      last_in_stock_at: '2026-09-18T10:00:00Z',
      is_stale: true,
    };
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock }));
    expect(html).toContain('有货 · 剩余 2 台');
    expect(html).toContain('数据可能已过期');
  });

  it('StockBadge renders fallback unknown state when stock is null', () => {
    const html = renderToStaticMarkup(React.createElement(StockBadge, { stock: null }));
    expect(html).toContain('库存未知');
    expect(html).toContain('数据可能已过期');
  });

  it('StaleAlert renders correct copy and does not mention external programs', () => {
    const stock: Stock = {
      vps_id: '42',
      status: 1,
      quantity: 2,
      last_checked_at: '2026-09-18T10:00:00Z',
      last_in_stock_at: '2026-09-18T10:00:00Z',
      is_stale: true,
    };
    const html = renderToStaticMarkup(React.createElement(StaleAlert, { stock }));
    expect(html).toContain('库存数据可能已过期');
    expect(html).toContain('后台库存采集超过 15 分钟未更新');
    expect(html).not.toContain('外部采集程序');
  });

  it('VpsCard renders 上次检查时间 when last_checked_at is available', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const { VpsCard } = await import('../features/vps/VpsCard');
    const mockVps = {
      id: 'vps-1',
      code: 'test-code',
      name: 'VPS Plan 1',
      merchant: { id: 'm-1', code: 'cloud', name: 'Cloud Provider', website_url: 'https://example.com' },
      cpu_cores: 2,
      memory_mb: 2048,
      disk_gb: 40,
      disk_type: 'nvme' as const,
      transfer_gb: 1000,
      port_mbps: 1000,
      has_ipv4: true,
      ipv4_count: 1,
      has_ipv6: false,
      ipv6_count: 0,
      price_amount: '10.00',
      currency: 'USD',
      billing_period: 'monthly' as const,
      purchase_url: 'https://example.com/buy',
      description: 'Test description',
      stock: {
        vps_id: 'vps-1',
        status: 1 as const,
        quantity: 10,
        last_checked_at: '2026-09-18T12:00:00Z',
        last_in_stock_at: '2026-09-18T12:00:00Z',
        is_stale: false,
      },
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-18T12:00:00Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(VpsCard, { vps: mockVps }))
    );
    expect(html).toContain('上次检查时间：');
    expect(html).not.toContain('尚未获得采集结果');
  });

  it('VpsCard renders 尚未获得采集结果 when last_checked_at is null', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const { VpsCard } = await import('../features/vps/VpsCard');
    const mockVps = {
      id: 'vps-2',
      code: 'test-code-2',
      name: 'VPS Plan 2',
      merchant: { id: 'm-1', code: 'cloud', name: 'Cloud Provider', website_url: 'https://example.com' },
      cpu_cores: 1,
      memory_mb: 1024,
      disk_gb: 20,
      disk_type: 'ssd' as const,
      transfer_gb: 500,
      port_mbps: 500,
      has_ipv4: true,
      ipv4_count: 1,
      has_ipv6: false,
      ipv6_count: 0,
      price_amount: '5.00',
      currency: 'USD',
      billing_period: 'monthly' as const,
      purchase_url: '',
      description: '',
      stock: {
        vps_id: 'vps-2',
        status: 3 as const,
        quantity: null,
        last_checked_at: null,
        last_in_stock_at: null,
        is_stale: true,
      },
      created_at: '2026-09-01T00:00:00Z',
      updated_at: '2026-09-18T12:00:00Z',
    };

    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(VpsCard, { vps: mockVps }))
    );
    expect(html).toContain('上次检查时间：');
    expect(html).toContain('尚未获得采集结果');
  });
});
