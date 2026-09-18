import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DashboardSummary } from '@/types/dashboard';
import * as dashboardApi from '@/api/dashboard';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Button } from '@/components/ui/Button';
import {
  LayoutDashboard,
  Store,
  Server,
  Users,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  Snowflake,
  Plus,
  Settings as SettingsIcon,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const fetchDashboard = () => {
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    dashboardApi
      .adminGetDashboard()
      .then((res) => setData(res.data))
      .catch((err) => {
        if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
          setIsNotImplemented(true);
        } else {
          setError(err instanceof Error ? err.message : '加载看板统计失败');
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl flex items-center">
            <LayoutDashboard className="w-7 h-7 text-brand-600 mr-3" />
            系统总览看板
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            实时查看合作商家、VPS 套餐、注册用户及库存核心指标
          </p>
        </div>

        {/* 快捷录入入口：方便从空数据库开始操作 */}
        <div className="flex items-center flex-wrap gap-2">
          <Link to="/admin/merchants?action=create">
            <Button variant="primary" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              添加商家
            </Button>
          </Link>
          <Link to="/admin/vps?action=create">
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-1.5" />
              添加 VPS
            </Button>
          </Link>
          <Link to="/admin/settings">
            <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900">
              <SettingsIcon className="w-4 h-4 mr-1.5" />
              站点设置
            </Button>
          </Link>
        </div>
      </div>

      {isNotImplemented ? (
        <NotImplementedCard
          title="看板统计接口尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/admin/dashboard/info 正在重构中，待后端接入后即可实时汇总系统指标。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在读取管理员看板指标..." />
      ) : error || !data ? (
        <ErrorState title="加载失败" description={error || '加载看板失败'} onRetry={fetchDashboard} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 合作商家数 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                合作商家总数
              </span>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
                <Store className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-gray-900">{data.merchant_count}</span>
              <Link
                to="/admin/merchants"
                className="text-xs text-brand-600 hover:underline inline-flex items-center font-medium"
              >
                商家管理 <ArrowRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>
          </div>

          {/* VPS 套餐数 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                VPS 套餐总数
              </span>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-gray-900">{data.vps_count}</span>
              <Link
                to="/admin/vps"
                className="text-xs text-brand-600 hover:underline inline-flex items-center font-medium"
              >
                套餐管理 <ArrowRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>
          </div>

          {/* 用户总数 & 冻结数 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                注册用户总数
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-3xl font-extrabold text-gray-900">{data.user_count}</span>
                {data.frozen_user_count > 0 && (
                  <span className="ml-2 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full inline-flex items-center font-medium">
                    <Snowflake className="w-3 h-3 mr-0.5" />
                    {data.frozen_user_count} 冻结
                  </span>
                )}
              </div>
              <Link
                to="/admin/users"
                className="text-xs text-brand-600 hover:underline inline-flex items-center font-medium"
              >
                用户管理 <ArrowRight className="w-3 h-3 ml-0.5" />
              </Link>
            </div>
          </div>

          {/* 有货套餐 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                当前有货套餐
              </span>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-600">{data.in_stock_count}</span>
              <span className="text-xs text-gray-400">实时库存</span>
            </div>
          </div>

          {/* 未知状态套餐 */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                库存状态未知
              </span>
              <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-amber-600">
                {data.unknown_stock_count}
              </span>
              <span className="text-xs text-gray-400">待后台采集</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
