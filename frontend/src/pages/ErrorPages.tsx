import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Compass, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-3xl bg-gray-100 flex items-center justify-center text-gray-400 mb-6">
        <Compass className="w-8 h-8" />
      </div>
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">404</h1>
      <p className="mt-2 text-lg font-medium text-gray-700">页面未找到</p>
      <p className="mt-1 text-sm text-gray-500 max-w-sm">
        抱歉，您访问的页面不存在或已被移除。
      </p>
      <div className="mt-6">
        <Link to="/">
          <Button variant="primary">
            <Home className="w-4 h-4 mr-2" />
            返回首页
          </Button>
        </Link>
      </div>
    </div>
  );
};

export const ForbiddenPage: React.FC = () => {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-3xl bg-rose-50 flex items-center justify-center text-rose-500 mb-6 border border-rose-100">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">403</h1>
      <p className="mt-2 text-lg font-medium text-gray-700">无访问权限</p>
      <p className="mt-1 text-sm text-gray-500 max-w-sm">
        抱歉，您的账号角色暂无权限访问管理员后台或执行该受限操作。
      </p>
      <div className="mt-6 flex space-x-3">
        <Link to="/">
          <Button variant="outline">
            <Home className="w-4 h-4 mr-2" />
            返回首页
          </Button>
        </Link>
        <Link to="/login">
          <Button variant="primary">切换账号登录</Button>
        </Link>
      </div>
    </div>
  );
};
