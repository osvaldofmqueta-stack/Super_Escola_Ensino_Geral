import { query } from "./db";
import { notifyUser, notifyGuardianAboutPropina } from "./notifications";
import { sendSms } from "./sms";
import { sendBackupRelatorio, sendPropinaEmAtrasoEmail } from "./email";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

type JsonObject = Record<string, unknown>;

// Nomes de meses em português para mensagens
const NOMES_MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const sentToday = new Set<string>();
let lastResetDay = new Date().toISOString().slice(0, 10);

function resetIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDay) {
    sentToday.clear();
    lastResetDay = today;
  }
}

// Helper: formata data ISO para português
function fmtDataPT(iso: string): string {
  const [a, m, d] = iso.split('-');
  const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${d}/${m}/${a}`;
}

export async function runAutoLembretesPautasOnce(): Promise<{ enviados: number; prazos: number }> {
  resetIfNewDay();
  let enviados = 0;
  let prazosProcessados = 0;
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const amanha = new Date(); amanha.setDate(hoje.getDate() + 1);
    const amanhaStr = amanha.toISOString().slice(0, 10);
    const tresDias = new Date(); tresDias.setDate(hoje.getDate() + 3);
    const tresDiasStr = tresDias.toISOString().slice(0, 10);

    // Buscar todos os prazos activos
    const prazos = await query<JsonObject>(
      `SELECT * FROM public.prazos_mini_pauta WHERE ativo=true`,
      []
    );

    for (const prazo of prazos as any[]) {
      prazosProcessados++;
      const dataInicio: string | null = prazo.dataInicio ?? null;
      const dataLimite: string = String(prazo.dataLimite ?? '');

      // Determinar qual notificação enviar hoje
      type NotifTipo = 'inicio' | '72h' | '24h' | 'hoje';
      let notifTipo: NotifTipo | null = null;
      let titulo = '';
      let prefixoMensagem = '';

      if (dataInicio && dataInicio === hojeStr) {
        notifTipo = 'inicio';
        titulo = `📋 Lançamento de Notas Aberto — ${prazo.trimestre}º Trimestre`;
        prefixoMensagem = `O período de lançamento de notas do ${prazo.trimestre}º trimestre começou hoje (${fmtDataPT(hojeStr)}). Prazo final: ${fmtDataPT(dataLimite)}.`;
      } else if (dataLimite === tresDiasStr) {
        notifTipo = '72h';
        titulo = `⚠️ Faltam 3 dias — Notas ${prazo.trimestre}º Trimestre`;
        prefixoMensagem = `O prazo para o lançamento de notas do ${prazo.trimestre}º trimestre termina em 3 dias (${fmtDataPT(dataLimite)}).`;
      } else if (dataLimite === amanhaStr) {
        notifTipo = '24h';
        titulo = `🚨 Faltam 24 horas — Notas ${prazo.trimestre}º Trimestre`;
        prefixoMensagem = `O prazo para o lançamento de notas do ${prazo.trimestre}º trimestre termina AMANHÃ (${fmtDataPT(dataLimite)}).`;
      } else if (dataLimite === hojeStr) {
        notifTipo = 'hoje';
        titulo = `🔴 Prazo Hoje! — Notas ${prazo.trimestre}º Trimestre`;
        prefixoMensagem = `O prazo para o lançamento de notas do ${prazo.trimestre}º trimestre expira HOJE (${fmtDataPT(dataLimite)}). Submete a tua pauta imediatamente.`;
      }

      if (!notifTipo) continue;

      const dedupeKey = `prazo:${prazo.id}:${notifTipo}:${lastResetDay}`;
      if (sentToday.has(dedupeKey)) continue;

      // Pautas abertas para esse trimestre/anoLetivo cujo professor existe
      const pautas = await query<JsonObject>(
        `SELECT p."professorId", p."turmaId", p.disciplina, p.trimestre, t.nome AS "turmaNome", u.id AS "utilId"
         FROM public.pautas p
         LEFT JOIN public.turmas t ON t.id = p."turmaId"
         LEFT JOIN public.professores pr ON pr.id = p."professorId"
         LEFT JOIN public.utilizadores u ON u.id = pr."utilizadorId"
         WHERE p.trimestre=$1 AND p."anoLetivo"=$2 AND p.status<>'fechada' AND p."professorId" IS NOT NULL`,
        [prazo.trimestre, prazo.anoLetivo]
      );

      // Agrupar por utilizador
      const porUser = new Map<string, Array<{ disciplina: string; turma: string; turmaId: string; trimestre: any }>>();
      for (const p of pautas as any[]) {
        if (!p.utilId) continue;
        const arr = porUser.get(String(p.utilId)) ?? [];
        arr.push({
          disciplina: String(p.disciplina ?? ''),
          turma: String(p.turmaNome ?? ''),
          turmaId: String(p.turmaId ?? ''),
          trimestre: p.trimestre,
        });
        porUser.set(String(p.utilId), arr);
      }

      for (const [utilId, ctx] of porUser) {
        const detalhe = ctx
          .map(c => `• ${c.disciplina}${c.turma ? ` — ${c.turma}` : ''} (Trim. ${c.trimestre})`)
          .join('\n');
        const mensagem = `${prefixoMensagem}${detalhe ? `\n\nPautas pendentes:\n${detalhe}` : ''}`;
        let link = '/professor-pauta';
        if (ctx.length === 1 && ctx[0].turmaId && ctx[0].disciplina) {
          const qs = new URLSearchParams({
            turmaId: ctx[0].turmaId,
            disciplina: ctx[0].disciplina,
            trimestre: String(ctx[0].trimestre || ''),
          }).toString();
          link = `/professor-pauta?${qs}`;
        }
        try {
          await notifyUser(utilId, {
            titulo,
            mensagem,
            tipo: 'pauta_lembrete',
            link,
            enviadoPor: `sistema:${notifTipo}`,
          });
          enviados++;
        } catch (err) {
          console.warn('[scheduler] notifyUser falhou para', utilId, (err as Error).message);
        }
      }
      sentToday.add(dedupeKey);
    }
  } catch (e) {
    console.warn('[scheduler] runAutoLembretesPautasOnce erro:', (e as Error).message);
  }
  return { enviados, prazos: prazosProcessados };
}

export function startAutoLembretesPautas() {
  // Executa logo após arranque (com pequeno delay) e depois de hora a hora
  setTimeout(() => {
    runAutoLembretesPautasOnce().then(r => {
      if (r.enviados > 0 || r.prazos > 0) {
        console.log(`[scheduler] lembretes 24h: ${r.enviados} envio(s) para ${r.prazos} prazo(s).`);
      }
    });
  }, 30_000);

  setInterval(() => {
    runAutoLembretesPautasOnce().then(r => {
      if (r.enviados > 0) {
        console.log(`[scheduler] lembretes 24h: ${r.enviados} envio(s).`);
      }
    });
  }, 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
//  COBRANÇA MENSAL DE PROPINAS — corre uma vez por dia
//  · Cria registos pendentes para o mês corrente (se ainda não existirem).
//  · Faz auto-débito do saldo do aluno (opt-in via config.autoDebitoSaldo).
//  · Envia notificações D-3, D-1, dia da multa ao aluno e ao encarregado.
// ─────────────────────────────────────────────────────────────────────────────
async function notifyAlunoUser(alunoId: string, opts: { titulo: string; mensagem: string; tipo?: string; link?: string }) {
  try {
    const rows = await query<JsonObject>(
      `SELECT u.id FROM public.utilizadores u
       LEFT JOIN public.alunos a ON a."utilizadorId"=u.id
       WHERE u."alunoId"=$1 OR a.id=$1 LIMIT 1`,
      [alunoId]
    );
    const userId = (rows[0] as any)?.id;
    if (userId) {
      await notifyUser(String(userId), {
        titulo: opts.titulo,
        mensagem: opts.mensagem,
        tipo: opts.tipo || 'aviso',
        link: opts.link || '/portal-estudante?tab=financeiro',
        enviadoPor: 'sistema:cobranca',
      });
    }
  } catch (err) {
    console.warn('[cobranca] notifyAlunoUser falhou:', (err as Error).message);
  }
}

export async function runCobrancaPropinasDiaria(): Promise<{ criados: number; debitados: number; notificados: number }> {
  resetIfNewDay();
  let criados = 0;
  let debitados = 0;
  let notificados = 0;

  try {
    const cfgRows = await query<JsonObject>(`SELECT * FROM public.config_geral ORDER BY id LIMIT 1`, []);
    const cfg = cfgRows[0] || {};
    const autoDebito = !!(cfg as any).autoDebitoSaldo;
    const multaConfig = ((cfg as any).multaConfig as Record<string, unknown> | null) || {};
    const dataLimite = Number((multaConfig as any).dataLimitePagamento || 10);

    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = String(hoje.getFullYear());

    const taxasPropina = await query<JsonObject>(
      `SELECT * FROM public.taxas WHERE tipo='propina' AND ativo=true AND ("anoAcademico"=$1 OR "anoAcademico"='' OR "anoAcademico" IS NULL)`,
      [anoAtual]
    );
    if (taxasPropina.length === 0) {
      return { criados, debitados, notificados };
    }

    const alunos = await query<JsonObject>(
      `SELECT a.id, a.nome, a.apelido, a."turmaId", t.nivel
       FROM public.alunos a LEFT JOIN public.turmas t ON t.id=a."turmaId"
       WHERE a.ativo=true`,
      []
    );

    function taxaParaAluno(nivel: string | null): JsonObject | null {
      if (!nivel) return (taxasPropina[0] as JsonObject) || null;
      return (taxasPropina.find(t => {
        const n = String((t as any).nivel || '').toLowerCase();
        return n === '' || n === 'todos' || n === String(nivel).toLowerCase();
      }) as JsonObject | undefined) || (taxasPropina[0] as JsonObject) || null;
    }

    for (const aluno of alunos as any[]) {
      const taxa = taxaParaAluno(aluno.nivel);
      if (!taxa) continue;
      const valorPropina = Number((taxa as any).valor || 0);
      if (valorPropina <= 0) continue;

      // 1) Garantir que existe um registo pendente para o mês corrente
      const existentes = await query<JsonObject>(
        `SELECT * FROM public.pagamentos
         WHERE "alunoId"=$1 AND ano=$2 AND mes=$3 AND status<>'cancelado'
         LIMIT 1`,
        [aluno.id, anoAtual, mesAtual]
      );

      let pagamentoMes = existentes[0] as any;
      if (!pagamentoMes) {
        const dedupeKey = `criar:${aluno.id}:${anoAtual}-${mesAtual}`;
        if (!sentToday.has(dedupeKey)) {
          const insRows = await query<JsonObject>(
            `INSERT INTO public.pagamentos
              (id,"alunoId","taxaId",valor,data,mes,ano,status,"metodoPagamento",observacao)
             VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,'pendente','referencia_bancaria',$7) RETURNING *`,
            [aluno.id, (taxa as any).id, valorPropina, hoje.toISOString().slice(0, 10), mesAtual, anoAtual,
             `Cobrança automática mensal (${NOMES_MESES[mesAtual]} ${anoAtual})`]
          );
          pagamentoMes = insRows[0];
          sentToday.add(dedupeKey);
          criados++;
        }
      }

      if (!pagamentoMes || pagamentoMes.status === 'pago') continue;

      // 2) Auto-débito do saldo (opt-in)
      if (autoDebito) {
        const sRes = await query<JsonObject>(`SELECT * FROM public.saldo_alunos WHERE "alunoId"=$1`, [aluno.id]);
        const saldoRow = sRes[0] as any;
        const saldoActual = saldoRow ? Number(saldoRow.saldo) : 0;
        if (saldoActual >= valorPropina) {
          const dedupeKey = `debito:${aluno.id}:${anoAtual}-${mesAtual}`;
          if (!sentToday.has(dedupeKey)) {
            const novoSaldo = saldoActual - valorPropina;
            await query(`UPDATE public.saldo_alunos SET saldo=$1, "updatedAt"=NOW() WHERE "alunoId"=$2`, [novoSaldo, aluno.id]);
            await query(
              `INSERT INTO public.movimentos_saldo ("alunoId", tipo, valor, descricao, "pagamentoId", "criadoPor")
               VALUES ($1,'debito',$2,$3,$4,'sistema:cobranca')`,
              [aluno.id, valorPropina, `Débito automático propina ${NOMES_MESES[mesAtual]} ${anoAtual}`, pagamentoMes.id]
            );
            await query(
              `UPDATE public.pagamentos SET status='pago', data=$1, observacao=COALESCE(observacao,'') || ' | Débito automático do saldo' WHERE id=$2`,
              [hoje.toISOString().slice(0, 10), pagamentoMes.id]
            );
            sentToday.add(dedupeKey);
            debitados++;

            await notifyAlunoUser(aluno.id, {
              titulo: 'Propina liquidada (débito automático)',
              mensagem: `A propina de ${NOMES_MESES[mesAtual]} (${valorPropina.toLocaleString('pt-AO')} Kz) foi liquidada automaticamente a partir do seu saldo. Saldo restante: ${novoSaldo.toLocaleString('pt-AO')} Kz.`,
              tipo: 'sucesso',
            });
            await notifyGuardianAboutPropina(aluno.id, NOMES_MESES[mesAtual], valorPropina, 'pago');
            continue;
          }
        }
      }

      // 3) Lembretes D-3, D-1 e dia da multa
      const eventos: Array<{ chave: string; titulo: string; mensagem: string; quando: number }> = [
        { chave: 'd3', quando: dataLimite - 3,
          titulo: 'Propina por liquidar (faltam 3 dias)',
          mensagem: `Faltam 3 dias para o limite de pagamento da propina de ${NOMES_MESES[mesAtual]} (${valorPropina.toLocaleString('pt-AO')} Kz). Após o dia ${dataLimite} começa a contar multa.` },
        { chave: 'd1', quando: dataLimite - 1,
          titulo: 'Propina por liquidar (amanhã é o último dia)',
          mensagem: `Amanhã é o último dia para liquidar a propina de ${NOMES_MESES[mesAtual]} (${valorPropina.toLocaleString('pt-AO')} Kz) sem multa.` },
        { chave: 'multa', quando: dataLimite,
          titulo: 'Multa começa a correr hoje',
          mensagem: `Hoje começa a contar multa sobre a propina de ${NOMES_MESES[mesAtual]} (${valorPropina.toLocaleString('pt-AO')} Kz). Regularize o quanto antes para evitar penalizações adicionais.` },
      ];

      for (const ev of eventos) {
        if (diaHoje !== ev.quando) continue;
        const dedupeKey = `aviso:${ev.chave}:${aluno.id}:${anoAtual}-${mesAtual}`;
        if (sentToday.has(dedupeKey)) continue;
        try {
          await notifyAlunoUser(aluno.id, { titulo: ev.titulo, mensagem: ev.mensagem, tipo: 'aviso' });
          await notifyGuardianAboutPropina(aluno.id, NOMES_MESES[mesAtual], valorPropina, 'pendente');
          sentToday.add(dedupeKey);
          notificados++;
        } catch (err) {
          console.warn('[cobranca] aviso falhou para', aluno.id, (err as Error).message);
        }
      }
    }
  } catch (e) {
    console.warn('[scheduler] runCobrancaPropinasDiaria erro:', (e as Error).message);
  }
  return { criados, debitados, notificados };
}

export function startCobrancaPropinas() {
  // Primeira execução com delay (após arranque), depois a cada 6h.
  setTimeout(() => {
    runCobrancaPropinasDiaria().then(r => {
      if (r.criados > 0 || r.debitados > 0 || r.notificados > 0) {
        console.log(`[scheduler] cobrança propinas: ${r.criados} criado(s), ${r.debitados} debitado(s), ${r.notificados} aviso(s).`);
      }
    });
  }, 60_000);

  setInterval(() => {
    runCobrancaPropinasDiaria().then(r => {
      if (r.criados > 0 || r.debitados > 0 || r.notificados > 0) {
        console.log(`[scheduler] cobrança propinas: ${r.criados} criado(s), ${r.debitados} debitado(s), ${r.notificados} aviso(s).`);
      }
    });
  }, 6 * 60 * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
//  BACKUP AUTOMÁTICO DIÁRIO
//  · Corre todos os dias às 00:05 (Angola, UTC+1 ≈ UTC 23:05 do dia anterior)
//  · Ficheiros guardados em backups/ com timestamp no nome
//  · Mantém apenas os últimos 7 backups (apaga os mais antigos)
//  · Regista resultado em backups/backup.log
// ─────────────────────────────────────────────────────────────────────────────
const BACKUP_DIR  = path.join(process.cwd(), "backups");
const BACKUP_LOG  = path.join(BACKUP_DIR, "backup.log");
const MAX_BACKUPS = 7;

function escreverLogBackup(linha: string) {
  try {
    const ts = new Date().toISOString().replace("T", " ").slice(0, 19);
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.appendFileSync(BACKUP_LOG, `[${ts}] ${linha}\n`, "utf8");
  } catch {}
}

function limparBackupsAntigos() {
  try {
    const ficheiros = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith("siga_backup_") && f.endsWith(".sql"))
      .map(f => ({ nome: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    const aApagar = ficheiros.slice(MAX_BACKUPS);
    for (const f of aApagar) {
      fs.unlinkSync(path.join(BACKUP_DIR, f.nome));
      escreverLogBackup(`🗑  Backup antigo removido: ${f.nome}`);
    }
  } catch {}
}

// ─── Hetzner SCP ─────────────────────────────────────────────────────────────

async function enviarParaHetzner(ficheiroLocal: string): Promise<{ ok: boolean; erro?: string }> {
  const host = process.env.HETZNER_HOST?.trim();
  const sshKey = process.env.HETZNER_SSH_KEY?.trim();
  if (!host || !sshKey) {
    return { ok: false, erro: "HETZNER_HOST ou HETZNER_SSH_KEY não configurados" };
  }

  return new Promise((resolve) => {
    let tmpKey = "";
    try {
      tmpKey = path.join(os.tmpdir(), `siga_hetzner_key_${Date.now()}`);
      const keyContent = sshKey.replace(/\\n/g, "\n");
      fs.writeFileSync(tmpKey, keyContent, { mode: 0o600 });
    } catch (e) {
      return resolve({ ok: false, erro: `Erro ao criar chave SSH temporária: ${(e as Error).message}` });
    }

    const remoto = `root@${host}:/root/backups/`;
    const args = [
      "-i", tmpKey,
      "-o", "StrictHostKeyChecking=no",
      "-o", "ConnectTimeout=30",
      ficheiroLocal,
      remoto,
    ];

    const proc = spawn("scp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let errOut = "";
    proc.stderr.on("data", (d: Buffer) => { errOut += d.toString(); });

    proc.on("close", (code: number) => {
      try { fs.unlinkSync(tmpKey); } catch {}
      if (code === 0) {
        escreverLogBackup(`🌐 Backup enviado para Hetzner (${host})`);
        resolve({ ok: true });
      } else {
        const detalhe = errOut.split("\n").filter(Boolean).slice(0, 2).join(" | ");
        escreverLogBackup(`⚠️  Hetzner SCP falhou (código ${code}): ${detalhe}`);
        resolve({ ok: false, erro: detalhe || `código ${code}` });
      }
    });

    proc.on("error", (err: Error) => {
      try { fs.unlinkSync(tmpKey); } catch {}
      resolve({ ok: false, erro: err.message });
    });
  });
}

// ─── Buscar emails dos destinatários (admin + CEO) ───────────────────────────

async function buscarEmailsBackup(): Promise<string[]> {
  try {
    const rows = await query<JsonObject>(
      `SELECT email FROM public.utilizadores
       WHERE role IN ('ceo','pca','admin') AND ativo = true AND email IS NOT NULL AND email <> ''
       ORDER BY CASE role WHEN 'ceo' THEN 0 WHEN 'pca' THEN 1 ELSE 2 END`,
      []
    );
    const emails = rows
      .map((r) => String((r as any).email ?? "").trim())
      .filter((e) => e.includes("@"));
    return [...new Set(emails)];
  } catch (e) {
    console.warn("[backup] Não foi possível obter emails para relatório:", (e as Error).message);
    return [];
  }
}

// ─── Nome da escola (para o email) ───────────────────────────────────────────

async function buscarNomeEscola(): Promise<string> {
  try {
    const rows = await query<JsonObject>(`SELECT "nomeEscola" FROM public.config_geral LIMIT 1`, []);
    return String((rows[0] as any)?.nomeEscola ?? "Super Escola");
  } catch { return "Super Escola"; }
}

// ─── Backup principal ─────────────────────────────────────────────────────────

export interface BackupDiarioResult {
  ok: boolean;
  ficheiro: string;
  tamanhoBytes: number;
  tabelasIncluidas: number;
  duracaoMs: number;
  hetznerEnviado?: boolean;
  hetznerErro?: string;
  emailEnviados: number;
  emailErros: string[];
}

export function runBackupDiario(): Promise<BackupDiarioResult> {
  return new Promise((resolve) => {
    escreverLogBackup("⏳ A iniciar backup automático...");
    console.log("[backup] A iniciar backup automático da BD...");
    const inicio = Date.now();

    const proc = spawn("node", ["scripts/backup-neon.js", "export"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    proc.stdout.on("data", (d: Buffer) => { output += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { output += d.toString(); });

    proc.on("close", async (code: number) => {
      const duracaoMs = Date.now() - inicio;
      const match = output.match(/siga_backup_[\w\-:.]+\.sql/);
      const nomeFicheiro = match ? match[0] : "desconhecido";
      const ficheiroPath = path.join(BACKUP_DIR, nomeFicheiro);

      if (code !== 0) {
        const msg = `❌ Backup falhou (código ${code})`;
        escreverLogBackup(msg);
        console.error(`[backup] ${msg}`);
        const primLinhas = output.split("\n").filter(Boolean).slice(0, 3).join(" | ");
        if (primLinhas) escreverLogBackup(`   Detalhe: ${primLinhas}`);
        resolve({ ok: false, ficheiro: nomeFicheiro, tamanhoBytes: 0, tabelasIncluidas: 0, duracaoMs, emailEnviados: 0, emailErros: [] });
        return;
      }

      const msg = `✅ Backup concluído: ${nomeFicheiro}`;
      escreverLogBackup(msg);
      console.log(`[backup] ${msg}`);
      limparBackupsAntigos();

      // Tamanho e contagem de tabelas a partir do ficheiro
      let tamanhoBytes = 0;
      let tabelasIncluidas = 0;
      try {
        if (fs.existsSync(ficheiroPath)) {
          tamanhoBytes = fs.statSync(ficheiroPath).size;
          const conteudo = fs.readFileSync(ficheiroPath, "utf8");
          const matches = conteudo.match(/^CREATE TABLE /gm);
          tabelasIncluidas = matches ? matches.length : 0;
        }
      } catch {}

      // Hetzner SCP
      let hetznerEnviado: boolean | undefined;
      let hetznerErro: string | undefined;
      if (process.env.HETZNER_HOST && process.env.HETZNER_SSH_KEY && fs.existsSync(ficheiroPath)) {
        const r = await enviarParaHetzner(ficheiroPath);
        hetznerEnviado = r.ok;
        hetznerErro = r.erro;
      }

      // Email para admin + CEO
      const [emails, nomeEscola] = await Promise.all([buscarEmailsBackup(), buscarNomeEscola()]);
      const emailResult = await sendBackupRelatorio(emails, {
        ficheiro: nomeFicheiro,
        tamanhoBytes,
        duracaoMs,
        tabelasIncluidas,
        hetznerEnviado,
        hetznerErro,
        nomeEscola,
      });

      if (emailResult.enviados > 0) {
        escreverLogBackup(`📧 Relatório enviado para ${emailResult.enviados} destinatário(s): ${emails.join(", ")}`);
      } else if (emails.length === 0) {
        escreverLogBackup("📧 Nenhum email de admin/CEO encontrado — relatório não enviado.");
      } else {
        escreverLogBackup(`📧 Falha ao enviar relatório: ${emailResult.erros.join("; ")}`);
      }

      resolve({
        ok: true,
        ficheiro: nomeFicheiro,
        tamanhoBytes,
        tabelasIncluidas,
        duracaoMs,
        hetznerEnviado,
        hetznerErro,
        emailEnviados: emailResult.enviados,
        emailErros: emailResult.erros,
      });
    });

    proc.on("error", (err: Error) => {
      const msg = `❌ Backup erro ao lançar processo: ${err.message}`;
      escreverLogBackup(msg);
      console.error(`[backup] ${msg}`);
      resolve({ ok: false, ficheiro: "desconhecido", tamanhoBytes: 0, tabelasIncluidas: 0, duracaoMs: Date.now() - Date.now(), emailEnviados: 0, emailErros: [] });
    });
  });
}

// ─── Polling automático de RUPEs pendentes ────────────────────────────────
// Verifica RUPEs activos junto da API EMIS configurada pelo banco, confirmando
// automaticamente os que já foram pagos no ATM/Multicaixa Express.
export async function runPollingRupesPendentesOnce(): Promise<{ verificados: number; confirmados: number }> {
  let verificados = 0;
  let confirmados = 0;
  try {
    const [cfg] = await query<{
      emisAmbiente: string; emisApiUrl: string; emisApiKey: string;
      emisEntidadeId: string; numeroEntidade: string; emisHabilitado: boolean;
    }>(
      `SELECT "emisAmbiente","emisApiUrl","emisApiKey","emisEntidadeId","numeroEntidade","emisHabilitado"
         FROM public.config_geral LIMIT 1`,
      []
    );
    if (!cfg || !cfg.emisHabilitado) return { verificados, confirmados };
    const ambiente = String(cfg.emisAmbiente || 'sandbox');
    if (ambiente !== 'producao') return { verificados, confirmados };
    const apiUrl = String(cfg.emisApiUrl || '').trim();
    const apiKey = String(cfg.emisApiKey || '').trim();
    const entidadeId = String(cfg.emisEntidadeId || cfg.numeroEntidade || '').trim();
    if (!apiUrl || !apiKey || !entidadeId) return { verificados, confirmados };

    // Buscar RUPEs activos não expirados (max 50 por ciclo)
    const agora = new Date();
    const rupesPendentes = await query<{
      id: string; referencia: string; valor: string; alunoId: string;
      taxaId: string; mes: number; ano: string; categoria: string; dataValidade: string;
    }>(
      `SELECT id, referencia, valor, "alunoId", "taxaId", mes, ano, categoria, "dataValidade"
         FROM public.rupes
        WHERE status = 'ativo' AND "dataValidade" > $1
        ORDER BY "createdAt" ASC LIMIT 50`,
      [agora.toISOString()]
    );

    for (const rupe of rupesPendentes) {
      verificados++;
      try {
        const refSemEspacos = rupe.referencia.replace(/\s/g, '');
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 7000);
        // Tenta endpoint de verificação — cada banco tem URI diferente; tentamos o mais comum
        const resp = await fetch(
          `${apiUrl.replace(/\/$/, '')}/payments/status/${encodeURIComponent(refSemEspacos)}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'X-Entity-ID': entidadeId,
              'Accept': 'application/json',
            },
            signal: controller.signal,
          }
        ).catch(() => null);
        clearTimeout(tid);
        if (!resp || !resp.ok) continue;
        const data = await resp.json().catch(() => null) as Record<string, unknown> | null;
        if (!data) continue;
        const pago =
          data['paid'] === true || data['pago'] === true ||
          String(data['status']).toLowerCase() === 'pago' ||
          String(data['status']).toLowerCase() === 'paid' ||
          String(data['status']).toLowerCase() === 'completed';
        if (!pago) continue;
        const dataPag = String(data['paymentDate'] || data['dataPagamento'] || data['paidAt'] || agora.toISOString());
        const valorPago = parseFloat(String(data['amount'] || data['valor'] || data['montante'] || rupe.valor)) || 0;
        const obsExtra = `Confirmação automática (polling_automatico) em ${agora.toISOString()}`;

        // Marcar RUPE como pago
        await query(`UPDATE public.rupes SET status='pago' WHERE id=$1 AND status<>'pago'`, [rupe.id]);

        // Criar registo de pagamento se não existir
        const [existing] = await query<{ id: string }>(
          `SELECT id FROM public.pagamentos WHERE referencia=$1 AND status='pago' LIMIT 1`,
          [rupe.referencia]
        );
        if (!existing) {
          let anoAtual = rupe.ano;
          if (!anoAtual) {
            const [cfgAno] = await query<{ anoLetivo: string }>(
              `SELECT "anoLetivo" FROM public.anos_academicos WHERE ativo=true LIMIT 1`, []
            );
            anoAtual = cfgAno?.anoLetivo || String(new Date().getFullYear());
          }
          await query(
            `INSERT INTO public.pagamentos
               (id,"alunoId","taxaId",valor,data,mes,ano,status,"metodoPagamento",referencia,observacao)
             VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,'pago','referencia_bancaria',$7,$8)`,
            [rupe.alunoId, rupe.taxaId || null, valorPago, dataPag,
             rupe.mes || null, anoAtual, rupe.referencia, obsExtra]
          );
        }
        confirmados++;
        console.log(`[rupe-polling] ✅ RUPE ${rupe.referencia.slice(0, 14)}… confirmado automaticamente.`);
      } catch (_) { /* ignora erros individuais */ }
    }
  } catch (e) {
    console.warn('[rupe-polling] Erro no ciclo de polling:', (e as Error).message);
  }
  return { verificados, confirmados };
}

