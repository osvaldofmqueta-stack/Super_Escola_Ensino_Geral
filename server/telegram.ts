/**
 * Telegram Bot OTP — Verificação em 2 Passos via Telegram
 *
 * Variáveis de ambiente necessárias:
 *   TELEGRAM_BOT_TOKEN    — token do bot (obtido via @BotFather no Telegram)
 *   TELEGRAM_BOT_USERNAME — username do bot sem @, ex: SIGAEscolaBot
 *
 * Como configurar:
 *   1. Abrir o Telegram e falar com @BotFather
 *   2. Enviar /newbot e seguir as instruções
 *   3. Copiar o token e definir TELEGRAM_BOT_TOKEN no servidor
 *   4. Definir TELEGRAM_BOT_USERNAME com o username do bot (sem @)
 *   5. Chamar POST /api/telegram/setup-webhook (como CEO/admin) para registar o webhook
 */

import * as crypto from 'crypto';

const BOT_API = 'https://api.telegram.org/bot';

// Tokens temporários de ligação: token → { userId, expires }
const pendingLinkTokens = new Map<string, { userId: string; expires: number }>();

// Limpeza periódica de tokens expirados (cada 60 s)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingLinkTokens.entries()) {
    if (v.expires < now) pendingLinkTokens.delete(k);
  }
}, 60_000);

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function getTelegramBotUsername(): string {
  return (process.env.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, '');
}

/** Cria token temporário (15 min) para ligar conta ao Telegram */
export function createTelegramLinkToken(userId: string): string {
  const token = crypto.randomBytes(16).toString('hex');
  pendingLinkTokens.set(token, { userId, expires: Date.now() + 15 * 60 * 1000 });
  return token;
}

/** Consome token e retorna o userId associado, ou null se inválido/expirado */
export function consumeTelegramLinkToken(token: string): string | null {
  const entry = pendingLinkTokens.get(token);
  if (!entry || entry.expires < Date.now()) {
    pendingLinkTokens.delete(token);
    return null;
  }
  pendingLinkTokens.delete(token);
  return entry.userId;
}

/** Envia OTP via Telegram Bot */
export async function sendTelegramOtp(
  chatId: string,
  code: string,
  nomeEscola: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN não configurado' };

  const text =
    `🔐 *${nomeEscola}*\n\n` +
    `O seu código de verificação é:\n\`${code}\`\n\n` +
    `⏱ Válido por *5 minutos*\n\n` +
    `_Se não foi você, ignore esta mensagem._`;

  try {
    const r = await fetch(`${BOT_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const body = await r.json() as { ok: boolean; description?: string };
    if (!body.ok) {
      console.warn('[telegram] Erro ao enviar OTP:', body.description);
      return { ok: false, error: body.description };
    }
    return { ok: true };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn('[telegram] Excepção ao enviar OTP:', msg);
    return { ok: false, error: msg };
  }
}

/** Envia mensagem genérica via Telegram Bot */
export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const r = await fetch(`${BOT_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    });
    const body = await r.json() as { ok: boolean; description?: string; error_code?: number };
    if (!body.ok) {
      console.warn(`[telegram] sendMessage falhou para chatId=${chatId}: [${body.error_code}] ${body.description}`);
    }
    return body.ok;
  } catch (err) {
    console.warn(`[telegram] sendMessage excepção para chatId=${chatId}:`, (err as Error).message);
    return false;
  }
}

/** Configura o webhook do bot para receber mensagens dos utilizadores */
export async function setTelegramWebhook(webhookUrl: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;
  try {
    const r = await fetch(`${BOT_API}${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message'] }),
    });
    const body = await r.json() as { ok: boolean; description?: string };
    if (body.ok) {
      console.log('[telegram] ✅ Webhook configurado:', webhookUrl);
    } else {
      console.warn('[telegram] ⚠️ Falha ao configurar webhook:', body.description);
    }
    return body.ok;
  } catch (err) {
    console.warn('[telegram] Excepção ao configurar webhook:', (err as Error).message);
    return false;
  }
}
