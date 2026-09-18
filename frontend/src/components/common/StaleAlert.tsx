import React from 'react';
import { Stock } from '@/types/stock';
import { formatDate } from '@/lib/format/date';
import { AlertCircle, Clock } from 'lucide-react';

export const StaleAlert: React.FC<{ stock?: Stock | null }> = ({ stock }) => {
  if (!stock || !stock.is_stale) {
    return null;
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 space-y-1">
      <div className="flex items-center space-x-1.5 font-medium">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>库存数据可能已过期</span>
      </div>
      <p className="text-amber-700/90 pl-5.5">
        后台库存采集超过 15 分钟未更新，当前显示的库存可能存在时滞，请以下单页面为准。
      </p>
      <div className="flex items-center space-x-4 pl-5.5 pt-1 text-amber-700/80">
        <span className="inline-flex items-center">
          <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" />
          最近检查时间：{stock.last_checked_at ? formatDate(stock.last_checked_at) : '尚未获得采集结果'}
        </span>
        {stock.last_in_stock_at && (
          <span>最后有货时间：{formatDate(stock.last_in_stock_at)}</span>
        )}
      </div>
    </div>
  );
};
