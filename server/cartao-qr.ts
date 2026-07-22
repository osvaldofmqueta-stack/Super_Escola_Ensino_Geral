import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 45;

// Segredo de fallback para dev — gerado uma vez no arranque do módulo (consistente na sessão)
const _devFallbackSecret =
  process.env.NODE_ENV === 'development'
    ? crypto.randomBytes(32).toString('hex')
    : null;

function getSecret(): string {
  const s =
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    _devFallbackSecret ||
    '';
  if (!s) {
    throw new Error(
      'JWT_SECRET não configurado — necessário para assinar QR do cartão'
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface CardTokenPayload {
  aId: string;
  ano: string;
  iat: number;
  exp: number;
  nonce: string;
}

export function generateCardToken(
  alunoId: string,
  anoLetivo: string
): { token: string; expiresAt: number } {
  const now = Math.floor(Date.now() / 1000);
  const payload: CardTokenPayload = {
    aId: alunoId,
    ano: anoLetivo,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(6).toString('hex'),
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  const sigB64 = b64url(sig).slice(0, 22);
  return {
    token: `SIGAC1.${payloadB64}.${sigB64}`,
    expiresAt: payload.exp * 1000,
  };
}

export interface CardTokenVerifyResult {
  ok: boolean;
  payload?: CardTokenPayload;
  error?: 'formato_invalido' | 'assinatura_invalida' | 'expirado' | 'futuro';
}

export function verifyCardToken(token: string): CardTokenVerifyResult {
  if (!token || typeof token !== 'string') return { ok: false, error: 'formato_invalido' };
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'SIGAC1') return { ok: false, error: 'formato_invalido' };

  const [, payloadB64, sigB64] = parts;
  let expectedSig: string;
  try {
    expectedSig = b64url(
      crypto.createHmac('sha256', getSecret()).update(payloadB64).digest()
    ).slice(0, 22);
  } catch {
    return { ok: false, error: 'formato_invalido' };
  }

  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'assinatura_invalida' };
  }

  let payload: CardTokenPayload;
  try {
    payload = JSON.parse(fromB64url(payloadB64).toString('utf8'));
  } catch {
    return { ok: false, error: 'formato_invalido' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now - 5) return { ok: false, payload, error: 'expirado' };
  if (payload.iat > now + 30) return { ok: false, payload, error: 'futuro' };

  return { ok: true, payload };
}

export const CARTAO_QR_TTL_SECONDS = TOKEN_TTL_SECONDS;
