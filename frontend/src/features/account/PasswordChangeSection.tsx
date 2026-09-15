import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getErrorMessage, isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import * as userApi from '@/api/user';
import { Lock, AlertCircle } from 'lucide-react';

export const PasswordChangeSection: React.FC = () => {
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword) {
      setError('请输入当前密码和新密码');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    const newPasswordBytes = new TextEncoder().encode(newPassword).length;
    if (newPasswordBytes < 8) {
      setError('新密码的 UTF-8 长度不能少于 8 字节');
      return;
    }

    if (newPasswordBytes > 72) {
      setError('新密码的 UTF-8 长度不能超过 72 字节');
      return;
    }

    try {
      setSubmitting(true);
      await userApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      toast({
        type: 'success',
        title: '密码修改成功',
        message: '您的密码已更新，所有现有会话已失效，请重新登录。',
      });

      await logout();
      navigate('/login');
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setError('后端密码修改接口尚未实现 (HTTP 501)');
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
        <h2 className="text-lg font-bold text-gray-900">修改登录密码</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          修改密码后将导致所有设备上的当前登录凭证失效，您需要使用新密码重新登录
        </p>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            当前密码
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="请输入当前密码"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={submitting}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            新密码
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="至少 8 位新密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            确认新密码
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="再次输入新密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="primary" size="sm" loading={submitting}>
            确认修改密码
          </Button>
        </div>
      </form>
    </section>
  );
};
