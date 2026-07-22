import { Resend } from "resend";
import nodemailer from "nodemailer";

type GuardianEmailTipo = "nota" | "falta" | "propina" | "geral" | "mensagem";

export interface ProfileAlertCampo {
  label: string;
  valor: string;
}

export interface EmailDiagnostico {
  configurado: boolean;
  resendKey: boolean;
  emailFrom: string;
  emailFromValido: boolean;
  avisos: string[];
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function getEmailDiagnostico(): EmailDiagnostico {
  const resendKey = !!process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM ?? "onboarding@resend.dev";
  const emailFromValido = emailFrom !== "onboarding@resend.dev" && emailFrom.includes("@");
  const avisos: string[] = [];

  if (!resendKey) avisos.push("RESEND_API_KEY não configurada — emails não serão enviados.");
  if (!emailFromValido) avisos.push("EMAIL_FROM não configurado ou inválido — a usar fallback 'onboarding@resend.dev' (apenas funciona para testes).");
  if (emailFromValido && !emailFrom.includes(".")) avisos.push("EMAIL_FROM não parece um endereço válido.");

  return { configurado: resendKey && emailFromValido, resendKey, emailFrom, emailFromValido, avisos };
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("[email] RESEND_API_KEY não configurada.");
  return new Resend(key);
}

function formatResendError(err: unknown): string {
  if (!err) return "erro desconhecido";
  if (typeof err === "object") {
    const e = err as any;
    const parts: string[] = [];
    if (e.name)       parts.push(`name=${e.name}`);
    if (e.statusCode) parts.push(`status=${e.statusCode}`);
    if (e.message)    parts.push(`message=${e.message}`);
    if (parts.length) return parts.join(" | ");
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function isDomainNotVerifiedError(err: unknown): boolean {
  const msg = typeof err === "object" ? (err as any)?.message ?? "" : String(err ?? "");
  return (
    msg.includes("testing emails") ||
    msg.includes("own email address") ||
    msg.includes("domain is not verified") ||
    msg.includes("You can only send")
  );
}

function getFromEmail() {
  const from = process.env.EMAIL_FROM;
  if (!from || from === "onboarding@resend.dev") {
    if (process.env.NODE_ENV === "production") {
      console.warn("[email] ⚠️  EMAIL_FROM não configurado. A usar 'onboarding@resend.dev' — apenas funciona para testes no Resend.");
    }
    return "onboarding@resend.dev";
  }
  return from;
}

// Cache: se o domínio já falhou uma vez por "não verificado", saltar directamente
// para onboarding@resend.dev nas próximas tentativas (evita double API call).
let _domainVerified: boolean | null = null; // null = ainda não testado

/** Envia com timeout máximo de 7 s para não bloquear o utilizador. */
async function resendSendWithTimeout(
  resend: ReturnType<typeof getResend>,
  payload: Parameters<ReturnType<typeof getResend>["emails"]["send"]>[0],
  timeoutMs = 7000
): Promise<{ error: unknown }> {
  return Promise.race([
    resend.emails.send(payload as any),
    new Promise<{ error: unknown }>((_res, rej) =>
      setTimeout(() => rej(new Error("Resend timeout após " + timeoutMs + "ms")), timeoutMs)
    ),
  ]);
}

/**
 * Envia email via Resend com fallback automático para onboarding@resend.dev
 * quando o domínio configurado não está verificado (plano gratuito do Resend).
 * Usa cache interno para evitar double-call após o primeiro erro de domínio.
 */
async function sendResendWithFallback(
  resend: ReturnType<typeof getResend>,
  payload: { from: string; to: string; subject: string; html: string; text: string; reply_to?: string }
): Promise<void> {
  const useFallbackDirectly = _domainVerified === false;

  if (!useFallbackDirectly) {
    try {
      const { error } = await resendSendWithTimeout(resend, payload as any);
      if (error) throw error;
      _domainVerified = true; // domínio confirmado como verificado
      return;
    } catch (firstErr) {
      if (isDomainNotVerifiedError(firstErr)) {
        _domainVerified = false; // cache: não tentar novamente na próxima
        // cai no fallback abaixo
      } else {
        throw firstErr;
      }
    }
  }

  // Fallback: onboarding@resend.dev (sem segunda falha de domínio)
  const originalFrom = payload.from;
  const fallbackFrom = payload.from
    .replace(/<[^>]+>/, "<onboarding@resend.dev>")
    .replace(/^[^<]*$/, "onboarding@resend.dev");
  if (useFallbackDirectly === false) {
    // só loga na primeira vez (quando fez double-call)
    console.warn(`[email] ⚠️  Domínio não verificado ('${originalFrom}'). A usar onboarding@resend.dev.`);
  }
  const { error: err2 } = await resendSendWithTimeout(resend, { ...payload, from: fallbackFrom, reply_to: undefined } as any);
  if (err2) throw err2;
}

// ── Sondagem do domínio Resend no arranque ──────────────────────────────────
// Consulta a API de domínios do Resend e pré-aquece o cache _domainVerified
// para que o primeiro login nunca precise de fazer double-call.
async function probeResendDomain(): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;

  const from = process.env.EMAIL_FROM ?? '';
  const domain = from.includes('@') ? from.split('@')[1] : '';

  // Se não há domínio próprio, já sabemos que usamos onboarding@resend.dev
  if (!domain || from === 'onboarding@resend.dev') {
    _domainVerified = false;
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!r.ok) return; // sem acesso — deixar como null, será determinado no primeiro envio

    const body = (await r.json()) as { data?: Array<{ name: string; status: string }> };
    const domains = body?.data ?? [];
    const match = domains.find(d => d.name === domain);

    if (match?.status === 'verified') {
      _domainVerified = true;
      console.log(`[email] ✅ Domínio ${domain} verificado no Resend — envio directo activado.`);
    } else {
      _domainVerified = false;
      console.log(`[email] ℹ️  Domínio ${domain} não verificado no Resend — a usar onboarding@resend.dev directamente (sem double-call).`);
    }
  } catch {
    // timeout ou erro de rede — mantém null; será determinado no primeiro envio
  }
}

// ── Log de diagnóstico no arranque ─────────────────────────────────────────
(function logEmailStartup() {
  const diag = getEmailDiagnostico();
  if (diag.configurado) {
    console.log(`[email] ✅ Resend configurado — a enviar de: ${diag.emailFrom}`);
    // Sondagem assíncrona: pré-aquece o cache antes do primeiro login
    probeResendDomain().catch(() => {});
  } else {
    for (const aviso of diag.avisos) {
      console.warn(`[email] ⚠️  ${aviso}`);
    }
  }
})();

export async function sendPasswordResetEmail(
  toEmail: string,
  nomeUtilizador: string,
  resetLink: string,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend API key não configurada. Defina RESEND_API_KEY nas variáveis de ambiente.");
    return { success: false, message: "Serviço de email não configurado. Contacte o administrador do sistema." };
  }

  const resend = getResend();
  const primeiroNome = nomeUtilizador.split(" ")[0] || nomeUtilizador;
  const sistemaLabel = nomeEscola || "Super Escola";

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de Senha — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A5276,#2980B9);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(240,165,0,0.15);border:2px solid rgba(240,165,0,0.4);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">🔐</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Redefinição de Senha</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">${sistemaLabel}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 24px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.7;">
                Recebemos um pedido para redefinir a senha da sua conta no ${sistemaLabel}. Se não foi você, pode ignorar este email em segurança — a sua senha permanecerá inalterada.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 32px;">
                    <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#1A5276,#2980B9);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                      Redefinir a minha senha
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.25);border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.6;">
                      ⏰ <strong style="color:#C89A2A;">Este link é válido apenas por 1 hora.</strong><br />
                      Após esse prazo, terá de solicitar um novo link de redefinição.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;">
                Se o botão não funcionar, copie e cole este endereço no seu navegador:<br />
                <span style="color:#3498DB;word-break:break-all;">${resetLink}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.3);font-size:11px;line-height:1.6;">
                Este email foi enviado automaticamente pelo ${sistemaLabel}.<br />
                Por favor, não responda a este email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      to: toEmail,
      subject: `Redefinição de Senha — ${sistemaLabel}`,
      html: htmlBody,
      text: `Olá ${primeiroNome},\n\nClique no link abaixo para redefinir a sua senha:\n${resetLink}\n\nEste link expira em 1 hora.\n\nSe não solicitou esta operação, ignore este email.`,
    });
    return { success: true, message: "Email enviado com sucesso." };
  } catch (err) {
    const detail = formatResendError(err);
    console.error(`[email] Erro ao enviar email de reset: ${detail}`);
    return { success: false, message: "Falha ao enviar o email. Verifique as configurações do Resend." };
  }
}

