import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { sanitizeReturnTo } from '@/lib/utils';
import { getErrorMessage, isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Lock, User, AlertCircle, Hammer } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      await login({ username, password });

      const returnTo = sanitizeReturnTo(searchParams.get('returnTo'));
      navigate(returnTo);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
        setError('后端登录接口尚未实现 (HTTP 501 / NOT_IMPLEMENTED)');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">登录账号</h1>
        <p className="text-sm text-gray-500">输入您的用户名与密码访问个人中心或管理后台</p>
      </div>

      {isNotImplemented && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm flex items-start space-x-3">
          <Hammer className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">功能尚未实现 (HTTP 501)</p>
            <p className="mt-1 text-xs text-amber-700">
              后端登录端点返回 501，骨架阶段不提供假登录成功。
            </p>
          </div>
        </div>
      )}

      {error && !isNotImplemented && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-red-700 text-sm flex items-center space-x-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">用户名</label>
          <div className="relative">
            <User className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="text"
              className="pl-9"
              placeholder="请输入用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-gray-700">密码</label>
            <Link
              to="/reset-password"
              className="text-xs text-brand-600 hover:text-brand-700 hover:underline"
            >
              忘记密码？
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" className="w-full mt-2" loading={loading}>
          立即登录
        </Button>

        {settings?.registration_enabled && (
          <div className="text-center pt-2">
            <span className="text-sm text-gray-500">还没有账号？ </span>
            <Link to="/register" className="text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline">
              立即注册
            </Link>
          </div>
        )}
      </form>
    </div>
  );
};
