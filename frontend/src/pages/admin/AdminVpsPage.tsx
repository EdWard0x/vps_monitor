import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { VpsAdmin, MerchantAdmin, Collector } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { StockBadge } from '@/components/common/StockBadge';
import { formatPrice } from '@/lib/format/money';
import { formatMemory, formatDisk } from '@/lib/format/specs';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import { Dialog } from '@/components/ui/Dialog';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Server, Plus, Settings } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const AdminVpsPage: React.FC = () => {
  const { toast } = useToast();

  const [vpsList, setVpsList] = useState<VpsAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [enabled, setEnabled] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [merchants, setMerchants] = useState<MerchantAdmin[]>([]);
  const [collectors, setCollectors] = useState<Collector[]>([]);

  // 新增 VPS 弹窗表单状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    merchant_id: '',
    code: '',
    name: '',
    description: '',
    cpu_cores: 1,
    memory_mb: 1024,
    disk_gb: 20,
    disk_type: 'ssd',
    transferType: 'custom', // 'unlimited' | 'unknown' | 'custom'
    transfer_gb: 1000,
    port_mbps: 1000,
    price_amount: '9.90',
    currency: 'USD',
    billing_period: 'monthly' as const,
    enabled: true,
    // 监控配置
    source_url: 'https://',
    collector_code: '',
    poll_interval_seconds: 300,
    timeout_seconds: 15,
    monitor_enabled: false,
  });

  const fetchMerchantsAndCollectors = () => {
    apiClient
      .get<{ items: MerchantAdmin[] }>('/admin/merchants?page=1&page_size=100')
      .then((res) => setMerchants(res.data.items))
      .catch(() => {});

    apiClient
      .get<Collector[]>('/admin/collectors')
      .then((res) => {
        setCollectors(res.data);
        if (res.data.length > 0) {
          setCreateForm((prev) => ({
            ...prev,
            collector_code: prev.collector_code || res.data[0].code,
          }));
        }
      })
      .catch(() => {});
  };

  const fetchVpsList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/admin/vps?page=${page}&page_size=${pageSize}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;
      if (merchantId) url += `&merchant_id=${merchantId}`;
      if (enabled !== '') url += `&enabled=${enabled}`;
      if (status) url += `&status=${status}`;

      const res = await apiClient.get<{ items: VpsAdmin[]; total: number }>(url);
      setVpsList(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取 VPS 列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, merchantId, enabled, status]);

  useEffect(() => {
    fetchMerchantsAndCollectors();
  }, []);

  useEffect(() => {
    fetchVpsList();
  }, [fetchVpsList]);

  const handleToggleEnabled = async (v: VpsAdmin) => {
    const next = !v.enabled;
    try {
      await apiClient.patch(`/admin/vps/${v.id}`, { enabled: next });
      toast('success', `套餐【${v.name}】已${next ? '上架' : '下架'}`);
      fetchVpsList();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '更新状态失败');
    }
  };

  const handleCreateVps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.merchant_id) {
      toast('error', '请选择所属商家');
      return;
    }
    if (!createForm.code.trim() || !createForm.name.trim()) {
      toast('error', '请填写套餐标识与名称');
      return;
    }
    if (!createForm.collector_code) {
      toast('error', '请选择有效的监控采集器');
      return;
    }

    let resolvedTransfer: number | null = null;
    if (createForm.transferType === 'unlimited') resolvedTransfer = 0;
    else if (createForm.transferType === 'custom') resolvedTransfer = Number(createForm.transfer_gb) || 0;

    try {
      setCreating(true);
      await apiClient.post('/admin/vps', {
        merchant_id: createForm.merchant_id,
        code: createForm.code.toLowerCase().trim(),
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        cpu_cores: Number(createForm.cpu_cores),
        memory_mb: Number(createForm.memory_mb),
        disk_gb: Number(createForm.disk_gb),
        disk_type: createForm.disk_type,
        transfer_gb: resolvedTransfer,
        port_mbps: Number(createForm.port_mbps) || null,
        price_amount: createForm.price_amount.trim(),
        currency: createForm.currency.trim().toUpperCase(),
        billing_period: createForm.billing_period,
        enabled: createForm.enabled,
        monitor_config: {
          source_url: createForm.source_url.trim(),
          collector_code: createForm.collector_code,
          poll_interval_seconds: Number(createForm.poll_interval_seconds),
          timeout_seconds: Number(createForm.timeout_seconds),
          enabled: createForm.monitor_enabled,
        },
      });

      toast('success', 'VPS 套餐及监控配置创建成功');
      setCreateDialogOpen(false);
      fetchVpsList();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <Server className="w-6 h-6 text-brand-600 mr-2.5" />
            VPS 套餐管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            维护各商家的商品基础规格、价格及监控状态
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (collectors.length > 0 && !createForm.collector_code) {
              setCreateForm((prev) => ({ ...prev, collector_code: collectors[0].code }));
            }
            setCreateDialogOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          创建新套餐
        </Button>
      </div>

      {/* 筛选工具栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-gray-200">
        <Input
          placeholder="按名称或套餐 code 搜索..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />

        <Select
          value={merchantId}
          onChange={(e) => {
            setMerchantId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部商家' },
            ...merchants.map((m) => ({ value: m.id, label: m.name })),
          ]}
        />

        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部库存状态' },
            { value: '1', label: '有货' },
            { value: '2', label: '缺货' },
            { value: '3', label: '无法识别' },
          ]}
        />

        <Select
          value={enabled}
          onChange={(e) => {
            setEnabled(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: '全部上架状态' },
            { value: 'true', label: '仅已上架' },
            { value: 'false', label: '仅已下架' },
          ]}
        />
      </div>

      {/* 表格内容 */}
      {loading ? (
        <LoadingSpinner label="正在拉取 VPS 列表..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchVpsList} />
      ) : vpsList.length === 0 ? (
        <EmptyState title="暂无 VPS 套餐" />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-400 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">商家</th>
                  <th className="py-3 px-4">套餐名称与标识</th>
                  <th className="py-3 px-4">规格配置</th>
                  <th className="py-3 px-4">价格</th>
                  <th className="py-3 px-4">当前库存</th>
                  <th className="py-3 px-4">上架状态</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vpsList.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-gray-800">{v.merchant.name}</td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{v.name}</div>
                      <div className="font-mono text-[11px] text-gray-400">{v.code}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      {v.cpu_cores}C / {formatMemory(v.memory_mb)} / {formatDisk(v.disk_gb, v.disk_type)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      {formatPrice(v.price_amount, v.currency, v.billing_period)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StockBadge stock={v.stock} showStaleNotice={false} />
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={v.enabled ? 'green' : 'gray'}>
                        {v.enabled ? '已上架' : '已下架'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <Link to={`/admin/vps/${v.id}`}>
                        <Button variant="outline" size="sm">
                          <Settings className="w-3.5 h-3.5 mr-1" />
                          配置与编辑
                        </Button>
                      </Link>
                      <Button
                        variant={v.enabled ? 'ghost' : 'secondary'}
                        size="sm"
                        className={v.enabled ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700'}
                        onClick={() => handleToggleEnabled(v)}
                      >
                        {v.enabled ? '下架' : '上架'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => setPage(p)} />
        </div>
      )}

      {/* 创建 VPS 弹窗 */}
      <Dialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="创建新 VPS 套餐"
        description="将同时初始化商品规格、默认初始库存及采集监控配置。"
        className="max-w-2xl"
      >
        <form onSubmit={handleCreateVps} className="space-y-4 pt-2 max-h-[75vh] overflow-y-auto px-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="所属商家 *"
              value={createForm.merchant_id}
              onChange={(e) => setCreateForm({ ...createForm, merchant_id: e.target.value })}
              options={[
                { value: '', label: '请选择商家' },
                ...merchants.map((m) => ({ value: m.id, label: m.name })),
              ]}
              disabled={creating}
            />
            <Input
              label="套餐标识 (Code) *"
              placeholder="如 demo-lax-mini"
              value={createForm.code}
              onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
              disabled={creating}
            />
          </div>

          <Input
            label="套餐名称 *"
            placeholder="如 DMIT LAX Mini"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            disabled={creating}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述说明</label>
            <textarea
              rows={2}
              className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:ring-2 focus:ring-brand-500"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              disabled={creating}
            />
          </div>

          {/* 硬件指标 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Input
              label="vCPU 核心数 *"
              type="number"
              min={1}
              value={createForm.cpu_cores}
              onChange={(e) => setCreateForm({ ...createForm, cpu_cores: Number(e.target.value) })}
              disabled={creating}
            />
            <Input
              label="内存 (MB) *"
              type="number"
              min={64}
              value={createForm.memory_mb}
              onChange={(e) => setCreateForm({ ...createForm, memory_mb: Number(e.target.value) })}
              disabled={creating}
            />
            <Input
              label="磁盘容量 (GB) *"
              type="number"
              min={1}
              value={createForm.disk_gb}
              onChange={(e) => setCreateForm({ ...createForm, disk_gb: Number(e.target.value) })}
              disabled={creating}
            />
            <Select
              label="磁盘类型 *"
              value={createForm.disk_type}
              onChange={(e) => setCreateForm({ ...createForm, disk_type: e.target.value })}
              options={[
                { value: 'ssd', label: 'SSD' },
                { value: 'nvme', label: 'NVMe' },
                { value: 'hdd', label: 'HDD' },
                { value: 'unknown', label: '未指定' },
              ]}
              disabled={creating}
            />
          </div>

          {/* 流量与带宽 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="流量限制类型"
              value={createForm.transferType}
              onChange={(e) => setCreateForm({ ...createForm, transferType: e.target.value })}
              options={[
                { value: 'custom', label: '指定流量额度' },
                { value: 'unlimited', label: '不限流量 (0)' },
                { value: 'unknown', label: '未知 (null)' },
              ]}
              disabled={creating}
            />
            {createForm.transferType === 'custom' && (
              <Input
                label="流量额度 (GB)"
                type="number"
                min={1}
                value={createForm.transfer_gb}
                onChange={(e) => setCreateForm({ ...createForm, transfer_gb: Number(e.target.value) })}
                disabled={creating}
              />
            )}
            <Input
              label="网口带宽 (Mbps)"
              type="number"
              min={1}
              value={createForm.port_mbps}
              onChange={(e) => setCreateForm({ ...createForm, port_mbps: Number(e.target.value) })}
              disabled={creating}
            />
          </div>

          {/* 资费价格 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="价格 (保留2位小数) *"
              placeholder="9.90"
              value={createForm.price_amount}
              onChange={(e) => setCreateForm({ ...createForm, price_amount: e.target.value })}
              disabled={creating}
            />
            <Input
              label="币种 (3位大写代码) *"
              placeholder="USD"
              value={createForm.currency}
              onChange={(e) => setCreateForm({ ...createForm, currency: e.target.value })}
              disabled={creating}
            />
            <Select
              label="计费周期 *"
              value={createForm.billing_period}
              onChange={(e) => setCreateForm({ ...createForm, billing_period: e.target.value as any })}
              options={[
                { value: 'monthly', label: '按月付费' },
                { value: 'quarterly', label: '按季付费' },
                { value: 'yearly', label: '按年付费' },
                { value: 'one_time', label: '一次性付费' },
              ]}
              disabled={creating}
            />
          </div>

          {/* 监控初始化配置分区 */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-3">
            <h4 className="text-xs font-bold text-gray-700">监控配置 (事务初始化)</h4>
            <Input
              label="监控/购买源 URL *"
              value={createForm.source_url}
              onChange={(e) => setCreateForm({ ...createForm, source_url: e.target.value })}
              disabled={creating}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                label="采集器选择 *"
                value={createForm.collector_code}
                onChange={(e) => setCreateForm({ ...createForm, collector_code: e.target.value })}
                options={[
                  ...(!createForm.collector_code ? [{ value: '', label: '请选择采集器' }] : []),
                  ...collectors.map((c) => ({
                    value: c.code,
                    label: `${c.name} (${c.code})`,
                  })),
                ]}
                disabled={creating}
              />
              <Input
                label="检查间隔 (秒)"
                type="number"
                min={60}
                max={86400}
                value={createForm.poll_interval_seconds}
                onChange={(e) => setCreateForm({ ...createForm, poll_interval_seconds: Number(e.target.value) })}
                disabled={creating}
              />
              <Input
                label="超时限制 (秒)"
                type="number"
                min={1}
                max={60}
                value={createForm.timeout_seconds}
                onChange={(e) => setCreateForm({ ...createForm, timeout_seconds: Number(e.target.value) })}
                disabled={creating}
              />
            </div>
            <Checkbox
              label="创建后立即启用监控调度"
              checked={createForm.monitor_enabled}
              onChange={(e) => setCreateForm({ ...createForm, monitor_enabled: e.target.checked })}
              disabled={creating}
            />
          </div>

          <Checkbox
            label="上架此商品供前台浏览"
            checked={createForm.enabled}
            onChange={(e) => setCreateForm({ ...createForm, enabled: e.target.checked })}
            disabled={creating}
          />

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={creating}>
              确认创建
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
