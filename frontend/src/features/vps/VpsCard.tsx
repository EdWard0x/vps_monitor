import React from 'react';
import { Link } from 'react-router-dom';
import { VPS } from '@/types/vps';
import { StockBadge } from '@/components/common/StockBadge';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk, formatPort, formatTransfer } from '@/lib/format/specs';
import { formatDate, formatRelativeTime } from '@/lib/format/date';
import { isSafeExternalUrl } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Cpu, HardDrive, Zap, Globe, ShoppingCart, ArrowRight, Clock } from 'lucide-react';

export interface VpsCardProps {
  vps: VPS;
}

export const VpsCard: React.FC<VpsCardProps> = ({ vps }) => {
  const isAvailable = vps.stock?.status === 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        {/* 头部：商家与库存状态 */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <Link
              to={`/merchants/${vps.merchant.id}`}
              className="text-xs font-semibold text-brand-600 hover:underline uppercase tracking-wider"
            >
              {vps.merchant.name}
            </Link>
            <h3 className="text-base font-bold text-gray-900 mt-0.5 line-clamp-1">
              <Link to={`/vps/${vps.id}`} className="hover:text-brand-600">
                {vps.name}
              </Link>
            </h3>
          </div>
          <StockBadge stock={vps.stock} />
        </div>

        {/* 规格列表 */}
        <div className="grid grid-cols-2 gap-y-2.5 gap-x-2 py-3 my-2 border-y border-gray-100 text-xs text-gray-600">
          <div className="flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{vps.cpu_cores} 核 CPU / {formatMemory(vps.memory_mb)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{formatDisk(vps.disk_gb, vps.disk_type)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{formatTransfer(vps.transfer_gb)} @ {formatPort(vps.port_mbps)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">
              {vps.has_ipv4 ? `${vps.ipv4_count} IPv4` : '无 IPv4'}
              {vps.has_ipv6 ? ` / ${vps.ipv6_count} IPv6` : ''}
            </span>
          </div>
        </div>

        {vps.description && (
          <p className="text-xs text-gray-500 line-clamp-2 mt-2 mb-2">
            {vps.description}
          </p>
        )}

        {/* 上次检查时间 */}
        <div className="flex items-center text-xs text-gray-500 my-2.5">
          <Clock className="w-3.5 h-3.5 text-gray-400 mr-1.5 shrink-0" />
          <span className="text-gray-400 shrink-0">上次检查时间：</span>
          <span
            className="font-medium text-gray-700 truncate"
            title={vps.stock?.last_checked_at ? formatDate(vps.stock.last_checked_at) : undefined}
          >
            {vps.stock?.last_checked_at ? formatDate(vps.stock.last_checked_at) : '尚未获得采集结果'}
          </span>
          {vps.stock?.last_checked_at && (
            <span className="text-gray-400 ml-1 text-[11px] shrink-0">
              ({formatRelativeTime(vps.stock.last_checked_at)})
            </span>
          )}
        </div>
      </div>

      {/* 底部价格与购买按钮 */}
      <div className="pt-3 border-t border-gray-100 flex items-center justify-between mt-auto">
        <div>
          <span className="text-xs text-gray-400 block">价格</span>
          <span className="text-base font-extrabold text-gray-900">
            {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Link to={`/vps/${vps.id}`}>
            <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">
              详情
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
          {vps.purchase_url && isSafeExternalUrl(vps.purchase_url) && (
            <a href={vps.purchase_url} target="_blank" rel="noopener noreferrer">
              <Button variant={isAvailable ? 'primary' : 'outline'} size="sm">
                <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                购买
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