export async function sendProfileSecurityAlert(
  toEmail: string,
  nomeUtilizador: string,
  modificadoPor: string,
  camposAlterados: ProfileAlertCampo[],
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend não configurado. Alerta de perfil não enviado.");
    return { success: false, message: "Serviço de email não configurado." };
  }

  const resend = getResend();
  const primeiroNome = nomeUtilizador.split(" ")[0] || nomeUtilizador;
  const sistemaLabel = nomeEscola || "Super Escola";
  const dataHora = new Date().toLocaleString("pt-AO", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const camposHtml = camposAlterados.length > 0
    ? camposAlterados.map(c => `
        <tr>
          <td style="padding:7px 12px;color:rgba(255,255,255,0.6);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);">${c.label}</td>
          <td style="padding:7px 12px;color:#C89A2A;font-size:13px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.05);">${c.valor}</td>
        </tr>`).join("")
    : `<tr><td colspan="2" style="padding:10px 12px;color:rgba(255,255,255,0.5);font-size:13px;">Campos de autenticação alterados (senha)</td></tr>`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alerta de Segurança — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7B1F1F,#C0392B);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.3);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">🔒</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Alerta de Segurança</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">O seu perfil foi modificado — ${sistemaLabel}</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.7;">
                A sua conta no <strong>${sistemaLabel}</strong> foi modificada por um administrador do sistema.
                Abaixo encontra os detalhes desta alteração:
              </p>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:rgba(192,57,43,0.12);border:1px solid rgba(192,57,43,0.35);border-radius:10px;padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.5);font-size:12px;padding-bottom:6px;" colspan="2">DETALHES DA ALTERAÇÃO</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 12px;color:rgba(255,255,255,0.6);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);">Modificado por</td>
                        <td style="padding:5px 12px;color:#ffffff;font-size:13px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.05);">${modificadoPor}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 12px;color:rgba(255,255,255,0.6);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.05);">Data e hora</td>
                        <td style="padding:5px 12px;color:#ffffff;font-size:13px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.05);">${dataHora}</td>
                      </tr>
                      ${camposHtml}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:rgba(240,165,0,0.08);border:1px solid rgba(240,165,0,0.25);border-radius:10px;padding:16px 20px;">
                    <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;line-height:1.7;">
                      ⚠️ <strong style="color:#C89A2A;">Se não autorizou esta alteração</strong>, contacte imediatamente
                      o administrador do sistema ou o responsável pela escola.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
                Este email foi enviado automaticamente pelo ${sistemaLabel}. Por favor, não responda a este email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:20px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.3);font-size:11px;">${sistemaLabel} — Sistema de Gestão Académica</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const camposTexto = camposAlterados.length > 0
    ? camposAlterados.map(c => `  • ${c.label}: ${c.valor}`).join("\n")
    : "  • Campos de autenticação alterados";

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      reply_to: getFromEmail(),
      to: toEmail,
      subject: `🔒 Alerta: O seu perfil foi modificado — ${sistemaLabel}`,
      html: htmlBody,
      text: `Olá ${primeiroNome},\n\nA sua conta no ${sistemaLabel} foi modificada.\n\nModificado por: ${modificadoPor}\nData: ${dataHora}\n\nCampos alterados:\n${camposTexto}\n\nSe não autorizou esta alteração, contacte o administrador imediatamente.\n\n— ${sistemaLabel}`,
    });
    return { success: true, message: "Alerta de segurança enviado." };
  } catch (err) {
    console.error(`[email] Erro ao enviar alerta de segurança para ${toEmail}: ${formatResendError(err)}`);
    return { success: false, message: "Falha ao enviar alerta." };
  }
}

export async function sendLoginApprovalEmail(
  toEmail: string,
  nomeUtilizador: string,
  ip: string,
  device: string,
  approveUrl: string,
  denyUrl: string,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend não configurado. Email de aprovação de login não enviado.");
    return { success: false, message: "Serviço de email não configurado." };
  }

  const resend = getResend();
  const primeiroNome = nomeUtilizador.split(" ")[0] || nomeUtilizador;
  const sistemaLabel = nomeEscola || "Super Escola";
  const dataHora = new Date().toLocaleString("pt-AO", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pedido de Acesso — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0F2347,#1A3A6B);padding:32px 40px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.08);">
              <div style="display:inline-block;background:rgba(200,154,42,0.15);border:2px solid rgba(200,154,42,0.4);border-radius:50%;width:68px;height:68px;line-height:68px;text-align:center;margin-bottom:16px;">
                <span style="font-size:30px;">🔐</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Pedido de Acesso</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">${sistemaLabel} — Sistema de Gestão Académica</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 18px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 24px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.7;">
                Alguém tentou entrar na sua conta no <strong>${sistemaLabel}</strong>.
                Se foi você, clique em <strong style="color:#27AE60;">Sim, autorizo</strong> para confirmar o acesso.
                Caso contrário, clique em <strong style="color:#E74C3C;">Não, bloquear</strong> para recusar.
              </p>

              <!-- Device info -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.8px;padding-bottom:10px;" colspan="2">DETALHES DA TENTATIVA</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:rgba(255,255,255,0.5);font-size:13px;width:40%;">Data e hora</td>
                        <td style="padding:5px 0;color:#ffffff;font-size:13px;font-weight:600;">${dataHora}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:rgba(255,255,255,0.5);font-size:13px;">Endereço IP</td>
                        <td style="padding:5px 0;color:#ffffff;font-size:13px;font-weight:600;">${ip}</td>
                      </tr>
                      <tr>
                        <td style="padding:5px 0;color:rgba(255,255,255,0.5);font-size:13px;">Dispositivo</td>
                        <td style="padding:5px 0;color:#ffffff;font-size:13px;font-weight:600;">${device}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action buttons -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center" style="padding:0 6px 0 0;">
                    <a href="${approveUrl}" style="display:block;background:linear-gradient(135deg,#1E8449,#27AE60);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 24px;border-radius:12px;text-align:center;letter-spacing:0.3px;">
                      ✅ Sim, autorizo
                    </a>
                  </td>
                  <td align="center" style="padding:0 0 0 6px;">
                    <a href="${denyUrl}" style="display:block;background:linear-gradient(135deg,#922B21,#E74C3C);color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 24px;border-radius:12px;text-align:center;letter-spacing:0.3px;">
                      🚫 Não, bloquear
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.2);border-radius:10px;padding:14px 18px;">
                    <p style="margin:0;color:rgba(255,255,255,0.65);font-size:12px;line-height:1.7;">
                      ⚠️ <strong style="color:#E74C3C;">Este link expira em 10 minutos.</strong>
                      Se não reconhece esta tentativa de acesso, clique em <strong>Não, bloquear</strong> e altere a sua senha imediatamente.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:18px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${sistemaLabel} — Sistema de Gestão Académica • Email automático, não responda.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      reply_to: getFromEmail(),
      to: toEmail,
      subject: `🔐 Pedido de acesso à sua conta — ${sistemaLabel}`,
      html: htmlBody,
      text: `Olá ${primeiroNome},\n\nAlguém tentou entrar na sua conta no ${sistemaLabel}.\n\nData: ${dataHora}\nIP: ${ip}\nDispositivo: ${device}\n\n✅ AUTORIZAR: ${approveUrl}\n\n🚫 BLOQUEAR: ${denyUrl}\n\nEste link expira em 10 minutos.\n\n— ${sistemaLabel}`,
    });
    return { success: true, message: "Email de aprovação enviado." };
  } catch (err) {
    console.error(`[email] Erro ao enviar email de aprovação de login para ${toEmail}: ${formatResendError(err)}`);
    return { success: false, message: "Falha ao enviar email de aprovação." };
  }
}

