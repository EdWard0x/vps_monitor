import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminMerchant, MerchantCreateInput, MerchantUpdateInput } from '@/types/merchant';
import * as merchantApi from '@/api/merchant';
import * as settingsApi from '@/api/settings';
import { MerchantFilter } from '@/features/merchant/MerchantFilter';
import { MerchantTable } from '@/features/merchant/MerchantTable';
import { MerchantFormDialog } from '@/features/merchant/MerchantFormDialog';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Store, Plus } from 'lucide-react';

export const AdminMerchantsPage: React.FC = () => {
  const { toast } = useToast();

  const [merchants, setMerchants] = useState<AdminMerchant[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [enabled, setEnabled] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);
  const [globalCollectionEnabled, setGlobalCollectionEnabled] = useState<boolean | undefined>(undefined);

  // 对话框状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState<AdminMerchant | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    settingsApi
      .adminGetSettings()
      .then((res) => setGlobalCollectionEnabled(res.data.collection_enabled))
      .catch(() => {});
  }, []);

  const fetchMerchants = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      const res = await merchantApi.adminListMerchants({
        page,
        page_size: pageSize,
        q: q.trim() || undefined,
        enabled: enabled !== '' ? enabled === 'true' : undefined,
      });

      setMerchants(res.data.items);
      setTotal(res.data.total);
    } catch (err: unknown) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        setIsNotImplemented(true);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, enabled]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  // 支持从其他页面传 action=create 自动弹出创建
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setEditingMerchant(null);
      setDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleOpenCreate = () => {
    setEditingMerchant(null);
    setDialogOpen(true);
  };

  // 必须读取管理端完整详情，不能直接拿列表浅层数据作为编辑表单数据
  const handleOpenEdit = async (m: AdminMerchant) => {
    try {
      setSubmitting(true);
      const res = await merchantApi.adminGetMerchant(m.id);
      setEditingMerchant(res.data);
      setDialogOpen(true);
    } catch (err) {
      toast({ type: 'error', title: '读取商家详情失败', message: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitCreate = async (input: MerchantCreateInput) => {
    try {
      setSubmitting(true);
      await merchantApi.adminCreateMerchant(input);
      toast({ type: 'success', title: '创建成功', message: `商家「${input.name}」已添加` });
      setDialogOpen(false);
      fetchMerchants();
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端商家创建接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '创建失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitUpdate = async (input: MerchantUpdateInput) => {
    try {
      setSubmitting(true);
      await merchantApi.adminUpdateMerchant(input);
      toast({ type: 'success', title: '更新成功', message: '商家资料已修改' });
      setDialogOpen(false);
      fetchMerchants();
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端商家更新接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '更新失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (m: AdminMerchant) => {
    if (!window.confirm(`确定删除商家「${m.name}」吗？若该商家旗下仍有套餐商品，将无法删除。`)) return;

    try {
      await merchantApi.adminDeleteMerchant(m.id);
      toast({ type: 'success', title: '删除成功', message: `商家「${m.name}」已移除` });
      // 删除最后一条记录后正确调整分页
      if (merchants.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        fetchMerchants();
      }
    } catch (err) {
      if (isAppError(err) && err.code === BusinessCode.RESOURCE_CONFLICT) {
        toast({
          type: 'error',
          title: '无法删除商家',
          message: '该商家下仍有关联的 VPS 套餐，无法直接删除。请先删除或转移其关联套餐后再重试。',
        });
      } else if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端商家删除接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '删除失败', message: getErrorMessage(err) });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center">
            <Store className="w-6 h-6 text-brand-600 mr-2.5" />
            商家管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">管理系统收录的云主机提供商、官网网址与启用状态</p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          添加新商家
        </Button>
      </div>

      <MerchantFilter
        q={q}
        onQChange={(val) => {
          setQ(val);
          setPage(1);
        }}
        enabled={enabled}
        onEnabledChange={(val) => {
          setEnabled(val);
          setPage(1);
        }}
        isAdmin={true}
      />

      {isNotImplemented ? (
        <NotImplementedCard
          title="商家管理接口尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/admin/merchant/list 正在重构中，待后端接入后即可进行管理。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在读取商家管理列表..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchMerchants} />
      ) : merchants.length === 0 ? (
        <EmptyState title="未找到商家" description="当前筛选条件下没有匹配的商家数据。" />
      ) : (
        <div className="space-y-4">
          <MerchantTable
            merchants={merchants}
            isAdmin={true}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
          />
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      <MerchantFormDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialData={editingMerchant}
        onSubmitCreate={handleSubmitCreate}
        onSubmitUpdate={handleSubmitUpdate}
        loading={submitting}
        globalCollectionEnabled={globalCollectionEnabled}
      />
    </div>
  );
};
