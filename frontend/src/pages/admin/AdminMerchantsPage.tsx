import React, { useState, useEffect, useCallback } from 'react';
import { MerchantAdmin } from '@/types/api';
import { apiClient } from '@/lib/http/client';
import { formatDate } from '@/lib/format/date';
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
import { Store, Plus, Edit2, ExternalLink } from 'lucide-react';
import { isAppError } from '@/lib/http/errors';

export const AdminMerchantsPage: React.FC = () => {
  const { toast } = useToast();

  const [merchants, setMerchants] = useState<MerchantAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [enabled, setEnabled] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 弹窗状态
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    code: '',
    name: '',
    website_url: '',
    enabled: true,
  });
  const [creating, setCreating] = useState(false);

  const [editMerchant, setEditMerchant] = useState<MerchantAdmin | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    website_url: '',
    enabled: true,
  });
  const [editing, setEditing] = useState(false);

  const fetchMerchants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/admin/merchants?page=${page}&page_size=${pageSize}`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;
      if (enabled !== '') url += `&enabled=${enabled}`;

      const res = await apiClient.get<{ items: MerchantAdmin[]; total: number }>(url);
      setMerchants(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取商家列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, enabled]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.code.trim() || !createForm.name.trim() || !createForm.website_url.trim()) {
      toast('error', '请完整填写必填项');
      return;
    }

    try {
      setCreating(true);
      await apiClient.post('/admin/merchants', {
        code: createForm.code.toLowerCase().trim(),
        name: createForm.name.trim(),
        website_url: createForm.website_url.trim(),
        enabled: createForm.enabled,
      });
      toast('success', '商家创建成功');
      setCreateDialogOpen(false);
      setCreateForm({ code: '', name: '', website_url: '', enabled: true });
      fetchMerchants();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '创建商家失败');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (m: MerchantAdmin) => {
    setEditMerchant(m);
    setEditForm({
      name: m.name,
      website_url: m.website_url,
      enabled: m.enabled,
    });
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMerchant) return;

    try {
      setEditing(true);
      await apiClient.patch(`/admin/merchants/${editMerchant.id}`, {
        name: editForm.name.trim(),
        website_url: editForm.website_url.trim(),
        enabled: editForm.enabled,
      });
      toast('success', '商家信息更新成功');
      setEditMerchant(null);
      fetchMerchants();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '修改商家失败');
    } finally {
      setEditing(false);
    }
  };

  const handleToggleEnabled = async (m: MerchantAdmin) => {
    const next = !m.enabled;
    const confirmMsg = next
      ? `确认启用商家【${m.name}】吗？其下原本启用的商品和监控将恢复展示。`
      : `确认停用商家【${m.name}】吗？旗下所有 VPS 将在前台隐藏，相关监控调度也将自动暂停！`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await apiClient.patch(`/admin/merchants/${m.id}`, { enabled: next });
      toast('success', `商家已${next ? '启用' : '停用'}`);
      fetchMerchants();
    } catch (err: unknown) {
      toast('error', isAppError(err) ? err.message : '更新状态失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight flex items-center">
            <Store className="w-6 h-6 text-brand-600 mr-2.5" />
            商家管理
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            维护系统中的云服务提供商档案及启停状态
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          新增商家
        </Button>
      </div>

      {/* 搜索与筛选行 */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-gray-200">
        <div className="relative flex-1">
          <Input
            placeholder="按商家名称或 code 搜索..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full sm:w-40">
          <Select
            value={enabled}
            onChange={(e) => {
              setEnabled(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: '全部启用状态' },
              { value: 'true', label: '仅已启用' },
              { value: 'false', label: '仅已停用' },
            ]}
          />
        </div>
      </div>

      {/* 列表内容 */}
      {loading ? (
        <LoadingSpinner label="正在拉取商家记录..." />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchMerchants} />
      ) : merchants.length === 0 ? (
        <EmptyState title="暂无商家记录" />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-600">
              <thead className="bg-gray-50 text-gray-400 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">标识 (Code)</th>
                  <th className="py-3 px-4">商家名称</th>
                  <th className="py-3 px-4">官网链接</th>
                  <th className="py-3 px-4">状态</th>
                  <th className="py-3 px-4">创建时间</th>
                  <th className="py-3 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {merchants.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-800">{m.code}</td>
                    <td className="py-3.5 px-4 font-semibold text-gray-900">{m.name}</td>
                    <td className="py-3.5 px-4 max-w-xs truncate">
                      <a
                        href={m.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:underline inline-flex items-center"
                      >
                        {m.website_url}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={m.enabled ? 'green' : 'gray'}>
                        {m.enabled ? '已启用' : '已停用'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-gray-400">{formatDate(m.created_at)}</td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                        <Edit2 className="w-3.5 h-3.5 mr-1" />
                        编辑
                      </Button>
                      <Button
                        variant={m.enabled ? 'ghost' : 'secondary'}
                        size="sm"
                        className={m.enabled ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700'}
                        onClick={() => handleToggleEnabled(m)}
                      >
                        {m.enabled ? '停用' : '启用'}
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

      {/* 新增商家弹窗 */}
      <Dialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="新增商家"
        description="填写云服务商家基本信息。商家标识创建后不可更改。"
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <Input
            label="商家标识 (Code)"
            placeholder="如 dmit / bandwagonghost"
            helperText="小写字母、数字、连字符或下划线，创建后不可修改"
            value={createForm.code}
            onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
            disabled={creating}
            autoFocus
          />
          <Input
            label="商家名称"
            placeholder="如 DMIT / 搬瓦工"
            value={createForm.name}
            onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            disabled={creating}
          />
          <Input
            label="官网地址"
            placeholder="https://..."
            value={createForm.website_url}
            onChange={(e) => setCreateForm({ ...createForm, website_url: e.target.value })}
            disabled={creating}
          />
          <Checkbox
            label="立即启用此商家"
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

      {/* 编辑商家弹窗 */}
      <Dialog
        isOpen={Boolean(editMerchant)}
        onClose={() => setEditMerchant(null)}
        title="编辑商家资料"
        description={`正在修改商家【${editMerchant?.code}】的公开信息`}
      >
        <form onSubmit={handleEdit} className="space-y-4 pt-2">
          <Input
            label="商家名称"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            disabled={editing}
          />
          <Input
            label="官网地址"
            value={editForm.website_url}
            onChange={(e) => setEditForm({ ...editForm, website_url: e.target.value })}
            disabled={editing}
          />
          <Checkbox
            label="保持启用状态"
            description="取消勾选将停用该商家并隐藏旗下所有产品"
            checked={editForm.enabled}
            onChange={(e) => setEditForm({ ...editForm, enabled: e.target.checked })}
            disabled={editing}
          />

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditMerchant(null)}
              disabled={editing}
            >
              取消
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={editing}>
              保存修改
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