export async function sendGuardianNotificationEmail(
  toEmail: string,
  nomeEncarregado: string,
  titulo: string,
  mensagem: string,
  tipo: GuardianEmailTipo,
  nomeAluno?: string,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend API key não configurada. Alerta de encarregado não enviado.");
    return { success: false, message: "Serviço de email não configurado." };
  }

  const resend = getResend();
  const primeiroNome = nomeEncarregado.split(" ")[0] || nomeEncarregado;
  const sistemaLabel = nomeEscola || "Super Escola";

  const iconMap: Record<GuardianEmailTipo, string> = {
    nota: "📋",
    falta: "⚠️",
    propina: "💳",
    mensagem: "✉️",
    geral: "🔔",
  };

  const colorMap: Record<GuardianEmailTipo, string> = {
    nota: "#2980B9",
    falta: "#E67E22",
    propina: "#C0392B",
    mensagem: "#27AE60",
    geral: "#1A5276",
  };

  const icon = iconMap[tipo] ?? "🔔";
  const accentColor = colorMap[tipo] ?? "#1A5276";

  const alunoLine = nomeAluno
    ? `<p style="margin:0 0 8px;color:rgba(255,255,255,0.6);font-size:13px;">Educando: <strong style="color:#C89A2A;">${nomeAluno}</strong></p>`
    : "";

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo} — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${accentColor},#0D1F35);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(240,165,0,0.15);border:2px solid rgba(240,165,0,0.4);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">${icon}</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${titulo}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">Portal do Encarregado — ${sistemaLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              ${alunoLine}
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td style="background:rgba(255,255,255,0.04);border-left:4px solid ${accentColor};border-radius:0 10px 10px 0;padding:16px 20px;">
                    <p style="margin:0;color:rgba(255,255,255,0.85);font-size:14px;line-height:1.7;">${mensagem}</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}/portal-encarregado` : "#"}"
                       style="display:inline-block;background:linear-gradient(135deg,${accentColor},#2C3E50);color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                      Ver no Portal do Encarregado
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
                Este email foi enviado automaticamente pelo ${sistemaLabel}. Por favor, não responda a este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${sistemaLabel}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} Encarregado <${getFromEmail()}>`,
      to: toEmail,
      subject: `${titulo} — ${sistemaLabel}`,
      html: htmlBody,
      text: `Olá ${primeiroNome},\n\n${mensagem}\n\nAceda ao Portal do Encarregado para mais detalhes.\n\n— ${sistemaLabel}`,
    });
    return { success: true, message: "Email enviado com sucesso." };
  } catch (err) {
    const detail = formatResendError(err);
    if (false) {
      console.error(`[email] alerta encarregado não enviado para ${toEmail}. Erro: ${detail}`);
    } else {
      console.error(`[email] Erro ao enviar alerta ao encarregado via Resend para ${toEmail}: ${detail}`);
    }
    return { success: false, message: "Falha ao enviar email." };
  }
}

// ── Email de propina em atraso ───────────────────────────────────────────────

/**
 * Envia alerta de propina em atraso ao aluno e/ou encarregado, em nome do Instituto.
 * Inclui número de dias em atraso e CTA para regularizar.
 */
export async function sendPropinaEmAtrasoEmail(opts: {
  emailAluno?: string | null;
  nomeAluno: string;
  emailEncarregado?: string | null;
  nomeEncarregado?: string | null;
  valor: number;
  mesMensagem: string;   // ex: "Janeiro 2025"
  diasAtraso: number;
  nomeEscola?: string;
}): Promise<{ aluno: boolean; encarregado: boolean }> {
  if (!isEmailConfigured()) return { aluno: false, encarregado: false };

  const resend = getResend();
  const escola = opts.nomeEscola || "Super Escola";
  const valorFmt = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 0 }).format(opts.valor);
  const urgenciaColor = opts.diasAtraso >= 30 ? '#C0392B' : '#E67E22';
  const urgenciaLabel = opts.diasAtraso >= 30 ? '🔴 Urgente' : '🟠 Em Atraso';
  const appUrl = process.env.APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : '#');

  function buildHtml(destinatario: 'aluno' | 'encarregado', primeiroNome: string): string {
    const saudacao = destinatario === 'encarregado'
      ? `O seu educando <strong style="color:#C89A2A;">${opts.nomeAluno}</strong> tem uma propina em atraso.`
      : 'Tens uma propina por regularizar.';
    const portalLink = destinatario === 'encarregado'
      ? `${appUrl}/portal-encarregado`
      : `${appUrl}/portal-estudante`;
    const portalLabel = destinatario === 'encarregado' ? 'Portal do Encarregado' : 'Portal do Estudante';

    return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Propina em Atraso — ${escola}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${urgenciaColor},#0D1F35);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.3);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">⚠️</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${urgenciaLabel} — Propina por Regularizar</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">${escola} · Serviços Financeiros</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.6;">
                ${saudacao}
              </p>

              <!-- Caixa de destaque -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(${urgenciaColor === '#C0392B' ? '192,57,43' : '230,126,34'},0.1);border:1px solid ${urgenciaColor};border-radius:12px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Propina referente a</td>
                        <td style="color:#ffffff;font-weight:700;font-size:14px;text-align:right;">${opts.mesMensagem}</td>
                      </tr>
                      <tr>
                        <td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Valor em dívida</td>
                        <td style="color:#C89A2A;font-weight:800;font-size:18px;text-align:right;">${valorFmt} Kz</td>
                      </tr>
                      <tr>
                        <td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Dias em atraso</td>
                        <td style="color:${urgenciaColor};font-weight:700;font-size:14px;text-align:right;">${opts.diasAtraso} dia${opts.diasAtraso !== 1 ? 's' : ''}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Instruções -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:rgba(255,255,255,0.03);border-left:4px solid #1A5276;border-radius:0 10px 10px 0;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;">Como regularizar:</p>
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.8;">
                      🏫 <strong>Secretaria</strong> — pagamento presencial<br/>
                      🏧 <strong>ATM / Multicaixa Express</strong> — referência disponível no portal<br/>
                      📞 <strong>Contacte os Serviços Financeiros</strong> para obter a referência de pagamento
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="${portalLink}"
                       style="display:inline-block;background:linear-gradient(135deg,${urgenciaColor},#2C3E50);color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                      Ver no ${portalLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
                Este aviso foi enviado automaticamente pelo ${escola}. Por favor, não responda a este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${escola} — Serviços Financeiros</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  const subject = `⚠️ Propina em Atraso — ${opts.mesMensagem} — ${escola}`;
  let alunoOk = false;
  let encarregadoOk = false;

  if (opts.emailAluno) {
    const nome = opts.nomeAluno.split(' ')[0] || opts.nomeAluno;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Financeiro <${getFromEmail()}>`,
        to: opts.emailAluno,
        subject,
        html: buildHtml('aluno', nome),
        text: `Olá ${nome},\n\nTens uma propina de ${opts.mesMensagem} (${valorFmt} Kz) em atraso há ${opts.diasAtraso} dia(s).\n\nPor favor regulariza o mais brevemente possível na secretaria ou através do portal.\n\n— ${escola} · Serviços Financeiros`,
      });
      alunoOk = true;
    } catch (err) {
      console.error(`[email] propina-atraso: falha ao notificar aluno ${opts.emailAluno}: ${formatResendError(err)}`);
    }
  }

  if (opts.emailEncarregado) {
    const nomeEnc = opts.nomeEncarregado || 'Encarregado de Educação';
    const primeiroNomeEnc = nomeEnc.split(' ')[0] || nomeEnc;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Financeiro <${getFromEmail()}>`,
        to: opts.emailEncarregado,
        subject: `⚠️ Propina em Atraso — ${opts.nomeAluno} — ${opts.mesMensagem} — ${escola}`,
        html: buildHtml('encarregado', primeiroNomeEnc),
        text: `Olá ${primeiroNomeEnc},\n\nO seu educando ${opts.nomeAluno} tem uma propina de ${opts.mesMensagem} (${valorFmt} Kz) em atraso há ${opts.diasAtraso} dia(s).\n\nPor favor regularize o mais brevemente possível.\n\n— ${escola} · Serviços Financeiros`,
      });
      encarregadoOk = true;
    } catch (err) {
      console.error(`[email] propina-atraso: falha ao notificar encarregado ${opts.emailEncarregado}: ${formatResendError(err)}`);
    }
  }

  return { aluno: alunoOk, encarregado: encarregadoOk };
}

