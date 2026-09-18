import React, { useState, useEffect } from 'react';
import * as settingsApi from '@/api/settings';
import { useSettings } from '@/app/SettingsContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Settings as SettingsIcon, Save } from 'lucide-react';

export const AdminSettingsPage: React.FC = () => {
  const { reloadSettings } = useSettings();
  const { toast } = useToast();

  const [siteName, setSiteName] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [collectorImplemented, setCollectorImplemented] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  const fetchSettings = () => {
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    settingsApi
      .adminGetSettings()
      .then((res) => {
        setSiteName(res.data.settings.site_name);
        setRegistrationEnabled(res.data.settings.registration_enabled);
        setCollectionEnabled(res.data.collection_enabled);
        setCollectorImplemented(res.data.collector_implemented);
      })
      .catch((err) => {
        if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
          setIsNotImplemented(true);
        } else {
          setError(getErrorMessage(err));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim()) {
      toast({ type: 'error', title: '表单错误', message: '站点名称不能为空' });
      return;
    }

    try {
      setSaving(true);
      await settingsApi.adminUpdateSettings({
        site_name: siteName.trim(),
        registration_enabled: registrationEnabled,
        collection_enabled: collectionEnabled,
      });

      toast({ type: 'success', title: '保存成功', message: '系统设置已更新' });
      await reloadSettings();
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端设置更新接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '保存失败', message: getErrorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center">
          <SettingsIcon className="w-6 h-6 text-brand-600 mr-2.5" />
          系统基础设置
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          配置站点前台展示名称以及是否开放普通用户自主注册
        </p>
      </div>

      {isNotImplemented ? (
        <NotImplementedCard
          title="系统设置接口尚未实现 (HTTP 501)"
          description="后端端点 GET/PUT /api/v1/admin/settings/* 正在重构中，待后端接入后即可保存配置。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在读取系统设置..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchSettings} />
      ) : (
        <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              网站名称 (Site Name)
            </label>
            <Input
              type="text"
              placeholder="例如: VPS 库存监控"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              disabled={saving}
              required
            />
            <p className="text-xs text-gray-400 mt-1">展示在前台导航栏与网页标题中</p>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-start space-x-3 cursor-pointer">
              <Checkbox
                checked={registrationEnabled}
                onChange={(e) => setRegistrationEnabled(e.target.checked)}
                disabled={saving}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900 block">开放用户自主注册</span>
                <span className="text-xs text-gray-500">
                  关闭后前台将隐藏注册入口，未注册用户无法自行创建账号
                </span>
              </div>
            </label>
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer">
              <Checkbox
                checked={collectionEnabled}
                onChange={(e) => setCollectionEnabled(e.target.checked)}
                disabled={saving}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-semibold text-gray-900 block">启用全局库存采集</span>
                <span className="text-xs text-gray-500">
                  全局库存采集总开关。开启后允许后台创建采集任务；实际采集还要求对应商家和 VPS 套餐两级开关均已开启。
                </span>
              </div>
            </label>
            {!collectorImplemented && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                后端采集能力不可用：系统暂未具备或部署采集能力，保存配置后暂不会产生采集结果。
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              保存设置
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
