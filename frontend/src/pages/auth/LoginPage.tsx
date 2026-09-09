import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Server, LogIn } from 'lucide-react';
import { sanitizeReturnTo } from '@/lib/utils';
import { isAppError } from '@/lib/http/errors';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('请输入用户名和密码');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await login(username, password);
      toast('success', '登录成功');

      const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
      navigate(returnTo, { replace: true });
    } catch (err: unknown) {
      if (isAppError(err)) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('登录失败，请检查网络连接后重试');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20 mb-4">
          <Server className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">账号登录</h2>
        <p className="mt-1 text-xs sm:text-sm text-gray-500">
          登录后可发表评论、使用匿名展示功能或进入管理员控制台
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-gray-200 rounded-3xl sm:px-10">
          {errorMsg && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="用户名"
              type="text"
              autoComplete="username"
              placeholder="请输入用户名（4~32位小写字母/数字/下划线）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              autoFocus
            />

            <Input
              label="密码"
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码（12~128位字符）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" size="md" className="w-full" loading={submitting}>
                <LogIn className="w-4 h-4 mr-2" />
                立即登录
              </Button>
            </div>
          </form>

          {settings?.registration_enabled ? (
            <div className="mt-6 text-center text-xs text-gray-500">
              还没有账号？{' '}
              <Link to="/register" className="font-semibold text-brand-600 hover:text-brand-500">
                立即免费注册
              </Link>
            </div>
          ) : (
            <div className="mt-6 text-center text-xs text-gray-400">本站当前暂未开放公众注册</div>
          )}
        </div>
      </div>
    </div>
  );
};
