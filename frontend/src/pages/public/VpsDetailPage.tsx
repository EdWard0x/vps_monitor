import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { VPS } from '@/types/vps';
import * as vpsApi from '@/api/vps';
import * as stockApi from '@/api/stock';
import { VpsDetailCard } from '@/features/vps/VpsDetailCard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { ArrowLeft, AlertCircle } from 'lucide-react';

export const VpsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [vps, setVps] = useState<VPS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);
  const [stockRefreshError, setStockRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);
    setStockRefreshError(null);

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

  // 轻量库存轮询刷新：30秒间隔，页面可见性监听，防重叠，网络失败保留上次数据
  const hasVps = Boolean(vps);
  useEffect(() => {
    if (!id || !hasVps || isNotImplemented) return;

    let cancelled = false;
    let isFetching = false;

    const refreshStock = async () => {
      if (cancelled || isFetching || document.hidden) return;
      try {
        isFetching = true;
        const stockRes = await stockApi.getStock(id);
        if (!cancelled && stockRes?.data) {
          setVps((prev) => (prev ? { ...prev, stock: stockRes.data } : null));
          setStockRefreshError(null);
        }
      } catch (err) {
        if (!cancelled) {
          // 刷新失败时保留上一次成功数据，绝不清空或设为未知，仅展示非阻塞提示
          setStockRefreshError(getErrorMessage(err));
        }
      } finally {
        isFetching = false;
      }
    };

    const interval = setInterval(refreshStock, 30000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshStock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id, hasVps, isNotImplemented]);

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

      {stockRefreshError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>库存刷新失败（{stockRefreshError}），已保留上次成功获取的数据。</span>
          </div>
          <button
            type="button"
            onClick={() => setStockRefreshError(null)}
            className="text-amber-600 hover:text-amber-900 font-medium ml-2 text-xs shrink-0 cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      <VpsDetailCard vps={vps} />
    </div>
  );
};
