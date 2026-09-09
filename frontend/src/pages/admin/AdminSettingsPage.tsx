import React, { useState, useEffect } from 'react';
import { SettingsAdmin, Settings } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
import { useSettings } from '@/app/SettingsContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { Settings as SettingsIcon, Save, RefreshCw } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const AdminSettingsPage: React.FC = () => {
  const { reloadSettings: reloadGlobalSettings } = useSettings();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<SettingsAdmin>('/admin/settings');
      setSettings(res.data.settings);
      setUpdatedAt(res.data.updated_at);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取站点设置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    if (!settings.site_name.trim() || settings.site_name.length > 64) {
      toast('error', '站点名称须在 1~64 个字符之间');
      return;
    }

    if (settings.comment_max_depth < 0 || settings.comment_max_depth > 4) {
      toast('error', '评论最大深度须在 0~4 之间');
      return;
    }

    try {
      setSaving(true);
      const res = await apiClient.patch<SettingsAdmin>('/admin/settings', settings);
      setSettings(res.data.settings);
      setUpdatedAt(res.data.updated_at);
      await reloadGlobalSettings();
      toast('success', '站点全局设置已保存并即时生效');
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '保存设置失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="正在拉取站点设置..." />;
  if (error || !settings) return <ErrorState message={error || '加载设置失败'} onRetry={fetchSettings} />;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <SettingsIcon className="w-6 h-6 text-brand-600 mr-2.5" />
            站点开关与系统设置
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            配置系统标题、用户注册开放状态及匿名评论审核策略
          </p>
        </div>

        {updatedAt && (
          <div className="text-xs text-gray-400">
            最近更新时间：{formatDate(updatedAt)}
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* 站点基本信息 */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            基本品牌信息
          </h2>

          <div className="max-w-md">
            <Input
              label="站点名称"
              value={settings.site_name}
              onChange={(e) => setSettings({ ...settings, site_name: e.target.value })}
              disabled={saving}
              helperText="展示于网站顶部导航、浏览器标题及系统提示中"
            />
          </div>
        </div>

        {/* 注册与认证开关 */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            注册与登录策略
          </h2>

          <div className="space-y-3">
            <Checkbox
              label="开放用户注册 (registration_enabled)"
              description="关闭后将隐藏注册入口并拒绝新的注册请求；已有用户仍可正常登录与访问"
              checked={settings.registration_enabled}
              onChange={(e) => setSettings({ ...settings, registration_enabled: e.target.checked })}
              disabled={saving}
            />
          </div>
        </div>

        {/* 评论与审核策略 */}
        <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm space-y-5">
          <h2 className="text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            讨论、匿名与审核规则
          </h2>

          <div className="space-y-4">
            <Checkbox
              label="开放新增评论 (comments_enabled)"
              description="关闭后前台将禁用所有新增评论与回复功能；已有的历史讨论仍可正常浏览"
              checked={settings.comments_enabled}
              onChange={(e) => setSettings({ ...settings, comments_enabled: e.target.checked })}
              disabled={saving}
            />

            <Checkbox
              label="允许匿名发表评论 (anonymous_comments_enabled)"
              description="关闭后用户发表新回复时不可勾选匿名；历史已发布的匿名内容依然严格保持匿名"
              checked={settings.anonymous_comments_enabled}
              onChange={(e) => setSettings({ ...settings, anonymous_comments_enabled: e.target.checked })}
              disabled={saving}
            />

            <Checkbox
              label="开启评论先审后发 (comment_review_required)"
              description="开启后新提交的评论将首先进入待审核状态 (visibility=2)，需管理员审核通过后方可在前台公开"
              checked={settings.comment_review_required}
              onChange={(e) => setSettings({ ...settings, comment_review_required: e.target.checked })}
              disabled={saving}
            />

            <div className="max-w-xs pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                评论最大嵌套深度 (comment_max_depth)
              </label>
              <input
                type="number"
                min={0}
                max={4}
                value={settings.comment_max_depth}
                onChange={(e) =>
                  setSettings({ ...settings, comment_max_depth: Number(e.target.value) })
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500"
                disabled={saving}
              />
              <p className="mt-1 text-xs text-gray-400">
                取值 0~4（0 表示仅允许根评论，4 表示允许最多五层树结构）。修改仅限制新回复层级。
              </p>
            </div>
          </div>
        </div>

        {/* 底部保存条 */}
        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" size="sm" onClick={fetchSettings} disabled={saving}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            重置尚未保存的修改
          </Button>

          <Button type="submit" variant="primary" size="md" loading={saving}>
            <Save className="w-4 h-4 mr-1.5" />
            保存设置
          </Button>
        </div>
      </form>
    </div>
  );
};
