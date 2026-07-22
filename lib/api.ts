import { getApiUrl } from './query-client';
import { getAuthToken, saveAuthToken } from '../context/AuthContext';
import { enqueueOperation, isNetworkError } from './offlineQueue';
import { syncProgress } from './syncProgress';
import { getTokenExpiry, tokenExpiresWithin } from './jwtDecode';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SKIP_QUEUE_ROUTES = ['/api/login', '/api/logout', '/api/auth', '/api/register', '/api/licenca'];

function shouldQueue(method: string, route: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  return !SKIP_QUEUE_ROUTES.some((r) => route.startsWith(r));
}

function offlineQueuedResult<T>(path: string): T {
  return {
    ok: true,
    offlineQueued: true,
    message: 'Sem internet: alteração guardada neste dispositivo e será sincronizada automaticamente.',
    path,
  } as T;
}



/** Singleton refresh promise — prevents concurrent refresh calls. */
let _refreshPromise: Promise<string | null> | null = null;

async function _doRefresh(): Promise<string | null> {
  const currentToken = await getAuthToken();
  if (!currentToken) return null;
  const base = getApiUrl();
  try {
    const res = await fetch(new URL('/api/auth/refresh', base).toString(), {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}` },
      credentials: 'include',
    });
    if (!res.ok) return null;
    const data = await res.json() as { token?: string };
    if (!data.token) return null;
    await saveAuthToken(data.token);
    return data.token;
  } catch {
    return null;
  }
}

/** Silently refresh the JWT. Returns the new token or null if it failed. */
export function refreshAccessToken(): Promise<string | null> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefresh().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

/** Proactively refresh if token expires within 2 hours. Safe to call often. */
export async function proactiveRefreshIfNeeded(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  if (tokenExpiresWithin(token, TWO_HOURS)) {
    await refreshAccessToken();
  }
}


async function req<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options?: { skipQueue?: boolean }
): Promise<T> {
  const base = getApiUrl();
  const url = new URL(path, base).toString();

  const token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const stopProgress = syncProgress.start();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include',
    });

    if (res.status === 401) {
      // Session may have expired — try a silent refresh once, then retry.
      const newToken = await refreshAccessToken();
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const retryRes = await fetch(url, {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'include',
        });
        if (!retryRes.ok) {
          const text = await retryRes.text().catch(() => retryRes.statusText);
          throw new Error(`${retryRes.status}: ${text}`);
        }
        return retryRes.json() as Promise<T>;
      }
      // Refresh failed — dispatch session-expired so AuthContext triggers logout
      // and stops all polling intervals.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('siga:session-expired'));
      }
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${text}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (
      !options?.skipQueue &&
      shouldQueue(method, path) &&
      isNetworkError(err)
    ) {
      await enqueueOperation({ method, path, body });
      return offlineQueuedResult<T>(path);
    }
    throw err;
  } finally {
    stopProgress();
  }
}

export const api = {
  get:    <T>(path: string)                               => req<T>('GET',    path),
  post:   <T>(path: string, body: unknown)                => req<T>('POST',   path, body),
  put:    <T>(path: string, body: unknown)                => req<T>('PUT',    path, body),
  patch:  <T>(path: string, body: unknown)                => req<T>('PATCH',  path, body),
  delete: <T>(path: string, options?: { skipQueue?: boolean }) => req<T>('DELETE', path, undefined, options),
};
