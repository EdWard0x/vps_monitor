import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminVPS, BillingPeriod, VPSCreateInput, VPSSortOption } from '@/types/vps';
import { StockStatus } from '@/types/stock';
import { Merchant } from '@/types/merchant';
import * as vpsApi from '@/api/vps';
import * as merchantApi from '@/api/merchant';
import { VpsFilter } from '@/features/vps/VpsFilter';
import { VpsTable } from '@/features/vps/VpsTable';
import { VpsFormDialog } from '@/features/vps/VpsFormDialog';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { Server, Plus } from 'lucide-react';

export const AdminVpsPage: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [vpsList, setVpsList] = useState<AdminVPS[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [q, setQ] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [currency, setCurrency] = useState('');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod | undefined>();
  const [status, setStatus] = useState<StockStatus | undefined>();
  const [sort, setSort] = useState<VPSSortOption>('updated_desc');
  const [enabled, setEnabled] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  // 创建套餐对话框
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 联动 URL action=create 自动弹出创建
  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setCreateDialogOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // 逐页或全量加载所有管理商家选项，防止因只取第 1 页导致后续商家无法关联
  useEffect(() => {
    let cancelled = false;
    const loadMerchants = async () => {
      try {
        let currentPage = 1;
        let allMerchants: Merchant[] = [];
        while (!cancelled) {
          const res = await merchantApi.adminListMerchants({ page: currentPage, page_size: 100 });
          allMerchants = [...allMerchants, ...res.data.items];
          if (allMerchants.length >= res.data.total || res.data.items.length === 0) {
            break;
          }
          currentPage++;
        }
        if (!cancelled) {
          setMerchants(allMerchants);
        }
      } catch {
        // 忽略异常
      }
    };
    loadMerchants();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchVpsList = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setIsNotImplemented(false);

      const res = await vpsApi.adminListVPS({
        page,
        page_size: pageSize,
        q: q.trim() || undefined,
        merchant_id: merchantId || undefined,
        currency: currency || undefined,
        billing_period: billingPeriod,
        status,
        sort,
        enabled: enabled !== '' ? enabled === 'true' : undefined,
      });

      setVpsList(res.data.items);
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
  }, [page, pageSize, q, merchantId, currency, billingPeriod, status, sort, enabled]);

  useEffect(() => {
    fetchVpsList();
  }, [fetchVpsList]);

  const handleCreateVps = async (input: VPSCreateInput) => {
    try {
      setSubmitting(true);
      await vpsApi.adminCreateVPS(input);
      toast({ type: 'success', title: '创建成功', message: `套餐「${input.name}」已创建` });
      setCreateDialogOpen(false);
      fetchVpsList();
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端套餐创建端点返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '创建失败', message: getErrorMessage(err) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVps = async (vps: AdminVPS) => {
    if (!window.confirm(`确定删除 VPS 套餐「${vps.name}」吗？`)) return;

    try {
      await vpsApi.adminDeleteVPS(vps.id);
      toast({ type: 'success', title: '删除成功', message: `套餐「${vps.name}」已删除` });
      if (vpsList.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        fetchVpsList();
      }
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端套餐删除端点返回 HTTP 501' });
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
            <Server className="w-6 h-6 text-brand-600 mr-2.5" />
            VPS 套餐管理
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            录入各服务商 VPS 套餐规格参数、购买链接、上下架状态与查看实时库存
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" />
          添加新套餐
        </Button>
      </div>

      <VpsFilter
        query={{ q, merchant_id: merchantId, currency, billing_period: billingPeriod, status, sort }}
        onChange={(patch) => {
          if (patch.q !== undefined) setQ(patch.q);
          if ('merchant_id' in patch) setMerchantId(patch.merchant_id || '');
          if ('currency' in patch) setCurrency(patch.currency || '');
          if ('billing_period' in patch) setBillingPeriod(patch.billing_period);
          if ('status' in patch) setStatus(patch.status);
          if (patch.sort !== undefined) setSort(patch.sort);
          setPage(1);
        }}
        merchants={merchants}
        isAdmin={true}
        enabledFilter={enabled}
        onEnabledFilterChange={(val) => {
          setEnabled(val);
          setPage(1);
        }}
      />

      {isNotImplemented ? (
        <NotImplementedCard
          title="VPS 套餐管理尚未实现 (HTTP 501)"
          description="后端端点 GET /api/v1/admin/vps/list 正在重构中，待后端接入后即可管理套餐。"
        />
      ) : loading ? (
        <LoadingSpinner label="正在读取套餐管理列表..." />
      ) : error ? (
        <ErrorState title="加载失败" description={error} onRetry={fetchVpsList} />
      ) : vpsList.length === 0 ? (
        <EmptyState title="未找到 VPS 套餐" description="当前筛选条件下没有匹配的套餐数据。" />
      ) : (
        <div className="space-y-4">
          <VpsTable vpsList={vpsList} onDelete={handleDeleteVps} />
          <Pagination
            page={page}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </div>
      )}

      <VpsFormDialog
        isOpen={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSubmitCreate={handleCreateVps}
        merchants={merchants}
        loading={submitting}
      />
    </div>
  );
};
