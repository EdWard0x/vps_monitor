import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  type: ToastType;
  message: string;
  title?: string;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  title?: string;
}

interface ToastContextType {
  toast: {
    (options: ToastOptions): void;
    (type: ToastType, message: string): void;
  };
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((arg1: ToastType | ToastOptions, arg2?: string) => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    let item: ToastItem;
    if (typeof arg1 === 'object') {
      item = { id, type: arg1.type, message: arg1.message, title: arg1.title };
    } else {
      item = { id, type: arg1, message: arg2 || '' };
    }

    setToasts((prev) => [...prev, item]);
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  }, [removeToast]);

  const success = useCallback((msg: string) => toast('success', msg), [toast]);
  const error = useCallback((msg: string) => toast('error', msg), [toast]);
  const info = useCallback((msg: string) => toast('info', msg), [toast]);
  const warning = useCallback((msg: string) => toast('warning', msg), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 max-w-sm w-full px-4 sm:px-0 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start justify-between p-3.5 rounded-xl shadow-lg border text-sm font-medium transition-all duration-200 animate-slide-up',
              t.type === 'success' && 'bg-emerald-50 border-emerald-200 text-emerald-800',
              t.type === 'error' && 'bg-rose-50 border-rose-200 text-rose-800',
              t.type === 'warning' && 'bg-amber-50 border-amber-200 text-amber-800',
              t.type === 'info' && 'bg-blue-50 border-blue-200 text-blue-800'
            )}
          >
            <div className="flex items-start space-x-2.5">
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
              {t.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
              {t.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
              <div>
                {t.title && <div className="font-bold text-xs uppercase tracking-wider mb-0.5">{t.title}</div>}
                <div className="text-xs">{t.message}</div>
              </div>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-3 text-gray-400 hover:text-gray-600 p-0.5 rounded"
              aria-label="关闭提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
