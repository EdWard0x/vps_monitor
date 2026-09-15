import React from 'react';
import { Stock } from '@/types/stock';
import { Badge } from '@/components/ui/Badge';

export interface StockBadgeProps {
  stock?: Stock | null;
  showStaleNotice?: boolean;
}

export const StockBadge: React.FC<StockBadgeProps> = ({ stock, showStaleNotice = true }) => {
  if (!stock) {
    return <Badge variant="gray">状态未知</Badge>;
  }

  const { status, quantity, last_checked_at, is_stale } = stock;

  if (!last_checked_at) {
    return <Badge variant="gray">尚未检查</Badge>;
  }

  let text = '';
  let variant: 'green' | 'red' | 'yellow' | 'gray' = 'gray';

  if (status === 1) {
    text = quantity !== null && quantity !== undefined ? `有货 · ${quantity} 台` : '有货 · 数量未知';
    variant = 'green';
  } else if (status === 2) {
    text = quantity === 0 ? '缺货 · 0 台' : '缺货';
    variant = 'red';
  } else {
    text = '未知';
    variant = 'yellow';
  }

  return (
    <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
      <Badge variant={variant}>{text}</Badge>
      {is_stale && showStaleNotice && <Badge variant="yellow">库存可能过期</Badge>}
    </div>
  );
};
