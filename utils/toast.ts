import { Platform } from 'react-native';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (msg: string, type: ToastType, duration?: number) => void;

let _listener: ToastListener | null = null;
let _idCounter = 0;

export function registerToastListener(fn: ToastListener) {
  _listener = fn;
}

export function unregisterToastListener() {
  _listener = null;
}

export function showToast(message: string, type: ToastType = 'error', duration = 3500) {
  if (_listener) {
    _listener(message, type, duration);
  } else {
    if (Platform.OS === 'web') {
      console.warn('[Toast]', message);
    }
  }
}

export function alertErro(titulo: string, mensagem?: string) {
  showToast(mensagem ? `${titulo}: ${mensagem}` : titulo, 'error');
}

export function alertSucesso(titulo: string, mensagem?: string) {
  showToast(mensagem ? `${titulo}: ${mensagem}` : titulo, 'success');
}

export function alertInfo(titulo: string, mensagem?: string) {
  showToast(mensagem ? `${titulo}: ${mensagem}` : titulo, 'info');
}
