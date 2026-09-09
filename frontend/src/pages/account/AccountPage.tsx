import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { apiClient } from '@/lib/http/client';
import { User, Session } from '@/types/api';
import { formatDate } from '@/lib/format/date';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Dialog } from '@/components/ui/Dialog';
import { isAppError } from '@/lib/http/errors';
import {
  User as UserIcon,
  Shield,
  KeyRound,
  Smartphone,
  Trash2,
  LogOut,
  Check,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AccountPage: React.FC = () => {
  const { user, updateUser, logoutAll } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // 1. 修改昵称
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [updatingNickname, setUpdatingNickname] = useState(false);

  // 2. 修改密码
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 3. 多端会话管理
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoadingSessions(true);
      const res = await apiClient.get<{ items: Session[] }>('/me/sessions?page=1&page_size=50');
      setSessions(res.data.items);
    } catch {
      // 忽略
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleUpdateNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNickname = nickname.trim();
    const count = [...cleanNickname].length;
    if (count < 1 || count > 32) {
      toast('error', '昵称长度须在 1~32 个字符之间（首尾空格不计入）');
      return;
    }

    try {
      setUpdatingNickname(true);
      const res = await apiClient.patch<User>('/me', { nickname: cleanNickname });
      updateUser(res.data);
      toast('success', '昵称修改成功');
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '修改昵称失败');
    } finally {
      setUpdatingNickname(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordError('请输入当前密码');
      return;
    }
    const newPasswordRuneCount = [...newPassword].length;
    const newPasswordByteLen = new TextEncoder().encode(newPassword).length;
    if (newPasswordRuneCount < 12 || newPasswordRuneCount > 128 || newPasswordByteLen > 512) {
      setPasswordError('新密码长度须在 12~128 个字符之间（UTF-8 编码不超过 512 字节）');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('两次输入的新密码不一致');
      return;
    }

    try {
      setChangingPassword(true);
      setPasswordError(null);
      await apiClient.patch('/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      toast('success', '密码已修改，所有登录会话已撤销，请重新登录');
      setPasswordDialogOpen(false);
      navigate('/login');
    } catch (err: unknown) {
      setPasswordError(isAppError(err) ? err.message : '修改密码失败');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/me/sessions/${sessionId}`);
      toast('success', '指定设备会话已撤销');
      fetchSessions();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '撤销会话失败');
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('确定要从所有登录设备注销并退出当前账号吗？')) return;
    try {
      await logoutAll();
      toast('success', '已从所有设备退出登录');
      navigate('/login');
    } catch {
      toast('error', '操作失败，请重试');
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
          <UserIcon className="w-6 h-6 text-brand-600 mr-2.5" />
          个人中心
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          管理您的个人基本资料、密码安全及多端活动会话
        </p>
      </div>

      {/* 基本资料与修改昵称 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center justify-between">
          <span>基础账户信息</span>
          <Badge variant={user.role === 'admin' ? 'purple' : 'blue'}>
            {user.role === 'admin' ? '系统管理员' : '普通用户'}
          </Badge>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs mb-6">
          <div className="p-3 bg-gray-50 rounded-xl">
            <span className="text-gray-400 block mb-0.5">用户名 (登录凭据)</span>
            <span className="font-mono text-gray-800 font-semibold text-sm">{user.username}</span>
          </div>
          <div className="p-3 bg-gray-50 rounded-xl">
            <span className="text-gray-400 block mb-0.5">注册时间</span>
            <span className="text-gray-800 font-semibold text-sm">{formatDate(user.created_at)}</span>
          </div>
        </div>

        <form onSubmit={handleUpdateNickname} className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 max-w-md">
            <Input
              label="修改展示昵称"
              placeholder="1~32个字符"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={updatingNickname}
              helperText="1~32个字符（首尾空格不计入），发帖与回复时向公众展示"
            />
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={updatingNickname}
              disabled={nickname.trim() === user.nickname || !nickname.trim()}
              className="shrink-0"
            >
              <Check className="w-4 h-4 mr-1.5" />
              保存昵称
            </Button>
          </div>
        </form>
      </div>

      {/* 安全设置 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center">
          <Shield className="w-5 h-5 text-emerald-600 mr-2" />
          账号安全
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          定期更新高强度密码有助于保障账号资产安全。修改密码后将强制撤销所有已有设备登录状态。
        </p>

        <Button variant="outline" size="sm" onClick={() => setPasswordDialogOpen(true)}>
          <KeyRound className="w-4 h-4 mr-2 text-gray-500" />
          修改登录密码
        </Button>
      </div>

      {/* 多端登录会话 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <Smartphone className="w-5 h-5 text-brand-600 mr-2" />
              活跃设备与会话 ({sessions.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              列出当前已授权并有效维持登录态的客户端会话
            </p>
          </div>
          {sessions.length > 1 && (
            <Button variant="ghost" size="sm" onClick={handleLogoutAll} className="text-red-600 hover:bg-red-50 text-xs">
              <LogOut className="w-3.5 h-3.5 mr-1" />
              下线所有设备
            </Button>
          )}
        </div>

        {loadingSessions ? (
          <LoadingSpinner label="正在读取会话..." />
        ) : (
          <div className="space-y-2.5">
            {sessions.map((sess) => (
              <div
                key={sess.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-gray-100 bg-gray-50/70 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-gray-700 font-semibold">{sess.id.slice(0, 8)}...</span>
                    {sess.is_current && <Badge variant="green">当前设备</Badge>}
                  </div>
                  <div className="text-gray-400">
                    登录时间：{formatDate(sess.created_at)} · 绝对有效期至：{formatDate(sess.refresh_expires_at)}
                  </div>
                </div>

                {!sess.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeSession(sess.id)}
                    className="text-red-600 hover:bg-red-50 text-xs p-2 h-auto"
                    title="下线此设备"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 修改密码弹窗 */}
      <Dialog
        isOpen={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
        title="修改密码"
        description="修改密码将使所有设备上的登录状态立即失效。"
      >
        {passwordError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
            {passwordError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-3 pt-2">
          <Input
            label="当前密码"
            type="password"
            placeholder="请输入当前登录密码"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={changingPassword}
            autoFocus
          />

          <Input
            label="新密码"
            type="password"
            placeholder="12~128位字符"
            helperText="长度须为 12~128 位字符"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={changingPassword}
          />

          <Input
            label="确认新密码"
            type="password"
            placeholder="请再次输入新密码"
            helperText="请再次输入新密码以确认"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={changingPassword}
          />

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPasswordDialogOpen(false)}
              disabled={changingPassword}
            >
              取消
            </Button>
            <Button type="submit" variant="danger" size="sm" loading={changingPassword}>
              确认修改并重新登录
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