// ── Email de documento/certificado pronto para levantamento ──────────────────

/**
 * Notifica aluno e encarregado por email quando um documento/certificado
 * fica pronto para levantamento na secretaria, em nome do Instituto.
 */
export async function sendDocumentoProntoEmail(opts: {
  emailAluno?: string | null;
  nomeAluno: string;
  emailEncarregado?: string | null;
  nomeEncarregado?: string | null;
  tipoDocumento: string;   // ex: "Certificado", "Declaração de Matrícula"
  nomeEscola?: string;
}): Promise<{ aluno: boolean; encarregado: boolean }> {
  if (!isEmailConfigured()) return { aluno: false, encarregado: false };

  const resend = getResend();
  const escola = opts.nomeEscola || "Super Escola";
  const tipoDoc = opts.tipoDocumento || 'Documento';
  const appUrl = process.env.APP_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : '#');

  function buildHtml(destinatario: 'aluno' | 'encarregado', primeiroNome: string): string {
    const saudacao = destinatario === 'encarregado'
      ? `O ${tipoDoc} do seu educando <strong style="color:#C89A2A;">${opts.nomeAluno}</strong> está pronto para levantamento.`
      : `O teu <strong style="color:#C89A2A;">${tipoDoc}</strong> está pronto para levantamento na secretaria.`;
    const portalLink = destinatario === 'encarregado'
      ? `${appUrl}/portal-encarregado`
      : `${appUrl}/portal-estudante`;
    const portalLabel = destinatario === 'encarregado' ? 'Portal do Encarregado' : 'Portal do Estudante';

    return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${tipoDoc} Pronto — ${escola}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1A7A4A,#0D1F35);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(39,174,96,0.15);border:2px solid rgba(39,174,96,0.5);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">🎓</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${tipoDoc} Pronto para Levantamento</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">${escola} · Secretaria</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 24px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.6;">
                ${saudacao}
              </p>

              <!-- Caixa de destaque -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:rgba(39,174,96,0.08);border:1px solid rgba(39,174,96,0.35);border-radius:12px;">
                <tr>
                  <td style="padding:24px 28px;text-align:center;">
                    <p style="margin:0 0 6px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Documento</p>
                    <p style="margin:0;color:#27AE60;font-size:22px;font-weight:800;">${tipoDoc}</p>
                    <p style="margin:8px 0 0;color:rgba(255,255,255,0.5);font-size:12px;">✅ Aprovado e pronto para entrega</p>
                  </td>
                </tr>
              </table>

              <!-- Instruções de levantamento -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:rgba(255,255,255,0.03);border-left:4px solid #27AE60;border-radius:0 10px 10px 0;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;">Como levantar:</p>
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.9;">
                      🏫 Dirija-se à <strong>Secretaria</strong> do ${escola}<br/>
                      🪪 Apresente o seu <strong>bilhete de identidade</strong> ou documento equivalente<br/>
                      🕐 Horário de atendimento: <strong>dias úteis, das 08h às 16h</strong>
                    </p>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:0 0 24px;">
                    <a href="${portalLink}"
                       style="display:inline-block;background:linear-gradient(135deg,#1A7A4A,#2C3E50);color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                      Ver no ${portalLabel}
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
                Este email foi enviado automaticamente pelo ${escola}. Por favor, não responda a este email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${escola} — Secretaria</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  const subject = `📄 ${tipoDoc} Pronto para Levantamento — ${escola}`;
  let alunoOk = false;
  let encarregadoOk = false;

  if (opts.emailAluno) {
    const nome = opts.nomeAluno.split(' ')[0] || opts.nomeAluno;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Secretaria <${getFromEmail()}>`,
        to: opts.emailAluno,
        subject,
        html: buildHtml('aluno', nome),
        text: `Olá ${nome},\n\nO teu ${tipoDoc} está pronto para levantamento na secretaria do ${escola}.\n\nApresenta o teu bilhete de identidade no balcão de atendimento (dias úteis, 08h–16h).\n\n— ${escola} · Secretaria`,
      });
      alunoOk = true;
    } catch (err) {
      console.error(`[email] doc-pronto: falha ao notificar aluno ${opts.emailAluno}: ${formatResendError(err)}`);
    }
  }

  if (opts.emailEncarregado) {
    const nomeEnc = opts.nomeEncarregado || 'Encarregado de Educação';
    const primeiroNomeEnc = nomeEnc.split(' ')[0] || nomeEnc;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Secretaria <${getFromEmail()}>`,
        to: opts.emailEncarregado,
        subject: `📄 ${tipoDoc} de ${opts.nomeAluno} Pronto — ${escola}`,
        html: buildHtml('encarregado', primeiroNomeEnc),
        text: `Olá ${primeiroNomeEnc},\n\nO ${tipoDoc} do seu educando ${opts.nomeAluno} está pronto para levantamento na secretaria do ${escola}.\n\nApresente o bilhete de identidade no balcão de atendimento (dias úteis, 08h–16h).\n\n— ${escola} · Secretaria`,
      });
      encarregadoOk = true;
    } catch (err) {
      console.error(`[email] doc-pronto: falha ao notificar encarregado ${opts.emailEncarregado}: ${formatResendError(err)}`);
    }
  }

  return { aluno: alunoOk, encarregado: encarregadoOk };
}

// ── Email de RUPE gerado ──────────────────────────────────────────────────────

const MESES_EMAIL: Record<number, string> = {
  1:'Janeiro', 2:'Fevereiro', 3:'Março', 4:'Abril', 5:'Maio', 6:'Junho',
  7:'Julho', 8:'Agosto', 9:'Setembro', 10:'Outubro', 11:'Novembro', 12:'Dezembro',
};

/**
 * Envia email de notificação de RUPE gerado ao aluno e/ou ao encarregado.
 * Chamada fire-and-forget nas rotas — erros não bloqueiam a resposta HTTP.
 */
