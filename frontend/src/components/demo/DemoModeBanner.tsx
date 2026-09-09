import React from 'react';
import { useSettings } from '@/app/SettingsContext';
import { Info } from 'lucide-react';

export const DemoModeBanner: React.FC = () => {
  const { settings } = useSettings();

  if (!settings?.demo_mode) {
    return null;
  }

  return (
    <div className="bg-amber-500 text-white text-xs py-1 px-4 text-center font-medium shadow-sm flex items-center justify-center space-x-1.5 select-none">
      <Info className="w-3.5 h-3.5 shrink-0" />
      <span>
        当前处于演示模式：所有套餐指标、价格、库存及商品链接均为模拟数据，未验证真实性。
      </span>
    </div>
  );
};
