import React from 'react';
import { Stock } from '@/types/stock';
import { Badge } from '@/components/ui/Badge';

export interface StockBadgeProps {
  stock?: Stock | null;
  showStaleNotice?: boolean;
}

export const StockBadge: React.FC<StockBadgeProps> = ({ stock, showStaleNotice = true }) => {
  if (!stock) {
    return (
      <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
        <Badge variant="gray">库存未知</Badge>
        {showStaleNotice && <Badge variant="yellow">数据可能已过期</Badge>}
      </div>
    );
  }

  const { status, quantity, last_checked_at, is_stale } = stock;

  let text = '';
  let variant: 'green' | 'red' | 'yellow' | 'gray' = 'gray';

  if (status === 1) {
    text = quantity !== null && quantity !== undefined ? `有货 · 剩余 ${quantity} 台` : '有货';
    variant = 'green';
  } else if (status === 2) {
    text = '暂时无货';
    variant = 'red';
  } else {
    text = last_checked_at ? '库存未知' : '尚未获得采集结果';
    variant = 'yellow';
  }

  return (
    <div className="inline-flex items-center space-x-1.5 flex-wrap gap-y-1">
      <Badge variant={variant}>{text}</Badge>
      {is_stale && showStaleNotice && <Badge variant="yellow">数据可能已过期</Badge>}
    </div>
  );
};
