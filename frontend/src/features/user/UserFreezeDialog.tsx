import React from 'react';
import { AdminUser } from '@/types/user';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Snowflake, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface UserFreezeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUser | null;
  onConfirm: (userId: string, targetFrozen: boolean) => Promise<void>;
  loading?: boolean;
}

export const UserFreezeDialog: React.FC<UserFreezeDialogProps> = ({
  isOpen,
  onClose,
  user,
  onConfirm,
  loading = false,
}) => {
  if (!user) return null;
  const willFreeze = !user.frozen;

  const handleConfirm = async () => {
    await onConfirm(user.id, willFreeze);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={willFreeze ? `确认冻结账号：${user.nickname}` : `确认解冻账号：${user.nickname}`}
      description={
        willFreeze
          ? '冻结将立即终止该用户在全部设备上的访问权限，阻止其继续调用受保护业务。'
          : '解冻将恢复该账号的正常状态。解冻后该用户需使用密码重新登录系统。'
      }
    >
      <div className="space-y-4 pt-2">
        <div
          className={`rounded-2xl p-4 border text-sm flex items-start space-x-3 ${
            willFreeze
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {willFreeze ? (
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p className="font-semibold">
              {willFreeze ? '账号将被锁定' : '账号将恢复可用'}
            </p>
            <p className="text-xs opacity-90 leading-relaxed">
              {willFreeze
                ? `确认对用户「${user.username}」实施全设备冻结？`
                : `解冻不会自动恢复旧的登录会话，用户「${user.username}」需重新输入凭据登录。`}
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button
            type="button"
            variant={willFreeze ? 'primary' : 'outline'}
            size="sm"
            onClick={handleConfirm}
            loading={loading}
            className={willFreeze ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            <Snowflake className="w-3.5 h-3.5 mr-1" />
            {willFreeze ? '确认冻结' : '确认解冻'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
