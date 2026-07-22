/**
 * Módulo SMS — envio via Termii (prioridade) ou Africa's Talking (fallback)
 *
 * Uso:
 *   import { sendSms } from './sms';
 *   await sendSms('+244923456789', 'Mensagem aqui');
 */

/** Normaliza número para formato internacional (+244XXXXXXXXX) */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s\-().]/g, '').replace(/^00/, '+');
  // Angola: acrescentar +244 se começar por 9 e tiver 9 dígitos
  if (/^9\d{8}$/.test(cleaned)) return `+244${cleaned}`;
  if (/^\+?244\d{9}$/.test(cleaned)) return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  // Devolver tal como está se já tiver + internacional
  if (cleaned.startsWith('+')) return cleaned;
  return null; // inválido
}

export interface SendSmsResult {
  ok: boolean;
  channel: string;
  error?: string;
}

/**
 * Envia um SMS para o número indicado.
 * Tenta Termii → Africa's Talking → log de consola (fallback dev).
 * Nunca lança excepção — devolve sempre { ok, channel }.
 */
export async function sendSms(
  phone: string,
  message: string,
  nomeEscola = 'Instituto'
): Promise<SendSmsResult> {
  const formattedPhone = formatPhone(phone);
  if (!formattedPhone) {
    return { ok: false, channel: 'none', error: `Número inválido: ${phone}` };
  }

  // 1. Termii
  const termiiKey = process.env.TERMII_API_KEY;
  if (termiiKey) {
    try {
      const senderId = process.env.TERMII_SENDER_ID || 'N-Alert';
      const r = await fetch('https://api.ng.termii.com/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: formattedPhone,
          from: senderId,
          sms: message,
          type: 'plain',
          api_key: termiiKey,
          channel: 'generic',
        }),
      });
      const body: any = await r.json().catch(() => ({}));
      if (r.ok && body?.message === 'Successfully Sent') {
        return { ok: true, channel: 'termii' };
      }
      console.warn('[sms] Termii erro:', JSON.stringify(body).slice(0, 200));
    } catch (e) {
      console.warn('[sms] Termii excepção:', (e as Error).message);
    }
  }

  // 2. Africa's Talking (fallback)
  const atUser = process.env.AFRICASTALKING_USERNAME;
  const atKey  = process.env.AFRICASTALKING_API_KEY;
  if (atUser && atKey) {
    try {
      const params = new URLSearchParams({ username: atUser, to: formattedPhone, message });
      const senderId = process.env.AFRICASTALKING_SENDER_ID;
      if (senderId) params.set('from', senderId);
      const r = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: { apiKey: atKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: params.toString(),
      });
      const body: any = await r.json().catch(() => ({}));
      if (r.ok && body?.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
        return { ok: true, channel: 'africastalking' };
      }
      console.warn('[sms] Africa\'s Talking erro:', JSON.stringify(body).slice(0, 200));
    } catch (e) {
      console.warn('[sms] Africa\'s Talking excepção:', (e as Error).message);
    }
  }

  // 3. Fallback consola (desenvolvimento)
  console.log(`[sms] 📱 SMS (sem provedor) → ${formattedPhone}: ${message.slice(0, 80)}`);
  return { ok: false, channel: 'console', error: 'Nenhum provedor SMS configurado' };
}
