import React from 'react';
import { useSettings } from '@/app/SettingsContext';

export const Footer: React.FC = () => {
  const { settings } = useSettings();

  return (
    <footer className="border-t border-gray-200 bg-white py-6 mt-auto text-xs text-gray-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>© 2026 {settings?.site_name || 'VPS 库存监控系统'} · 前后端分离架构</p>
        <p className="text-gray-400">
          基于 React + TypeScript + Tailwind CSS · 状态码及数据契约严格遵从 OpenAPI 3.1
        </p>
      </div>
    </footer>
  );
};
