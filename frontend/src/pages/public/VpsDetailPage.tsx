import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { VPS } from '@/types/vps';
import * as vpsApi from '@/api/vps';
import * as stockApi from '@/api/stock';
import { VpsDetailCard } from '@/features/vps/VpsDetailCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { ArrowLeft } from 'lucide-react';

export const VpsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [vps, setVps] = useState<VPS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    vpsApi
      .getVPS(id)
      .then((res) => {
        setVps(res.data);
      })
      .catch((err) => {
        if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
          setIsNotImplemented(true);
        } else {
          setError(err instanceof Error ? err.message : '加载套餐详情失败');
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // 轻量库存刷新
  useEffect(() => {
    if (!id || !vps || isNotImplemented) return;

    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const stockRes = await stockApi.getStock(id);
        setVps((prev) => (prev ? { ...prev, stock: stockRes.data } : null));
      } catch {
        // 静默失败
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [id, vps?.id, isNotImplemented]);

  if (loading) return <LoadingSpinner label="正在拉取套餐详情与最新库存..." />;

  if (isNotImplemented) {
    return (
      <div className="space-y-4">
        <Link
          to="/"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回套餐列表
        </Link>
        <NotImplementedCard
          title="套餐详情查询尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/vps/info 正在重构中，待后端接入后即可展示。"
        />
      </div>
    );
  }

  if (error || !vps) {
    return (
      <div className="space-y-4">
        <Link
          to="/"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回套餐列表
        </Link>
        <ErrorState title="加载失败" description={error || '套餐不存在或已下架'} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        返回套餐列表
      </Link>

      <VpsDetailCard vps={vps} />
    </div>
  );
};
