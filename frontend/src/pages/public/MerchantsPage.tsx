import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Merchant } from '@/types/merchant';
import * as merchantApi from '@/api/merchant';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Store, ExternalLink, ArrowRight, Globe, Search } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/utils';

export const MerchantsPage: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const fetchMerchants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      const res = await merchantApi.listMerchants({
        page,
        page_size: pageSize,
        q: q.trim() || undefined,
      });
      setMerchants(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
      } else {
        setError(err instanceof Error ? err.message : '获取商家列表失败');
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMerchants();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchMerchants]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center">
            <Store className="w-7 h-7 text-brand-600 mr-3" />
            商家列表
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            系统已收录的主机服务提供商列表
          </p>
        </div>

        <div className="w-full sm:w-64 relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <Input
            type="text"
            className="pl-9"
            placeholder="按名称或标识搜索..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isNotImplemented ? (
        <NotImplementedCard
          title="商家列表接口尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/merchant/list 正在重构中，待后端接入后即可展示真实商家。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在拉取商家列表..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchMerchants} />
      ) : merchants.length === 0 ? (
        <EmptyState title="暂无商家数据" description="未找到符合条件的商家信息。" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {merchants.map((merchant) => {
              const safeWebsite = isSafeExternalUrl(merchant.website_url);
              return (
                <div
                  key={merchant.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-gray-900">{merchant.name}</h3>
                      <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {merchant.code}
                      </span>
                    </div>

                    {safeWebsite && (
                      <div className="flex items-center text-xs text-brand-600 mb-4 truncate">
                        <Globe className="w-3.5 h-3.5 mr-1 shrink-0 text-gray-400" />
                        <a
                          href={merchant.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline truncate"
                        >
                          {merchant.website_url}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                    <Link
                      to={`/merchants/${merchant.id}`}
                      className="inline-flex items-center text-brand-600 hover:text-brand-700 font-medium"
                    >
                      查看商家套餐
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Link>

                    {safeWebsite && (
                      <a
                        href={merchant.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-gray-400 hover:text-gray-600"
                      >
                        访问官网
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
};
