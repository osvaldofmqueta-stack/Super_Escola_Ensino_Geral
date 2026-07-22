import { Pool, PoolClient } from "pg";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type DbMode = "neon" | "local" | "neon_only" | "local_only";

interface DbSyncState {
  mode: DbMode;
  neonAvailable: boolean;
  neonPermsDenied: boolean;
  localAvailable: boolean;
  lastNeonCheck: Date | null;
  lastFailover: Date | null;
  lastSync: Date | null;
  lastSyncError: string | null;
  lastBackup: Date | null;
  lastBackupError: string | null;
  pendingSync: boolean;
  syncRunning: boolean;
  backupRunning: boolean;
  checkCount: number;
}

export interface HealthPoint {
  ts: number;
  neonOk: boolean;
  localOk: boolean;
  latencyMs: number | null;
}

const HEALTH_HISTORY_MAX = 60;
const healthHistory: HealthPoint[] = [];

export function getHealthHistory(): HealthPoint[] {
  return [...healthHistory];
}

const state: DbSyncState = {
  mode: "neon",
  neonAvailable: true,
  neonPermsDenied: false,
  localAvailable: true,
  lastNeonCheck: null,
  lastFailover: null,
  lastSync: null,
  lastSyncError: null,
  lastBackup: null,
  lastBackupError: null,
  pendingSync: false,
  syncRunning: false,
  backupRunning: false,
  checkCount: 0,
};

let neonPool: Pool | null = null;
let localPool: Pool | null = null;
let activePool: Pool;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let backupTimer: ReturnType<typeof setInterval> | null = null;

const HEALTH_CHECK_INTERVAL_MS = 30_000;
const BACKUP_INTERVAL_MS = 5 * 60_000;
const PING_TIMEOUT_MS = 8_000;
const SYNC_MAX_RETRIES = 3;
const STARTUP_RETRY_ATTEMPTS = 5;
const STARTUP_RETRY_DELAY_MS = 3_000;

let NEON_URL = "";
let LOCAL_URL = "";

function isValidNeonUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 1 && parsed.protocol.startsWith("postgres");
  } catch {
    return false;
  }
}

/**
 * Remove parâmetros SSL do URL e outros params problemáticos com o pooler Neon,
 * pois o SSL é configurado directamente nas opções do Pool.
 */
function sanitizeNeonUrl(raw: string): string {
  try {
    const u = new URL(raw.trim().replace(/\.$/, ""));
    // Remover parâmetros incompatíveis com node-postgres
    // channel_binding=require causa falha de autenticação em versões mais antigas do pg
    u.searchParams.delete("sslmode");
    u.searchParams.delete("uselibpqcompat");
    u.searchParams.delete("channel_binding");
    return u.toString();
  } catch {
    return raw.trim()
      .replace(/\.$/, "")
      .replace(/[?&]sslmode=[^&]*/g, "")
      .replace(/[?&]uselibpqcompat=[^&]*/g, "")
      .replace(/[?&]channel_binding=[^&]*/g, "");
  }
}

export function getActivePool(): Pool {
  return activePool;
}

export function getSyncState(): Readonly<DbSyncState> {
  return { ...state };
}

/**
 * Faz ping ao pool com timeout seguro — liberta o cliente mesmo quando o timeout dispara.
 */
async function pingPool(pool: Pool): Promise<boolean> {
  let client: PoolClient | null = null;
  const timer = new Promise<false>((resolve) =>
    setTimeout(() => resolve(false), PING_TIMEOUT_MS)
  );
  const attempt = (async (): Promise<boolean> => {
    try {
      client = await pool.connect();
      await client.query("SELECT 1");
      return true;
    } catch {
      return false;
    } finally {
      try { client?.release(); } catch {}
    }
  })();

  return Promise.race([attempt, timer]);
}

async function pingPoolWithLatency(pool: Pool): Promise<{ ok: boolean; latencyMs: number | null }> {
  const t0 = Date.now();
  const ok = await pingPool(pool);
  return { ok, latencyMs: ok ? Date.now() - t0 : null };
}

async function switchToLocal(): Promise<void> {
  if (state.mode === "local" || state.mode === "local_only") return;
  console.warn("[db-sync] ⚠️  Neon indisponível — a mudar para base de dados local.");
  state.mode = localPool ? "local" : "local_only";
  state.neonAvailable = false;
  state.lastFailover = new Date();
  state.pendingSync = true;
  if (localPool) activePool = localPool;
}

