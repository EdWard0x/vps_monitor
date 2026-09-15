import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { VPS, VPSSortOption, BillingPeriod } from '@/types/vps';
import { StockStatus } from '@/types/stock';
import { Merchant } from '@/types/merchant';
import * as vpsApi from '@/api/vps';
import * as merchantApi from '@/api/merchant';
import { VpsFilter } from '@/features/vps/VpsFilter';
import { VpsCard } from '@/features/vps/VpsCard';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Server } from 'lucide-react';

export const HomePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get('q') || '';
  const merchantId = searchParams.get('merchant_id') || '';
  const statusStr = searchParams.get('status') || '';
  const status = statusStr ? (Number(statusStr) as StockStatus) : undefined;
  const currency = searchParams.get('currency') || undefined;
  const billingPeriod = (searchParams.get('billing_period') as BillingPeriod) || undefined;
  const sort = (searchParams.get('sort') as VPSSortOption) || 'updated_desc';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 20;

  const [vpsList, setVpsList] = useState<VPS[]>([]);
  const [total, setTotal] = useState(0);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  // 加载商家筛选列表
  useEffect(() => {
    merchantApi
      .listMerchants({ page: 1, page_size: 100 })
      .then((res) => setMerchants(res.data.items))
      .catch(() => {});
  }, []);

  const fetchVpsList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      const res = await vpsApi.listVPS({
        page,
        page_size: pageSize,
        q: q || undefined,
        merchant_id: merchantId || undefined,
        status,
        currency,
        billing_period: billingPeriod,
        sort,
      });

      setVpsList(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
      } else {
        setError(err instanceof Error ? err.message : '加载 VPS 套餐失败');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, q, merchantId, status, currency, billingPeriod]);

  useEffect(() => {
    fetchVpsList();
  }, [fetchVpsList]);

  const handleFilterChange = (patch: Record<string, any>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') {
        next.delete(k);
      } else {
        next.set(k, String(v));
      }
    });
    if (!patch.page && next.get('page')) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const handlePageChange = (newPage: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(newPage));
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      {/* 头部介绍 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
          VPS 实时库存与套餐监控
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          全网热门便宜 VPS 服务器套餐配置、库存状态及直达购买链接
        </p>
      </div>

      {/* 综合筛选外壳 */}
      <VpsFilter
        query={{ q, merchant_id: merchantId, status, currency, billing_period: billingPeriod, sort }}
        onChange={handleFilterChange}
        merchants={merchants}
      />

      {/* 内容区域 */}
      {isNotImplemented ? (
        <NotImplementedCard
          title="VPS 列表接口尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/vps/list 正在重构中，待后端接入业务逻辑后即可展示真实库存。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在获取 VPS 套餐列表..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchVpsList} />
      ) : vpsList.length === 0 ? (
        <EmptyState
          icon={<Server className="w-6 h-6" />}
          title="未找到符合条件的 VPS 套餐"
          description="您可以尝试清除或放宽搜索关键词与筛选条件。"
          actionText="重置筛选条件"
          onAction={() => setSearchParams(new URLSearchParams())}
        />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vpsList.map((vps) => (
              <VpsCard key={vps.id} vps={vps} />
            ))}
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  );
};
