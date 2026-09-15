import React, { useState, useEffect } from 'react';
import { AdminUser } from '@/types/user';
import { Role } from '@/types/auth';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';

export interface UserRoleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onSubmit: (userId: string, role: Role) => Promise<void>;
  loading?: boolean;
}

export const UserRoleDialog: React.FC<UserRoleDialogProps> = ({
  isOpen,
  onClose,
  user,
  onSubmit,
  loading = false,
}) => {
  const [role, setRole] = useState<Role>('user');

  useEffect(() => {
    if (user) {
      setRole(user.role);
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    await onSubmit(user.id, role);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`修改用户角色：${user?.nickname || user?.username}`}
      description="变更用户的系统权限级别。提升为管理员要求目标账号已完成邮箱验证。"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            分配系统角色
          </label>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={[
              { value: 'user', label: '普通用户 (user)' },
              { value: 'admin', label: '系统管理员 (admin)' },
            ]}
            disabled={loading}
          />
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            保存角色
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
