import { enqueueOperation, isNetworkError } from './offlineQueue';
import { getStoredServerUrl, getDefaultServerUrl } from './server-config';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_QUEUE_ROUTES = [
  '/api/login',
  '/api/logout',
  '/api/auth',
  '/api/register',
  '/api/licenca',
  '/api/upload',
  '/api/public',
  '/api/check-credentials',
  '/api/login-provisorio',
  '/api/reset-password',
'/api/notificacoes/gerar-alertas',
  '/api/ai-feedback',
  '/api/ai-status',
];

let installed = false;

function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
  if (
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port === '' &&
    typeof (window as any).Capacitor !== 'undefined'
  ) return true;
  return false;
}

function getCapacitorServerBase(): string {
  const stored = getStoredServerUrl();
  return stored || getDefaultServerUrl();
}

function rewriteUrlForCapacitor(input: RequestInfo | URL): RequestInfo | URL {
  if (!isCapacitorNative()) return input;

  const rawUrl = input instanceof Request ? input.url : String(input);

  if (rawUrl.startsWith('/')) {
    const base = getCapacitorServerBase();
    const absoluteUrl = base + rawUrl;
    if (input instanceof Request) {
      return new Request(absoluteUrl, input);
    }
    return absoluteUrl;
  }

  return input;
}

export function installOfflineFetchInterceptor() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rewritten = rewriteUrlForCapacitor(input);
    const info = await getRequestInfo(rewritten, init);

    try {
      return await originalFetch(rewritten, init);
    } catch (err) {
      if (info && isNetworkError(err)) {
        await enqueueOperation({
          method: info.method,
          path: info.path,
          body: info.body,
        });
        return new Response(
          JSON.stringify({
            ok: true,
            offlineQueued: true,
            message: 'Sem internet: alteração guardada neste dispositivo e será sincronizada automaticamente.',
            path: info.path,
          }),
          {
            status: 202,
            headers: {
              'Content-Type': 'application/json',
              'X-SIGA-Offline-Queued': 'true',
            },
          },
        );
      }
      throw err;
    }
  };
}

async function getRequestInfo(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<{ method: string; path: string; body?: unknown } | null> {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (!WRITE_METHODS.has(method)) return null;

  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  if (headers.get('X-SIGA-Offline-Replay') === 'true') return null;

  const rawUrl = input instanceof Request ? input.url : String(input);
  const origin = (typeof window !== 'undefined') ? (isCapacitorNative() ? getCapacitorServerBase() : window.location.origin) : '';
  const url = new URL(rawUrl, origin);
  const serverBase = isCapacitorNative() ? getCapacitorServerBase() : window.location.origin;
  const serverUrl = new URL(serverBase);
  if (url.hostname !== serverUrl.hostname) return null;
  if (!url.pathname.startsWith('/api/')) return null;
  if (SKIP_QUEUE_ROUTES.some((route) => url.pathname.startsWith(route))) return null;

  const body = await extractSerializableBody(input, init);
  if (body === undefined && method !== 'DELETE') return null;

  return {
    method,
    path: `${url.pathname}${url.search}`,
    body,
  };
}

async function extractSerializableBody(input: RequestInfo | URL, init?: RequestInit): Promise<unknown | undefined> {
  const body = init?.body;

  if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || body instanceof URLSearchParams) {
    return undefined;
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return undefined;
    }
  }

  if (body && typeof body === 'object') {
    return body;
  }

  if (input instanceof Request) {
    const contentType = input.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return undefined;
    const text = await input.clone().text().catch(() => '');
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  return undefined;
}
