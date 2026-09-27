import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { VPS, VPSSortOption, BillingPeriod } from '@/types/vps';
import { StockStatus } from '@/types/stock';
import { Merchant } from '@/types/merchant';
import * as favorApi from '@/api/favor';
import * as merchantApi from '@/api/merchant';
import { useFavorites } from '@/app/FavoritesContext';
import { VpsFilter } from '@/features/vps/VpsFilter';
import { VpsCard } from '@/features/vps/VpsCard';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { getErrorMessage } from '@/lib/http/errors';
import { Star, Server, ArrowLeft, RefreshCw, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const FavoritesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { favoriteIds, isLoaded: favoritesLoaded } = useFavorites();

  const q = searchParams.get('q') || '';
  const merchantId = searchParams.get('merchant_id') || '';
  const statusStr = searchParams.get('status') || '';
  const status = statusStr ? (Number(statusStr) as StockStatus) : undefined;
  const currency = searchParams.get('currency') || undefined;
  const billingPeriod = (searchParams.get('billing_period') as BillingPeriod) || undefined;
  const sort = (searchParams.get('sort') as VPSSortOption) || 'updated_desc';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = 20;

  const hasFilters = Boolean(
    q ||
      merchantId ||
      status !== undefined ||
      currency ||
      billingPeriod ||
      (sort && sort !== 'updated_desc')
  );

  const [vpsList, setVpsList] = useState<VPS[]>([]);
  const [total, setTotal] = useState(0);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageGenRef = useRef(0);

  // 加载商家筛选列表
  useEffect(() => {
    merchantApi
      .listMerchants({ page: 1, page_size: 100 })
      .then((res) => setMerchants(res.data.items))
      .catch(() => {});
  }, []);

  const fetchFavoritesList = useCallback(async () => {
    const currentGen = ++pageGenRef.current;
    try {
      setLoading(true);
      setError(null);

      const res = await favorApi.listFavors({
        page,
        page_size: pageSize,
        q: q || undefined,
        merchant_id: merchantId || undefined,
        status,
        currency,
        billing_period: billingPeriod,
        sort,
      });

      if (pageGenRef.current !== currentGen) return;

      const serverTotal = res.data.total;
      const items = res.data.items;

      // 若取消最后一页全部项，导致当前页为空且超出有效总页数，自动退回最后一页
      if (serverTotal > 0 && items.length === 0 && page > 1) {
        const maxPage = Math.max(1, Math.ceil(serverTotal / pageSize));
        if (page > maxPage) {
          const next = new URLSearchParams(searchParams);
          next.set('page', String(maxPage));
          setSearchParams(next);
          return;
        }
      } else if (serverTotal === 0 && page > 1) {
        const next = new URLSearchParams(searchParams);
        next.set('page', '1');
        setSearchParams(next);
        return;
      }

      setVpsList(items);
      setTotal(serverTotal);
    } catch (err: unknown) {
      if (pageGenRef.current !== currentGen) return;
      setError(getErrorMessage(err));
    } finally {
      if (pageGenRef.current === currentGen) {
        setLoading(false);
      }
    }
  }, [page, pageSize, sort, q, merchantId, status, currency, billingPeriod, searchParams, setSearchParams]);

  useEffect(() => {
    fetchFavoritesList();
  }, [fetchFavoritesList]);

  // 当当前页面渲染的卡片在收藏上下文中被取消时，重新请求列表与 total
  useEffect(() => {
    if (!favoritesLoaded) return;
    const hasUnfavoritedItem = vpsList.some((vps) => !favoriteIds.has(vps.id));
    if (hasUnfavoritedItem) {
      fetchFavoritesList();
    }
  }, [favoriteIds, favoritesLoaded, vpsList, fetchFavoritesList]);

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

  const resetFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* 顶部面包屑导航 */}
      <div>
        <Link
          to="/account"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回个人中心
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center">
              <Star className="w-7 h-7 text-amber-500 mr-3 fill-current" />
              我的收藏
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              集中管理您关注的 VPS 套餐，实时监控库存与价格变动
            </p>
          </div>

          <div className="flex items-center space-x-3 self-start sm:self-auto">
            <Link to="/account/notifications"><Button variant="outline" size="sm"><BellRing className="w-3.5 h-3.5 mr-1.5" />微信通知设置</Button></Link>
            {total > 0 && (
              <span className="text-xs bg-amber-50 text-amber-800 font-medium px-3 py-1.5 rounded-xl border border-amber-200">
                共收藏 <span className="font-bold">{total}</span> 款套餐
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchFavoritesList}
              disabled={loading}
              title="刷新收藏列表"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      {/* 筛选外壳 */}
      <VpsFilter
        query={{
          q,
          merchant_id: merchantId,
          status,
          currency,
          billing_period: billingPeriod,
          sort,
        }}
        onChange={handleFilterChange}
        merchants={merchants}
      />

      {/* 列表内容 */}
      {loading ? (
        <LoadingSpinner label="正在获取收藏列表..." />
      ) : error ? (
        <ErrorState title="加载收藏失败" description={error} onRetry={fetchFavoritesList} />
      ) : vpsList.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={<Server className="w-6 h-6" />}
            title="未找到符合条件的收藏套餐"
            description="您可以尝试清除或放宽搜索关键词与筛选条件。"
            actionText="重置筛选条件"
            onAction={resetFilters}
          />
        ) : (
          <EmptyState
            icon={<Star className="w-6 h-6 text-amber-500" />}
            title="暂无收藏的 VPS 套餐"
            description="您在浏览套餐或商家时，点击卡片右上角的星星即可收藏。收藏后的套餐将在此集中展示与监控。"
            actionText="前往探索 VPS"
            onAction={() => navigate('/')}
          />
        )
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
