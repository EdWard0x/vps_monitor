import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Merchant } from '@/types/merchant';
import { VPS } from '@/types/vps';
import * as merchantApi from '@/api/merchant';
import * as vpsApi from '@/api/vps';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { VpsCard } from '@/features/vps/VpsCard';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Store, Globe, ExternalLink, ArrowLeft, Server } from 'lucide-react';
import { isSafeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export const MerchantDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [vpsList, setVpsList] = useState<VPS[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    Promise.all([
      merchantApi.getMerchant(id),
      vpsApi.listVPS({ merchant_id: id, page: 1, page_size: 100 }),
    ])
      .then(([mRes, vRes]) => {
        setMerchant(mRes.data);
        setVpsList(vRes.data.items);
      })
      .catch((err) => {
        if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
          setIsNotImplemented(true);
        } else {
          setError(err instanceof Error ? err.message : '加载商家详情与套餐失败');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner label="正在拉取商家详情与套餐..." />;

  if (isNotImplemented) {
    return (
      <div className="space-y-4">
        <Link
          to="/merchants"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回商家列表
        </Link>
        <NotImplementedCard
          title="商家详情与套餐查询尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/merchant/info 及套餐列表正在重构中。"
        />
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="space-y-4">
        <Link
          to="/merchants"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回商家列表
        </Link>
        <ErrorState title="加载失败" description={error || '商家不存在或已下架'} />
      </div>
    );
  }

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
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
          <EmptyState title="该商家暂无在售套餐" description="当前该商家下未查询到已上架的 VPS 商品。" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vpsList.map((vps) => (
              <VpsCard key={vps.id} vps={vps} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