export async function sendRupeGeradoEmail(opts: {
  emailAluno?: string | null;
  nomeAluno: string;
  emailEncarregado?: string | null;
  nomeEncarregado?: string | null;
  referencia: string;
  entidade?: string | null;
  valor: number;
  mes?: number | null;
  anoMes?: string | null;
  dataValidade?: string | null;
  nomeEscola?: string;
}): Promise<{ aluno: boolean; encarregado: boolean }> {
  if (!isEmailConfigured()) return { aluno: false, encarregado: false };

  const resend = getResend();
  const escola = opts.nomeEscola || "Super Escola";
  const mesLabel = opts.mes ? ` — ${MESES_EMAIL[opts.mes] ?? `Mês ${opts.mes}`}${opts.anoMes ? ` ${opts.anoMes}` : ''}` : '';
  const valorFmt = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 0 }).format(opts.valor);
  const validadeFmt = opts.dataValidade
    ? new Date(opts.dataValidade).toLocaleDateString('pt-PT', { day:'2-digit', month:'long', year:'numeric' })
    : '72 horas';

  const entidadeRow = opts.entidade
    ? `<tr><td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Entidade</td><td style="color:#C89A2A;font-weight:700;font-size:13px;text-align:right;">${opts.entidade}</td></tr>`
    : '';

  function buildHtml(destinatario: string, primeiroNome: string): string {
    return `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Referência de Pagamento — ${escola}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <!-- Cabeçalho -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A5276,#0D1F35);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(200,154,42,0.15);border:2px solid rgba(200,154,42,0.5);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:28px;">🏦</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">Referência de Pagamento Gerada</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">Propinas${mesLabel} — ${escola}</p>
            </td>
          </tr>
          <!-- Corpo -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
              </p>
              <p style="margin:0 0 8px;color:rgba(255,255,255,0.7);font-size:13px;">
                ${destinatario === 'encarregado'
                  ? `Foi gerada uma referência de pagamento para <strong style="color:#ffffff;">${opts.nomeAluno}</strong>.`
                  : 'Foi gerada uma referência de pagamento para a sua propina.'
                }
                Efectue o pagamento antes do prazo indicado.
              </p>

              <!-- Caixa destaque da referência -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:rgba(200,154,42,0.08);border:1px solid rgba(200,154,42,0.35);border-radius:12px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Referência RUPE</p>
                    <p style="margin:0 0 20px;color:#C89A2A;font-size:26px;font-weight:800;letter-spacing:2px;font-family:monospace;">${opts.referencia}</p>
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
                      ${entidadeRow}
                      <tr><td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Valor a pagar</td><td style="color:#ffffff;font-weight:700;font-size:15px;text-align:right;">${valorFmt} Kz</td></tr>
                      ${opts.mes ? `<tr><td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Mês</td><td style="color:rgba(255,255,255,0.85);font-size:13px;text-align:right;">${MESES_EMAIL[opts.mes]}${opts.anoMes ? ` ${opts.anoMes}` : ''}</td></tr>` : ''}
                      <tr><td style="color:rgba(255,255,255,0.55);font-size:13px;padding:6px 0;">Válida até</td><td style="color:#E74C3C;font-weight:600;font-size:13px;text-align:right;">${validadeFmt}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Como pagar -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background:rgba(255,255,255,0.03);border-left:4px solid #1A5276;border-radius:0 10px 10px 0;padding:0;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.9);font-size:13px;font-weight:700;">Como pagar:</p>
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.8;">
                      🏧 <strong>ATM</strong> → Pagamentos e Transferências → Entidades → Introduza a referência<br/>
                      📱 <strong>Multicaixa Express</strong> → Pagar → Serviços → Introduza a referência<br/>
                      🌐 <strong>Internet Banking</strong> → Pagamento de Serviços → Introduza a referência
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
                O sistema confirma o pagamento automaticamente após o depósito. Não é necessária nenhuma acção adicional.<br/>
                Este email foi enviado automaticamente pelo ${escola}. Por favor, não responda.
              </p>
            </td>
          </tr>
          <!-- Rodapé -->
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${escola}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
  }

  let alunoOk = false;
  let encarregadoOk = false;

  // ── Email ao aluno ────────────────────────────────────────────────────────
  if (opts.emailAluno) {
    const primeiroNome = opts.nomeAluno.split(' ')[0] || opts.nomeAluno;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Propinas <${getFromEmail()}>`,
        to: opts.emailAluno,
        subject: `Referência de Pagamento${mesLabel} — ${escola}`,
        html: buildHtml('aluno', primeiroNome),
        text: `Olá ${primeiroNome},\n\nFoi gerada uma referência de pagamento para a sua propina${mesLabel}.\n\nReferência: ${opts.referencia}\nValor: ${valorFmt} Kz\nVálida até: ${validadeFmt}\n\nPode pagar em qualquer ATM ou Multicaixa Express. O sistema confirma o pagamento automaticamente.\n\n— ${escola}`,
      });
      alunoOk = true;
    } catch (err) {
      console.error(`[email] RUPE: falha ao notificar aluno ${opts.emailAluno}: ${formatResendError(err)}`);
    }
  }

  // ── Email ao encarregado ──────────────────────────────────────────────────
  if (opts.emailEncarregado) {
    const nomeEnc = opts.nomeEncarregado || 'Encarregado de Educação';
    const primeiroNomeEnc = nomeEnc.split(' ')[0] || nomeEnc;
    try {
      await sendResendWithFallback(resend, {
        from: `${escola} Propinas <${getFromEmail()}>`,
        to: opts.emailEncarregado,
        subject: `Referência de Pagamento — ${opts.nomeAluno}${mesLabel} — ${escola}`,
        html: buildHtml('encarregado', primeiroNomeEnc),
        text: `Olá ${primeiroNomeEnc},\n\nFoi gerada uma referência de pagamento para ${opts.nomeAluno}${mesLabel}.\n\nReferência: ${opts.referencia}\nValor: ${valorFmt} Kz\nVálida até: ${validadeFmt}\n\nPode pagar em qualquer ATM ou Multicaixa Express.\n\n— ${escola}`,
      });
      encarregadoOk = true;
    } catch (err) {
      console.error(`[email] RUPE: falha ao notificar encarregado ${opts.emailEncarregado}: ${formatResendError(err)}`);
    }
  }

  return { aluno: alunoOk, encarregado: encarregadoOk };
}

// ── Helpers SMTP (nodemailer fallback) ────────────────────────────────────────
function isSMTPConfigured(): boolean {
  return !!(process.env.SMTP_HOST && (process.env.SMTP_USER || process.env.SMTP_PASS));
}

async function sendOtpViaSmtp(
  toEmail: string,
  primeiroNome: string,
  code: string,
  sistemaLabel: string,
  htmlBody: string
): Promise<{ success: boolean; message: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST!,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
      tls: { rejectUnauthorized: false },
    });
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || `noreply@${process.env.SMTP_HOST}`;
    await transport.sendMail({
      from: `${sistemaLabel} <${from}>`,
      to: toEmail,
      subject: `${code} é o seu código de acesso — ${sistemaLabel}`,
      html: htmlBody,
      text: `Ola ${primeiroNome}, o seu codigo de verificacao e: ${code}. Valido por 5 minutos.`,
    });
    console.log(`[email] ✅ OTP enviado via SMTP para ${toEmail}`);
    return { success: true, message: "Email enviado via SMTP." };
  } catch (smtpErr) {
    console.error("[email] SMTP fallback falhou:", (smtpErr as Error).message);
    return { success: false, message: `SMTP falhou: ${(smtpErr as Error).message}` };
  }
}

