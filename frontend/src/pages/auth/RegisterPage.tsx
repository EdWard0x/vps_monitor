import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { UserPlus, Server } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const { settings } = useSettings();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 注册关闭拦截
  if (settings && !settings.registration_enabled) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
          <Server className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-gray-900">暂未开放注册</h2>
        <p className="text-xs text-gray-500 mt-1 max-w-sm mb-6">
          当前站点由管理员关闭了公众注册通道。已有账号可直接登录。
        </p>
        <Link to="/login">
          <Button variant="primary">前往登录</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = username.toLowerCase().trim();

    if (!/^[a-z0-9_]{4,32}$/.test(cleanUsername)) {
      setErrorMsg('用户名须为 4~32 位小写字母、数字或下划线');
      return;
    }

    const trimmedNickname = nickname.trim();
    const nicknameRuneCount = [...trimmedNickname].length;
    if (nicknameRuneCount < 1 || nicknameRuneCount > 32) {
      setErrorMsg('昵称长度须在 1~32 个字符之间（首尾空格不计入）');
      return;
    }

    const passwordRuneCount = [...password].length;
    const passwordByteLen = new TextEncoder().encode(password).length;
    if (passwordRuneCount < 12 || passwordRuneCount > 128 || passwordByteLen > 512) {
      setErrorMsg('密码长度须在 12~128 个字符之间（UTF-8 编码不超过 512 字节）');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('两次输入的密码不一致');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await register({
        username: cleanUsername,
        nickname: trimmedNickname,
        password,
      });

      toast('success', '注册成功，请使用新账号密码登录');
      navigate('/login');
    } catch (err: unknown) {
      if (isAppError(err)) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('注册失败，请稍后重试');
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
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">注册新账号</h2>
        <p className="mt-1 text-xs sm:text-sm text-gray-500">创建专属账号，加入 VPS 讨论并监控补货动态</p>
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
              placeholder="4~32位小写字母、数字或下划线"
              helperText="4~32位，仅限字母、数字与下划线（自动转换为小写）"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
              autoFocus
            />

            <Input
              label="展示昵称"
              type="text"
              placeholder="1~32个字符"
              helperText="1~32个字符（首尾空格不计入）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={submitting}
            />

            <Input
              label="密码"
              type="password"
              placeholder="12~128位字符"
              helperText="长度须为 12~128 位字符"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
            />

            <Input
              label="确认密码"
              type="password"
              placeholder="请再次输入相同密码"
              helperText="请再次输入相同密码以确认"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={submitting}
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" size="md" className="w-full" loading={submitting}>
                <UserPlus className="w-4 h-4 mr-2" />
                完成注册
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-xs text-gray-500">
            已有账号？{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-500">
              直接登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
