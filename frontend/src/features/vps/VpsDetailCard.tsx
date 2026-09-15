import React from 'react';
import { Link } from 'react-router-dom';
import { VPS } from '@/types/vps';
import { StockBadge } from '@/components/common/StockBadge';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk, formatPort, formatTransfer } from '@/lib/format/specs';
import { formatDate } from '@/lib/format/date';
import { isSafeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import {
  Cpu,
  HardDrive,
  Zap,
  Globe,
  ShoppingCart,
  Calendar,
  Store,
  ExternalLink,
} from 'lucide-react';

export interface VpsDetailCardProps {
  vps: VPS;
}

export const VpsDetailCard: React.FC<VpsDetailCardProps> = ({ vps }) => {
  const isAvailable = vps.stock?.status === 1;

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 sm:p-8 shadow-xs space-y-8">
      {/* 头部信息 */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
            <Store className="w-4 h-4 text-brand-600" />
            <Link
              to={`/merchants/${vps.merchant.id}`}
              className="font-semibold text-brand-600 hover:underline"
            >
              {vps.merchant.name}
            </Link>
            <span>·</span>
            <span className="font-mono text-xs text-gray-400">Code: {vps.code}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {vps.name}
          </h1>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          <StockBadge stock={vps.stock} />
          <div className="text-2xl font-black text-gray-900">
            {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
          </div>
        </div>
      </div>

      {/* 规格参数网格 */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-4">硬件与网络配置规格</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Cpu className="w-4 h-4 text-brand-500" />
              <span>处理器 (CPU)</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">{vps.cpu_cores} 核心</p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <HardDrive className="w-4 h-4 text-brand-500" />
              <span>运行内存 (RAM)</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">{formatMemory(vps.memory_mb)}</p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <HardDrive className="w-4 h-4 text-brand-500" />
              <span>存储空间 (Disk)</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">
              {formatDisk(vps.disk_gb, vps.disk_type)}
            </p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Zap className="w-4 h-4 text-brand-500" />
              <span>端口速率 (Port)</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">{formatPort(vps.port_mbps)}</p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Zap className="w-4 h-4 text-brand-500" />
              <span>月流量 (Traffic)</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">{formatTransfer(vps.transfer_gb)}</p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Globe className="w-4 h-4 text-brand-500" />
              <span>IPv4 地址</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">
              {vps.has_ipv4 ? `${vps.ipv4_count} 个` : '无独立 IPv4'}
            </p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Globe className="w-4 h-4 text-brand-500" />
              <span>IPv6 地址</span>
            </div>
            <p className="text-lg font-bold text-gray-900 mt-2">
              {vps.has_ipv6 ? `${vps.ipv6_count} 个` : '无 IPv6'}
            </p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Calendar className="w-4 h-4 text-brand-500" />
              <span>最后核查时间</span>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-2 truncate">
              {vps.stock?.last_checked_at ? formatDate(vps.stock.last_checked_at) : '尚未检查'}
            </p>
          </div>

          <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-semibold uppercase">
              <Calendar className="w-4 h-4 text-brand-500" />
              <span>最近有货时间</span>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-2 truncate">
              {vps.stock?.last_in_stock_at ? formatDate(vps.stock.last_in_stock_at) : '暂无有货记录'}
            </p>
          </div>
        </div>
      </div>

      {/* 描述与补充信息 */}
      {vps.description && (
        <div className="border-t border-gray-100 pt-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">套餐详情与说明</h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {vps.description}
          </p>
        </div>
      )}

      {/* 底部购买行动呼吁 */}
      <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-gray-400">
          价格与库存信息由外部监控程序自动汇报采集，下单前请以服务商官方页面为准。
        </div>

        {vps.purchase_url && isSafeExternalUrl(vps.purchase_url) && (
          <a
            href={vps.purchase_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto"
          >
            <Button
              variant={isAvailable ? 'primary' : 'outline'}
              size="lg"
              className="w-full sm:w-auto shadow-sm"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              前往服务商官网购买
              <ExternalLink className="w-3.5 h-3.5 ml-1.5 opacity-70" />
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};
