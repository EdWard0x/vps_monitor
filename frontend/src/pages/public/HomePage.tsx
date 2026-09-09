import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Vps, Merchant } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { StockBadge } from '@/components/common/StockBadge';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk, formatTransfer, formatPort } from '@/lib/format/specs';
import { formatDate } from '@/lib/format/date';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Filter, X, Server, ExternalLink, Cpu, HardDrive, Wifi, ArrowUpDown } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/utils';

export const HomePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // 状态与筛选参数
  const q = searchParams.get('q') || '';
  const merchantId = searchParams.get('merchant_id') || '';
  const status = searchParams.get('status') || '';
  const currency = searchParams.get('currency') || '';
  const billingPeriod = searchParams.get('billing_period') || '';
  const sort = searchParams.get('sort') || 'created_desc';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 20;

  const [vpsList, setVpsList] = useState<Vps[]>([]);
  const [total, setTotal] = useState(0);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // 获取商家列表供下拉选择
  useEffect(() => {
    apiClient
      .get<{ items: Merchant[] }>('/merchants?page=1&page_size=100')
      .then((res) => setMerchants(res.data.items))
      .catch(() => {});
  }, []);

  const updateFilters = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, val]) => {
      if (val === null || val === '') {
        next.delete(key);
      } else {
        next.set(key, val);
      }
    });
    // 改变筛选条件时重置到第 1 页
    if (!updates.page && next.get('page')) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const fetchVpsList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
        sort,
      });

      if (q) params.set('q', q);
      if (merchantId) params.set('merchant_id', merchantId);
      if (status) params.set('status', status);
      if (currency) params.set('currency', currency);
      if (billingPeriod) params.set('billing_period', billingPeriod);

      const res = await apiClient.get<{ items: Vps[]; total: number; page: number }>(`/vps?${params.toString()}`);
      setVpsList(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载 VPS 列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, q, merchantId, status, currency, billingPeriod]);

  useEffect(() => {
    fetchVpsList();
  }, [fetchVpsList]);

  // 处理价格排序切换
  const handleSortChange = (newSort: string) => {
    if (newSort === 'price_asc' || newSort === 'price_desc') {
      // 契约约束：按价格排序必须同时指定币种和周期
      const curr = currency || 'USD';
      const period = billingPeriod || 'monthly';
      updateFilters({
        sort: newSort,
        currency: curr,
        billing_period: period,
      });
    } else {
      updateFilters({ sort: newSort });
    }
  };

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const activeFiltersCount = [q, merchantId, status, currency, billingPeriod].filter(Boolean).length;

  const FilterControls = () => (
    <div className="space-y-4">
      <Input
        label="套餐搜索"
        placeholder="搜索套餐名称或标识..."
        value={q}
        onChange={(e) => updateFilters({ q: e.target.value || null })}
      />

      <Select
        label="选择商家"
        value={merchantId}
        onChange={(e) => updateFilters({ merchant_id: e.target.value || null })}
        options={[
          { value: '', label: '全部商家' },
          ...merchants.map((m) => ({ value: m.id, label: m.name })),
        ]}
      />

      <Select
        label="库存状态"
        value={status}
        onChange={(e) => updateFilters({ status: e.target.value || null })}
        options={[
          { value: '', label: '全部状态' },
          { value: '1', label: '有货' },
          { value: '2', label: '缺货' },
          { value: '3', label: '无法识别' },
        ]}
      />

      <div className="grid grid-cols-2 gap-2">
        <Select
          label="币种"
          value={currency}
          onChange={(e) => updateFilters({ currency: e.target.value || null })}
          options={[
            { value: '', label: '不限币种' },
            { value: 'USD', label: 'USD (美元)' },
            { value: 'CNY', label: 'CNY (人民币)' },
            { value: 'EUR', label: 'EUR (欧元)' },
          ]}
        />
        <Select
          label="计费周期"
          value={billingPeriod}
          onChange={(e) => updateFilters({ billing_period: e.target.value || null })}
          options={[
            { value: '', label: '不限周期' },
            { value: 'monthly', label: '月付' },
            { value: 'quarterly', label: '季付' },
            { value: 'yearly', label: '年付' },
            { value: 'one_time', label: '一次性' },
          ]}
        />
      </div>

      <Select
        label="排序方式"
        value={sort}
        onChange={(e) => handleSortChange(e.target.value)}
        options={[
          { value: 'created_desc', label: '最新添加' },
          { value: 'price_asc', label: '价格从低到高' },
          { value: 'price_desc', label: '价格从高到低' },
        ]}
      />

      {activeFiltersCount > 0 && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="w-full text-xs text-gray-500">
          清除所有筛选项
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 顶部标题与快速操作 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <Server className="w-6 h-6 text-brand-600 mr-2.5" />
            VPS 套餐与库存列表
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            实时监控各大云服务商套餐、价格与补货动态
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* 移动端展开抽屉筛选按钮 */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMobileFilterOpen(true)}
            className="md:hidden relative"
          >
            <Filter className="w-4 h-4 mr-1.5" />
            筛选
            {activeFiltersCount > 0 && (
              <span className="ml-1.5 w-4 h-4 rounded-full bg-brand-600 text-[10px] text-white flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* 当前生效标签（移动端及桌面均可清除） */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center flex-wrap gap-2 text-xs">
          <span className="text-gray-400 font-medium">已选条件：</span>
          {q && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              关键词: {q}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => updateFilters({ q: null })} />
            </span>
          )}
          {merchantId && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              商家: {merchants.find((m) => m.id === merchantId)?.name || merchantId}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => updateFilters({ merchant_id: null })} />
            </span>
          )}
          {status && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              状态: {status === '1' ? '有货' : status === '2' ? '缺货' : '无法识别'}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => updateFilters({ status: null })} />
            </span>
          )}
          {currency && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              币种: {currency}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => updateFilters({ currency: null })} />
            </span>
          )}
          {billingPeriod && (
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700">
              周期: {billingPeriod}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => updateFilters({ billing_period: null })} />
            </span>
          )}
          <button onClick={clearAllFilters} className="text-brand-600 hover:underline ml-1">
            重置全部
          </button>
        </div>
      )}

      {/* 桌面端与移动端主布局 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* 桌面端侧边筛选器 */}
        <aside className="hidden md:block col-span-1">
          <div className="sticky top-20 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
              <Filter className="w-4 h-4 mr-2 text-brand-600" />
              条件筛选
            </h3>
            <FilterControls />
          </div>
        </aside>

        {/* 移动端筛选抽屉 */}
        <Drawer
          isOpen={mobileFilterOpen}
          onClose={() => setMobileFilterOpen(false)}
          title="筛选套餐"
          position="bottom"
        >
          <FilterControls />
          <div className="mt-6">
            <Button variant="primary" size="md" className="w-full" onClick={() => setMobileFilterOpen(false)}>
              确定
            </Button>
          </div>
        </Drawer>

        {/* 列表内容区 */}
        <div className="col-span-1 md:col-span-3 space-y-4">
          {loading ? (
            <LoadingSpinner label="正在拉取 VPS 数据..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchVpsList} />
          ) : vpsList.length === 0 ? (
            <EmptyState
              title="未找到匹配套餐"
              description="请尝试调整关键词、选择其他商家或放宽筛选条件。"
              actionText="清空所有筛选"
              onAction={clearAllFilters}
            />
          ) : (
            <>
              {/* 卡片列表 (手机与桌面双适配) */}
              <div className="space-y-3">
                {vpsList.map((vps) => {
                  const safePurchase = isSafeExternalUrl(vps.purchase_url);
                  return (
                    <div
                      key={vps.id}
                      className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md hover:border-brand-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* 卡片头部：商家、名称、库存状态 */}
                        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                          <div>
                            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md mr-2">
                              {vps.merchant.name}
                            </span>
                            <Link
                              to={`/vps/${vps.id}`}
                              className="text-base sm:text-lg font-bold text-gray-900 hover:text-brand-600 transition-colors"
                            >
                              {vps.name}
                            </Link>
                          </div>
                          <StockBadge stock={vps.stock} />
                        </div>

                        {/* 描述 */}
                        {vps.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                            {vps.description}
                          </p>
                        )}

                        {/* 规格参数网格 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-600 bg-gray-50/80 p-3 rounded-xl mb-3">
                          <div className="flex items-center space-x-1.5">
                            <Cpu className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{vps.cpu_cores} 核 / {formatMemory(vps.memory_mb)}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <HardDrive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>{formatDisk(vps.disk_gb, vps.disk_type)}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <Wifi className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>流量: {formatTransfer(vps.transfer_gb)}</span>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>带宽: {formatPort(vps.port_mbps)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 卡片底部：价格、更新时间与操作 */}
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100 flex-wrap gap-2 text-xs">
                        <div className="flex items-baseline space-x-1">
                          <span className="text-lg sm:text-xl font-extrabold text-brand-700">
                            {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
                          </span>
                          <span className="text-[11px] text-gray-400 ml-2 hidden sm:inline">
                            更新于 {formatDate(vps.stock.last_checked_at)}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {safePurchase && (
                            <a
                              href={vps.purchase_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                            >
                              购买直达
                              <ExternalLink className="w-3 h-3 ml-1 text-gray-400" />
                            </a>
                          )}
                          <Link to={`/vps/${vps.id}`}>
                            <Button variant="primary" size="sm">
                              查看详情与讨论
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 分页组件 */}
              <Pagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={(newPage) => updateFilters({ page: newPage.toString() })}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
