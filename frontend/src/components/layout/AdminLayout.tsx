import React, { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import {
  LayoutDashboard,
  Store,
  Server,
  Activity,
  Users,
  MessageSquare,
  Settings as SettingsIcon,
  ArrowLeft,
  Menu,
  X,
  LogOut,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DemoModeBanner } from '../demo/DemoModeBanner';

const navItems = [
  { path: '/admin', label: '总览看板', icon: LayoutDashboard, end: true },
  { path: '/admin/merchants', label: '商家管理', icon: Store },
  { path: '/admin/vps', label: 'VPS 套餐', icon: Server },
  { path: '/admin/monitors', label: '监控调度', icon: Activity },
  { path: '/admin/users', label: '用户管理', icon: Users },
  { path: '/admin/comments', label: '评论审核', icon: MessageSquare },
  { path: '/admin/settings', label: '站点设置', icon: SettingsIcon },
];

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const NavList = () => (
    <nav className="space-y-1 px-3 py-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={() => setMobileDrawerOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
          >
            <Icon className="w-4 h-4 mr-3 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-100/60">
      <DemoModeBanner />

      {/* 管理端顶部栏 */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 sm:px-6 shadow-sm">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileDrawerOpen(true)}
            className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="展开管理导航"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center space-x-2 text-brand-700 font-bold text-base sm:text-lg">
            <Shield className="w-5 h-5" />
            <span>管理后台</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 text-sm">
          <Link
            to="/"
            className="inline-flex items-center text-gray-500 hover:text-gray-800 transition-colors text-xs sm:text-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回前台
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <span className="text-gray-700 font-medium hidden sm:inline">{user?.nickname}</span>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="退出登录"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* 桌面端侧边栏 */}
        <aside className="hidden md:flex w-64 flex-col border-r border-gray-200 bg-white">
          <div className="flex-1 overflow-y-auto">
            <NavList />
          </div>
          <div className="p-4 border-t border-gray-100 text-xs text-gray-400 text-center">
            管理员专区 · 严格权限审计
          </div>
        </aside>

        {/* 移动端侧边抽屉 */}
        {mobileDrawerOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div className="flex items-center space-x-2 font-bold text-gray-800">
                  <Shield className="w-5 h-5 text-brand-600" />
                  <span>管理导航</span>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavList />
              </div>
            </div>
          </div>
        )}

        {/* 主体管理内容 */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
