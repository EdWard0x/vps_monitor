import React, { useState, useEffect } from 'react';
import { AdminMerchant, MerchantCreateInput, MerchantUpdateInput } from '@/types/merchant';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';

export interface MerchantFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate?: (input: MerchantCreateInput) => Promise<void>;
  onSubmitUpdate?: (input: MerchantUpdateInput) => Promise<void>;
  initialData?: AdminMerchant | null;
  loading?: boolean;
  globalCollectionEnabled?: boolean;
}

export const MerchantFormDialog: React.FC<MerchantFormDialogProps> = ({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  initialData,
  loading = false,
  globalCollectionEnabled,
}) => {
  const isEdit = Boolean(initialData);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [collectionEnabled, setCollectionEnabled] = useState(false);

  useEffect(() => {
    if (initialData) {
      setCode(initialData.code);
      setName(initialData.name);
      setWebsiteUrl(initialData.website_url);
      setEnabled(initialData.enabled);
      setCollectionEnabled(initialData.collection_enabled);
    } else {
      setCode('');
      setName('');
      setWebsiteUrl('');
      setEnabled(true);
      setCollectionEnabled(false);
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit && initialData && onSubmitUpdate) {
      await onSubmitUpdate({
        id: initialData.id,
        name: name.trim(),
        website_url: websiteUrl.trim(),
        enabled,
        collection_enabled: collectionEnabled,
      });
    } else if (onSubmitCreate) {
      await onSubmitCreate({
        code: code.toLowerCase().trim(),
        name: name.trim(),
        website_url: websiteUrl.trim(),
        enabled,
        collection_enabled: collectionEnabled,
      });
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `编辑商家：${initialData?.name}` : '添加新商家'}
      description={isEdit ? '修改商家名称、官网地址与启用状态' : '录入新的云服务提供商信息'}
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            商家唯一标识 (Code)
          </label>
          <Input
            type="text"
            placeholder="例如: racknerd, dmit"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            disabled={isEdit || loading}
            required
          />
          {isEdit && <p className="text-xs text-gray-400 mt-1">商家标识创建后不可修改</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            商家名称
          </label>
          <Input
            type="text"
            placeholder="例如: RackNerd"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
            官网网址
          </label>
          <Input
            type="url"
            placeholder="https://example.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={loading}
            required
          />
        </div>

        <div className="pt-2 space-y-4">
          <div>
            <label className="flex items-center space-x-2 cursor-pointer">
              <Checkbox
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={loading}
              />
              <span className="text-sm font-medium text-gray-700">公开展示该商家</span>
            </label>
            {!enabled && (
              <p className="text-xs text-amber-600 mt-1.5 pl-6">
                停用提醒：商家停用后，其名下所有 VPS 套餐均将从公开前台隐藏（管理后台仍可见）。
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
                <span className="text-sm font-medium text-gray-700 block">允许采集该商家</span>
                <span className="text-xs text-gray-400 block mt-0.5">
                  商家级采集许可。实际采集需要全局、商家、VPS 三级均开启；上级关闭时此处配置依旧保留。
                </span>
              </div>
            </label>
            {globalCollectionEnabled === false && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2">
                受全局开关限制：当前全局采集已停用，开启后本商家的采集配置才会生效。
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={loading}>
            取消
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            {isEdit ? '保存更改' : '创建商家'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
