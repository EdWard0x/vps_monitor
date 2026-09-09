import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SettingsPublic } from '@/types/api';
import { apiClient } from '@/lib/http/client';

interface SettingsContextType {
  settings: SettingsPublic | null;
  loading: boolean;
  error: Error | null;
  reloadSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<SettingsPublic>('/settings');
      setSettings(res.data);
    } catch (err: unknown) {
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
