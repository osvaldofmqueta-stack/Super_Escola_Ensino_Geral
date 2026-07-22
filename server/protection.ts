/**
 * Super Escola / SIGA — Sistema de Protecção Anti-Clonagem
 * © Queta Tech, Lda. — Eng. Osvaldo Fernando Muondo Queta
 *
 * Camadas de protecção:
 *  1. Fingerprint do servidor (hardware) — guardado em ficheiro LOCAL por servidor
 *  2. Bloqueio por domínio autorizado — configurado na BD (partilhado)
 *  3. Validação na inicialização com notificação ao CEO
 *  4. Verificação periódica (a cada 6 horas)
 *
 * NOTA ARQUITECTURAL: o fingerprint é guardado num ficheiro local (.server_fp)
 * porque cada servidor (Replit dev, Hetzner prod) tem hardware diferente mas
 * partilha a mesma BD Neon. Guardar na BD causaria conflitos entre servidores.
 */

import * as os from "os";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { query } from "./db";

// Caminho do ficheiro de fingerprint (local ao servidor)
const FP_FILE = path.resolve(process.cwd(), ".server_fp");

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ProtectionStatus {
  fingerprintOk: boolean;
  dominioOk: boolean;
  licencaOk: boolean;
  bloqueado: boolean;
  motivo?: string;
  fingerprint?: string;
  dominiosAutorizados: string[];
  serverInfo: {
    hostname: string;
    platform: string;
    cpus: number;
  };
}

// ─── Estado interno ───────────────────────────────────────────────────────────

let _status: ProtectionStatus = {
  fingerprintOk: true,
  dominioOk: true,
  licencaOk: true,
  bloqueado: false,
  dominiosAutorizados: [],
  serverInfo: { hostname: "", platform: "", cpus: 0 },
};

let _validationInterval: ReturnType<typeof setInterval> | null = null;

// ─── Geração do Fingerprint ───────────────────────────────────────────────────

/**
 * Gera um fingerprint único baseado no hardware deste servidor:
 *  - Hostname
 *  - MACs de interfaces de rede não-internas
 *  - Modelo e número de CPUs
 */
export function generateFingerprint(): string {
  const hostname = os.hostname();
  const platform = os.platform();
  const cpuModel = os.cpus()[0]?.model ?? "unknown";
  const cpuCount = os.cpus().length;

  const nets = os.networkInterfaces();
  const macs: string[] = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of (ifaces ?? [])) {
      if (!iface.internal && iface.mac && iface.mac !== "00:00:00:00:00:00") {
        macs.push(iface.mac.toLowerCase());
      }
    }
  }
  macs.sort();

  const raw = [hostname, platform, cpuModel, String(cpuCount), ...macs].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

// ─── Fingerprint local (ficheiro por servidor) ────────────────────────────────

function lerFingerprintLocal(): string | null {
  try {
    if (!fs.existsSync(FP_FILE)) return null;
    const content = fs.readFileSync(FP_FILE, "utf-8").trim();
    return content || null;
  } catch {
    return null;
  }
}

function guardarFingerprintLocal(fp: string): void {
  try {
    fs.writeFileSync(FP_FILE, fp, { encoding: "utf-8", mode: 0o600 });
  } catch (e) {
    console.warn("[protection] Não foi possível guardar .server_fp:", (e as Error).message);
  }
}

// ─── Gestão de Domínios (BD partilhada) ──────────────────────────────────────

