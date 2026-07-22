import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = '@siga_offline_cred_';

/**
 * Suporte a login offline.
 * Após um login online com sucesso guardamos uma "impressão" da palavra-passe
 * (hash SHA-256 com salt) por email + um snapshot do utilizador autenticado.
 * Quando o utilizador tenta autenticar-se sem rede, comparamos a senha
 * introduzida com o hash guardado e — se baterem — restauramos a sessão a
 * partir desse snapshot, sem dependerem do `lastUser` em cache.
 *
 * IMPORTANTE: esta credencial offline serve apenas para reabrir a sessão local
 * já anteriormente autenticada pelo servidor — não substitui o login online,
 * nem dá novos privilégios. As operações de escrita feitas offline ficam na
 * fila e só são executadas quando a ligação volta (com o token).
 */

export interface OfflineUserSnapshot {
  id: string;
  nome: string;
  email: string;
  role: string;
  escola?: string;
  avatar?: string;
}

interface StoredEntry {
  v: 2;
  hash: string;
  user: OfflineUserSnapshot;
  savedAt: string;
}

export type CheckResult =
  | { ok: true; user: OfflineUserSnapshot }
  | { ok: false; reason: 'no-credential' | 'wrong-password' | 'storage-error' };

async function sha256(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && (crypto as any).subtle?.digest) {
    const enc = new TextEncoder().encode(input);
    const buf = await (crypto as any).subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

function makeKey(email: string) {
  return KEY_PREFIX + email.toLowerCase().trim();
}

export async function saveOfflineCredential(
  email: string,
  senha: string,
  user?: OfflineUserSnapshot
): Promise<void> {
  try {
    const emailLc = email.toLowerCase().trim();
    const hash = await sha256(`${emailLc}::${senha}`);
    if (user) {
      const entry: StoredEntry = {
        v: 2,
        hash,
        user: { ...user, email: user.email || emailLc },
        savedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(makeKey(emailLc), JSON.stringify(entry));
    } else {
      // Compatibilidade — guarda só o hash quando o snapshot ainda não está disponível.
      await AsyncStorage.setItem(makeKey(emailLc), hash);
    }
  } catch {
    // ignora — não é fatal
  }
}

export async function checkOfflineCredential(email: string, senha: string): Promise<CheckResult> {
  try {
    const stored = await AsyncStorage.getItem(makeKey(email));
    if (!stored) return { ok: false, reason: 'no-credential' };
    const hash = await sha256(`${email.toLowerCase().trim()}::${senha}`);
    // Formato novo (v2): JSON com hash + user.
    if (stored.startsWith('{')) {
      try {
        const entry = JSON.parse(stored) as StoredEntry;
        if (entry?.hash !== hash) return { ok: false, reason: 'wrong-password' };
        if (!entry.user) return { ok: false, reason: 'no-credential' };
        return { ok: true, user: entry.user };
      } catch {
        return { ok: false, reason: 'storage-error' };
      }
    }
    // Formato antigo (v1): apenas a string de hash. Verificamos só o hash;
    // o caller decide se consegue restaurar a sessão a partir do `lastUser`.
    if (stored === hash) {
      return { ok: true, user: { id: '', nome: '', email: email.toLowerCase().trim(), role: '' } };
    }
    return { ok: false, reason: 'wrong-password' };
  } catch {
    return { ok: false, reason: 'storage-error' };
  }
}

export async function clearOfflineCredential(email: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(makeKey(email));
  } catch { /* ignore */ }
}

export async function hasOfflineCredential(email: string): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(makeKey(email));
    return !!stored;
  } catch {
    return false;
  }
}
