import React from 'react';
import { AdminMerchant, Merchant } from '@/types/merchant';
import { formatDate } from '@/lib/format/date';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ExternalLink, Edit2, Trash2 } from 'lucide-react';

export interface MerchantTableProps {
  merchants: (Merchant | AdminMerchant)[];
  isAdmin?: boolean;
  onEdit?: (m: AdminMerchant) => void;
  onDelete?: (m: AdminMerchant) => void;
}

export const MerchantTable: React.FC<MerchantTableProps> = ({
  merchants,
  isAdmin = false,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-500 uppercase font-semibold">
          <tr>
            <th className="py-3.5 px-4">标识 (Code)</th>
            <th className="py-3.5 px-4">商家名称</th>
            <th className="py-3.5 px-4">官方网址</th>
            {isAdmin && <th className="py-3.5 px-4">状态</th>}
            {isAdmin && <th className="py-3.5 px-4">采集许可</th>}
            {isAdmin && <th className="py-3.5 px-4">创建时间</th>}
            {isAdmin && <th className="py-3.5 px-4 text-right">操作</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {merchants.map((m) => {
            const adminM = m as AdminMerchant;
            return (
              <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="py-3.5 px-4 font-mono font-medium text-gray-900">{m.code}</td>
                <td className="py-3.5 px-4 font-semibold text-gray-800">{m.name}</td>
                <td className="py-3.5 px-4">
                  <a
                    href={m.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center text-xs truncate max-w-[200px]"
                  >
                    {m.website_url}
                    <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
                  </a>
                </td>
                {isAdmin && (
                  <td className="py-3.5 px-4">
                    {adminM.enabled ? (
                      <Badge variant="green">已启用</Badge>
                    ) : (
                      <Badge variant="gray">已停用</Badge>
                    )}
                  </td>
                )}
                {isAdmin && (
                  <td className="py-3.5 px-4">
                    <div className="space-y-1">
                      <Badge variant={adminM.collection_enabled ? 'blue' : 'gray'}>
                        {adminM.collection_enabled ? '已允许' : '未允许'}
                      </Badge>
                      {!adminM.enabled && adminM.collection_enabled && (
                        <span className="block text-[11px] text-amber-600 whitespace-nowrap">
                          商家已停用，库存不会采集
                        </span>
                      )}
                    </div>
                  </td>
                )}
                {isAdmin && (
                  <td className="py-3.5 px-4 text-xs text-gray-500">
                    {adminM.created_at ? formatDate(adminM.created_at) : '—'}
                  </td>
                )}
                {isAdmin && (
                  <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                    {onEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(adminM)}
                        className="text-gray-600 hover:text-brand-600"
                        title="编辑商家"
                      >
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        编辑
                      </Button>
                    )}
                    {onDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(adminM)}
                        className="text-gray-400 hover:text-red-600"
                        title="删除商家"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        删除
                      </Button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
