import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getErrorMessage, isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Lock, User, Smile, AlertCircle, CheckCircle2, Hammer, ShieldOff } from 'lucide-react';

export const RegisterForm: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsNotImplemented(false);

    if (!username.trim() || !nickname.trim() || !password) {
      setError('请完整填写所有注册信息');
      return;
    }

    const trimmedNickname = nickname.trim();
    if (trimmedNickname.length < 1 || trimmedNickname.length > 64) {
      setError('用户昵称长度须在 1 到 64 个字符之间');
      return;
    }

    // 后端规则：3–64 位 ASCII 字母/数字/下划线，首位字母或数字，保存为小写
    const lowerUsername = username.toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9_]{2,63}$/.test(lowerUsername)) {
      setError('用户名须为 3~64 位，首位须为字母或数字，仅包含字母、数字或下划线');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    const passwordBytes = new TextEncoder().encode(password).length;
    if (passwordBytes < 8) {
      setError('密码的 UTF-8 长度至少需要 8 字节');
      return;
    }

    if (passwordBytes > 72) {
      setError('密码的 UTF-8 长度不能超过 72 字节');
      return;
    }

    try {
      setLoading(true);
      await register({
        username: lowerUsername,
        nickname: trimmedNickname,
        password,
      });

      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 1500);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
        setError('后端注册接口尚未实现 (HTTP 501 / NOT_IMPLEMENTED)');
      } else if (isAppError(err) && err.code === BusinessCode.REGISTRATION_DISABLED) {
        setError('系统当前未开放注册，请联系管理员获取账号');
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  if (settings && !settings.registration_enabled) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-white rounded-2xl border border-gray-200 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <ShieldOff className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">自主注册已关闭</h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          根据系统安全设置，当前暂未开放普通用户自主注册。如需使用系统，请联系管理员分配账号。
        </p>
        <div className="pt-2">
          <Link to="/login">
            <Button variant="outline" size="md" className="w-full">
              返回登录页面
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-white rounded-2xl border border-gray-200 shadow-sm text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">注册成功</h2>
        <p className="text-sm text-gray-500">正在为您跳转到登录页面...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">创建新账号</h1>
        <p className="text-sm text-gray-500">填写您的账号信息以注册成为系统用户</p>
      </div>

      {isNotImplemented && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-sm flex items-start space-x-3">
          <Hammer className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">功能尚未实现 (HTTP 501)</p>
            <p className="mt-1 text-xs text-amber-700">
              服务以 skeleton 模式运行时不会返回假注册成功。
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
              placeholder="3-64 位小写字母、数字或下划线"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">用户昵称</label>
          <div className="relative">
            <Smile className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="text"
              className="pl-9"
              placeholder="展示名称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="至少 8 位密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">确认密码</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <Input
              type="password"
              className="pl-9"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              autoComplete="new-password"
              required
            />
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" className="w-full mt-2" loading={loading}>
          注册账号
        </Button>

        <div className="text-center pt-2">
          <span className="text-sm text-gray-500">已有账号？ </span>
          <Link to="/login" className="text-sm font-semibold text-brand-600 hover:text-brand-700 hover:underline">
            立即登录
          </Link>
        </div>
      </form>
    </div>
  );
};
