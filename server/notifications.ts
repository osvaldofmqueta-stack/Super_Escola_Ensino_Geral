import webpush from "web-push";
import { query } from "./db";
import { sendGuardianNotificationEmail, sendDocumentoProntoEmail } from "./email";
import { sendSms, formatPhone } from "./sms";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:sige@escola.ao";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY.length > 50) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.log("[push] VAPID configurado com sucesso. Notificações push activas.");
  } catch (error) {
    console.warn("[push] Falha na configuração VAPID:", (error as Error).message);
  }
} else {
  console.warn("[push] VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY não configuradas. Push desactivado.");
}

export type NotificacaoTipo = "nota" | "falta" | "propina" | "mensagem" | "geral";

export interface GuardianNotificationPayload {
  titulo: string;
  mensagem: string;
  tipo: NotificacaoTipo;
  url?: string;
  alunoId?: string;
  alunoNome?: string;
}

type JsonObject = Record<string, unknown>;

async function getNomeEscola(): Promise<string> {
  try {
    const rows = await query<JsonObject>(`SELECT "nomeEscola" FROM public.config_geral LIMIT 1`, []);
    return (rows[0]?.nomeEscola as string) || "Super Escola";
  } catch {
    return "Super Escola";
  }
}

async function getGuardianByAlunoId(alunoId: string): Promise<{ email: string | null; userId: string | null }> {
  const rows = await query<JsonObject>(
    `SELECT u.id, u.email
     FROM public.utilizadores u
     WHERE u."alunoId" = $1 AND u.role = 'encarregado' AND u.ativo = true
     LIMIT 1`,
    [alunoId]
  );
  if (!rows[0]) return { email: null, userId: null };
  return { email: rows[0].email as string, userId: rows[0].id as string };
}

async function getAlunoEmailEncarregado(alunoId: string): Promise<{ emailEncarregado: string | null; nomeAluno: string | null; nomeEncarregado: string | null }> {
  const rows = await query<JsonObject>(
    `SELECT "emailEncarregado", nome || ' ' || apelido as "nomeAluno", "nomeEncarregado"
     FROM public.alunos WHERE id = $1 LIMIT 1`,
    [alunoId]
  );
  if (!rows[0]) return { emailEncarregado: null, nomeAluno: null, nomeEncarregado: null };
  return {
    emailEncarregado: rows[0].emailEncarregado as string | null,
    nomeAluno: rows[0].nomeAluno as string | null,
    nomeEncarregado: rows[0].nomeEncarregado as string | null,
  };
}

async function getPushSubscriptionsForUser(utilizadorId: string) {
  try {
    const rows = await query<JsonObject>(
      `SELECT * FROM public.push_subscriptions WHERE "utilizadorId" = $1`,
      [utilizadorId]
    );
    return rows;
  } catch {
    return [];
  }
}

/**
 * Notificação genérica para qualquer utilizador (professor, secretaria, director, etc.).
 * Garante: gravação in-app (com link e auditoria) + envio web-push se houver subscrição.
 */
export interface NotifyUserOptions {
  titulo: string;
  mensagem: string;
  tipo?: string; // 'info' | 'aviso' | 'urgente' | 'sucesso' | qualquer label custom
  link?: string;
  enviadoPor?: string; // email/identificador de quem enviou (auditoria)
}

export async function notifyUser(utilizadorId: string, opts: NotifyUserOptions): Promise<void> {
  if (!utilizadorId) return;
  const tipo = opts.tipo ?? "info";
  const link = opts.link ?? null;

  // 1) Gravar notificação in-app (não falha se a coluna enviadoPor ainda não existir)
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    try {
      await query(
        `INSERT INTO public.notificacoes
           ("utilizadorId","titulo","mensagem","tipo","data","lida","link","enviadoPor")
         VALUES ($1,$2,$3,$4,$5,false,$6,$7)`,
        [utilizadorId, opts.titulo, opts.mensagem, tipo, hoje, link, opts.enviadoPor ?? null]
      );
    } catch {
      // fallback: schema antigo sem enviadoPor
      await query(
        `INSERT INTO public.notificacoes
           ("utilizadorId","titulo","mensagem","tipo","data","lida","link")
         VALUES ($1,$2,$3,$4,$5,false,$6)`,
        [utilizadorId, opts.titulo, opts.mensagem, tipo, hoje, link]
      );
    }
  } catch (err) {
    console.error("[notify] Falha ao gravar notificação in-app:", err);
  }

  // 2) Enviar web push (best-effort)
  try {
    await sendPushToUser(utilizadorId, {
      titulo: opts.titulo,
      mensagem: opts.mensagem,
      tipo: "geral",
      url: link ?? "/",
    });
  } catch (err) {
    console.warn("[notify] Falha no envio push:", (err as Error).message);
  }
}

