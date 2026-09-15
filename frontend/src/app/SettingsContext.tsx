import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { PublicSettings } from '@/types/settings';
import * as settingsApi from '@/api/settings';

const DEFAULT_SETTINGS: PublicSettings = {
  site_name: 'VPS 库存监控',
  registration_enabled: true,
};

interface SettingsContextType {
  settings: PublicSettings | null;
  loading: boolean;
  error: Error | null;
  reloadSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PublicSettings | null>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await settingsApi.getPublicSettings();
      setSettings(res.data);
    } catch (err: unknown) {
      // 若后端 501 未实现或离线，保持默认基本配置
      setSettings(DEFAULT_SETTINGS);
      setError(err instanceof Error ? err : new Error('加载站点设置失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, error, reloadSettings: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
