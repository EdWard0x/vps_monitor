import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import { SettingsProvider } from './SettingsContext';
import { AuthProvider } from './AuthContext';
import { ToastProvider } from '@/components/ui/Toast';

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
};
