import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { VpsAdmin, Collector } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { StockBadge } from '@/components/common/StockBadge';
import { formatDate } from '@/lib/format/date';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { ArrowLeft, Save, RefreshCw, Activity, AlertCircle } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';

export const AdminVpsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const [vps, setVps] = useState<VpsAdmin | null>(null);
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 基础规格表单
  const [detailsForm, setDetailsForm] = useState<any>({});
  const [savingDetails, setSavingDetails] = useState(false);

  // 监控配置表单
  const [monitorForm, setMonitorForm] = useState<any>({});
  const [savingMonitor, setSavingMonitor] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);

  // 人工检查触发状态
  const [queueingCheck, setQueueingCheck] = useState(false);
  const [checkingQueued, setCheckingQueued] = useState(false);

  const fetchVpsAndCollectors = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [vpsRes, colRes] = await Promise.all([
        apiClient.get<VpsAdmin>(`/admin/vps/${id}`),
        apiClient.get<Collector[]>('/admin/collectors'),
      ]);

      const data = vpsRes.data;
      setVps(data);
      setCollectors(colRes.data);

      setDetailsForm({
        name: data.name,
        description: data.description,
        cpu_cores: data.cpu_cores,
        memory_mb: data.memory_mb,
        disk_gb: data.disk_gb,
        disk_type: data.disk_type,
        transfer_gb: data.transfer_gb,
        port_mbps: data.port_mbps,
        price_amount: data.price_amount,
        currency: data.currency,
        billing_period: data.billing_period,
        enabled: data.enabled,
      });

      setMonitorForm({
        source_url: data.monitor_config.source_url,
        collector_code: data.monitor_config.collector_code,
        poll_interval_seconds: data.monitor_config.poll_interval_seconds,
        timeout_seconds: data.monitor_config.timeout_seconds,
        enabled: data.monitor_config.enabled,
      });

      setVersionConflict(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取 VPS 详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVpsAndCollectors();
  }, [fetchVpsAndCollectors]);

  // 保存商品基础详情
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      setSavingDetails(true);
      const res = await apiClient.patch<VpsAdmin>(`/admin/vps/${id}`, {
        name: detailsForm.name,
        description: detailsForm.description,
        cpu_cores: Number(detailsForm.cpu_cores),
        memory_mb: Number(detailsForm.memory_mb),
        disk_gb: Number(detailsForm.disk_gb),
        disk_type: detailsForm.disk_type,
        transfer_gb: detailsForm.transfer_gb !== null ? Number(detailsForm.transfer_gb) : null,
        port_mbps: detailsForm.port_mbps !== null ? Number(detailsForm.port_mbps) : null,
        price_amount: detailsForm.price_amount,
        currency: detailsForm.currency,
        billing_period: detailsForm.billing_period,
        enabled: detailsForm.enabled,
      });
      setVps((prev) => (prev ? { ...prev, ...res.data } : null));
      toast('success', '基础商品指标保存成功');
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '保存失败');
    } finally {
      setSavingDetails(false);
    }
  };

  // 保存监控配置（带 expected_version 乐观锁控制）
  const handleSaveMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !vps) return;

    try {
      setSavingMonitor(true);
      setVersionConflict(false);
      const res = await apiClient.put(`/admin/vps/${id}/monitor-config`, {
        source_url: monitorForm.source_url,
        collector_code: monitorForm.collector_code,
        poll_interval_seconds: Number(monitorForm.poll_interval_seconds),
        timeout_seconds: Number(monitorForm.timeout_seconds),
        enabled: monitorForm.enabled,
        expected_version: vps.monitor_config.config_version,
      });

      toast('success', '监控配置已更新并递增版本号');
      setVps((prev) => (prev ? { ...prev, monitor_config: res.data as any } : null));
    } catch (err: unknown) {
      if (isAppError(err) && err.code === BusinessCode.CONFIG_VERSION_CONFLICT) {
        setVersionConflict(true);
        toast('error', '监控配置已被其他会话更新，请先重新载入最新版本');
      } else {
        toast('error', isAppError(err) ? err.message : '保存监控配置失败');
      }
    } finally {
      setSavingMonitor(false);
    }
  };

  // 触发人工检查 (POST /admin/vps/:id/check -> 202)
  const handleTriggerCheck = async () => {
    if (!id || !vps) return;
    try {
      setQueueingCheck(true);
      await apiClient.post(`/admin/vps/${id}/check`, {});
      toast('info', '人工检查任务已排程 (202 Accepted)，正在等待 Worker 领取...');
      setCheckingQueued(true);

      // 轮询检查完成时间
      const initialCheckedAt = vps.stock.last_checked_at;
      const interval = setInterval(async () => {
        try {
          const res = await apiClient.get<VpsAdmin>(`/admin/vps/${id}`);
          if (res.data.stock.last_checked_at !== initialCheckedAt) {
            setVps(res.data);
            setCheckingQueued(false);
            clearInterval(interval);
            toast('success', '监控检查完成，最新库存观测已回写！');
          }
        } catch {
          // 忽略轮询过程异常
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(interval);
        setCheckingQueued(false);
      }, 20000);
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '排程检查失败');
    } finally {
      setQueueingCheck(false);
    }
  };

  if (loading) return <LoadingSpinner label="正在读取套餐与监控配置..." />;
  if (error || !vps) return <ErrorState message={error || '套餐不存在'} onRetry={fetchVpsAndCollectors} />;

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <Link
          to="/admin/vps"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回套餐管理
        </Link>
        <div className="flex items-center space-x-2">
          <StockBadge stock={vps.stock} />
        </div>
      </div>

      {/* 头部摘要 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-brand-600 mb-1">
              <span>{vps.merchant.name}</span>
              <span>·</span>
              <span className="font-mono text-gray-400">Code: {vps.code}</span>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900">{vps.name}</h1>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              loading={queueingCheck || checkingQueued}
              onClick={handleTriggerCheck}
              disabled={!vps.enabled || !vps.monitor_config.enabled}
            >
              <Activity className="w-4 h-4 mr-1.5 text-brand-600" />
              {checkingQueued ? '检查执行中...' : '立即排程检查'}
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-400">
          <span>创建时间：{formatDate(vps.created_at)}</span>
          <span>最近检查：{formatDate(vps.stock.last_checked_at)}</span>
          <span>最后有货：{formatDate(vps.stock.last_in_stock_at)}</span>
          {vps.stock.last_error_code && (
            <span className="text-amber-600 font-mono">错误码: {vps.stock.last_error_code}</span>
          )}
        </div>
      </div>

      {/* 分区 1：商品基础规格表单 */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <h2 className="text-base font-bold text-gray-900 mb-1">商品基础参数</h2>
        <p className="text-xs text-gray-500 mb-6">修改套餐公开展示的名称、说明、硬件指标及价格（不影响监控抓取规则）</p>

        <form onSubmit={handleSaveDetails} className="space-y-4">
          <Input
            label="套餐名称"
            value={detailsForm.name || ''}
            onChange={(e) => setDetailsForm({ ...detailsForm, name: e.target.value })}
            disabled={savingDetails}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">说明描述</label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:ring-2 focus:ring-brand-500"
              value={detailsForm.description || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, description: e.target.value })}
              disabled={savingDetails}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="CPU 核心"
              type="number"
              min={1}
              value={detailsForm.cpu_cores || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, cpu_cores: e.target.value })}
              disabled={savingDetails}
            />
            <Input
              label="内存 (MB)"
              type="number"
              min={64}
              value={detailsForm.memory_mb || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, memory_mb: e.target.value })}
              disabled={savingDetails}
            />
            <Input
              label="磁盘容量 (GB)"
              type="number"
              min={1}
              value={detailsForm.disk_gb || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, disk_gb: e.target.value })}
              disabled={savingDetails}
            />
            <Select
              label="磁盘介质"
              value={detailsForm.disk_type || 'ssd'}
              onChange={(e) => setDetailsForm({ ...detailsForm, disk_type: e.target.value })}
              options={[
                { value: 'ssd', label: 'SSD' },
                { value: 'nvme', label: 'NVMe' },
                { value: 'hdd', label: 'HDD' },
                { value: 'unknown', label: '未指定' },
              ]}
              disabled={savingDetails}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="流量限制 (GB, 0=不限量, 空=未知)"
              type="number"
              value={detailsForm.transfer_gb ?? ''}
              onChange={(e) =>
                setDetailsForm({
                  ...detailsForm,
                  transfer_gb: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              disabled={savingDetails}
            />
            <Input
              label="带宽端口 (Mbps, 空=未知)"
              type="number"
              value={detailsForm.port_mbps ?? ''}
              onChange={(e) =>
                setDetailsForm({
                  ...detailsForm,
                  port_mbps: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              disabled={savingDetails}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="金额 (如 9.90)"
              value={detailsForm.price_amount || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, price_amount: e.target.value })}
              disabled={savingDetails}
            />
            <Input
              label="币种 (如 USD)"
              value={detailsForm.currency || ''}
              onChange={(e) => setDetailsForm({ ...detailsForm, currency: e.target.value })}
              disabled={savingDetails}
            />
            <Select
              label="计费周期"
              value={detailsForm.billing_period || 'monthly'}
              onChange={(e) => setDetailsForm({ ...detailsForm, billing_period: e.target.value })}
              options={[
                { value: 'monthly', label: '月付' },
                { value: 'quarterly', label: '季付' },
                { value: 'yearly', label: '年付' },
                { value: 'one_time', label: '一次性' },
              ]}
              disabled={savingDetails}
            />
          </div>

          <Checkbox
            label="上架此套餐（公开可浏览）"
            checked={detailsForm.enabled}
            onChange={(e) => setDetailsForm({ ...detailsForm, enabled: e.target.checked })}
            disabled={savingDetails}
          />

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" size="md" loading={savingDetails}>
              <Save className="w-4 h-4 mr-1.5" />
              保存商品基础信息
            </Button>
          </div>
        </form>
      </div>

      {/* 分区 2：采集与监控配置（含版本冲突提示） */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-gray-900">监控与采集配置</h2>
          <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
            Config Version: v{vps.monitor_config.config_version}
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-6">配置抓取 URL、使用的采集器与调度轮询频率。修改将自动使旧采集任务失效。</p>

        {versionConflict && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50 text-xs text-amber-800 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">配置版本冲突：</span>
                当前监控配置已被其他管理人员或后台任务更新。为防止覆盖他人更改，已阻止提交。
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchVpsAndCollectors} className="shrink-0 text-xs">
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              重载最新配置
            </Button>
          </div>
        )}

        <form onSubmit={handleSaveMonitor} className="space-y-4">
          <Input
            label="监控源地址 (source_url)"
            helperText="仅接受标准 HTTP/HTTPS 端口，同时作为前台购买直达链接"
            value={monitorForm.source_url || ''}
            onChange={(e) => setMonitorForm({ ...monitorForm, source_url: e.target.value })}
            disabled={savingMonitor}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="采集器"
              value={monitorForm.collector_code || ''}
              onChange={(e) => setMonitorForm({ ...monitorForm, collector_code: e.target.value })}
              options={
                collectors.some((c) => c.code === monitorForm.collector_code)
                  ? collectors.map((c) => ({
                      value: c.code,
                      label: `${c.name} (${c.code})`,
                    }))
                  : [
                      ...(monitorForm.collector_code
                        ? [{ value: monitorForm.collector_code, label: `${monitorForm.collector_code} (未注册/不可用)` }]
                        : [{ value: '', label: '请选择采集器' }]),
                      ...collectors.map((c) => ({
                        value: c.code,
                        label: `${c.name} (${c.code})`,
                      })),
                    ]
              }
              disabled={savingMonitor}
            />

            <Input
              label="轮询间隔 (秒, 60~86400)"
              type="number"
              min={60}
              max={86400}
              value={monitorForm.poll_interval_seconds || 300}
              onChange={(e) => setMonitorForm({ ...monitorForm, poll_interval_seconds: e.target.value })}
              disabled={savingMonitor}
            />

            <Input
              label="单次超时 (秒, 1~60)"
              type="number"
              min={1}
              max={60}
              value={monitorForm.timeout_seconds || 15}
              onChange={(e) => setMonitorForm({ ...monitorForm, timeout_seconds: e.target.value })}
              disabled={savingMonitor}
            />
          </div>

          <Checkbox
            label="启用定时监控调度"
            description="开启后监控 Worker 将按间隔自动检查并更新三态库存"
            checked={monitorForm.enabled}
            onChange={(e) => setMonitorForm({ ...monitorForm, enabled: e.target.checked })}
            disabled={savingMonitor}
          />

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="primary" size="md" loading={savingMonitor}>
              <Save className="w-4 h-4 mr-1.5" />
              更新监控配置 (保存新版本)
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
