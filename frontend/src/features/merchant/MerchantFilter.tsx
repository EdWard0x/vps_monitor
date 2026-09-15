import React from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Search } from 'lucide-react';

export interface MerchantFilterProps {
  q: string;
  onQChange: (val: string) => void;
  enabled?: string;
  onEnabledChange?: (val: string) => void;
  isAdmin?: boolean;
}

export const MerchantFilter: React.FC<MerchantFilterProps> = ({
  q,
  onQChange,
  enabled = '',
  onEnabledChange,
  isAdmin = false,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
        <Input
          type="text"
          className="pl-9"
          placeholder="搜索商家名称或标识..."
          value={q}
          onChange={(e) => onQChange(e.target.value)}
        />
      </div>

      {isAdmin && onEnabledChange && (
        <div className="w-full sm:w-40">
          <Select
            value={enabled}
            onChange={(e) => onEnabledChange(e.target.value)}
            options={[
              { value: '', label: '全部状态' },
              { value: 'true', label: '已启用' },
              { value: 'false', label: '已停用' },
            ]}
          />
        </div>
      )}
    </div>
  );
};
