import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dashboard } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  LayoutDashboard,
  Store,
  Server,
  Users,
  MessageSquare,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Activity,
  ArrowRight,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = () => {
    setLoading(true);
    setError(null);
    apiClient
      .get<Dashboard>('/admin/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) return <LoadingSpinner label="正在读取管理员仪表盘指标..." />;
  if (error || !data) return <ErrorState message={error || '加载仪表盘失败'} onRetry={fetchDashboard} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
          <LayoutDashboard className="w-6 h-6 text-brand-600 mr-2.5" />
          系统总览看板
        </h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          实时查看商家、商品、监控队列积压及评论审核核心运行指标
        </p>
      </div>

      {/* 核心统计卡片网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 商家数 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">合作商家总数</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-gray-900">{data.merchant_count}</span>
            <Link to="/admin/merchants" className="text-xs text-brand-600 hover:underline inline-flex items-center">
              管理 <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* VPS 套餐数 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">已登记套餐</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
              <Server className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-gray-900">{data.vps_count}</span>
            <Link to="/admin/vps" className="text-xs text-brand-600 hover:underline inline-flex items-center">
              管理 <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* 用户数 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">注册用户总数</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-extrabold text-gray-900">{data.user_count}</span>
              <span className="text-xs text-gray-400 ml-2">({data.enabled_user_count} 正常)</span>
            </div>
            <Link to="/admin/users" className="text-xs text-brand-600 hover:underline inline-flex items-center">
              管理 <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* 待审核评论 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400">待审核评论</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-extrabold text-amber-600">{data.pending_comment_count}</span>
            <Link to="/admin/comments?visibility=2" className="text-xs text-brand-600 hover:underline inline-flex items-center">
              立即审核 <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* 监控与库存状态分区 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 三态库存健康状况 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
            <Activity className="w-4 h-4 text-brand-600 mr-2" />
            上架商品库存观测分布
          </h2>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
              <div className="text-2xl font-black text-emerald-700">{data.stock_counts.in_stock}</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">有货商品</div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50/60 border border-rose-100">
              <XCircle className="w-6 h-6 text-rose-600 mx-auto mb-1.5" />
              <div className="text-2xl font-black text-rose-700">{data.stock_counts.out_of_stock}</div>
              <div className="text-xs text-rose-600 font-medium mt-1">缺货商品</div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-100">
              <HelpCircle className="w-6 h-6 text-amber-600 mx-auto mb-1.5" />
              <div className="text-2xl font-black text-amber-700">{data.stock_counts.unknown}</div>
              <div className="text-xs text-amber-600 font-medium mt-1">状态无法识别</div>
            </div>
          </div>
        </div>

        {/* 监控积压与时钟 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900 mb-4 flex items-center">
              <Clock className="w-4 h-4 text-brand-600 mr-2" />
              采集监控运行状态
            </h2>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                <span className="text-gray-500">到期积压任务数（Due Tasks）</span>
                <span className="font-bold text-gray-800 text-sm">
                  {data.monitor_due_count} 项
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50">
                <span className="text-gray-500">全库最近完成检查时间</span>
                <span className="font-bold text-gray-800 text-sm">
                  {formatDate(data.last_checked_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-gray-100 text-right">
            <Link to="/admin/monitors" className="text-xs text-brand-600 hover:underline inline-flex items-center font-semibold">
              前往监控任务调度中心 <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
