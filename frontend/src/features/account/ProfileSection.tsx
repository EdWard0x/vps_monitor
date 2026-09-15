import React, { useState } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatDate } from '@/lib/format/date';
import { getErrorMessage, isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import * as userApi from '@/api/user';
import { User, Shield, Calendar, AlertCircle } from 'lucide-react';

export const ProfileSection: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setError('昵称不能为空');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      const res = await userApi.updateMe({ nickname: nickname.trim() });
      updateUser(res.data);
      toast({ type: 'success', title: '修改成功', message: '个人昵称已更新' });
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setError('后端资料更新接口尚未实现 (HTTP 501)');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">基本信息</h2>
        <p className="text-sm text-gray-500 mt-0.5">查看并管理您的系统公开资料</p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              用户名
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <Input type="text" className="pl-9 bg-gray-50" value={user.username} disabled readOnly />
            </div>
            <p className="text-xs text-gray-400 mt-1">用户名注册后不可更改</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              系统角色
            </label>
            <div className="relative">
              <Shield className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <Input
                type="text"
                className="pl-9 bg-gray-50"
                value={user.role === 'admin' ? '系统管理员' : '普通用户'}
                disabled
                readOnly
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              用户昵称
            </label>
            <Input
              type="text"
              placeholder="请输入昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              注册时间
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
              <Input
                type="text"
                className="pl-9 bg-gray-50"
                value={formatDate(user.created_at)}
                disabled
                readOnly
              />
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={nickname.trim() === user.nickname}
          >
            保存昵称修改
          </Button>
        </div>
      </form>
    </section>
  );
};