export function startPollingRupesPendentes() {
  const INTERVALO_MS = 30 * 60 * 1000; // 30 minutos
  async function ciclo() {
    const { verificados, confirmados } = await runPollingRupesPendentesOnce();
    if (verificados > 0) {
      console.log(`[rupe-polling] Ciclo concluído: ${verificados} verificados, ${confirmados} confirmados.`);
    }
    setTimeout(ciclo, INTERVALO_MS);
  }
  // Primeira execução após 2 min do arranque (deixa o servidor estabilizar)
  setTimeout(ciclo, 2 * 60 * 1000);
  console.log('[rupe-polling] Polling automático de RUPEs iniciado (intervalo: 30 min).');
}

// ─────────────────────────────────────────────────────────────────────────────
//  AVISOS SEMANAIS DE PROPINAS EM ATRASO
//  · Deteta pagamentos pendentes de meses anteriores (ou do mês corrente após
//    o prazo limite) e envia email ao aluno e encarregado em nome do Instituto.
//  · Corre uma vez por semana (intervalo de 7 dias). Na primeira execução,
//    aguarda 5 minutos após o arranque para deixar o servidor estabilizar.
// ─────────────────────────────────────────────────────────────────────────────

export async function runAvisosPropinaEmAtraso(): Promise<{ notificados: number }> {
  let notificados = 0;
  try {
    // Garantir coluna de deduplicação (migration inline)
    await query(
      `ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS "ultimoAvisoAtraso" timestamptz`,
      []
    ).catch(() => {});

    const cfgRows = await query<JsonObject>(`SELECT * FROM public.config_geral ORDER BY id LIMIT 1`, []);
    const cfg = cfgRows[0] || {};
    const multaConfig = ((cfg as any).multaConfig as Record<string, unknown> | null) || {};
    const dataLimite = Number((multaConfig as any).dataLimitePagamento || 10);
    const nomeEscola: string = (cfg as any).nomeEscola || 'Super Escola';

    const hoje = new Date();
    const diaHoje = hoje.getDate();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = String(hoje.getFullYear());

    // Buscar pagamentos pendentes/em_atraso que:
    //   1. São de meses anteriores ao corrente, OU do mês corrente após o prazo
    //   2. Nunca foram notificados como em atraso OU o último aviso foi há +7 dias
    // DISTINCT ON (p.id) garante um único resultado por pagamento
    // e obtemos apenas um encarregado por aluno (o mais recente ativo)
    const pagamentos = await query<JsonObject>(
      `SELECT DISTINCT ON (p.id)
         p.id, p."alunoId", p.mes, p.ano, p.valor, p."ultimoAvisoAtraso",
         a.nome AS "nomeAluno", a.apelido AS "apelidoAluno",
         a."utilizadorId"        AS "alunoUtilizadorId",
         a."telefoneEncarregado",
         u_aluno.email           AS "emailAluno",
         u_aluno.telefone        AS "telefoneAluno",
         u_enc.id                AS "encarregadoId",
         u_enc.email             AS "emailEncarregado",
         u_enc.nome              AS "nomeEncarregado"
       FROM public.pagamentos p
       JOIN public.alunos a ON a.id = p."alunoId"
       LEFT JOIN public.utilizadores u_aluno ON u_aluno.id = a."utilizadorId"
       LEFT JOIN public.utilizadores u_enc
         ON u_enc."alunoId" = a.id AND u_enc.role = 'encarregado' AND u_enc.ativo = true
       WHERE p.status IN ('pendente', 'em_atraso')
         AND (
           (CAST(p.ano AS INTEGER) < CAST($1 AS INTEGER))
           OR (CAST(p.ano AS INTEGER) = CAST($1 AS INTEGER) AND p.mes < $2)
           OR (CAST(p.ano AS INTEGER) = CAST($1 AS INTEGER) AND p.mes = $2 AND $3 > $4)
         )
         AND (
           p."ultimoAvisoAtraso" IS NULL
           OR p."ultimoAvisoAtraso" < NOW() - INTERVAL '7 days'
         )
       ORDER BY p.id, u_enc.id NULLS LAST`,
      [anoAtual, mesAtual, diaHoje, dataLimite]
    );

    if (pagamentos.length === 0) return { notificados };

    const NOMES_MESES_PT = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio',
      'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    for (const pag of pagamentos as any[]) {
      try {
        const nomeAluno = [pag.nomeAluno, pag.apelidoAluno].filter(Boolean).join(' ') || 'Aluno';
        const nomeMes = NOMES_MESES_PT[Number(pag.mes)] || `Mês ${pag.mes}`;
        const mesMensagem = `${nomeMes} ${pag.ano}`;

        // Dias em atraso a partir da data de vencimento estimada
        const dataVencimento = new Date(Number(pag.ano), Number(pag.mes) - 1, dataLimite);
        const diasAtraso = Math.max(1, Math.floor((hoje.getTime() - dataVencimento.getTime()) / 86_400_000));
        const valor = Number(pag.valor) || 0;

        // Notificação in-app ao aluno (utilizadorId já vem da query principal)
        const alunoUtilizadorId = pag.alunoUtilizadorId as string | null;
        if (alunoUtilizadorId) {
          await notifyUser(alunoUtilizadorId, {
            titulo: `⚠️ Propina em atraso — ${mesMensagem}`,
            mensagem: `A propina de ${mesMensagem} (${valor.toLocaleString('pt-AO')} Kz) está em atraso há ${diasAtraso} dia(s). Por favor regularize.`,
            tipo: 'urgente',
            link: '/(main)/portal-estudante',
            enviadoPor: 'sistema',
          }).catch(() => {});
        }

        // Notificação in-app ao encarregado (id já vem da query, sem lookup secundário)
        const encarregadoId = pag.encarregadoId as string | null;
        if (encarregadoId) {
          await notifyUser(encarregadoId, {
            titulo: `⚠️ Propina em atraso — ${nomeAluno}`,
            mensagem: `A propina de ${nomeAluno} referente a ${mesMensagem} (${valor.toLocaleString('pt-AO')} Kz) está em atraso há ${diasAtraso} dia(s).`,
            tipo: 'urgente',
            link: '/portal-encarregado',
            enviadoPor: 'sistema',
          }).catch(() => {});
        }

        // Email ao aluno e/ou encarregado em nome do Instituto
        const result = await sendPropinaEmAtrasoEmail({
          emailAluno: pag.emailAluno || null,
          nomeAluno,
          emailEncarregado: pag.emailEncarregado || null,
          nomeEncarregado: pag.nomeEncarregado || null,
          valor,
          mesMensagem,
          diasAtraso,
          nomeEscola,
        });

        // SMS ao aluno
        const smsAluno = pag.telefoneAluno as string | null;
        if (smsAluno) {
          await sendSms(
            smsAluno,
            `[${nomeEscola}] A propina de ${mesMensagem} (${valor.toLocaleString('pt-AO')} Kz) está em atraso há ${diasAtraso} dia(s). Dirija-se à secretaria para regularizar.`,
            nomeEscola
          ).catch(() => {});
        }

        // SMS ao encarregado (telefone directo da ficha do aluno)
        const smsEncarregado = pag.telefoneEncarregado as string | null;
        if (smsEncarregado) {
          await sendSms(
            smsEncarregado,
            `[${nomeEscola}] O seu educando ${nomeAluno} tem propina de ${mesMensagem} (${valor.toLocaleString('pt-AO')} Kz) em atraso há ${diasAtraso} dia(s). Contacte a secretaria.`,
            nomeEscola
          ).catch(() => {});
        }

        // Marcar data do último aviso para deduplicação persistente
        await query(
          `UPDATE public.pagamentos SET "ultimoAvisoAtraso" = NOW() WHERE id = $1`,
          [pag.id]
        ).catch(() => {});

        notificados++;
        console.log(`[avisos-atraso] Aviso enviado: ${nomeAluno} — ${mesMensagem} (${diasAtraso}d atraso) | email-aluno=${result.aluno} email-enc=${result.encarregado} sms-aluno=${!!smsAluno} sms-enc=${!!smsEncarregado}`);
      } catch (err) {
        console.warn('[avisos-atraso] Erro ao processar pagamento', (pag as any).id, (err as Error).message);
      }
    }
  } catch (e) {
    console.warn('[avisos-atraso] Erro geral:', (e as Error).message);
  }
  return { notificados };
}