// ── OTP por Email ─────────────────────────────────────────────────────────────
export async function sendOtpByEmail(
  toEmail: string,
  nomeUtilizador: string,
  code: string,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  const sistemaLabel = nomeEscola || "Super Escola";
  const primeiroNome = (nomeUtilizador || "Utilizador").split(" ")[0];

  if (!isEmailConfigured()) {
    // Tentar SMTP mesmo sem Resend
    if (isSMTPConfigured()) {
      const htmlFallback = `<p>Olá ${primeiroNome}, o seu código de verificação é: <strong>${code}</strong>. Válido por 5 minutos.</p>`;
      return sendOtpViaSmtp(toEmail, primeiroNome, code, sistemaLabel, htmlFallback);
    }
    console.warn(`[email] RESEND_API_KEY e SMTP não configurados. OTP para ${toEmail} não enviado por email.`);
    return { success: false, message: "Serviço de email não configurado (RESEND_API_KEY ou SMTP)." };
  }

  const resend = getResend();
  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Código de Verificação — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1A5276,#0D1F35);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(240,165,0,0.15);border:2px solid rgba(240,165,0,0.4);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
                <span style="font-size:30px;">🔐</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Verificação em 2 Passos</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">${sistemaLabel}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;text-align:center;">
              <p style="margin:0 0 24px;color:rgba(255,255,255,0.85);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>!<br/>
                Recebemos um pedido de acesso à sua conta. Use o código abaixo para confirmar a sua identidade.
              </p>
              <div style="background:rgba(200,154,42,0.12);border:2px dashed rgba(200,154,42,0.5);border-radius:12px;padding:24px 32px;margin:0 auto 24px;display:inline-block;">
                <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#C89A2A;font-family:monospace;">${code}</div>
                <p style="margin:8px 0 0;color:rgba(255,255,255,0.45);font-size:12px;">Válido por 5 minutos</p>
              </div>

              <!-- Botão Magic Link — compatível com Outlook (table-based) -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="#C89A2A" style="border-radius:12px;">
                          <a href="${(process.env.APP_URL || 'https://liceun303.live').replace(/\/$/, '')}/login?otp=${code}&e=${encodeURIComponent(toEmail)}"
                             target="_blank"
                             style="display:inline-block;background:#C89A2A;color:#0A1228;text-decoration:none;font-size:15px;font-weight:800;padding:14px 36px;border-radius:12px;letter-spacing:0.3px;font-family:Arial,sans-serif;mso-padding-alt:14px 36px;">
                            &#9889; Entrar Automaticamente
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:10px 0 0;color:rgba(255,255,255,0.4);font-size:11px;font-family:Arial,sans-serif;">Clique no botão acima para entrar sem digitar o código</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:rgba(255,255,255,0.4);font-size:12px;line-height:1.6;">
                Se não foi você a tentar fazer login, ignore este email e a sua conta permanecerá segura.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${sistemaLabel} · Verificação automática de segurança</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      reply_to: getFromEmail(),
      to: toEmail,
      subject: `${code} é o seu código de acesso — ${sistemaLabel}`,
      html: htmlBody,
      text: `Ola ${primeiroNome}, o seu codigo de verificacao e: ${code}. Valido por 5 minutos.`,
    });
    return { success: true, message: "Email enviado com sucesso." };
  } catch (resendErr) {
    const detail = formatResendError(resendErr);
    console.warn(`[email] Resend falhou para OTP (${toEmail}): ${detail} — a tentar SMTP fallback`);
    if (isSMTPConfigured()) {
      const smtpResult = await sendOtpViaSmtp(toEmail, primeiroNome, code, sistemaLabel, htmlBody);
      if (smtpResult.success) return smtpResult;
    }
    console.error(`[email] Erro ao enviar OTP (Resend + SMTP falharam) para ${toEmail}: ${detail}`);
    return { success: false, message: "Falha ao enviar email com código OTP." };
  }
}

