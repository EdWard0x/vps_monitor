import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Mail, AlertCircle } from 'lucide-react';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingSpinner label="验证身份中..." />;
  }

  if (status === 'unavailable') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-900">认证服务暂不可用</h2>
          <p className="text-sm text-gray-500">
            后端服务或鉴权功能尚未就绪（HTTP 501/503），目前无法验证您的登录身份。
          </p>
          <Link to="/" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              返回前台首页
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
};

export const AdminGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status, isAdmin } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingSpinner label="验证管理权限中..." />;
  }

  if (status === 'unavailable') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h2 className="text-lg font-bold text-gray-900">管理服务暂不可用</h2>
          <p className="text-sm text-gray-500">
            后端服务或管理接口尚未就绪（HTTP 501/503），目前无法确认管理权限。
          </p>
          <Link to="/" className="inline-block mt-2">
            <Button variant="outline" size="sm">
              返回前台首页
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (status !== 'authenticated' || !user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/403" replace />;
  }

  // 管理员必须完成邮箱验证方可进入后台
  if (user.mail_required || !user.mail_verified) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl border border-amber-200 bg-white p-6 sm:p-8 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">需要验证管理员邮箱</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            系统管理员账号必须先完成安全邮箱绑定与验证，方可访问管理后台。
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link to="/account">
              <Button variant="primary" size="md" className="w-full">
                前往个人中心绑定邮箱
              </Button>
            </Link>
            <Link to="/">
              <Button variant="ghost" size="sm" className="w-full text-gray-500">
                返回前台首页
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const GuestGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, status } = useAuth();

  if (status === 'loading') {
    return <LoadingSpinner label="加载中..." />;
  }

  if (status === 'authenticated' && user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
