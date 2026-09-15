import React from 'react';
import { VPSQuery, VPSSortOption } from '@/types/vps';
import { StockStatus } from '@/types/stock';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Search, Info } from 'lucide-react';

export interface VpsFilterProps {
  query: VPSQuery;
  onChange: (patch: Partial<VPSQuery>) => void;
  merchants?: { id: string; name: string }[];
  isAdmin?: boolean;
  enabledFilter?: string;
  onEnabledFilterChange?: (val: string) => void;
}

export const VpsFilter: React.FC<VpsFilterProps> = ({
  query,
  onChange,
  merchants = [],
  isAdmin = false,
  enabledFilter = '',
  onEnabledFilterChange,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <Input
            type="text"
            className="pl-9"
            placeholder="搜索套餐名称、描述或规格..."
            value={query.q || ''}
            onChange={(e) => onChange({ q: e.target.value, page: 1 })}
          />
        </div>

        {merchants.length > 0 && (
          <div className="w-full sm:w-44">
            <Select
              value={query.merchant_id || ''}
              onChange={(e) => onChange({ merchant_id: e.target.value || undefined, page: 1 })}
              options={[
                { value: '', label: '全部商家' },
                ...merchants.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
        )}

        <div className="w-full sm:w-36">
          <Select
            value={query.currency || ''}
            onChange={(e) => onChange({ currency: e.target.value || undefined, page: 1 })}
            options={[
              { value: '', label: '全部币种' },
              { value: 'USD', label: 'USD' },
              { value: 'EUR', label: 'EUR' },
              { value: 'CNY', label: 'CNY' },
              { value: 'GBP', label: 'GBP' },
              { value: 'JPY', label: 'JPY' },
            ]}
          />
        </div>

        <div className="w-full sm:w-40">
          <Select
            value={query.billing_period || ''}
            onChange={(e) => onChange({ billing_period: (e.target.value || undefined) as VPSQuery['billing_period'], page: 1 })}
            options={[
              { value: '', label: '全部周期' },
              { value: 'monthly', label: '按月' },
              { value: 'quarterly', label: '按季' },
              { value: 'yearly', label: '按年' },
              { value: 'one_time', label: '一次性' },
            ]}
          />
        </div>

        <div className="w-full sm:w-36">
          <Select
            value={query.status !== undefined ? String(query.status) : ''}
            onChange={(e) =>
              onChange({
                status: e.target.value ? (Number(e.target.value) as StockStatus) : undefined,
                page: 1,
              })
            }
            options={[
              { value: '', label: '全部库存' },
              { value: '1', label: '仅看有货' },
              { value: '2', label: '仅看缺货' },
              { value: '3', label: '状态未知' },
            ]}
          />
        </div>

        <div className="w-full sm:w-40">
          <Select
            value={query.sort || 'updated_desc'}
            onChange={(e) => onChange({ sort: e.target.value as VPSSortOption, page: 1 })}
            options={[
              { value: 'updated_desc', label: '更新时间降序' },
              { value: 'price_asc', label: '价格从低到高' },
              { value: 'price_desc', label: '价格从高到低' },
            ]}
          />
        </div>

        {isAdmin && onEnabledFilterChange && (
          <div className="w-full sm:w-32">
            <Select
              value={enabledFilter}
              onChange={(e) => onEnabledFilterChange(e.target.value)}
              options={[
                { value: '', label: '全部启用' },
                { value: 'true', label: '已启用' },
                { value: 'false', label: '已下架' },
              ]}
            />
          </div>
        )}
      </div>

      {(query.sort === 'price_asc' || query.sort === 'price_desc') && (!query.currency || !query.billing_period) && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-500 shrink-0" />
          <span>货币不自动转换汇率；按价格排序时，建议先选择固定的币种和计费周期进行横向对比。</span>
        </div>
      )}
    </div>
  );
};
