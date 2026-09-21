import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { ProfileSection } from '@/features/account/ProfileSection';
import { MailBindingSection } from '@/features/account/MailBindingSection';
import { PasswordChangeSection } from '@/features/account/PasswordChangeSection';
import { Button } from '@/components/ui/Button';
import { User, LogOut, Star, ArrowRight } from 'lucide-react';

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
        {/* 我的收藏快捷入口 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Star className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">我的收藏</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                查看并管理您收藏的 VPS 套餐，实时跟踪库存状态与价格走势
              </p>
            </div>
          </div>
          <Link to="/account/favorites">
            <Button variant="outline" size="sm" className="w-full sm:w-auto text-amber-700 border-amber-200 hover:bg-amber-50">
              <Star className="w-4 h-4 mr-1.5 fill-current text-amber-500" />
              进入我的收藏
              <ArrowRight className="w-4 h-4 ml-1 text-gray-400" />
            </Button>
          </Link>
        </div>

        <ProfileSection />
        <MailBindingSection />
        <PasswordChangeSection />
      </div>
    </div>
  );
};
