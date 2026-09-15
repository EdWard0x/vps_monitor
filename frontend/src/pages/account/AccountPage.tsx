import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { ProfileSection } from '@/features/account/ProfileSection';
import { MailBindingSection } from '@/features/account/MailBindingSection';
import { PasswordChangeSection } from '@/features/account/PasswordChangeSection';
import { Button } from '@/components/ui/Button';
import { User, LogOut } from 'lucide-react';

export const AccountPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center">
            <User className="w-7 h-7 text-brand-600 mr-3" />
            个人中心
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            管理您的个人资料、登录凭证与安全邮箱设置
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          className="text-gray-600 hover:text-red-600 self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4 mr-1.5" />
          退出当前登录
        </Button>
      </div>

      {/* 资料与账号设置板块 */}
      <div className="space-y-6">
        <ProfileSection />
        <MailBindingSection />
        <PasswordChangeSection />
      </div>
    </div>
  );
};
