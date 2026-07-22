import React, { createContext, useContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeJwtPayload } from '@/lib/jwtDecode';
import { PRODUCTION_URL } from '@/lib/server-config';

function getAuthApiBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, '');
  if (typeof document !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return PRODUCTION_URL;
}

export type UserRole = 'ceo' | 'pca' | 'admin' | 'director' | 'chefe_secretaria' | 'secretaria' | 'professor' | 'diretor_turma' | 'subdiretor_administrativo' | 'aluno' | 'financeiro' | 'encarregado' | 'rh' | 'pedagogico' | 'coordenador_curso';

export interface AuthUser {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  escola: string;
  telefone?: string;
  avatar?: string;
  biometricEnabled: boolean;
  alunoId?: string;
  genero?: 'M' | 'F' | '';
  dataNascimento?: string; // YYYY-MM-DD (vinda de alunos.dataNascimento ou funcionarios.dataNascimento)
  cursoId?: string; // coordenador_curso: ID do curso coordenado
}

interface AuthContextValue {
  user: AuthUser | null;
  lastUser: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  loggedInOffline: boolean;
  login: (user: AuthUser, opts?: { offline?: boolean }) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<AuthUser>) => Promise<void>;
  setBiometric: (enabled: boolean) => Promise<void>;
  clearLastUser: () => Promise<void>;
  markSessionVerified: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = '@siga_user';
const LAST_USER_KEY = '@siga_last_user';
const TOKEN_KEY = '@siga_token';

function normalizeSchoolName(value?: string | null) {
  const raw = String(value ?? '').trim();
  const legacy = raw.toLowerCase().replace(/\s+/g, ' ');
  if (!raw || legacy === 'queta' || legacy === 'queta school' || legacy === 'queta, school' || legacy === 'siga school') {
    return 'Super Escola';
  }
  return raw;
}

function normalizeAuthUser(authUser: AuthUser): AuthUser {
  return { ...authUser, escola: normalizeSchoolName(authUser.escola) };
}

export async function saveAuthToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  try { return await AsyncStorage.getItem(TOKEN_KEY); }
  catch { return null; }
}

export async function clearAuthToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