export async function sendWelcomeEmail(
  toEmail: string,
  nomeUtilizador: string,
  senha: string,
  role: string,
  appUrl: string,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend não configurado. Email de boas-vindas não enviado.");
    return { success: false, message: "Serviço de email não configurado." };
  }

  const resend = getResend();
  const primeiroNome = nomeUtilizador.split(" ")[0] || nomeUtilizador;
  const sistemaLabel = nomeEscola || "Super Escola";

  const roleMap: Record<string, string> = {
    admin: "Administrador",
    director: "Director",
    teacher: "Professor",
    professor: "Professor",
    aluno: "Aluno",
    student: "Aluno",
    encarregado: "Encarregado de Educação",
    guardian: "Encarregado de Educação",
    ceo: "CEO / Gestor",
    secretaria: "Secretário(a)",
    financeiro: "Técnico Financeiro",
    rh: "Recursos Humanos",
    biblioteca: "Bibliotecário(a)",
    subdirector: "Sub-Director(a)",
    coordenador: "Coordenador(a)",
  };
  const perfilLabel = roleMap[role] ?? role;

  // ── Conteúdo de campos a completar — específico por tipo de utilizador ──
  const isAluno      = ["aluno","student"].includes(role);
  const isProfessor  = ["professor","teacher"].includes(role);
  const isEncarregado = ["encarregado","guardian"].includes(role);
  const isAdmin = !isAluno && !isProfessor && !isEncarregado;

  type CheckItem = { icon: string; text: string };
  let checkItems: CheckItem[] = [];

  if (isAluno) {
    checkItems = [
      { icon: "📷", text: "Foto de perfil" },
      { icon: "🪪", text: "Bilhete de Identidade (número, data e local de emissão)" },
      { icon: "🏠", text: "Morada actual / residência" },
      { icon: "📱", text: "Número de telefone de contacto" },
      { icon: "👨‍👩‍👧", text: "Dados do Encarregado de Educação (se incompletos)" },
      { icon: "🎓", text: "Curso e turma (se ainda não atribuídos)" },
    ];
  } else if (isProfessor) {
    checkItems = [
      { icon: "📷", text: "Foto de perfil" },
      { icon: "🪪", text: "Bilhete de Identidade (número e dados)" },
      { icon: "📚", text: "Habilitações académicas e especialização" },
      { icon: "📱", text: "Número de telefone de contacto" },
      { icon: "🏫", text: "Disciplinas e turmas leccionadas (se ainda não atribuídas)" },
      { icon: "💼", text: "Dados do contrato (categoria e tempo de serviço)" },
    ];
  } else if (isEncarregado) {
    checkItems = [
      { icon: "📷", text: "Foto de perfil" },
      { icon: "🪪", text: "Número do Bilhete de Identidade" },
      { icon: "🏠", text: "Morada / residência" },
      { icon: "📱", text: "Segundo número de contacto (opcional)" },
      { icon: "💼", text: "Profissão e local de trabalho" },
      { icon: "🧾", text: "NIF (Número de Identificação Fiscal)" },
    ];
  } else {
    // Pessoal administrativo (admin, director, secretaria, financeiro, rh, etc.)
    checkItems = [
      { icon: "📷", text: "Foto de perfil" },
      { icon: "🪪", text: "Bilhete de Identidade e NIF" },
      { icon: "🏠", text: "Morada / residência" },
      { icon: "📱", text: "Número de telefone de contacto" },
      { icon: "📚", text: "Habilitações académicas" },
      { icon: "💼", text: "Departamento, secção e cargo (se ainda não definidos)" },
    ];
  }

  const checkItemsHtml = checkItems
    .map(item => `
      <tr>
        <td style="padding:5px 0;vertical-align:top;width:28px;font-size:15px;">${item.icon}</td>
        <td style="padding:5px 0;color:rgba(255,255,255,0.8);font-size:13px;line-height:1.5;">${item.text}</td>
      </tr>`)
    .join("");

  const checkItemsText = checkItems.map(i => `  • ${i.text}`).join("\n");

  const htmlBody = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

          <!-- ▸ Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a3a6b 0%,#1A5276 50%,#2980B9 100%);padding:38px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(200,154,42,0.18);border:2px solid rgba(200,154,42,0.5);border-radius:50%;width:76px;height:76px;line-height:76px;text-align:center;margin-bottom:18px;">
                <span style="font-size:34px;">🎓</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:23px;font-weight:700;letter-spacing:0.4px;">Bem-vindo(a) ao ${sistemaLabel}!</h1>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">A sua conta foi criada — perfil: <strong style="color:#C89A2A;">${perfilLabel}</strong></p>
            </td>
          </tr>

          <!-- ▸ Saudação -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>!
              </p>
              <p style="margin:0;color:rgba(255,255,255,0.65);font-size:14px;line-height:1.7;">
                A sua conta no <strong style="color:#ffffff;">${sistemaLabel}</strong> foi criada pelo administrador do sistema.
                Use as credenciais abaixo para fazer o seu <strong style="color:#ffffff;">primeiro acesso</strong>.
              </p>
            </td>
          </tr>

          <!-- ▸ Caixa de credenciais -->
          <tr>
            <td style="padding:24px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(26,82,118,0.35);border:1.5px solid rgba(41,128,185,0.45);border-radius:14px;padding:22px 26px;">
                    <p style="margin:0 0 14px;color:rgba(255,255,255,0.38);font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;">🔐 Credenciais de acesso</p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);font-size:12px;width:38%;">📧 Email / Utilizador</td>
                        <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:#ffffff;font-size:13px;font-weight:600;word-break:break-all;">${toEmail}</td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);font-size:12px;">🔑 Senha inicial</td>
                        <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
                          <span style="display:inline-block;background:rgba(200,154,42,0.15);border:1px solid rgba(200,154,42,0.4);border-radius:6px;padding:4px 12px;color:#C89A2A;font-size:16px;font-weight:700;letter-spacing:3px;font-family:'Courier New',monospace;">${senha}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:rgba(255,255,255,0.5);font-size:12px;">👤 Perfil no sistema</td>
                        <td style="padding:8px 0;color:#ffffff;font-size:13px;font-weight:600;">${perfilLabel}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ▸ Botão de acesso -->
          <tr>
            <td style="padding:26px 40px 0;text-align:center;">
              <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#1A5276,#2980B9);color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:11px;font-size:15px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                🚀 Aceder ao ${sistemaLabel}
              </a>
              <p style="margin:10px 0 0;color:rgba(255,255,255,0.35);font-size:11px;">
                Ou copie este endereço: <span style="color:#3498DB;">${appUrl}</span>
              </p>
            </td>
          </tr>

          <!-- ▸ Dados a completar -->
          <tr>
            <td style="padding:28px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(26,150,80,0.1);border:1px solid rgba(26,150,80,0.3);border-radius:14px;padding:20px 24px;">
                    <p style="margin:0 0 14px;color:rgba(255,255,255,0.45);font-size:10.5px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;">📋 Dados a preencher na aplicação</p>
                    <p style="margin:0 0 12px;color:rgba(255,255,255,0.65);font-size:13px;line-height:1.6;">
                      Após o primeiro acesso, pode completar o seu perfil com os seguintes dados:
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${checkItemsHtml}
                    </table>
                    <p style="margin:14px 0 0;color:rgba(255,255,255,0.45);font-size:12px;line-height:1.5;">
                      Aceda a <strong style="color:rgba(255,255,255,0.65);">Menu → O meu Perfil</strong> para completar os seus dados pessoais.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ▸ Alerta de segurança -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(200,80,0,0.1);border:1px solid rgba(200,100,0,0.3);border-radius:12px;padding:16px 20px;">
                    <p style="margin:0;color:rgba(255,255,255,0.8);font-size:13px;line-height:1.65;">
                      ⚠️ <strong style="color:#E87722;">Importante — Segurança da conta:</strong><br/>
                      A senha apresentada acima é temporária e foi definida pelo administrador.
                      <strong style="color:#ffffff;">Altere-a imediatamente</strong> após o primeiro acesso em
                      <em style="color:#C89A2A;">Perfil → Alterar Senha</em>.
                      Escolha uma senha robusta com pelo menos 8 caracteres, incluindo letras, números e símbolos.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ▸ Footer -->
          <tr>
            <td style="padding:28px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);margin-top:28px;">
              <p style="margin:0;color:rgba(255,255,255,0.22);font-size:11px;line-height:1.7;">
                Este email foi enviado automaticamente pelo <strong style="color:rgba(255,255,255,0.35);">${sistemaLabel}</strong> — Sistema Integrado de Gestão Académica.<br/>
                Por favor, não responda a este email. Em caso de dúvida, contacte a secretaria da escola.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textBody = `Olá ${primeiroNome},

A sua conta no ${sistemaLabel} foi criada com sucesso!

━━ CREDENCIAIS DE ACESSO ━━
📧 Email:       ${toEmail}
🔑 Senha:       ${senha}
👤 Perfil:      ${perfilLabel}
🔗 Acesso:      ${appUrl}

━━ DADOS A PREENCHER NA APLICAÇÃO ━━
Após o primeiro acesso, complete o seu perfil com:
${checkItemsText}

Aceda a: Menu → O meu Perfil

━━ SEGURANÇA ━━
⚠️  ALTERE A SUA SENHA imediatamente após o primeiro acesso!
Aceda a: Perfil → Alterar Senha
Escolha uma senha robusta (mín. 8 caracteres, com letras, números e símbolos).

— ${sistemaLabel} | Sistema de Gestão Académica`;

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      to: toEmail,
      subject: `🎓 Bem-vindo(a) ao ${sistemaLabel} — As suas credenciais de acesso`,
      html: htmlBody,
      text: textBody,
    });
    console.log(`[email] Email de boas-vindas enviado para ${toEmail}`);
    return { success: true, message: "Email de boas-vindas enviado com sucesso." };
  } catch (err) {
    console.error("[email] Erro ao enviar email de boas-vindas:", formatResendError(err));
    return { success: false, message: "Falha ao enviar email de boas-vindas." };
  }
}

// ── Relatório de Backup Diário ────────────────────────────────────────────

export interface BackupRelatorioInfo {
  ficheiro: string;
  tamanhoBytes: number;
  duracaoMs: number;
  tabelasIncluidas: number;
  hetznerEnviado?: boolean;
  hetznerErro?: string;
  nomeEscola?: string;
}

