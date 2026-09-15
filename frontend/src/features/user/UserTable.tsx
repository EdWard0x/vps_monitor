import React from 'react';
import { AdminUser } from '@/types/user';
import { formatDate } from '@/lib/format/date';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Shield, User, Snowflake, KeyRound, Edit2 } from 'lucide-react';

export interface UserTableProps {
  users: AdminUser[];
  onEditUser?: (u: AdminUser) => void;
  onEditRole?: (u: AdminUser) => void;
  onResetPassword?: (u: AdminUser) => void;
  onToggleFreeze?: (u: AdminUser) => void;
}

export const UserTable: React.FC<UserTableProps> = ({
  users,
  onEditUser,
  onEditRole,
  onResetPassword,
  onToggleFreeze,
}) => {
  return (
    <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-xs">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-500 uppercase font-semibold">
          <tr>
            <th className="py-3.5 px-4">用户名</th>
            <th className="py-3.5 px-4">昵称</th>
            <th className="py-3.5 px-4">角色</th>
            <th className="py-3.5 px-4">账号状态</th>
            <th className="py-3.5 px-4">注册时间</th>
            <th className="py-3.5 px-4 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-gray-50/60 transition-colors">
              <td className="py-3.5 px-4 font-mono font-medium text-gray-900">{u.username}</td>
              <td className="py-3.5 px-4 text-gray-800 font-medium">{u.nickname}</td>
              <td className="py-3.5 px-4">
                {u.role === 'admin' ? (
                  <Badge variant="yellow">
                    <Shield className="w-3 h-3 mr-1" />
                    管理员
                  </Badge>
                ) : (
                  <Badge variant="gray">
                    <User className="w-3 h-3 mr-1" />
                    普通用户
                  </Badge>
                )}
              </td>
              <td className="py-3.5 px-4">
                {u.frozen ? (
                  <Badge variant="red">已冻结</Badge>
                ) : (
                  <Badge variant="green">正常</Badge>
                )}
              </td>
              <td className="py-3.5 px-4 text-xs text-gray-500">
                {u.created_at ? formatDate(u.created_at) : '—'}
              </td>
              <td className="py-3.5 px-4 text-right space-x-1 whitespace-nowrap">
                {onEditUser && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditUser(u)}
                    className="text-gray-600 hover:text-brand-600"
                    title="编辑资料"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" />
                    编辑
                  </Button>
                )}
                {onEditRole && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditRole(u)}
                    className="text-gray-600 hover:text-brand-600"
                    title="修改角色"
                  >
                    <Shield className="w-3.5 h-3.5 mr-1" />
                    角色
                  </Button>
                )}
                {onResetPassword && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResetPassword(u)}
                    className="text-gray-600 hover:text-amber-600"
                    title="重置密码"
                  >
                    <KeyRound className="w-3.5 h-3.5 mr-1" />
                    改密
                  </Button>
                )}
                {onToggleFreeze && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleFreeze(u)}
                    className={u.frozen ? 'text-emerald-600 hover:bg-emerald-50' : 'text-red-600 hover:bg-red-50'}
                    title={u.frozen ? '解冻该账号' : '冻结该账号'}
                  >
                    <Snowflake className="w-3.5 h-3.5 mr-1" />
                    {u.frozen ? '解冻' : '冻结'}
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
