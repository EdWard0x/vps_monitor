import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { SettingsProvider } from './app/SettingsContext';
import { AuthProvider } from './app/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { ErrorBoundary } from './app/ErrorBoundary';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
};
