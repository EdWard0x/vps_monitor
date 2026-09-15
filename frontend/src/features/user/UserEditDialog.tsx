import React, { useState, useEffect } from 'react';
import { AdminUser } from '@/types/user';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export interface UserEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onSubmit: (userId: string, nickname: string) => Promise<void>;
  loading?: boolean;
}

export const UserEditDialog: React.FC<UserEditDialogProps> = ({
  isOpen,
  onClose,
  user,
  onSubmit,
  loading = false,
}) => {
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    if (user) {
      setNickname(user.nickname);
    }
  }, [user, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !nickname.trim()) return;
    await onSubmit(user.id, nickname.trim());
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`编辑用户资料：${user?.username}`}
      description="修改用户的展示昵称"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            用户昵称
          </label>
          <Input
            type="text"
            placeholder="请输入新昵称"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            保存修改
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
