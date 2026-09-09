import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Merchant, Vps } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StockBadge } from '@/components/common/StockBadge';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk, formatTransfer } from '@/lib/format/specs';
import { Store, Globe, ExternalLink, ArrowLeft, Server } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export const MerchantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [vpsList, setVpsList] = useState<Vps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      apiClient.get<Merchant>(`/merchants/${id}`),
      apiClient.get<{ items: Vps[] }>(`/vps?merchant_id=${id}&page=1&page_size=100`),
    ])
      .then(([mRes, vRes]) => {
        setMerchant(mRes.data);
        setVpsList(vRes.data.items);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner label="正在拉取商家详情与套餐..." />;
  if (error || !merchant) return <ErrorState message={error || '商家不存在或已停用'} />;

  const safeWebsite = isSafeExternalUrl(merchant.website_url);

  return (
    <div className="space-y-6">
      <Link
        to="/merchants"
        className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        返回商家列表
      </Link>

      {/* 商家资料卡片 */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{merchant.name}</h1>
              <span className="text-xs font-mono text-gray-400">{merchant.code}</span>
            </div>
          </div>
        </div>

        {safeWebsite && (
          <a
            href={merchant.website_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center"
          >
            <Button variant="outline" size="sm">
              <Globe className="w-3.5 h-3.5 mr-1.5" />
              访问商家官网
              <ExternalLink className="w-3 h-3 ml-1.5 text-gray-400" />
            </Button>
          </a>
        )}
      </div>

      {/* 旗下套餐列表 */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <Server className="w-4 h-4 text-brand-600 mr-2" />
          旗下套餐与实时库存 ({vpsList.length})
        </h2>

        {vpsList.length === 0 ? (
          <EmptyState title="该商家暂无在售套餐" description="当前该商家下未配置任何上架商品。" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vpsList.map((vps) => (
              <div
                key={vps.id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-brand-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Link
                      to={`/vps/${vps.id}`}
                      className="font-bold text-gray-900 hover:text-brand-600 transition-colors"
                    >
                      {vps.name}
                    </Link>
                    <StockBadge stock={vps.stock} />
                  </div>

                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                    {vps.description || '暂无描述'}
                  </p>

                  <div className="flex items-center space-x-3 text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg mb-3">
                    <span>{vps.cpu_cores} 核 / {formatMemory(vps.memory_mb)}</span>
                    <span>·</span>
                    <span>{formatDisk(vps.disk_gb, vps.disk_type)}</span>
                    <span>·</span>
                    <span>流量: {formatTransfer(vps.transfer_gb)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                  <span className="text-base font-bold text-brand-700">
                    {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
                  </span>
                  <Link to={`/vps/${vps.id}`}>
                    <Button variant="primary" size="sm">
                      详情与评论
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
