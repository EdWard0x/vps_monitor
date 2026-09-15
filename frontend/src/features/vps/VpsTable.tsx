import React from 'react';
import { Link } from 'react-router-dom';
import { AdminVPS } from '@/types/vps';
import { StockBadge } from '@/components/common/StockBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk } from '@/lib/format/specs';
import { isSafeExternalUrl } from '@/lib/utils';
import { Edit2, Trash2, ExternalLink } from 'lucide-react';

export interface VpsTableProps {
  vpsList: AdminVPS[];
  onDelete?: (vps: AdminVPS) => void;
}

export const VpsTable: React.FC<VpsTableProps> = ({ vpsList, onDelete }) => {
  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-500 uppercase font-semibold">
          <tr>
            <th className="py-3.5 px-4">标识 (Code)</th>
            <th className="py-3.5 px-4">套餐名称</th>
            <th className="py-3.5 px-4">所属商家</th>
            <th className="py-3.5 px-4">核心规格</th>
            <th className="py-3.5 px-4">价格 / 周期</th>
            <th className="py-3.5 px-4">状态</th>
            <th className="py-3.5 px-4">采集许可</th>
            <th className="py-3.5 px-4">当前库存</th>
            <th className="py-3.5 px-4 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {vpsList.map((vps) => (
            <tr key={vps.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-3.5 px-4 font-mono font-medium text-gray-900">{vps.code}</td>
              <td className="py-3.5 px-4">
                <Link
                  to={`/admin/vps/${vps.id}`}
                  className="font-semibold text-gray-900 hover:text-brand-600 line-clamp-1"
                >
                  {vps.name}
                </Link>
                {vps.purchase_url && isSafeExternalUrl(vps.purchase_url) && (
                  <a
                    href={vps.purchase_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-600 hover:underline inline-flex items-center mt-0.5"
                  >
                    购买地址
                    <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                  </a>
                )}
              </td>
              <td className="py-3.5 px-4 text-gray-700 font-medium">
                {vps.merchant?.name || vps.merchant_id}
              </td>
              <td className="py-3.5 px-4 text-xs text-gray-500 whitespace-nowrap">
                {vps.cpu_cores}C / {formatMemory(vps.memory_mb)} / {formatDisk(vps.disk_gb, vps.disk_type)}
              </td>
              <td className="py-3.5 px-4 font-semibold text-gray-800 whitespace-nowrap">
                {formatPrice(vps.price_amount, vps.currency, vps.billing_period)}
              </td>
              <td className="py-3.5 px-4">
                {vps.enabled ? (
                  <Badge variant="green">已上架</Badge>
                ) : (
                  <Badge variant="gray">已下架</Badge>
                )}
              </td>
              <td className="py-3.5 px-4">
                <Badge variant={vps.collection_enabled ? 'blue' : 'gray'}>
                  {vps.collection_enabled ? '已允许' : '未允许'}
                </Badge>
              </td>
              <td className="py-3.5 px-4">
                <StockBadge stock={vps.stock} showStaleNotice={false} />
              </td>
              <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                <Link to={`/admin/vps/${vps.id}`}>
                  <Button variant="ghost" size="sm" className="text-gray-600 hover:text-brand-600">
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    编辑
                  </Button>
                </Link>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(vps)}
                    className="text-gray-400 hover:text-red-600"
                    title="删除套餐"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                    删除
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
