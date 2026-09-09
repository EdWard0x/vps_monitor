import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Vps, Stock } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { StockBadge } from '@/components/common/StockBadge';
import { StaleAlert } from '@/components/common/StaleAlert';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk, formatTransfer, formatPort } from '@/lib/format/specs';
import { formatDate } from '@/lib/format/date';
import { isSafeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { CommentSection } from '@/features/comments/CommentSection';
import {
  ArrowLeft,
  ExternalLink,
  Cpu,
  HardDrive,
  Wifi,
  Clock,
  CheckCircle2,
  Calendar,
  Layers,
} from 'lucide-react';

export const VpsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [vps, setVps] = useState<Vps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. 获取套餐完整详情
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiClient
      .get<Vps>(`/vps/${id}`)
      .then((res) => {
        setVps(res.data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // 2. 30 秒轻量库存轮询机制 (页面隐藏暂停，恢复可见刷新)
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id || !vps) return;

    const pollStock = async () => {
      // 仅在标签页处于可见状态时轮询
      if (document.hidden) return;
      try {
        const res = await apiClient.get<Stock>(`/vps/${id}/stock`);
        setVps((prev) => (prev ? { ...prev, stock: res.data } : null));
      } catch {
        // 轮询失败静默处理，不打扰用户
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        pollStock();
      }
    };

    pollTimerRef.current = window.setInterval(pollStock, 30000);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [id, vps?.id]);

  if (loading) return <LoadingSpinner label="正在拉取套餐详情与最新库存..." />;
  if (error || !vps) return <ErrorState message={error || '套餐不存在或已下架'} />;

  const safePurchase = isSafeExternalUrl(vps.purchase_url);

  return (
    <div className="space-y-8">
      {/* 返回首页 */}
      <Link
        to="/"
        className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        返回套餐列表
      </Link>

      {/* 套餐基本信息横幅 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-gray-100">
          <div>
            <div className="flex items-center space-x-2 mb-2 flex-wrap gap-y-1">
              <Link
                to={`/merchants/${vps.merchant.id}`}
                className="text-xs font-semibold text-brand-600 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-md transition-colors"
              >
                {vps.merchant.name}
              </Link>
              <span className="text-xs font-mono text-gray-400">Code: {vps.code}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              {vps.name}
            </h1>
            {vps.description && (
              <p className="mt-2 text-sm text-gray-500 whitespace-pre-wrap max-w-3xl leading-relaxed">
                {vps.description}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end justify-between gap-4 shrink-0">
            <div>
              <div className="text-xs text-gray-400 lg:text-right">套餐资费</div>
              <div className="text-3xl font-black text-brand-700">
                {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <StockBadge stock={vps.stock} />
              {safePurchase && (
                <a
                  href={vps.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center"
                >
                  <Button variant="primary" size="md">
                    前往购买
                    <ExternalLink className="w-4 h-4 ml-1.5" />
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 数据过期/监控暂停警示条 */}
        <div className="mt-6">
          <StaleAlert stock={vps.stock} />
        </div>

        {/* 详细配置网格 */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 flex items-start space-x-3">
            <Cpu className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] text-gray-400 font-medium">处理器 / 内存</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">
                {vps.cpu_cores} vCPU / {formatMemory(vps.memory_mb)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 flex items-start space-x-3">
            <HardDrive className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] text-gray-400 font-medium">系统盘 / 类型</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">
                {formatDisk(vps.disk_gb, vps.disk_type)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 flex items-start space-x-3">
            <Wifi className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] text-gray-400 font-medium">月流量限制</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">
                {formatTransfer(vps.transfer_gb)}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 flex items-start space-x-3">
            <Layers className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] text-gray-400 font-medium">网络端口速率</div>
              <div className="text-sm font-bold text-gray-800 mt-0.5">
                {formatPort(vps.port_mbps)}
              </div>
            </div>
          </div>
        </div>

        {/* 监控检查时间说明 */}
        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between text-xs text-gray-400 gap-2">
          <div className="flex items-center space-x-4">
            <span className="flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1" />
              最近监控检查：{formatDate(vps.stock.last_checked_at)}
            </span>
            {vps.stock.last_in_stock_at && (
              <span className="flex items-center text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                最后有货记录：{formatDate(vps.stock.last_in_stock_at)}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <span>
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              创建于 {formatDate(vps.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* 评论与答疑模块 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <CommentSection vpsId={vps.id} />
      </div>
    </div>
  );
};