async function switchToNeon(): Promise<void> {
  if (state.mode === "neon" || state.mode === "neon_only") return;
  if (state.neonPermsDenied) {
    return; // utilizador pooler sem permissões — não mudar para Neon
  }
  console.log("[db-sync] ✅ Neon disponível — a mudar de volta para Neon.");
  state.neonAvailable = true;
  if (neonPool) {
    activePool = neonPool;
    state.mode = "neon";
  }
  if (state.pendingSync) {
    await triggerSync("auto");
  }
}

export async function triggerSync(
  trigger: "auto" | "manual" = "manual",
  retries = 0
): Promise<{ ok: boolean; message: string }> {
  if (state.syncRunning) {
    return { ok: false, message: "Sincronização já em curso. Aguarde." };
  }
  if (!neonPool || !localPool) {
    return { ok: false, message: "Ambas as bases de dados necessárias para sincronizar." };
  }
  if (!NEON_URL || !LOCAL_URL) {
    return { ok: false, message: "URLs de base de dados não configuradas." };
  }

  state.syncRunning = true;
  console.log(`[db-sync] 🔄 A iniciar sincronização LOCAL → NEON (${trigger}, tentativa ${retries + 1})...`);

  try {
    await execAsync(
      `pg_dump --data-only --no-owner --no-acl --no-privileges "${LOCAL_URL}" | psql "${NEON_URL}"`,
      { maxBuffer: 256 * 1024 * 1024 }
    );
    state.lastSync = new Date();
    state.pendingSync = false;
    state.lastSyncError = null;
    console.log(`[db-sync] ✅ Sincronização LOCAL → NEON concluída (${trigger}).`);
    return { ok: true, message: "Dados sincronizados com sucesso do banco local para o Neon." };
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 300);
    state.lastSyncError = msg;
    console.error("[db-sync] ❌ Erro na sincronização:", msg);
    if (retries < SYNC_MAX_RETRIES - 1) {
      console.warn(`[db-sync] A tentar novamente em 10s... (${retries + 2}/${SYNC_MAX_RETRIES})`);
      state.syncRunning = false;
      await new Promise((r) => setTimeout(r, 10_000));
      return triggerSync(trigger, retries + 1);
    }
    return { ok: false, message: `Erro na sincronização após ${SYNC_MAX_RETRIES} tentativas: ${msg}` };
  } finally {
    state.syncRunning = false;
  }
}

export async function triggerBackup(
  trigger: "auto" | "manual" = "manual"
): Promise<{ ok: boolean; message: string }> {
  if (state.backupRunning) {
    return { ok: false, message: "Backup já em curso. Aguarde." };
  }
  if (!neonPool || !localPool) {
    return { ok: false, message: "Ambas as bases de dados necessárias para backup." };
  }
  if (!NEON_URL || !LOCAL_URL) {
    return { ok: false, message: "URLs de base de dados não configuradas." };
  }
  if (state.mode !== "neon" && state.mode !== "neon_only") {
    return { ok: false, message: "Backup ignorado: Neon não está activo como primário." };
  }

  state.backupRunning = true;
  console.log(`[db-sync] 💾 A iniciar backup NEON → LOCAL (${trigger})...`);

  try {
    await execAsync(
      `pg_dump --data-only --no-owner --no-acl --no-privileges "${NEON_URL}" | psql "${LOCAL_URL}"`,
      { maxBuffer: 256 * 1024 * 1024 }
    );
    state.lastBackup = new Date();
    state.lastBackupError = null;
    console.log(`[db-sync] ✅ Backup NEON → LOCAL concluído (${trigger}).`);
    return { ok: true, message: "Backup do Neon para o banco local concluído com sucesso." };
  } catch (err: any) {
    const msg = String(err?.message ?? err).slice(0, 300);
    state.lastBackupError = msg;
    console.error("[db-sync] ❌ Erro no backup:", msg);
    return { ok: false, message: `Erro no backup: ${msg}` };
  } finally {
    state.backupRunning = false;
  }
}

