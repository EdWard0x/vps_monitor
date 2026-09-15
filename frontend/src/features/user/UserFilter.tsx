import React from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Search } from 'lucide-react';

export interface UserFilterProps {
  q: string;
  onQChange: (val: string) => void;
  role: string;
  onRoleChange: (val: string) => void;
  frozen: string;
  onFrozenChange: (val: string) => void;
}

export const UserFilter: React.FC<UserFilterProps> = ({
  q,
  onQChange,
  role,
  onRoleChange,
  frozen,
  onFrozenChange,
}) => {
  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
        <Input
          type="text"
          className="pl-9"
          placeholder="搜索用户名或昵称..."
          value={q}
          onChange={(e) => onQChange(e.target.value)}
        />
      </div>

      <div className="w-full sm:w-36">
        <Select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          options={[
            { value: '', label: '全部角色' },
            { value: 'user', label: '普通用户' },
            { value: 'admin', label: '管理员' },
          ]}
        />
      </div>

      <div className="w-full sm:w-36">
        <Select
          value={frozen}
          onChange={(e) => onFrozenChange(e.target.value)}
          options={[
            { value: '', label: '全部状态' },
            { value: 'false', label: '正常' },
            { value: 'true', label: '已冻结' },
          ]}
        />
      </div>
    </div>
  );
};