// Fields that are persisted server-side (not device-local)
const SERVER_FIELDS: (keyof AuthUser)[] = ['nome', 'email', 'telefone', 'escola', 'avatar'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [lastUser, setLastUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loggedInOffline, setLoggedInOffline] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  // Quando a fila offline drena com sucesso, a sessão deixa de ser "local"
  // (já contactámos o servidor com este token).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onSync = () => setLoggedInOffline(false);
    window.addEventListener('siga:online-sync', onSync);
    return () => window.removeEventListener('siga:online-sync', onSync);
  }, []);

  // Handler global: quando qualquer parte da app recebe 401, tenta renovar o token.
  // Se a renovação falhar, faz logout automático para forçar novo login.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onSessionExpired = async () => {
      const current = await getAuthToken();
      if (!current) { await logout(); return; }
      try {
        const base = getAuthApiBase();
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 10_000);
        try {
          const res = await fetch(`${base}/api/auth/refresh`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${current}` },
            credentials: 'include',
            signal: controller.signal,
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.token) { await saveAuthToken(data.token); return; }
          }
        } finally {
          clearTimeout(t);
        }
      } catch {}
      // Renovação falhou — sessão inválida, forçar logout
      await logout();
    };
    window.addEventListener('siga:session-expired', onSessionExpired);
    return () => window.removeEventListener('siga:session-expired', onSessionExpired);
  }, []);

  // Temporizador proactivo: renova o token JWT 2 horas antes de expirar.
  // Reprograma-se automaticamente após cada renovação bem-sucedida.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      return;
    }

    let cancelled = false;

    async function doRefreshToken(): Promise<string | null> {
      const current = await getAuthToken();
      if (!current) return null;
      const base = getAuthApiBase();
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(`${base}/api/auth/refresh`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${current}` },
          credentials: 'include',
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data?.token) return null;
        await saveAuthToken(data.token);
        return data.token as string;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    }

    async function scheduleNextRefresh() {
      if (cancelled) return;
      const token = await getAuthToken();
      if (!token) return;
      try {
        const payload = decodeJwtPayload(token);
        if (!payload?.exp) return;
        const expiresAt = (payload.exp as number) * 1000;
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const delay = Math.max(0, expiresAt - TWO_HOURS - Date.now());
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(async () => {
          if (cancelled) return;
          const newToken = await doRefreshToken();
          if (newToken && !cancelled) scheduleNextRefresh();
        }, Math.min(delay, 2_147_483_647));
      } catch {}
    }

    scheduleNextRefresh();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [user]);

  // Heartbeat — informa o servidor que o utilizador está online (a cada 30 s)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!user) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      return;
    }
    async function sendHeartbeat() {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const base = getAuthApiBase();
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8_000);
        try {
          await fetch(`${base}/api/sessoes/heartbeat`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'include',
            signal: controller.signal,
          });
        } finally {
          clearTimeout(t);
        }
      } catch {}
    }
    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 30_000);
    return () => { if (heartbeatRef.current) clearInterval(heartbeatRef.current); };
  }, [user?.id]);

  async function loadUser() {
    try {
      const [raw, lastRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(LAST_USER_KEY),
      ]);
      if (raw) {
        const parsed = normalizeAuthUser(JSON.parse(raw));
        setUser(parsed);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));

        // Refresh token on startup if expired or expiring within 24h
        const token = await getAuthToken();
        if (token) {
          try {
            const jwtPayload = decodeJwtPayload(token);
            if (jwtPayload) {
              const expiresAt = ((jwtPayload.exp as number) || 0) * 1000;
              const ONE_DAY = 24 * 60 * 60 * 1000;
              const isExpired = Date.now() > expiresAt;
              const needsRefresh = Date.now() > expiresAt - ONE_DAY;
              if (needsRefresh) {
                const base = getAuthApiBase();
                const controller = new AbortController();
                const refreshTimeout = setTimeout(() => controller.abort(), 10_000);
                try {
                  const res = await fetch(`${base}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    credentials: 'include',
                    signal: controller.signal,
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data?.token) await saveAuthToken(data.token);
                  } else if (isExpired) {
                    await AsyncStorage.multiRemove([STORAGE_KEY, LAST_USER_KEY, TOKEN_KEY]);
                    setUser(null);
                    setLastUser(null);
                  }
                } catch {
                  // Timeout ou rede indisponível — continuar sem renovar token
                } finally {
                  clearTimeout(refreshTimeout);
                }
              }
            }
          } catch {}
        }
      }
      if (lastRaw) {
        const parsedLast = normalizeAuthUser(JSON.parse(lastRaw));
        setLastUser(parsedLast);
        await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(parsedLast));
      }
    } catch (e) {
      console.error('Failed to load user', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(authUser: AuthUser, opts?: { offline?: boolean }) {
    const normalized = normalizeAuthUser(authUser);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(normalized));
    setUser(normalized);
    setLastUser(normalized);
    setLoggedInOffline(!!opts?.offline);
    if (Platform.OS === 'web' && !opts?.offline) {
      window.dispatchEvent(new CustomEvent('siga:online-sync'));
    }
  }

  function markSessionVerified() {
    setLoggedInOffline(false);
  }

  async function logout() {
    await AsyncStorage.multiRemove([STORAGE_KEY, LAST_USER_KEY, TOKEN_KEY]);
    setUser(null);
    setLastUser(null);
    setLoggedInOffline(false);
  }

  async function updateUser(updates: Partial<AuthUser>) {
    if (!user) return;
    const updated = normalizeAuthUser({ ...user, ...updates });

    // Determine which fields need to be persisted to the server
    const serverUpdates: Record<string, unknown> = {};
    for (const field of SERVER_FIELDS) {
      if (field in updates) serverUpdates[field] = updates[field];
    }

    // Call the server API if there are server-side fields to update
    let serverData: Partial<AuthUser> | null = null;
    if (Object.keys(serverUpdates).length > 0) {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const res = await fetch('/api/perfil', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(serverUpdates),
        });
        const resJson = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((resJson as any)?.error || 'Erro ao actualizar perfil.');
        }
        // Use server-returned values as source of truth
        serverData = resJson as Partial<AuthUser>;
      } catch (apiErr) {
        console.warn('[AuthContext] updateUser API error:', apiErr);
        throw apiErr;
      }
    }

    // Merge server data (source of truth) over local computed update
    const final = normalizeAuthUser(serverData
      ? { ...updated, ...serverData }
      : updated
    );

    // Update local storage and state
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(final));
    await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(final));
    setUser(final);
    setLastUser(final);
  }

  async function setBiometric(enabled: boolean) {
    if (!user) return;
    const updated = { ...user, biometricEnabled: enabled };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    await AsyncStorage.setItem(LAST_USER_KEY, JSON.stringify(updated));
    setUser(updated);
    setLastUser(updated);
  }

  async function clearLastUser() {
    await AsyncStorage.removeItem(LAST_USER_KEY);
    setLastUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      lastUser,
      isLoading,
      isAuthenticated: !!user,
      loggedInOffline,
      login,
      logout,
      updateUser,
      setBiometric,
      clearLastUser,
      markSessionVerified,
    }),
    [user, lastUser, isLoading, loggedInOffline]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const AUTHORIZED_APPROVER_ROLES: UserRole[] = ['ceo', 'pca', 'admin', 'director', 'chefe_secretaria'];
