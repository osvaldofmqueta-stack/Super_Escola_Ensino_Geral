import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { verifyToken } from './auth';

interface WSClient {
  ws:     WebSocket;
  userId: string;
  role:   string;
  alive:  boolean;
}

const clients = new Map<string, WSClient>();

export function initWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const rawUrl = req.url ?? '';
    const qIdx = rawUrl.indexOf('?');
    const qs = qIdx >= 0 ? rawUrl.slice(qIdx + 1) : '';
    const params = new URLSearchParams(qs);
    const token = params.get('token');

    if (!token) { ws.close(4001, 'no token'); return; }

    const payload = verifyToken(token);
    if (!payload) { ws.close(4001, 'invalid token'); return; }

    const client: WSClient = { ws, userId: payload.userId, role: payload.role, alive: true };
    clients.set(payload.userId, client);

    try { ws.send(JSON.stringify({ type: 'connected', userId: payload.userId })); } catch { /* ignore */ }

    // Notifica todos os clientes que este utilizador ficou online
    broadcastPresence();

    ws.on('pong', () => { client.alive = true; });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else if (msg.type === 'typing_start' && msg.toUserId) {
          // Reencaminhar indicador "a escrever" para o destinatário
          const target = clients.get(msg.toUserId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            try {
              target.ws.send(JSON.stringify({
                type: 'typing',
                fromUserId: payload.userId,
                fromUserName: msg.fromUserName ?? '',
                isTyping: true,
                ts: Date.now(),
              }));
            } catch { /* ignore */ }
          }
        } else if (msg.type === 'typing_stop' && msg.toUserId) {
          // Parar indicador "a escrever"
          const target = clients.get(msg.toUserId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            try {
              target.ws.send(JSON.stringify({
                type: 'typing',
                fromUserId: payload.userId,
                fromUserName: msg.fromUserName ?? '',
                isTyping: false,
                ts: Date.now(),
              }));
            } catch { /* ignore */ }
          }
        }
      } catch { /* ignore malformed */ }
    });
    ws.on('close', () => { clients.delete(payload.userId); broadcastPresence(); });
    ws.on('error', () => { clients.delete(payload.userId); broadcastPresence(); });
  });

  const heartbeat = setInterval(() => {
    for (const [uid, c] of clients) {
      if (!c.alive) { c.ws.terminate(); clients.delete(uid); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { clients.delete(uid); }
    }
  }, 25_000);

  wss.on('close', () => clearInterval(heartbeat));

  console.log('[ws] ✅ WebSocket server a ouvir em /ws (todos os roles)');
  return wss;
}

export function broadcastSessionsUpdated(): void {
  broadcast({ type: 'sessions_updated', ts: Date.now() });
}

export function broadcastActivityEvent(event: object): void {
  broadcast({ type: 'activity_event', event, ts: Date.now() });
}

export function broadcastChange(entity: string): void {
  if (clients.size === 0) return;
  broadcast({ type: 'data_change', entity, ts: Date.now() });
}

function broadcast(payload: object): void {
  if (clients.size === 0) return;
  const msg = JSON.stringify(payload);
  for (const [, c] of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      try { c.ws.send(msg); } catch { /* ignore */ }
    }
  }
}

export function getConnectedCount(): number {
  return clients.size;
}

export function getOnlineUserIds(): string[] {
  return Array.from(clients.keys());
}

function broadcastPresence(): void {
  if (clients.size === 0) return;
  broadcast({ type: 'presence_update', onlineIds: Array.from(clients.keys()), ts: Date.now() });
}
