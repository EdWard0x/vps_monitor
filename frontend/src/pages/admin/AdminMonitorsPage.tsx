import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MonitorRow, MerchantAdmin } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { StockBadge } from '@/components/common/StockBadge';
import { formatDate } from '@/lib/format/date';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Activity, Play, Settings, RefreshCw } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const AdminMonitorsPage: React.FC = () => {
  const { toast } = useToast();

  const [monitors, setMonitors] = useState<MonitorRow[]>([]);
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
  const [checkingIds, setCheckingIds] = useState<Record<string, boolean>>({});

  const fetchMerchants = () => {
    apiClient
      .get<{ items: MerchantAdmin[] }>('/admin/merchants?page=1&page_size=100')
      .then((res) => setMerchants(res.data.items))
      .catch(() => {});
  };

  const fetchMonitors = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/admin/monitors?page=${page}&page_size=${pageSize}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;
      if (merchantId) url += `&merchant_id=${merchantId}`;
      if (enabled !== '') url += `&enabled=${enabled}`;
      if (status) url += `&status=${status}`;

      const res = await apiClient.get<{ items: MonitorRow[]; total: number }>(url);
      setMonitors(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取监控任务失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, merchantId, enabled, status]);

  useEffect(() => {
    fetchMerchants();
  }, []);

  useEffect(() => {
    fetchMonitors();
  }, [fetchMonitors]);

  const handleQueueCheck = async (vpsId: string) => {
    try {
      setCheckingIds((prev) => ({ ...prev, [vpsId]: true }));
      await apiClient.post(`/admin/vps/${vpsId}/check`, {});
      toast('info', '检查请求已进入排程 (202 Accepted)');
      setTimeout(() => {
        fetchMonitors();
        setCheckingIds((prev) => ({ ...prev, [vpsId]: false }));
      }, 2000);
    } catch (err: unknown) {
      setCheckingIds((prev) => ({ ...prev, [vpsId]: false }));
      toast('error', isAppError(err) ? err.message : '排程失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <Activity className="w-6 h-6 text-brand-600 mr-2.5" />
            监控调度与采集管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            监控 Worker 周期检查任务、执行频率及即时排程
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchMonitors}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          刷新列表
        </Button>
      </div>

      {/* 筛选栏 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-gray-200">
        <Input
          placeholder="按 VPS 名称搜索..."
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
            { value: '', label: '全部状态' },
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
            { value: '', label: '全部调度开关' },
            { value: 'true', label: '仅已开启' },
            { value: 'false', label: '仅已暂停' },
          ]}
        />
      </div>

      {/* 列表表格 */}
      {loading ? (
        <LoadingSpinner label="正在拉取监控列表..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMonitors} />
      ) : monitors.length === 0 ? (
        <EmptyState title="暂无监控任务" />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-400 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">VPS 套餐</th>
                  <th className="py-3 px-4">所属商家</th>
                  <th className="py-3 px-4">采集器与间隔</th>
                  <th className="py-3 px-4">当前库存观测</th>
                  <th className="py-3 px-4">下次检查时间</th>
                  <th className="py-3 px-4">监控开关</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {monitors.map((m) => (
                  <tr key={m.vps_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-gray-900">{m.vps_name}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-700">{m.merchant_name}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px] text-gray-700 mr-1.5">
                        {m.collector_code}
                      </span>
                      <span>每 {m.poll_interval_seconds}s</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StockBadge stock={m.stock} showStaleNotice={false} />
                    </td>
                    <td className="py-3.5 px-4 text-gray-400">{formatDate(m.next_check_at)}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant={m.enabled ? 'green' : 'gray'}>
                        {m.enabled ? '运行中' : '已暂停'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!m.enabled || checkingIds[m.vps_id]}
                        loading={checkingIds[m.vps_id]}
                        onClick={() => handleQueueCheck(m.vps_id)}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        立即检查
                      </Button>
                      <Link to={`/admin/vps/${m.vps_id}`}>
                        <Button variant="outline" size="sm">
                          <Settings className="w-3.5 h-3.5 mr-1" />
                          配置
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={(p) => setPage(p)} />
        </div>
      )}
    </div>
  );
};
