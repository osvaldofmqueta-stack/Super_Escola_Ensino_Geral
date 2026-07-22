import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emitDataChange } from '@/lib/realtimeSync';

export type WSEventType =
  | 'sessions_updated'
  | 'activity_event'
  | 'data_change'
  | 'connected'
  | 'pong'
  | 'presence_update'
  | 'typing';

export interface WSEvent {
  type: WSEventType;
  ts?:  number;
  event?: unknown;
  entity?: string;
  onlineIds?: string[];
  fromUserId?: string;
  fromUserName?: string;
  isTyping?: boolean;
}

type SendFn = (msg: object) => void;

const sendRegistry = new Map<string, SendFn>();

export function registerWsSend(userId: string, fn: SendFn): void {
  sendRegistry.set(userId, fn);
}

export function unregisterWsSend(userId: string): void {
  sendRegistry.delete(userId);
}

export function sendWsMessage(userId: string, msg: object): void {
  sendRegistry.get(userId)?.(msg);
}

type Handler = (data: WSEvent) => void;

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

function getWsUrl(): string {
  if (Platform.OS === 'web') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return '';
}

export function useRealtimeSocket(
  userRole: string | undefined,
  onEvent?: Handler,
): { sendWs: (msg: object) => void } {
  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const aliveRef   = useRef(false);
  const handlerRef = useRef<Handler | undefined>(onEvent);

  handlerRef.current = onEvent;

  const sendWs = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current);  timerRef.current = null; }
    if (pingRef.current)  { clearInterval(pingRef.current);  pingRef.current  = null; }
  }, []);

  const connect = useCallback(async () => {
    if (Platform.OS !== 'web') return;
    if (!userRole) return;

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    let token: string | null = null;
    try { token = await AsyncStorage.getItem('@siga_token'); } catch { /* ignore */ }
    if (!token) return;

    clearTimers();

    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
    } catch {
      return;
    }

    wsRef.current = ws;
    aliveRef.current = false;

    ws.onopen = () => {
      retryRef.current = 0;
      aliveRef.current = true;

      // Registar função de envio global para uso fora do hook
      if (userRole) {
        registerWsSend(userRole + '_ws', (msg) => {
          if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
          }
        });
      }

      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'ping' })); } catch { /* ignore */ }
        }
      }, 20_000);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as WSEvent;
        // Dispatch data_change events to the global bus
        if (data.type === 'data_change' && data.entity) {
          emitDataChange(data.entity);
        }
        handlerRef.current?.(data);
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      clearTimers();
      wsRef.current = null;

      const delay = BACKOFF_DELAYS[Math.min(retryRef.current, BACKOFF_DELAYS.length - 1)];
      retryRef.current++;
      timerRef.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };
  }, [userRole, clearTimers]);

  useEffect(() => {
    connect();
    return () => {
      clearTimers();
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [connect, clearTimers]);

  return { sendWs };
}
