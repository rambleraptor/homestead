/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useCallback } from 'react';
import type { ReactNode } from 'react';
import { toast as sonnerToast } from 'sonner';
import { Toaster } from '@/shared/components/ui/sonner';
import type { ToastType } from '@/shared/types/toast';

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const showToast = useCallback(
    (type: ToastType, message: string, duration?: number) => {
      const options = duration ? { duration } : undefined;

      switch (type) {
        case 'success':
          sonnerToast.success(message, options);
          break;
        case 'error':
          sonnerToast.error(message, options);
          break;
        case 'info':
          sonnerToast.info(message, options);
          break;
        case 'warning':
          sonnerToast.warning(message, options);
          break;
      }
    },
    []
  );

  const success = useCallback(
    (message: string, duration?: number) => showToast('success', message, duration),
    [showToast]
  );

  const error = useCallback(
    (message: string, duration?: number) => showToast('error', message, duration),
    [showToast]
  );

  const info = useCallback(
    (message: string, duration?: number) => showToast('info', message, duration),
    [showToast]
  );

  const warning = useCallback(
    (message: string, duration?: number) => showToast('warning', message, duration),
    [showToast]
  );

  const value = { showToast, success, error, info, warning };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
