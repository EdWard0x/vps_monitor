import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AdminVPS, BillingPeriod, DiskType } from '@/types/vps';
import { Merchant } from '@/types/merchant';
import * as vpsApi from '@/api/vps';
import * as merchantApi from '@/api/merchant';
import { StockBadge } from '@/components/common/StockBadge';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ErrorState } from '@/components/ui/ErrorState';
import { NotImplementedCard } from '@/pages/ErrorPages';
import { isAppError, getErrorMessage } from '@/lib/http/errors';
import { BusinessCode } from '@/types/error';
import { ArrowLeft, Server, Save } from 'lucide-react';

export const AdminVpsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [vps, setVps] = useState<AdminVPS | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNotImplemented, setIsNotImplemented] = useState(false);

  // 表单字段
  const [merchantId, setMerchantId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cpuCores, setCpuCores] = useState(1);
  const [memoryMb, setMemoryMb] = useState(1024);
  const [diskGb, setDiskGb] = useState(20);
  const [diskType, setDiskType] = useState<DiskType>('ssd');
  const [transferGb, setTransferGb] = useState<string>('');
  const [portMbps, setPortMbps] = useState<string>('');
  const [hasIpv4, setHasIpv4] = useState(true);
  const [ipv4Count, setIpv4Count] = useState(1);
  const [hasIpv6, setHasIpv6] = useState(false);
  const [ipv6Count, setIpv6Count] = useState(0);
  const [priceAmount, setPriceAmount] = useState('0.00');
  const [currency, setCurrency] = useState('USD');
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [purchaseUrl, setPurchaseUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [collectionEnabled, setCollectionEnabled] = useState(false);

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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setIsNotImplemented(false);

    vpsApi
      .adminGetVPS(id)
      .then((res) => {
        const data = res.data;
        setVps(data);
        setMerchantId(data.merchant_id || data.merchant?.id || '');
        setCode(data.code);
        setName(data.name);
        setDescription(data.description || '');
        setCpuCores(data.cpu_cores);
        setMemoryMb(data.memory_mb);
        setDiskGb(data.disk_gb);
        setDiskType(data.disk_type);
        setTransferGb(data.transfer_gb !== null && data.transfer_gb !== undefined ? String(data.transfer_gb) : '');
        setPortMbps(data.port_mbps !== null && data.port_mbps !== undefined ? String(data.port_mbps) : '');
        setHasIpv4(data.has_ipv4);
        setIpv4Count(data.ipv4_count);
        setHasIpv6(data.has_ipv6);
        setIpv6Count(data.ipv6_count);
        setPriceAmount(data.price_amount);
        setCurrency(data.currency);
        setBillingPeriod(data.billing_period);
        setPurchaseUrl(data.purchase_url || '');
        setEnabled(data.enabled);
        setCollectionEnabled(data.collection_enabled);
      })
      .catch((err) => {
        if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
          setIsNotImplemented(true);
        } else {
          setError(getErrorMessage(err));
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !vps) return;

    const parsedTransfer = transferGb.trim() === '' ? null : Number(transferGb);
    const parsedPort = portMbps.trim() === '' ? null : Number(portMbps);

    try {
      setSaving(true);
      const res = await vpsApi.adminUpdateVPS({
        id,
        merchant_id: merchantId,
        code: code.toLowerCase().trim(),
        name: name.trim(),
        description: description.trim(),
        cpu_cores: Number(cpuCores),
        memory_mb: Number(memoryMb),
        disk_gb: Number(diskGb),
        disk_type: diskType,
        transfer_gb: parsedTransfer,
        port_mbps: parsedPort,
        has_ipv4: hasIpv4,
        ipv4_count: hasIpv4 ? Number(ipv4Count) : 0,
        has_ipv6: hasIpv6,
        ipv6_count: hasIpv6 ? Number(ipv6Count) : 0,
        price_amount: priceAmount.trim(),
        currency: currency.trim(),
        billing_period: billingPeriod,
        purchase_url: purchaseUrl.trim(),
        enabled,
        collection_enabled: collectionEnabled,
      });

      setVps(res.data);
      toast({ type: 'success', title: '保存成功', message: '套餐配置与购买地址已更新' });
    } catch (err) {
      if (isAppError(err) && (err.code === BusinessCode.NOT_IMPLEMENTED || err.status === 501)) {
        toast({ type: 'error', title: '功能尚未实现', message: '后端套餐更新接口返回 HTTP 501' });
      } else {
        toast({ type: 'error', title: '保存失败', message: getErrorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner label="正在读取套餐详情..." />;

  if (isNotImplemented) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/vps"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回套餐管理
        </Link>
        <NotImplementedCard
          title="套餐详情编辑接口尚未实现 (HTTP 501)"
          description="后端端点 GET/PUT /api/v1/admin/vps/* 正在重构中。"
        />
      </div>
    );
  }

  if (error || !vps) {
    return (
      <div className="space-y-4">
        <Link
          to="/admin/vps"
          className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          返回套餐管理
        </Link>
        <ErrorState title="加载失败" description={error || '套餐不存在或已删除'} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Link
        to="/admin/vps"
        className="inline-flex items-center text-xs text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" />
        返回套餐管理
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-mono text-gray-400">
            <span>Code: {vps.code}</span>
            <span>·</span>
            <span>ID: {vps.id}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 mt-1 flex items-center">
            <Server className="w-6 h-6 text-brand-600 mr-2.5" />
            编辑套餐：{vps.name}
          </h1>
        </div>

        <div className="flex items-center space-x-3">
          <StockBadge stock={vps.stock} />
        </div>
      </div>

      {merchants.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-amber-800 text-xs sm:text-sm flex items-center justify-between">
          <span>当前系统尚未录入任何主机商家，需先添加商家方可关联套餐。</span>
          <Link to="/admin/merchants?action=create" className="text-brand-600 font-semibold hover:underline shrink-0 ml-2">
            前往添加商家 &rarr;
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-200 shadow-xs space-y-6">
        <div>
          <h2 className="text-base font-bold text-gray-900">配置规格与基础参数</h2>
          <p className="text-xs text-gray-500 mt-0.5">无采集调度配置；购买地址为独立购买链接</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              所属商家
            </label>
            <Select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              options={merchants.map((m) => ({ value: m.id, label: m.name }))}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              套餐唯一标识 (Code)
            </label>
            <Input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={saving}
              required
            />
            <p className="text-xs text-gray-400 mt-1">标识在所属商家内必须唯一</p>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              套餐展示名称
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              CPU 核心数
            </label>
            <Input
              type="number"
              min={1}
              value={cpuCores}
              onChange={(e) => setCpuCores(Number(e.target.value))}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              运行内存 (MB)
            </label>
            <Input
              type="number"
              min={64}
              step={128}
              value={memoryMb}
              onChange={(e) => setMemoryMb(Number(e.target.value))}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              磁盘大小 (GB)
            </label>
            <Input
              type="number"
              min={0}
              value={diskGb}
              onChange={(e) => setDiskGb(Number(e.target.value))}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              磁盘类型
            </label>
            <Select
              value={diskType}
              onChange={(e) => setDiskType(e.target.value as DiskType)}
              options={[
                { value: 'ssd', label: 'SSD' },
                { value: 'nvme', label: 'NVMe' },
                { value: 'hdd', label: 'HDD' },
                { value: 'unknown', label: '未注明 (Unknown)' },
              ]}
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              月流量 (GB)
            </label>
            <Input
              type="number"
              min={0}
              placeholder="留空为未知，0为不限量"
              value={transferGb}
              onChange={(e) => setTransferGb(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-gray-400 mt-1">留空提交 null (未知)，0 为不限量</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              端口速率 (Mbps)
            </label>
            <Input
              type="number"
              min={0}
              placeholder="留空为未知"
              value={portMbps}
              onChange={(e) => setPortMbps(e.target.value)}
              disabled={saving}
            />
            <p className="text-xs text-gray-400 mt-1">留空提交 null (未知)，如 1000</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              价格金额 (字符串提交)
            </label>
            <Input
              type="text"
              value={priceAmount}
              onChange={(e) => setPriceAmount(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              结算币种 (三位大写)
            </label>
            <Select
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              options={[
                { value: 'USD', label: 'USD - 美元' },
                { value: 'EUR', label: 'EUR - 欧元' },
                { value: 'CNY', label: 'CNY - 人民币' },
                { value: 'GBP', label: 'GBP - 英镑' },
                { value: 'JPY', label: 'JPY - 日元' },
                { value: 'CAD', label: 'CAD - 加元' },
                { value: 'HKD', label: 'HKD - 港币' },
              ]}
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              计费周期
            </label>
            <Select
              value={billingPeriod}
              onChange={(e) => setBillingPeriod(e.target.value as BillingPeriod)}
              options={[
                { value: 'monthly', label: '按月付费 (monthly)' },
                { value: 'quarterly', label: '按季付费 (quarterly)' },
                { value: 'yearly', label: '按年付费 (yearly)' },
                { value: 'one_time', label: '一次性付费 (one_time)' },
              ]}
              disabled={saving}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              独立购买地址 (HTTP / HTTPS)
            </label>
            <Input
              type="url"
              placeholder="https://provider.com/cart.php?a=add&pid=123"
              value={purchaseUrl}
              onChange={(e) => setPurchaseUrl(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              详细描述
            </label>
            <textarea
              rows={3}
              className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer mb-1.5">
              <Checkbox
                checked={hasIpv4}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHasIpv4(checked);
                  if (!checked) setIpv4Count(0);
                  else if (ipv4Count === 0) setIpv4Count(1);
                }}
                disabled={saving}
              />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">含独立 IPv4</span>
            </label>
            {hasIpv4 ? (
              <Input
                type="number"
                min={1}
                value={ipv4Count}
                onChange={(e) => setIpv4Count(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={saving}
                placeholder="IPv4 数量"
                required
              />
            ) : (
              <p className="text-xs text-gray-400">关闭后数量自动置为 0</p>
            )}
          </div>

          <div>
            <label className="flex items-center space-x-2 cursor-pointer mb-1.5">
              <Checkbox
                checked={hasIpv6}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHasIpv6(checked);
                  if (!checked) setIpv6Count(0);
                  else if (ipv6Count === 0) setIpv6Count(1);
                }}
                disabled={saving}
              />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">含独立 IPv6</span>
            </label>
            {hasIpv6 ? (
              <Input
                type="number"
                min={1}
                value={ipv6Count}
                onChange={(e) => setIpv6Count(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={saving}
                placeholder="IPv6 数量"
                required
              />
            ) : (
              <p className="text-xs text-gray-400">关闭后数量自动置为 0</p>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 space-y-4">
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <Checkbox
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={saving}
              />
              <span className="text-sm font-medium text-gray-700">公开上架展示该套餐</span>
            </label>
            {!enabled && (
              <p className="text-xs text-amber-600 mt-1 pl-6">
                下架提醒：下架后，该套餐将从公开前台页面隐藏（管理后台仍可查看与编辑）。
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100">
            <label className="flex items-start space-x-2 cursor-pointer">
              <Checkbox
                checked={collectionEnabled}
                onChange={(e) => setCollectionEnabled(e.target.checked)}
                disabled={saving}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 block">允许采集该套餐</span>
                <span className="text-xs text-gray-400 block mt-0.5">
                  套餐级采集许可。未来执行需全局、所属商家、该套餐三级均开启；上级关闭时此处配置依旧保留。
                </span>
              </div>
            </label>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
              采集配置可保存，实际采集功能待接入。
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={() => navigate('/admin/vps')}>
            返回
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={saving} disabled={merchants.length === 0}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            保存套餐配置
          </Button>
        </div>
      </form>
    </div>
  );
};
