import React from 'react';
import { Stock } from '@/types/api';
import { Badge } from '@/components/ui/Badge';

export interface StockBadgeProps {
  stock: Stock;
  showStaleNotice?: boolean;
}

export const StockBadge: React.FC<StockBadgeProps> = ({ stock, showStaleNotice = true }) => {
  const { status, quantity, last_checked_at, is_stale, monitor_enabled } = stock;

  // 1. 尚未检查
  if (!last_checked_at) {
    return <Badge variant="gray">尚未检查</Badge>;
  }

  // 2. 基础状态计算
  let text = '';
  let variant: 'green' | 'red' | 'yellow' | 'gray' = 'gray';

  if (status === 1) {
    text = quantity !== null && quantity !== undefined ? `有货 · ${quantity} 台` : '有货 · 数量未知';
    variant = 'green';
  } else if (status === 2) {
    text = '缺货';
    variant = 'red';
  } else {
    text = '无法识别';
    variant = 'yellow';
  }

  // 3. 监控暂停或数据过期叠加
  if (!monitor_enabled) {
    return (
      <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
        <Badge variant="gray">监控已暂停</Badge>
        <span className="text-xs text-gray-400">({text})</span>
      </div>
    );
  }

  if (is_stale && showStaleNotice) {
    return (
      <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
        <Badge variant="yellow">数据已过期</Badge>
        <span className="text-xs text-gray-500">({text})</span>
      </div>
    );
  }

  return <Badge variant={variant}>{text}</Badge>;
};
