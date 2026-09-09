import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Merchant } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Store, ExternalLink, ArrowRight, Globe } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/utils';

export const MerchantsPage: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ items: Merchant[] }>('/merchants?page=1&page_size=100')
      .then((res) => setMerchants(res.data.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
          <Store className="w-6 h-6 text-brand-600 mr-2.5" />
          商家列表
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          当前系统已收录且处于启用监控状态的主机商家
        </p>
      </div>

      {loading ? (
        <LoadingSpinner label="正在拉取商家列表..." />
      ) : error ? (
        <ErrorState message={error} />
      ) : merchants.length === 0 ? (
        <EmptyState title="暂无启用商家" description="系统中暂无可公开浏览的商家数据。" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {merchants.map((merchant) => {
            const safeWebsite = isSafeExternalUrl(merchant.website_url);
            return (
              <div
                key={merchant.id}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">{merchant.name}</h3>
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
      )}
    </div>
  );
};
