import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/AuthContext';
import { useSettings } from '@/app/SettingsContext';
import { Button } from '@/components/ui/Button';
import { Server, Menu, X, Shield, User, MessageSquare, LogOut } from 'lucide-react';

export const Header: React.FC = () => {
  const { user, isAdmin, logout } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* 左侧 Logo */}
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2.5 font-bold text-gray-900 text-lg hover:opacity-90">
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shadow-brand-500/30">
              <Server className="w-5 h-5" />
            </div>
            <span>{settings?.site_name || 'VPS 库存监控'}</span>
          </Link>
          <nav className="hidden md:flex items-center space-x-1 text-sm font-medium">
            <Link
              to="/"
              className="px-3 py-2 rounded-lg text-gray-700 hover:text-brand-600 hover:bg-gray-100 transition-colors"
            >
              库存监控
            </Link>
            <Link
              to="/merchants"
              className="px-3 py-2 rounded-lg text-gray-700 hover:text-brand-600 hover:bg-gray-100 transition-colors"
            >
              商家列表
            </Link>
          </nav>
        </div>

        {/* 右侧用户状态（桌面） */}
        <div className="hidden md:flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              {isAdmin && (
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="text-brand-600 border-brand-200 hover:bg-brand-50">
                    <Shield className="w-3.5 h-3.5 mr-1.5" />
                    管理后台
                  </Button>
                </Link>
              )}
              <Link to="/account/comments">
                <Button variant="ghost" size="sm" title="我的评论">
                  <MessageSquare className="w-4 h-4 mr-1 text-gray-500" />
                  我的评论
                </Button>
              </Link>
              <Link to="/account">
                <Button variant="ghost" size="sm">
                  <User className="w-4 h-4 mr-1.5 text-gray-500" />
                  <span className="font-semibold text-gray-800 max-w-[120px] truncate">
                    {user.nickname}
                  </span>
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-gray-500 hover:text-red-600">
                <LogOut className="w-4 h-4 mr-1" />
                退出
              </Button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  登录
                </Button>
              </Link>
              {settings?.registration_enabled && (
                <Link to="/register">
                  <Button variant="primary" size="sm">
                    注册
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* 移动端汉堡菜单按钮 */}
        <div className="flex md:hidden items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="打开菜单"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* 移动端展开导航 */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 pt-3 pb-5 space-y-2 animate-fade-in shadow-lg">
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-medium text-gray-800 hover:bg-gray-100"
          >
            库存监控
          </Link>
          <Link
            to="/merchants"
            onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-base font-medium text-gray-800 hover:bg-gray-100"
          >
            商家列表
          </Link>

          <div className="pt-3 border-t border-gray-100">
            {user ? (
              <div className="space-y-1.5">
                <div className="px-3 py-1 text-xs text-gray-400 font-medium">
                  当前用户：<span className="text-gray-800 font-bold">{user.nickname}</span>
                </div>
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-brand-600 bg-brand-50"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    管理后台
                  </Link>
                )}
                <Link
                  to="/account"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <User className="w-4 h-4 mr-2 text-gray-400" />
                  个人中心与会话
                </Link>
                <Link
                  to="/account/comments"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  <MessageSquare className="w-4 h-4 mr-2 text-gray-400" />
                  我的评论
                </Link>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center w-full px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  退出登录
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">
                    登录
                  </Button>
                </Link>
                {settings?.registration_enabled && (
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="primary" size="sm" className="w-full">
                      注册
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
