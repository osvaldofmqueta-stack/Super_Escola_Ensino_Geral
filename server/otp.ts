/**
 * Serviço OTP — Verificação em 2 Passos
 *
 * Suporta envio via:
 *   1. Africa's Talking SMS (AFRICASTALKING_USERNAME + AFRICASTALKING_API_KEY)
 *   2. Gateway SMS genérico   (SMS_GATEWAY_URL + SMS_GATEWAY_TOKEN opcional)
 *   3. Console log (fallback de desenvolvimento — sempre funciona)
 *
 * Armazenamento em memória com TTL de 5 minutos.
 */

interface OtpEntry {
  code: string;
  expires: number;
  attempts: number;
  userId: string;
  email: string;
  sentAt: number;
}

interface RecoveryEntry {
  email: string;
  expires: number;
}

// ── Stores em memória ────────────────────────────────────────────────────────
const otpStore = new Map<string, OtpEntry>();
const recoveryStore = new Map<string, RecoveryEntry>();

// Limpar entradas expiradas a cada minuto
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpStore.entries()) {
    if (v.expires < now) otpStore.delete(k);
  }
  for (const [k, v] of recoveryStore.entries()) {
    if (v.expires < now) recoveryStore.delete(k);
  }
}, 60_000);

// ── Geração ──────────────────────────────────────────────────────────────────
export function generateOtp(namespace: string, email: string, userId: string): string {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(`${namespace}:${email.toLowerCase()}`, {
    code,
    expires: Date.now() + 5 * 60 * 1000,
    attempts: 0,
    userId,
    email: email.toLowerCase(),
    sentAt: Date.now(),
  });
  return code;
}

// ── Verificação ──────────────────────────────────────────────────────────────
export function verifyOtp(
  namespace: string,
  email: string,
  code: string
): { ok: boolean; reason?: string; userId?: string } {
  const key = `${namespace}:${email.toLowerCase()}`;
  const entry = otpStore.get(key);

  if (!entry) return { ok: false, reason: 'not-found' };
  if (entry.expires < Date.now()) {
    otpStore.delete(key);
    return { ok: false, reason: 'expired' };
  }
  if (entry.attempts >= 5) {
    otpStore.delete(key);
    return { ok: false, reason: 'too-many-attempts' };
  }

  entry.attempts++;

  if (entry.code !== code.trim()) {
    return { ok: false, reason: 'wrong-code' };
  }

  otpStore.delete(key);
  return { ok: true, userId: entry.userId };
}

// ── Cooldown (evitar spam de reenvio) ───────────────────────────────────────
export function canResendOtp(namespace: string, email: string): boolean {
  const entry = otpStore.get(`${namespace}:${email.toLowerCase()}`);
  if (!entry) return true;
  return Date.now() - entry.sentAt >= 60_000;
}

// ── Recovery tokens ──────────────────────────────────────────────────────────
export function createRecoveryToken(email: string): string {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  recoveryStore.set(token, { email: email.toLowerCase(), expires: Date.now() + 15 * 60 * 1000 });
  return token;
}

export function consumeRecoveryToken(token: string): { ok: boolean; email?: string } {
  const entry = recoveryStore.get(token);
  if (!entry || entry.expires < Date.now()) {
    recoveryStore.delete(token);
    return { ok: false };
  }
  recoveryStore.delete(token);
  return { ok: true, email: entry.email };
}

// ── Envio ────────────────────────────────────────────────────────────────────
export async function sendOtp(
  phone: string,
  code: string,
  nomeEscola: string
): Promise<{ ok: boolean; channel: string; error?: string }> {
  // Extrair domínio para Web OTP API (Android Chrome auto-fill)
  // O SMS deve terminar com "\n@dominio.live #CODIGO" para funcionar
  const appUrl  = process.env.APP_URL ?? '';
  const domain  = appUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') || 'liceun303.live';
  const shortMsg = `${nomeEscola}: o seu código de verificação é ${code}. Válido por 5 minutos. Não partilhe.\n\n@${domain} #${code}`;

  // 1. Termii (prioridade — API Key configurada)
  const termiiKey = process.env.TERMII_API_KEY;
  if (termiiKey) {
    try {
      const senderId = process.env.TERMII_SENDER_ID || 'N-Alert';
      const r = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phone,
          from: senderId,
          sms: shortMsg,
          type: 'plain',
          api_key: termiiKey,
          channel: 'generic',
        }),
      });
      const body: any = await r.json();
      if (r.ok && body?.message === 'Successfully Sent') {
        return { ok: true, channel: 'sms-termii' };
      }
      console.warn('[otp] Termii erro:', JSON.stringify(body).slice(0, 200));
    } catch (e) {
      console.warn('[otp] Termii excepção:', (e as Error).message);
    }
  }

  // 2. Africa's Talking (fallback)
  const atUser = process.env.AFRICASTALKING_USERNAME;
  const atKey  = process.env.AFRICASTALKING_API_KEY;
  if (atUser && atKey) {
    try {
      const params = new URLSearchParams({ username: atUser, to: phone, message: shortMsg });
      const senderId = process.env.AFRICASTALKING_SENDER_ID;
      if (senderId) params.set('from', senderId);
      const r = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: { apiKey: atKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: params.toString(),
      });
      const body: any = await r.json();
      if (r.ok && body?.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
        return { ok: true, channel: 'sms' };
      }
      console.warn('[otp] Africa\'s Talking erro:', JSON.stringify(body).slice(0, 200));
    } catch (e) {
      console.warn('[otp] Africa\'s Talking excepção:', (e as Error).message);
    }
  }

  // 3. Gateway SMS genérico
  const gUrl   = process.env.SMS_GATEWAY_URL;
  const gToken = process.env.SMS_GATEWAY_TOKEN;
  if (gUrl) {
    try {
      const r = await fetch(gUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(gToken ? { Authorization: `Bearer ${gToken}` } : {}),
        },
        body: JSON.stringify({ to: phone, message: shortMsg, from: process.env.SMS_GATEWAY_FROM ?? nomeEscola }),
      });
      if (r.ok) return { ok: true, channel: 'sms' };
    } catch (e) {
      console.warn('[otp] Gateway SMS genérico erro:', (e as Error).message);
    }
  }

  // 3. Fallback: log na consola (desenvolvimento / testes)
  const border = '═'.repeat(52);
  console.log(`\n╔${border}╗`);
  console.log(`║  🔐 CÓDIGO OTP${' '.repeat(37)}║`);
  console.log(`║  Telemóvel : ${phone.padEnd(38)}║`);
  console.log(`║  Código    : ${code.padEnd(38)}║`);
  console.log(`║  Válido    : 5 minutos${' '.repeat(30)}║`);
  console.log(`╚${border}╝\n`);

  return { ok: true, channel: 'console' };
}

// ── Formatar telefone ────────────────────────────────────────────────────────
export function cleanPhone(raw: string): string {
  return raw.replace(/[\s\-().]/g, '').replace(/^00/, '+');
}

export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length <= 6) return phone;
  return d.slice(0, 3) + '*'.repeat(d.length - 6) + d.slice(-3);
}
