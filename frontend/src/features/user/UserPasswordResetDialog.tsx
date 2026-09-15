import React, { useState, useEffect } from 'react';
import { AdminUser } from '@/types/user';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export interface UserPasswordResetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onSubmit: (userId: string, newPassword: string) => Promise<void>;
  loading?: boolean;
}

export const UserPasswordResetDialog: React.FC<UserPasswordResetDialogProps> = ({
  isOpen,
  onClose,
  user,
  onSubmit,
  loading = false,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNewPassword('');
    setError(null);
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const newPasswordBytes = new TextEncoder().encode(newPassword).length;
    if (newPasswordBytes < 8) {
      setError('新密码的 UTF-8 长度不能少于 8 字节');
      return;
    }
    if (newPasswordBytes > 72) {
      setError('新密码的 UTF-8 长度不能超过 72 字节');
      return;
    }
    setError(null);
    await onSubmit(user.id, newPassword);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`重置密码：${user?.nickname || user?.username}`}
      description="为该用户强制设置新密码。重置后该用户的所有旧登录令牌将立即失效。"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            输入新密码
          </label>
          <Input
            type="password"
            placeholder="至少 8 位新密码"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            确认重置密码
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
