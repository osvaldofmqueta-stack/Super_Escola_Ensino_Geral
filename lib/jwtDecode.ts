/**
 * Decode JWT payload without verifying signature.
 * Compatible with React Native (no atob polyfill needed).
 * For client-side expiry checks only — never trust for auth decisions.
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  try {
    if (typeof atob === 'function') {
      return atob(base64);
    }
    return Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const decoded = base64UrlDecode(parts[1]);
    if (!decoded) return null;
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function getTokenExpiry(token: string): number | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
}

export function isTokenExpired(token: string): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return true;
  return Date.now() >= exp;
}

export function tokenExpiresWithin(token: string, ms: number): boolean {
  const exp = getTokenExpiry(token);
  if (!exp) return true;
  return Date.now() + ms >= exp;
}
