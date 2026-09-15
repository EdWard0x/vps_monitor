import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  AdminVPS,
  VPSCreateInput,
  VPSUpdateInput,
  BillingPeriod,
  DiskType,
} from '@/types/vps';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';

export interface VpsFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate?: (input: VPSCreateInput) => Promise<void>;
  onSubmitUpdate?: (input: VPSUpdateInput) => Promise<void>;
  initialData?: AdminVPS | null;
  merchants: { id: string; name: string }[];
  loading?: boolean;
}

export const VpsFormDialog: React.FC<VpsFormDialogProps> = ({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  initialData,
  merchants,
  loading = false,
}) => {
  const isEdit = Boolean(initialData);

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
    if (initialData) {
      setMerchantId(initialData.merchant_id || initialData.merchant?.id || '');
      setCode(initialData.code);
      setName(initialData.name);
      setDescription(initialData.description || '');
      setCpuCores(initialData.cpu_cores);
      setMemoryMb(initialData.memory_mb);
      setDiskGb(initialData.disk_gb);
      setDiskType(initialData.disk_type);
      setTransferGb(initialData.transfer_gb !== null && initialData.transfer_gb !== undefined ? String(initialData.transfer_gb) : '');
      setPortMbps(initialData.port_mbps !== null && initialData.port_mbps !== undefined ? String(initialData.port_mbps) : '');
      setHasIpv4(initialData.has_ipv4);
      setIpv4Count(initialData.ipv4_count);
      setHasIpv6(initialData.has_ipv6);
      setIpv6Count(initialData.ipv6_count);
      setPriceAmount(initialData.price_amount);
      setCurrency(initialData.currency);
      setBillingPeriod(initialData.billing_period);
      setPurchaseUrl(initialData.purchase_url || '');
      setEnabled(initialData.enabled);
      setCollectionEnabled(initialData.collection_enabled);
    } else {
      setMerchantId(merchants[0]?.id || '');
      setCode('');
      setName('');
      setDescription('');
      setCpuCores(1);
      setMemoryMb(1024);
      setDiskGb(20);
      setDiskType('ssd');
      setTransferGb('');
      setPortMbps('');
      setHasIpv4(true);
      setIpv4Count(1);
      setHasIpv6(false);
      setIpv6Count(0);
      setPriceAmount('9.99');
      setCurrency('USD');
      setBillingPeriod('monthly');
      setPurchaseUrl('');
      setEnabled(true);
      setCollectionEnabled(false);
    }
  }, [initialData, isOpen, merchants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedTransfer = transferGb.trim() === '' ? null : Number(transferGb);
    const parsedPort = portMbps.trim() === '' ? null : Number(portMbps);

    if (isEdit && initialData && onSubmitUpdate) {
      await onSubmitUpdate({
        id: initialData.id,
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
    } else if (onSubmitCreate) {
      await onSubmitCreate({
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
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `编辑 VPS 套餐：${initialData?.name}` : '添加新 VPS 套餐'}
      description="配置套餐规格、价格、购买地址及上架状态"
      className="max-w-2xl"
    >
      {merchants.length === 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-800 text-xs flex items-center justify-between mb-3">
          <span>当前系统中尚无可用商家，请先添加商家后再创建套餐。</span>
          <Link to="/admin/merchants?action=create" className="text-brand-600 font-semibold hover:underline shrink-0 ml-2">
            前往添加商家 &rarr;
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              所属商家
            </label>
            <Select
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              options={merchants.map((m) => ({ value: m.id, label: m.name }))}
              disabled={loading || merchants.length === 0}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              套餐唯一标识 (Code)
            </label>
            <Input
              type="text"
              placeholder="例如: rn-la-1c1g"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              required
            />
            {isEdit && <p className="text-xs text-gray-400 mt-1">标识在所属商家内必须唯一</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              套餐展示名称
            </label>
            <Input
              type="text"
              placeholder="例如: Los Angeles Special 1C1G"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
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
              onChange={(e) => setCpuCores(Math.max(1, parseInt(e.target.value, 10) || 1))}
              disabled={loading}
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
              onChange={(e) => setMemoryMb(Math.max(64, parseInt(e.target.value, 10) || 64))}
              disabled={loading}
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
              onChange={(e) => setDiskGb(Math.max(0, parseInt(e.target.value, 10) || 0))}
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
            />
            <p className="text-xs text-gray-400 mt-1">留空提交 null (未知)，如 1000</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              价格金额 (字符串提交)
            </label>
            <Input
              type="text"
              placeholder="例如: 9.99"
              value={priceAmount}
              onChange={(e) => setPriceAmount(e.target.value)}
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
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
              disabled={loading}
              required
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
              套餐详细描述
            </label>
            <textarea
              rows={2}
              className="w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              placeholder="机房机型补充说明、线路特征等..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
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
                disabled={loading}
              />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">含独立 IPv4</span>
            </label>
            {hasIpv4 ? (
              <Input
                type="number"
                min={1}
                value={ipv4Count}
                onChange={(e) => setIpv4Count(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={loading}
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
                disabled={loading}
              />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">含独立 IPv6</span>
            </label>
            {hasIpv6 ? (
              <Input
                type="number"
                min={1}
                value={ipv6Count}
                onChange={(e) => setIpv6Count(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={loading}
                placeholder="IPv6 数量"
                required
              />
            ) : (
              <p className="text-xs text-gray-400">关闭后数量自动置为 0</p>
            )}
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100 space-y-4">
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <Checkbox
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={loading}
              />
              <span className="text-sm font-medium text-gray-700">公开上架展示该套餐</span>
            </label>
            {!enabled && (
              <p className="text-xs text-amber-600 mt-1 pl-6">
                下架提醒：下架后，该套餐将从公开前台页面隐藏（管理后台仍可查看）。
              </p>
            )}
          </div>

          <div className="pt-3 border-t border-gray-100">
            <label className="flex items-start space-x-2 cursor-pointer">
              <Checkbox
                checked={collectionEnabled}
                onChange={(e) => setCollectionEnabled(e.target.checked)}
                disabled={loading}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium text-gray-700 block">允许采集该套餐</span>
                <span className="text-xs text-gray-400 block mt-0.5">
                  套餐级采集许可。未来执行需要全局、商家、套餐三级均开启；上级关闭时此处配置依旧保留。
                </span>
              </div>
            </label>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
              采集配置可保存，实际采集功能待接入。
            </p>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading} disabled={merchants.length === 0}>
            {isEdit ? '保存更改' : '创建套餐'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
