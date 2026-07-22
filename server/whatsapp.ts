/**
 * Notificações WhatsApp via CallMeBot (https://www.callmebot.com/)
 *
 * Configuração:
 *   WHATSAPP_NOTIFY_NUMBER — número de telefone (com indicativo, sem '+'), ex: 244926219731
 *   WHATSAPP_CALLMEBOT_APIKEY — apikey enviada pelo bot no WhatsApp após autorização
 *
 * Como obter o apikey (uma vez):
 *   1. Adicione o contacto +34 644 64 38 92 ao seu telemóvel.
 *   2. Envie a mensagem: "I allow callmebot to send me messages"
 *   3. Receberá no WhatsApp uma resposta com o "API key for ...". Use esse valor.
 */

const ENDPOINT = 'https://api.callmebot.com/whatsapp.php';

export interface WhatsAppResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export async function sendWhatsAppNotification(message: string): Promise<WhatsAppResult> {
  const phone = (process.env.WHATSAPP_NOTIFY_NUMBER || '').replace(/[^\d]/g, '');
  const apiKey = (process.env.WHATSAPP_CALLMEBOT_APIKEY || '').trim();

  if (!phone) return { ok: false, skipped: true, reason: 'WHATSAPP_NOTIFY_NUMBER não configurado' };
  if (!apiKey) return { ok: false, skipped: true, reason: 'WHATSAPP_CALLMEBOT_APIKEY não configurado' };

  const url = `${ENDPOINT}?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(message)}&apikey=${encodeURIComponent(apiKey)}`;

  try {
    const r = await fetch(url, { method: 'GET' });
    const body = await r.text();
    const ok = r.ok && !/error|invalid|unauthor/i.test(body);
    if (!ok) {
      console.warn('[whatsapp] CallMeBot resposta inválida:', r.status, body.slice(0, 200));
    }
    return { ok, status: r.status, body: body.slice(0, 500) };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn('[whatsapp] erro a enviar:', msg);
    return { ok: false, error: msg };
  }
}