export function startAvisosPropinaEmAtraso() {
  const INTERVALO_MS = 7 * 24 * 60 * 60 * 1000; // semanal
  // Primeira execução 5 minutos após o arranque
  setTimeout(() => {
    runAvisosPropinaEmAtraso().then(r => {
      if (r.notificados > 0) {
        console.log(`[avisos-atraso] ${r.notificados} aviso(s) de propinas em atraso enviado(s).`);
      }
    });
  }, 5 * 60 * 1000);

  setInterval(() => {
    runAvisosPropinaEmAtraso().then(r => {
      if (r.notificados > 0) {
        console.log(`[avisos-atraso] ${r.notificados} aviso(s) de propinas em atraso enviado(s).`);
      }
    });
  }, INTERVALO_MS);

  console.log('[avisos-atraso] Avisos semanais de propinas em atraso iniciados.');
}

export function startBackupDiario() {
  // Agendar para correr às 00:05 hora de Angola (UTC+1 → 23:05 UTC)
  function msAteMeia(): number {
    const agora = new Date();
    const amanha = new Date(agora);
    amanha.setUTCHours(23, 5, 0, 0); // 23:05 UTC = 00:05 Angola
    if (amanha <= agora) amanha.setUTCDate(amanha.getUTCDate() + 1);
    return amanha.getTime() - agora.getTime();
  }

  function agendar() {
    const ms = msAteMeia();
    const horas = Math.round(ms / 3_600_000 * 10) / 10;
    console.log(`[backup] Próximo backup automático em ${horas}h`);
    escreverLogBackup(`📅 Próximo backup agendado para daqui a ${horas}h`);

    setTimeout(() => {
      runBackupDiario().then(() => {
        agendar(); // reagendar para o dia seguinte
      });
    }, ms);
  }

  agendar();
}
