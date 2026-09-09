import React from 'react';
import { Stock } from '@/types/api';
import { formatDate } from '@/lib/format/date';
import { AlertCircle, Clock } from 'lucide-react';

export const StaleAlert: React.FC<{ stock: Stock }> = ({ stock }) => {
  if (stock.monitor_enabled && !stock.is_stale) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 space-y-1">
      <div className="flex items-center space-x-1.5 font-medium">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>
          {!stock.monitor_enabled ? '监控已暂停' : '库存数据已超过预期更新时间'}
        </span>
      </div>
      <p className="text-amber-700/90 pl-5.5">
        {!stock.monitor_enabled
          ? '该商家或产品的监控目前已由管理员暂停，当前显示的库存仅为历史观测数据。'
          : '由于网络延迟或监控调度，当前显示的库存可能存在时滞。'}
      </p>
      <div className="flex items-center space-x-4 pl-5.5 pt-1 text-amber-700/80">
        <span className="inline-flex items-center">
          <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
          最近检查时间：{formatDate(stock.last_checked_at)}
        </span>
        {stock.last_in_stock_at && (
          <span>最后有货：{formatDate(stock.last_in_stock_at)}</span>
        )}
      </div>
    </div>
  );
};