async function runHealthCheck(): Promise<void> {
  state.checkCount++;
  const hasNeon = Boolean(neonPool);
  const hasLocal = Boolean(localPool);

  let neonOk = state.neonAvailable;
  let localOk = state.localAvailable;
  let latencyMs: number | null = null;

  if (hasNeon) {
    try {
      const result = await pingPoolWithLatency(neonPool!);
      neonOk = result.ok;
      latencyMs = result.latencyMs;
      state.lastNeonCheck = new Date();
      if (result.ok && !state.neonAvailable) {
        await switchToNeon();
      } else if (!result.ok && state.neonAvailable) {
        await switchToLocal();
      }
      state.neonAvailable = result.ok;
    } catch {
      neonOk = false;
      if (state.neonAvailable) await switchToLocal();
      state.neonAvailable = false;
    }
  }

  if (hasLocal) {
    try {
      const ok = await pingPool(localPool!);
      localOk = ok;
      state.localAvailable = ok;
    } catch {
      localOk = false;
      state.localAvailable = false;
    }
  }

  const point: HealthPoint = { ts: Date.now(), neonOk, localOk, latencyMs };
  healthHistory.push(point);
  if (healthHistory.length > HEALTH_HISTORY_MAX) healthHistory.shift();
}

function startBackupScheduler(): void {
  if (!isValidNeonUrl(NEON_URL) || !LOCAL_URL) return;
  setTimeout(async () => {
    try { await triggerBackup("auto"); } catch {}
  }, 2 * 60_000);
  backupTimer = setInterval(async () => {
    try { await triggerBackup("auto"); } catch {}
  }, BACKUP_INTERVAL_MS);
  console.log(`[db-sync] 💾 Scheduler de backup iniciado (intervalo: ${BACKUP_INTERVAL_MS / 60000} min).`);
}

/**
 * Tenta ligar ao pool Neon com várias tentativas antes de desistir.
 */