async function carregarDominiosAutorizados(): Promise<string[]> {
  try {
    const rows = await query<{ dominiosAutorizados?: string[] | string | null }>(
      `SELECT "dominiosAutorizados" FROM public.config_geral LIMIT 1`, []
    );
    const raw = rows[0]?.dominiosAutorizados;
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return []; }
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Validação Principal ──────────────────────────────────────────────────────

export async function validarProtecao(): Promise<void> {
  const fp = generateFingerprint();
  const hostname = os.hostname();
  const platform = os.platform();
  const cpuCount = os.cpus().length;

  _status.serverInfo = { hostname, platform, cpus: cpuCount };

  const [fpGuardado, dominios] = await Promise.all([
    Promise.resolve(lerFingerprintLocal()),
    carregarDominiosAutorizados(),
  ]);

  _status.dominiosAutorizados = dominios;

  // 1. Fingerprint (ficheiro local)
  if (!fpGuardado) {
    // Primeiro arranque neste servidor — registar fingerprint actual
    guardarFingerprintLocal(fp);
    _status.fingerprintOk = true;
    console.log(`[protection] ✅ Fingerprint registado para este servidor: ${fp}`);
  } else if (fpGuardado !== fp) {
    _status.fingerprintOk = false;
    _status.motivo = "Fingerprint do servidor mudou — hardware alterado ou possível clonagem.";
    console.warn(`[protection] ⚠️  Fingerprint MUDOU! Guardado=${fpGuardado} Actual=${fp}`);
    await registarEventoSeguranca("FINGERPRINT_MISMATCH", {
      fpGuardado, fpActual: fp, hostname, platform,
    });
  } else {
    _status.fingerprintOk = true;
  }

  _status.fingerprint = fp;

  // 2. Verificar licença activa
  try {
    const rows = await query<{
      licencaNivel?: string;
      licencaExpiracao?: string;
    }>(
      `SELECT "licencaNivel","licencaExpiracao" FROM public.config_geral LIMIT 1`, []
    );
    const cfg = rows[0];
    if (cfg) {
      const expirado = cfg.licencaExpiracao
        ? new Date(cfg.licencaExpiracao) < new Date()
        : false;
      _status.licencaOk = !expirado;
      if (expirado) {
        _status.motivo = (_status.motivo ? _status.motivo + " " : "") + "Licença expirada.";
      }
    }
  } catch {
    // BD indisponível — não bloquear
  }

  if (!_status.fingerprintOk) {
    console.warn("[protection] ⚠️  Servidor em modo DEGRADADO — hardware não reconhecido.");
  } else {
    console.log("[protection] ✅ Protecção activa — servidor autorizado.");
  }
}

// ─── Evento de Segurança ──────────────────────────────────────────────────────

async function registarEventoSeguranca(
  tipo: string,
  detalhes: Record<string, unknown>
): Promise<void> {
  try {
    await query(
      `INSERT INTO public.alertas_seguranca
        (id, tipo, descricao, "criadoEm", metadados)
       VALUES ($1, $2, $3, NOW(), $4)
       ON CONFLICT DO NOTHING`,
      [
        `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tipo,
        `[AntiClonagem] ${tipo}: ${JSON.stringify(detalhes).slice(0, 500)}`,
        JSON.stringify(detalhes),
      ]
    );
  } catch {
    // Tabela pode não existir em instalações antigas — ignorar
  }
}

// ─── Middleware de Domínio ────────────────────────────────────────────────────

/**
 * Middleware Express: bloqueia pedidos de domínios não autorizados.
 * Se a lista de domínios estiver vazia, permite tudo (modo aberto).
 * Localhost, IPs e ambientes Replit são sempre permitidos.
 */
export function dominioMiddleware(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): void {
  const dominios = _status.dominiosAutorizados;

  // Lista vazia = modo aberto (permite tudo)
  if (dominios.length === 0) { next(); return; }

  const host = (req.headers.host ?? "").split(":")[0].toLowerCase().trim();

  // Sempre permite localhost, IPs e ambientes Replit/dev
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    /^(\d{1,3}\.){3}\d{1,3}$/.test(host) ||
    host.endsWith(".replit.dev") ||
    host.endsWith(".repl.co") ||
    host.endsWith(".replit.app");

  if (isLocal) { next(); return; }

  // Verifica se o host está autorizado (ou é subdomínio autorizado)
  const autorizado = dominios.some((d) => {
    const dominio = d.toLowerCase().trim();
    return host === dominio || host.endsWith("." + dominio);
  });

  if (autorizado) { next(); return; }

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.socket?.remoteAddress ??
    "?";

  console.warn(
    `[protection] 🚫 Domínio não autorizado: ${host} (IP: ${ip}) ${req.method} ${req.path}`
  );

  res.status(403).json({
    error: "Acesso não autorizado. Este servidor não está licenciado para este domínio.",
    code: "DOMAIN_NOT_AUTHORIZED",
  });
}

// ─── Inicialização ────────────────────────────────────────────────────────────

export async function initProtection(): Promise<void> {
  console.log("[protection] Inicializando sistema de protecção Anti-Clonagem...");

  try {
    await validarProtecao();
  } catch (e) {
    console.warn("[protection] Aviso na inicialização:", (e as Error).message);
  }

  // Verificação periódica a cada 6 horas
  if (_validationInterval) clearInterval(_validationInterval);
  _validationInterval = setInterval(async () => {
    try {
      await validarProtecao();
    } catch { /* silencioso */ }
  }, 6 * 60 * 60 * 1000);
}

// ─── API Pública ──────────────────────────────────────────────────────────────

export function getProtectionStatus(): ProtectionStatus {
  return { ..._status };
}

export async function adicionarDominio(dominio: string): Promise<void> {
  const dominios = await carregarDominiosAutorizados();
  const clean = dominio.toLowerCase().trim();
  if (!dominios.includes(clean)) {
    dominios.push(clean);
    await query(
      `UPDATE public.config_geral SET "dominiosAutorizados"=$1 WHERE id=(SELECT id FROM public.config_geral LIMIT 1)`,
      [JSON.stringify(dominios)]
    );
    _status.dominiosAutorizados = dominios;
    console.log(`[protection] ✅ Domínio adicionado: ${clean}`);
  }
}

export async function removerDominio(dominio: string): Promise<void> {
  const dominios = await carregarDominiosAutorizados();
  const clean = dominio.toLowerCase().trim();
  const novos = dominios.filter((d) => d !== clean);
  await query(
    `UPDATE public.config_geral SET "dominiosAutorizados"=$1 WHERE id=(SELECT id FROM public.config_geral LIMIT 1)`,
    [JSON.stringify(novos)]
  );
  _status.dominiosAutorizados = novos;
  console.log(`[protection] 🗑️  Domínio removido: ${clean}`);
}

/**
 * Reseta o fingerprint: apaga o ficheiro local e regista o fingerprint actual.
 * Usar após migrar o servidor para novo hardware.
 */
export async function resetarFingerprint(): Promise<string> {
  const fp = generateFingerprint();
  guardarFingerprintLocal(fp);
  _status.fingerprintOk = true;
  _status.fingerprint = fp;
  _status.motivo = undefined;
  console.log(`[protection] 🔄 Fingerprint resetado: ${fp}`);
  return fp;
}
