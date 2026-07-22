import React, { createContext, useContext, ReactNode } from 'react';
import { showToast, ToastType } from '@/utils/toast';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast });

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}