async function sendPushToUser(utilizadorId: string, payload: GuardianNotificationPayload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;

  const subscriptions = await getPushSubscriptionsForUser(utilizadorId);
  const pushPayload = JSON.stringify({
    title: payload.titulo,
    body: payload.mensagem,
    icon: "/icons/icon-192.png",
    badge: "/icons/favicon-32.png",
    data: { url: payload.url ?? "/", tipo: payload.tipo },
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint as string,
            keys: {
              p256dh: sub.p256dh as string,
              auth: sub.auth as string,
            },
          },
          pushPayload
        );
      } catch (err: unknown) {
        const pushErr = err as { statusCode?: number };
        if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
          await query(
            `DELETE FROM public.push_subscriptions WHERE endpoint = $1`,
            [sub.endpoint]
          );
          console.log("[push] Removed expired subscription:", sub.endpoint);
        } else {
          throw err;
        }
      }
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`[push] ${failed.length} push(es) failed for user ${utilizadorId}`);
  }
}

// Save an in-app notification to the database for a specific user
async function saveNotificacaoParaUtilizador(
  utilizadorId: string,
  titulo: string,
  mensagem: string,
  tipo: string,
  link?: string
) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO public.notificacoes ("utilizadorId", "titulo", "mensagem", "tipo", "data", "lida", "link")
       VALUES ($1, $2, $3, $4, $5, false, $6)`,
      [utilizadorId, titulo, mensagem, tipo, hoje, link ?? "/portal-encarregado"]
    );
  } catch (err) {
    console.error("[notify] Failed to save in-app notification:", err);
  }
}

export async function notifyGuardianAboutNota(
  alunoId: string,
  disciplina: string,
  nf: number | null,
  trimestre: string
) {
  try {
    const [aluno, { userId }, nomeEscola] = await Promise.all([
      getAlunoEmailEncarregado(alunoId),
      getGuardianByAlunoId(alunoId),
      getNomeEscola(),
    ]);

    const nfDisplay = nf !== null ? `${nf} valores` : "lançada";
    const titulo = "📋 Nova Nota Lançada";
    const mensagem = `A nota de ${aluno.nomeAluno ?? "seu educando"} em ${disciplina} (${trimestre}) foi ${nfDisplay}.`;

    const payload: GuardianNotificationPayload = {
      titulo,
      mensagem,
      tipo: "nota",
      url: "/portal-encarregado",
      alunoId,
      alunoNome: aluno.nomeAluno ?? undefined,
    };

    const tasks: Promise<unknown>[] = [];

    if (userId) {
      tasks.push(sendPushToUser(userId, payload));
      tasks.push(saveNotificacaoParaUtilizador(userId, titulo, mensagem, "info", "/portal-encarregado"));
    }

    if (aluno.emailEncarregado) {
      tasks.push(
        sendGuardianNotificationEmail(
          aluno.emailEncarregado,
          aluno.nomeEncarregado ?? "Encarregado",
          titulo,
          mensagem,
          "nota",
          aluno.nomeAluno ?? undefined,
          nomeEscola
        )
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[notify] Error notifying guardian about nota:", err);
  }
}

export async function notifyGuardianAboutFalta(
  alunoId: string,
  disciplina: string,
  data: string,
  status: string
) {
  if (status !== "falta" && status !== "F") return;

  try {
    const [aluno, { userId }, nomeEscola] = await Promise.all([
      getAlunoEmailEncarregado(alunoId),
      getGuardianByAlunoId(alunoId),
      getNomeEscola(),
    ]);

    const titulo = "⚠️ Falta Registada";
    const mensagem = `${aluno.nomeAluno ?? "Seu educando"} teve falta em ${disciplina} no dia ${data}.`;

    const payload: GuardianNotificationPayload = {
      titulo,
      mensagem,
      tipo: "falta",
      url: "/portal-encarregado",
      alunoId,
      alunoNome: aluno.nomeAluno ?? undefined,
    };

    const tasks: Promise<unknown>[] = [];

    if (userId) {
      tasks.push(sendPushToUser(userId, payload));
      tasks.push(saveNotificacaoParaUtilizador(userId, titulo, mensagem, "aviso", "/portal-encarregado"));
    }

    if (aluno.emailEncarregado) {
      tasks.push(
        sendGuardianNotificationEmail(
          aluno.emailEncarregado,
          aluno.nomeEncarregado ?? "Encarregado",
          titulo,
          mensagem,
          "falta",
          aluno.nomeAluno ?? undefined,
          nomeEscola
        )
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[notify] Error notifying guardian about falta:", err);
  }
}

export async function notifyGuardianAboutPropina(
  alunoId: string,
  mes: string,
  valor: number,
  status: string
) {
  try {
    const [aluno, { userId }, nomeEscola] = await Promise.all([
      getAlunoEmailEncarregado(alunoId),
      getGuardianByAlunoId(alunoId),
      getNomeEscola(),
    ]);

    const isPendente = status === "pendente" || status === "em_atraso";
    const titulo = isPendente ? "💳 Propina Vencida" : "✅ Pagamento Confirmado";
    const mensagem = isPendente
      ? `A propina de ${aluno.nomeAluno ?? "seu educando"} referente a ${mes} (${valor.toLocaleString("pt-AO")} Kz) está em cobrança.`
      : `O pagamento de ${aluno.nomeAluno ?? "seu educando"} referente a ${mes} foi confirmado com sucesso.`;

    const payload: GuardianNotificationPayload = {
      titulo,
      mensagem,
      tipo: "propina",
      url: "/portal-encarregado",
      alunoId,
      alunoNome: aluno.nomeAluno ?? undefined,
    };

    const tasks: Promise<unknown>[] = [];

    if (userId) {
      tasks.push(sendPushToUser(userId, payload));
      tasks.push(saveNotificacaoParaUtilizador(
        userId,
        titulo,
        mensagem,
        isPendente ? "urgente" : "sucesso",
        "/portal-encarregado"
      ));
    }

    if (aluno.emailEncarregado) {
      tasks.push(
        sendGuardianNotificationEmail(
          aluno.emailEncarregado,
          aluno.nomeEncarregado ?? "Encarregado",
          titulo,
          mensagem,
          "propina",
          aluno.nomeAluno ?? undefined,
          nomeEscola
        )
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[notify] Error notifying guardian about propina:", err);
  }
}

/**
 * Obtém o utilizadorId do aluno a partir do alunoId.
 * Devolve null se o aluno não tiver conta de utilizador.
 */
async function getUtilizadorIdDoAluno(alunoId: string): Promise<string | null> {
  try {
    const rows = await query<JsonObject>(
      `SELECT "utilizadorId" FROM public.alunos WHERE id=$1 LIMIT 1`,
      [alunoId]
    );
    return (rows[0]?.utilizadorId as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Notifica o próprio aluno (não o encarregado) directamente na sua conta.
 * Inclui push se tiver subscrição registada.
 */
export async function notifyAluno(
  alunoId: string,
  titulo: string,
  mensagem: string,
  tipo: string = 'info',
  link: string = '/(main)/portal-estudante'
): Promise<void> {
  try {
    const utilizadorId = await getUtilizadorIdDoAluno(alunoId);
    if (!utilizadorId) return; // aluno sem conta de utilizador
    await notifyUser(utilizadorId, { titulo, mensagem, tipo, link, enviadoPor: 'sistema' });
  } catch (err) {
    console.error('[notify] Erro ao notificar aluno:', (err as Error).message);
  }
}

/**
 * Notifica aluno quando um pagamento é confirmado como pago.
 */
export async function notifyAlunoPagamentoConfirmado(
  alunoId: string,
  rubrica: string,
  valor: number,
  mes?: string
): Promise<void> {
  const valorFmt = valor.toLocaleString('pt-AO');
  const periodo = mes ? ` · ${mes}` : '';
  await notifyAluno(
    alunoId,
    '✅ Pagamento confirmado',
    `O teu pagamento de ${rubrica}${periodo} (${valorFmt} Kz) foi registado com sucesso.`,
    'sucesso',
    '/(main)/portal-estudante'
  );
}

/**
 * Notifica aluno quando as suas notas de uma pauta são lançadas/publicadas.
 * Inclui notificação in-app + email (se o aluno tiver conta com email).
 */
export async function notifyAlunoNotasLancadas(
  alunoId: string,
  disciplina: string,
  trimestre: string | number
): Promise<void> {
  const titulo = '📋 Notas publicadas';
  const mensagem = `As tuas notas de ${disciplina} do ${trimestre}º trimestre foram publicadas. Consulta o teu histórico.`;
  await notifyAluno(alunoId, titulo, mensagem, 'info', '/(main)/portal-estudante');
  // Email ao aluno (se tiver utilizador com email)
  try {
    const rows = await query<JsonObject>(
      `SELECT u.email, a.nome AS "alunoNome"
       FROM public.alunos a
       LEFT JOIN public.utilizadores u ON u.id = a."utilizadorId"
       WHERE a.id = $1 LIMIT 1`,
      [alunoId]
    );
    const emailAluno = rows[0]?.email as string | null;
    const nomeAluno = rows[0]?.alunoNome as string | null;
    if (emailAluno) {
      const nomeEscola = await getNomeEscola();
      await sendGuardianNotificationEmail(emailAluno, nomeAluno || 'Estudante', titulo, mensagem, 'nota', nomeAluno || undefined, nomeEscola);
    }
  } catch {}
}

/**
 * Notifica aluno quando o documento solicitado fica pronto para levantamento.
 * Envia notificação in-app + email ao aluno E ao encarregado, em nome do Instituto.
 */
export async function notifyAlunoDocumentoPronte(
  alunoId: string,
  tipoDoc: string
): Promise<void> {
  // 1) Notificação in-app ao aluno
  await notifyAluno(
    alunoId,
    '📄 Documento pronto',
    `O teu ${tipoDoc} está pronto para levantamento na secretaria.`,
    'sucesso',
    '/(main)/portal-estudante'
  );

  // 2) Email ao aluno e ao encarregado em nome do Instituto
  try {
    const [nomeEscola, dadosAluno] = await Promise.all([
      getNomeEscola(),
      // DISTINCT ON garante uma linha por aluno mesmo com múltiplos encarregados
      query<JsonObject>(
        `SELECT DISTINCT ON (a.id)
           a.nome, a.apelido,
           a."telefoneEncarregado",
           u_aluno.email    AS "emailAluno",
           u_aluno.telefone AS "telefoneAluno",
           u_enc.id         AS "encarregadoId",
           u_enc.email      AS "emailEncarregado",
           u_enc.nome       AS "nomeEncarregado"
         FROM public.alunos a
         LEFT JOIN public.utilizadores u_aluno ON u_aluno.id = a."utilizadorId"
         LEFT JOIN public.utilizadores u_enc
           ON u_enc."alunoId" = a.id AND u_enc.role = 'encarregado' AND u_enc.ativo = true
         WHERE a.id = $1
         ORDER BY a.id, u_enc.id NULLS LAST`,
        [alunoId]
      ),
    ]);

    const row = dadosAluno[0] as any;
    if (!row) return;

    const nomeAluno = [row.nome, row.apelido].filter(Boolean).join(' ') || 'Aluno';

    await sendDocumentoProntoEmail({
      emailAluno: row.emailAluno || null,
      nomeAluno,
      emailEncarregado: row.emailEncarregado || null,
      nomeEncarregado: row.nomeEncarregado || null,
      tipoDocumento: tipoDoc,
      nomeEscola,
    });

    // 3) Notificação in-app ao encarregado — usa o id da query principal, sem lookup secundário
    const encarregadoId = row.encarregadoId as string | null;
    if (encarregadoId) {
      await notifyUser(encarregadoId, {
        titulo: '📄 Documento do seu educando pronto',
        mensagem: `O ${tipoDoc} de ${nomeAluno} está pronto para levantamento na secretaria.`,
        tipo: 'sucesso',
        link: '/portal-encarregado',
        enviadoPor: 'sistema',
      }).catch(() => {});
    }

    // 4) SMS ao aluno e ao encarregado
    await Promise.allSettled([
      row.telefoneAluno
        ? sendSms(
            row.telefoneAluno,
            `[${nomeEscola}] O seu ${tipoDoc} está pronto para levantamento na secretaria. Traga o BI. Seg-Sex 8h-16h.`,
            nomeEscola
          )
        : Promise.resolve(),
      row.telefoneEncarregado
        ? sendSms(
            row.telefoneEncarregado,
            `[${nomeEscola}] O ${tipoDoc} de ${nomeAluno} está pronto para levantamento na secretaria. Seg-Sex 8h-16h.`,
            nomeEscola
          )
        : Promise.resolve(),
    ]);
  } catch (err) {
    console.error('[notify] Erro ao enviar email de documento pronto:', (err as Error).message);
  }
}

export async function notifyGuardianGeneric(
  alunoId: string,
  titulo: string,
  mensagem: string
) {
  try {
    const [aluno, { userId }, nomeEscola] = await Promise.all([
      getAlunoEmailEncarregado(alunoId),
      getGuardianByAlunoId(alunoId),
      getNomeEscola(),
    ]);

    const payload: GuardianNotificationPayload = {
      titulo,
      mensagem,
      tipo: "geral",
      url: "/portal-encarregado",
    };

    const tasks: Promise<unknown>[] = [];

    if (userId) {
      tasks.push(sendPushToUser(userId, payload));
      tasks.push(saveNotificacaoParaUtilizador(userId, titulo, mensagem, "info", "/portal-encarregado"));
    }

    if (aluno.emailEncarregado) {
      tasks.push(
        sendGuardianNotificationEmail(
          aluno.emailEncarregado,
          aluno.nomeEncarregado ?? "Encarregado",
          titulo,
          mensagem,
          "geral",
          aluno.nomeAluno ?? undefined,
          nomeEscola
        )
      );
    }

    await Promise.allSettled(tasks);
  } catch (err) {
    console.error("[notify] Error sending generic guardian notification:", err);
  }
}