async function connectNeonWithRetry(pool: Pool): Promise<boolean> {
  for (let attempt = 1; attempt <= STARTUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const ok = await pingPool(pool);
      if (ok) return true;
    } catch {}
    if (attempt < STARTUP_RETRY_ATTEMPTS) {
      console.warn(`[db-sync] ⏳ Neon tentativa ${attempt}/${STARTUP_RETRY_ATTEMPTS} falhou — a aguardar ${STARTUP_RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, STARTUP_RETRY_DELAY_MS));
    }
  }
  return false;
}

/**
 * Verifica se o utilizador Neon tem permissões suficientes (SELECT + INSERT no schema public).
 * O utilizador "authenticator" do pooler Neon não tem permissões — nesse caso usa-se o banco local.
 */
async function testNeonPermissions(pool: Pool): Promise<boolean> {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const { rows } = await client.query<{ can_select: boolean; can_create: boolean }>(`
      SELECT
        has_schema_privilege(current_user, 'public', 'USAGE') AS can_select,
        has_schema_privilege(current_user, 'public', 'CREATE') AS can_create
    `);
    const { can_select, can_create } = rows[0];
    if (!can_select) {
      console.warn("[db-sync] ⚠️  Utilizador Neon sem USAGE no schema public — sem permissões suficientes.");
      return false;
    }
    if (!can_create) {
      console.warn("[db-sync] ⚠️  Utilizador Neon sem CREATE no schema public (provavelmente pooler/authenticator).");
      console.warn("[db-sync] ⚠️  A usar banco local como primário. Para usar Neon, forneça a connection string directa (neondb_owner).");
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("[db-sync] ⚠️  Não foi possível verificar permissões Neon:", err?.message ?? err);
    return false;
  } finally {
    try { client?.release(); } catch {}
  }
}

function isLocalDatabase(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" ||
      host === "helium" ||
      host.endsWith(".local") || host.startsWith("10.") ||
      host.startsWith("172.16.") || host.startsWith("192.168.");
  } catch {
    return false;
  }
}

export async function initDbSync(): Promise<Pool> {
  // Prioridade: NEON_DATABASE_URL (Neon externo) — nunca usar DATABASE_URL do Replit se NEON_DATABASE_URL estiver definido
  const neonEnv = process.env.NEON_DATABASE_URL?.trim();
  const replitEnv = process.env.DATABASE_URL?.trim();

  const isNeonSource = Boolean(neonEnv);
  const rawNeon = (neonEnv || replitEnv || "").trim();
  if (!rawNeon) {
    throw new Error("[db-sync] ❌ Nenhuma base de dados configurada. Define NEON_DATABASE_URL ou DATABASE_URL com a connection string do PostgreSQL.");
  }

  if (isNeonSource) {
    console.log("[db-sync] 🔗 A usar base de dados Neon (NEON_DATABASE_URL).");
  } else {
    console.log("[db-sync] 🔗 A usar base de dados Replit (DATABASE_URL).");
  }

  // Apenas sanitizar parâmetros Neon-específicos quando a fonte é NEON_DATABASE_URL
  NEON_URL = isNeonSource ? sanitizeNeonUrl(rawNeon) : rawNeon.trim().replace(/\.$/, "");
  LOCAL_URL = ""; // Não usar base de dados local — apenas pool principal

  const hasNeon = Boolean(rawNeon);

  if (hasNeon) {
    const useSSL = !isLocalDatabase(NEON_URL);
    const poolOptions: import("pg").PoolConfig = {
      connectionString: NEON_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    };

    neonPool = new Pool(poolOptions);
    // Evitar que erros do pool (ex: Neon reiniciar) causem crash do servidor
    neonPool.on("error", (err: Error) => {
      console.warn("[db-sync] ⚠️  Erro inesperado no pool Neon (ignorado):", err.message.split("\n")[0]);
    });
    console.log("[db-sync] Pool criado.");

    const neonOk = await connectNeonWithRetry(neonPool);
    // Verificação de permissões apenas relevante para Neon; para Replit DATABASE_URL assume-se acesso total
    const neonHasPerms = neonOk ? (isNeonSource ? await testNeonPermissions(neonPool) : true) : false;

    // Iniciar monitor de saúde (partilhado entre caminho de sucesso e de retry)
    function startHealthMonitor() {
      if (healthCheckTimer) return;
      healthCheckTimer = setInterval(async () => {
        try {
          const { ok, latencyMs } = await pingPoolWithLatency(neonPool!);
          state.neonAvailable = ok;
          state.lastNeonCheck = new Date();
          const point: HealthPoint = { ts: Date.now(), neonOk: ok, localOk: false, latencyMs };
          healthHistory.push(point);
          if (healthHistory.length > HEALTH_HISTORY_MAX) healthHistory.shift();
          if (!ok) console.warn("[db-sync] ⚠️  Base de dados não respondeu ao health check.");
        } catch {}
      }, HEALTH_CHECK_INTERVAL_MS);
      console.log(`[db-sync] Monitor de saúde iniciado (intervalo: ${HEALTH_CHECK_INTERVAL_MS / 1000}s).`);
    }

    if (neonOk && neonHasPerms) {
      activePool = neonPool;
      state.mode = "neon_only";
      state.neonAvailable = true;
      state.localAvailable = false;
      console.log("[db-sync] ✅ Base de dados ligada com sucesso.");
      startHealthMonitor();
      return activePool;
    }

    // ── Neon não respondeu na inicialização ───────────────────────────────────
    // Em vez de lançar erro (que impede o servidor de arrancar), iniciar em modo
    // degradado com retry automático em background.  O pool já está criado e
    // assim que a Neon acordar, as queries passarão a funcionar.
    console.warn("[db-sync] ⚠️  Neon não respondeu na inicialização — modo degradado.");
    console.warn("[db-sync] ⚠️  O servidor HTTP vai arrancar na mesma. Reconexão automática em 30s.");

    // Manter o pool (não encerrar) — o pg tentará ligar quando chegarem queries
    activePool = neonPool;
    state.neonAvailable = false;
    state.mode = "neon_only";

    // Retry em background até a Neon estar disponível
    let retryCount = 0;
    const bgRetry = setInterval(async () => {
      retryCount++;
      try {
        const ok = await pingPool(neonPool!);
        if (ok) {
          const hasPerms = await testNeonPermissions(neonPool!);
          if (hasPerms) {
            state.neonAvailable = true;
            console.log(`[db-sync] ✅ Reconexão Neon bem-sucedida (tentativa ${retryCount}).`);
            clearInterval(bgRetry);
            startHealthMonitor();
          } else {
            console.warn(`[db-sync] ⚠️  Neon acessível mas sem permissões (tentativa ${retryCount}).`);
          }
        } else {
          console.warn(`[db-sync] ⏳ Reconexão Neon tentativa ${retryCount} falhou — próxima em 30s.`);
        }
      } catch (e: any) {
        console.warn(`[db-sync] ⏳ Reconexão Neon tentativa ${retryCount} — erro: ${e?.message ?? e}`);
      }
    }, 30_000);

    return activePool;
  }

  throw new Error("[db-sync] ❌ DATABASE_URL não configurada. Configure a variável de ambiente com a connection string da base de dados.");
}

export function stopDbSync(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}
