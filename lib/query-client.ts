import { fetch as expoFetch } from "expo/fetch";
import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { enqueueOperation, isNetworkError } from "./offlineQueue";
import { getAuthToken, saveAuthToken } from "@/context/AuthContext";
import { syncProgress } from "./syncProgress";
import { saveToCache, loadFromCache } from "./offlineCache";
import { getStoredServerUrl, PRODUCTION_URL } from "./server-config";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const SKIP_QUEUE_ROUTES = ["/api/login", "/api/logout", "/api/auth", "/api/register", "/api/licenca"];

function shouldQueue(method: string, route: string): boolean {
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  return !SKIP_QUEUE_ROUTES.some((r) => route.startsWith(r));
}

function offlineQueuedResponse(route: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      offlineQueued: true,
      message: "Sem internet: alteração guardada neste dispositivo e será sincronizada automaticamente.",
      route,
    }),
    {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        "X-SIGA-Offline-Queued": "true",
      },
    },
  );
}

function request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    return window.fetch(input, init);
  }

  return expoFetch(input as string, init);
}

function isCapacitorWebView(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) return true;
  if (window.location.protocol === "capacitor:") return true;
  if (
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
    window.location.port === "" &&
    typeof (window as any).Capacitor !== "undefined"
  ) return true;
  return false;
}

export function getApiUrl(): string {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const { protocol, hostname, port } = window.location;
    const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

    if (configuredApiUrl) {
      return configuredApiUrl;
    }

    if (isCapacitorWebView()) {
      const stored = getStoredServerUrl();
      return stored || PRODUCTION_URL;
    }

    if ((hostname === "localhost" || hostname === "127.0.0.1") && port === "8000") {
      return `${protocol}//${hostname}:5000`;
    }

    if (hostname.endsWith(".replit.dev")) {
      return window.location.origin;
    }

    return window.location.origin;
  }

  const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (configuredApiUrl) {
    return configuredApiUrl.replace(/\/$/, "");
  }

  let host = process.env.EXPO_PUBLIC_DOMAIN;

  if (!host) {
    return PRODUCTION_URL;
  }

  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host.replace(/\/$/, "");
  }

  let url = new URL(`https://${host}`);

  return url.href.replace(/\/$/, "");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

let _refreshPromiseQC: Promise<string | null> | null = null;

async function silentRefresh(currentToken: string): Promise<string | null> {
  if (_refreshPromiseQC) return _refreshPromiseQC;
  _refreshPromiseQC = (async () => {
    try {
      const baseUrl = getApiUrl();
      const res = await request(new URL('/api/auth/refresh', baseUrl).toString(), {
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
  })().finally(() => { _refreshPromiseQC = null; });
  return _refreshPromiseQC;
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
  options?: { skipQueue?: boolean }
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  let token = await getAuthToken();
  const headers: Record<string, string> = {};
  if (data) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const stopProgress = syncProgress.start();
  try {
    const res = await request(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    if (res.status === 401 && token && !route.startsWith('/api/auth')) {
      const newToken = await silentRefresh(token);
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const retryRes = await request(url.toString(), {
          method,
          headers: retryHeaders,
          body: data ? JSON.stringify(data) : undefined,
          credentials: 'include',
        });
        await throwIfResNotOk(retryRes);
        return retryRes;
      }
      // Refresh failed — dispatch session-expired so AuthContext triggers logout
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('siga:session-expired'));
      }
    }

    await throwIfResNotOk(res);
    return res;
  } catch (err) {
    if (
      !options?.skipQueue &&
      shouldQueue(method, route) &&
      isNetworkError(err)
    ) {
      await enqueueOperation({ method, path: route, body: data });
      return offlineQueuedResponse(route);
    }
    throw err;
  } finally {
    stopProgress();
  }
}

/** Marcador especial nos dados servidos a partir de cache offline. */
export const CACHE_MARKER = '__fromOfflineCache__';

export function isFromCache(data: unknown): boolean {
  return (
    data !== null &&
    typeof data === 'object' &&
    CACHE_MARKER in (data as Record<string, unknown>)
  );
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const route = queryKey.join("/") as string;
    const url = new URL(route, baseUrl);

    let token = await getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      let res = await request(url.toString(), {
        headers,
        credentials: "include",
      });

      if (res.status === 401 && token && !route.startsWith('/api/auth')) {
        const newToken = await silentRefresh(token);
        if (newToken) {
          res = await request(url.toString(), {
            headers: { ...headers, Authorization: `Bearer ${newToken}` },
            credentials: "include",
          });
        }
      }

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const json = await res.json();

      saveToCache(route, json).catch(() => {});

      return json;
    } catch (err) {
      if (isNetworkError(err)) {
        const cached = await loadFromCache(route);
        if (cached !== null) {
          const data = cached.data;
          if (Array.isArray(data)) {
            return [...data, { [CACHE_MARKER]: true, _cachedAt: cached.cachedAt }] as unknown as T;
          }
          if (data !== null && typeof data === 'object') {
            return { ...(data as object), [CACHE_MARKER]: true, _cachedAt: cached.cachedAt } as unknown as T;
          }
          return data as T;
        }
      }
      throw err;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