export async function sendBackupRelatorio(
  destinatarios: string[],
  info: BackupRelatorioInfo
): Promise<{ success: boolean; enviados: number; erros: string[] }> {
  if (!isEmailConfigured()) {
    console.warn("[email] Resend não configurado — relatório de backup não enviado.");
    return { success: false, enviados: 0, erros: ["RESEND_API_KEY não configurada."] };
  }
  if (destinatarios.length === 0) {
    return { success: false, enviados: 0, erros: ["Nenhum destinatário encontrado."] };
  }

  const resend = getResend();
  const sistemaLabel = info.nomeEscola || "Super Escola";
  const dataHora = new Date().toLocaleString("pt-AO", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  const tamanhoFmt = info.tamanhoBytes > 1_048_576
    ? `${(info.tamanhoBytes / 1_048_576).toFixed(2)} MB`
    : info.tamanhoBytes > 1_024
    ? `${(info.tamanhoBytes / 1_024).toFixed(1)} KB`
    : `${info.tamanhoBytes} B`;

  const duracaoFmt = info.duracaoMs > 60_000
    ? `${Math.round(info.duracaoMs / 60_000)} min`
    : `${Math.round(info.duracaoMs / 1_000)}s`;

  const hetznerBadge = info.hetznerEnviado === true
    ? `<span style="display:inline-block;background:#14532D22;border:1px solid #16A34A44;color:#16A34A;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">✅ Enviado para Hetzner</span>`
    : info.hetznerEnviado === false
    ? `<span style="display:inline-block;background:#7F1D1D22;border:1px solid #DC262644;color:#EF4444;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;">⚠️ Hetzner: ${info.hetznerErro ?? 'erro'}</span>`
    : `<span style="display:inline-block;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.4);padding:2px 8px;border-radius:6px;font-size:11px;">Hetzner não configurado</span>`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Backup Diário — ${sistemaLabel}</title>
</head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#064E3B,#065F46);padding:32px 40px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.1);border:2px solid rgba(255,255,255,0.25);border-radius:50%;width:68px;height:68px;line-height:68px;text-align:center;margin-bottom:16px;">
                <span style="font-size:30px;">🗄️</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">Backup Diário Concluído</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">${sistemaLabel} — Sistema de Gestão Académica</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <p style="margin:0 0 20px;color:rgba(255,255,255,0.8);font-size:14px;line-height:1.7;">
                O backup automático diário da base de dados foi concluído com <strong style="color:#34D399;">sucesso</strong> em <strong style="color:#C89A2A;">${dataHora}</strong>.
              </p>

              <!-- Stats grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.8px;padding-bottom:14px;" colspan="2">DETALHES DO BACKUP</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:rgba(255,255,255,0.55);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);width:45%;">📁 Ficheiro</td>
                        <td style="padding:7px 0;color:#ffffff;font-size:12px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);font-family:monospace;">${info.ficheiro}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:rgba(255,255,255,0.55);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">💾 Tamanho</td>
                        <td style="padding:7px 0;color:#34D399;font-size:13px;font-weight:700;border-bottom:1px solid rgba(255,255,255,0.06);">${tamanhoFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:rgba(255,255,255,0.55);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">⏱️ Duração</td>
                        <td style="padding:7px 0;color:#60A5FA;font-size:13px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);">${duracaoFmt}</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:rgba(255,255,255,0.55);font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06);">🗃️ Tabelas</td>
                        <td style="padding:7px 0;color:#C89A2A;font-size:13px;font-weight:600;border-bottom:1px solid rgba(255,255,255,0.06);">${info.tabelasIncluidas} tabelas incluídas</td>
                      </tr>
                      <tr>
                        <td style="padding:7px 0;color:rgba(255,255,255,0.55);font-size:13px;">🌐 Hetzner</td>
                        <td style="padding:7px 0;">${hetznerBadge}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Info box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td style="background:rgba(200,154,42,0.07);border:1px solid rgba(200,154,42,0.2);border-radius:10px;padding:14px 18px;">
                    <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;line-height:1.7;">
                      📂 O ficheiro está guardado na pasta <code style="background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px;font-size:12px;">backups/</code> do servidor.
                      Os últimos <strong style="color:#C89A2A;">7 backups</strong> são mantidos automaticamente — os mais antigos são removidos.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:rgba(255,255,255,0.3);font-size:11px;line-height:1.6;">
                Este email foi gerado automaticamente pelo ${sistemaLabel}. Para configurar o destino do backup ou a hora de execução, contacte o administrador do sistema.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:rgba(0,0,0,0.25);padding:18px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${sistemaLabel} — Backup automático às 00:05 (hora de Angola)</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const textBody = `Backup Diário — ${sistemaLabel}

✅ Backup concluído com sucesso em ${dataHora}.

Ficheiro : ${info.ficheiro}
Tamanho  : ${tamanhoFmt}
Duração  : ${duracaoFmt}
Tabelas  : ${info.tabelasIncluidas}
Hetzner  : ${info.hetznerEnviado === true ? 'Enviado ✅' : info.hetznerEnviado === false ? `Erro: ${info.hetznerErro}` : 'Não configurado'}

O ficheiro encontra-se em backups/ no servidor. Os últimos 7 backups são mantidos.

— ${sistemaLabel} | Sistema de Gestão Académica`;

  const erros: string[] = [];
  let enviados = 0;

  for (const email of destinatarios) {
    try {
      await sendResendWithFallback(resend, {
        from: `${sistemaLabel} <${getFromEmail()}>`,
        to: email,
        subject: `🗄️ Backup Diário Concluído — ${dataHora} — ${sistemaLabel}`,
        html: htmlBody,
        text: textBody,
      });
      enviados++;
      console.log(`[backup-email] ✅ Relatório enviado para ${email}`);
    } catch (err) {
      const detail = formatResendError(err);
      {
        console.error(`[backup-email] Erro ao enviar para ${email}: ${detail}`);
        erros.push(`${email}: ${detail}`);
      }
    }
  }

  return { success: enviados > 0, enviados, erros };
}

// ─── Notificação de Promoção de Acesso ───────────────────────────────────────

/**
 * Envia email ao utilizador quando o seu role ou permissões são actualizados.
 * @param toEmail         Email do destinatário
 * @param nomeUtilizador  Nome completo do utilizador
 * @param titulo          Assunto/título do email
 * @param detalhes        Lista de { label, valor } com o que mudou
 * @param nomeEscola      Nome da escola (opcional)
 */
export async function sendAccessNotificationEmail(
  toEmail: string,
  nomeUtilizador: string,
  titulo: string,
  detalhes: Array<{ label: string; valor: string }>,
  nomeEscola?: string
): Promise<{ success: boolean; message: string }> {
  if (!isEmailConfigured()) return { success: false, message: "Serviço de email não configurado." };
  const resend = getResend();
  const sistemaLabel = nomeEscola || "Super Escola";
  const primeiroNome = nomeUtilizador.split(" ")[0] || nomeUtilizador;
  const appUrl = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
    : "#";

  const detalhesRows = detalhes.map(d => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);font-size:12px;white-space:nowrap;">${d.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06);color:#C89A2A;font-size:13px;font-weight:600;">${d.valor}</td>
    </tr>`).join('');

  const textoSimples = detalhes.map(d => `${d.label}: ${d.valor}`).join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#0D1F35;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1F35;padding:40px 20px;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#0F2347;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
      <tr>
        <td style="background:linear-gradient(135deg,#1d4ed8,#0D1F35);padding:32px 40px;text-align:center;">
          <div style="display:inline-block;background:rgba(240,165,0,0.15);border:2px solid rgba(240,165,0,0.4);border-radius:50%;width:64px;height:64px;line-height:64px;text-align:center;margin-bottom:16px;">
            <span style="font-size:28px;">🔑</span>
          </div>
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${titulo}</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.6);font-size:13px;">${sistemaLabel}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
            Olá, <strong style="color:#C89A2A;">${primeiroNome}</strong>,
          </p>
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.75);font-size:14px;line-height:1.6;">
            O seu acesso no <strong>${sistemaLabel}</strong> foi actualizado. Consulte os detalhes abaixo:
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);margin-bottom:24px;">
            <thead>
              <tr style="background:rgba(29,78,216,0.3);">
                <th style="padding:10px 12px;text-align:left;color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.08);">Campo</th>
                <th style="padding:10px 12px;text-align:left;color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.08);">Novo Valor</th>
              </tr>
            </thead>
            <tbody>${detalhesRows}</tbody>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:4px 0 20px;">
                <a href="${appUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#2C3E50);color:#ffffff;text-decoration:none;padding:13px 36px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:0.3px;border:1px solid rgba(255,255,255,0.15);">
                  Aceder ao SIGA
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;color:rgba(255,255,255,0.35);font-size:11px;line-height:1.6;">
            Se não reconheces esta alteração, contacta imediatamente o administrador da escola.<br>
            Este email foi enviado automaticamente pelo ${sistemaLabel}. Por favor, não respondas a este email.
          </p>
        </td>
      </tr>
      <tr>
        <td style="background:rgba(0,0,0,0.2);padding:16px 40px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;color:rgba(255,255,255,0.25);font-size:11px;">${sistemaLabel} — Sistema Integrado de Gestão Académica</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`.trim();

  try {
    await sendResendWithFallback(resend, {
      from: `${sistemaLabel} <${getFromEmail()}>`,
      to: toEmail,
      subject: `${titulo} — ${sistemaLabel}`,
      html: htmlBody,
      text: `Olá ${primeiroNome},\n\nO seu acesso no ${sistemaLabel} foi actualizado:\n${textoSimples}\n\nAceda ao SIGA: ${appUrl}\n\n— ${sistemaLabel}`,
    });
    return { success: true, message: "Email enviado com sucesso." };
  } catch (err) {
    const detail = formatResendError(err);
    console.error(`[email] Falha ao enviar notificação de acesso para ${toEmail}: ${detail}`);
    return { success: false, message: detail };
  }
}
