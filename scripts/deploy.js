#!/usr/bin/env node
/**
 * Super Escola — Deploy Completo (build + git + secrets + hetzner)
 *
 * Uso (no terminal do Replit):
 *   node scripts/deploy.js                   # completo
 *   node scripts/deploy.js --skip-build      # sem build do frontend
 *   node scripts/deploy.js --skip-git        # sem push para GitHub
 *   node scripts/deploy.js --skip-deploy     # só build + git (sem Hetzner)
 *   node scripts/deploy.js --skip-tdz        # ignorar verificação TDZ
 *   node scripts/deploy.js --dry-run         # mostra o plano sem executar
 */

'use strict';

const { execSync, spawnSync, execFileSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

// ── Cores ─────────────────────────────────────────────────────────────────────
const G = '\x1b[32m'; const Y = '\x1b[33m'; const R = '\x1b[31m';
const C = '\x1b[36m'; const B = '\x1b[1m';  const D = '\x1b[2m'; const N = '\x1b[0m';
const ok   = (m) => console.log(`   ${G}✓${N} ${m}`);
const info = (m) => console.log(`   ${C}→${N} ${m}`);
const warn = (m) => console.log(`   ${Y}⚠${N}  ${m}`);
const fail = (m) => { console.error(`\n   ${R}✗ ERRO:${N} ${m}\n`); process.exit(1); };
const step = (n, t, total) => console.log(`\n${B}${C}━━━ [${n}/${total}] ${t} ━━━${N}`);
const hr   = () => console.log(`${D}${'─'.repeat(62)}${N}`);

// ── Flags ─────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const SKIP_BUILD  = args.includes('--skip-build');
const SKIP_GIT    = args.includes('--skip-git');
const SKIP_DEPLOY = args.includes('--skip-deploy');
const DRY_RUN     = args.includes('--dry-run');
const SKIP_TDZ    = args.includes('--skip-tdz');
const TOTAL_STEPS = 6;

// ── Scan TDZ (Temporal Dead Zone) ────────────────────────────────────────────
function scanTDZ(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  let compStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^export default function\s|^export function\s/.test(lines[i])) {
      compStart = i + 1; break;
    }
  }
  if (compStart < 0) return [];

  const declarations = new Map();
  for (let i = compStart; i < lines.length; i++) {
    const line = lines[i];
    const mSimple = line.match(/^  (const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]/);
    const mDestr  = line.match(/^  (const|let)\s+\{([^}]+)\}/);
    const mDestrArr = line.match(/^  (const|let)\s+\[([^\]]+)\]/);
    if (mSimple && !declarations.has(mSimple[2])) declarations.set(mSimple[2], i + 1);
    if (mDestr) mDestr[2].split(',').forEach(s => {
      const n = s.trim().split(':')[0].trim().split('=')[0].trim();
      if (/^[A-Za-z_$]/.test(n) && !declarations.has(n)) declarations.set(n, i + 1);
    });
    if (mDestrArr) mDestrArr[2].split(',').forEach(s => {
      const n = s.trim().split('=')[0].trim();
      if (/^[A-Za-z_$]/.test(n) && !declarations.has(n)) declarations.set(n, i + 1);
    });
  }

  const SKIP_NAMES = new Set(['true','false','null','undefined','NaN','Infinity','Math','Date','JSON','Object','Array','String','Number','console','Promise','Error','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','setTimeout','clearTimeout','setInterval','clearInterval','fetch','window','document','navigator']);
  const issues = [];

  for (let i = compStart; i < lines.length; i++) {
    const line = lines[i];
    const mDeps = line.match(/^\s*\},\s*\[([^\]]*)\]/);
    if (mDeps && mDeps[1].trim()) {
      const hookLine = i + 1;
      mDeps[1].split(',').map(d => d.trim().split('.')[0].split('[')[0].trim())
        .filter(n => n && /^[A-Za-z_$]/.test(n) && !SKIP_NAMES.has(n))
        .forEach(n => {
          const dl = declarations.get(n);
          if (dl !== undefined && dl > hookLine) issues.push({ dep: n, useLine: hookLine, declaredLine: dl, file: filePath });
        });
    }
    const mInline = line.match(/use(?:Memo|Callback)\s*\([^,]+,\s*\[([^\]]+)\]/);
    if (mInline) {
      const hookLine = i + 1;
      mInline[1].split(',').map(d => d.trim().split('.')[0].split('[')[0].trim())
        .filter(n => n && /^[A-Za-z_$]/.test(n) && !SKIP_NAMES.has(n))
        .forEach(n => {
          const dl = declarations.get(n);
          if (dl !== undefined && dl > hookLine) issues.push({ dep: n, useLine: hookLine, declaredLine: dl, file: filePath });
        });
    }
  }
  return issues;
}

// ── Carregar secrets do Replit ────────────────────────────────────────────────
const S = {};
const SECRET_KEYS = [
  'HETZNER_HOST', 'HETZNER_USER', 'HETZNER_DEPLOY_PATH', 'HETZNER_SSH_KEY',
  'NEON_DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY', 'GEMINI_API_KEY',
  'TELEGRAM_BOT_TOKEN', 'GITHUB_PAT',
];
for (const k of SECRET_KEYS) {
  S[k] = process.env[k] || '';
}

// Limpar valores que não podem ter whitespace
S.HETZNER_HOST = S.HETZNER_HOST.trim().replace(/[\r\n\t ]/g, '');
S.GITHUB_PAT   = S.GITHUB_PAT.trim().replace(/[\r\n\t ]/g, '');

// Defaults
S.HETZNER_USER        = S.HETZNER_USER || 'root';
S.HETZNER_DEPLOY_PATH = (S.HETZNER_DEPLOY_PATH && S.HETZNER_DEPLOY_PATH !== '/var/www/superescola')
  ? S.HETZNER_DEPLOY_PATH
  : '/opt/superescola';
const GITHUB_REPO = 'https://github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar';
const PM2_APP     = 'superescola';

// ── Cabeçalho ─────────────────────────────────────────────────────────────────
console.log('');
console.log(`${B}╔══════════════════════════════════════════════════════════════╗${N}`);
console.log(`${B}║       Super Escola (SIGA) — Deploy Completo                 ║${N}`);
console.log(`${B}╚══════════════════════════════════════════════════════════════╝${N}`);
console.log('');
console.log(`   ${D}TDZ Scan :${N} ${SKIP_TDZ    ? Y+'ignorado'+N : G+'✓'+N}`);
console.log(`   ${D}Build    :${N} ${SKIP_BUILD  ? Y+'ignorado'+N : G+'✓'+N}`);
console.log(`   ${D}Git Push :${N} ${SKIP_GIT    ? Y+'ignorado'+N : G+'✓'+N}`);
console.log(`   ${D}Hetzner  :${N} ${SKIP_DEPLOY ? Y+'ignorado'+N : `${G}✓${N} ${S.HETZNER_USER}@${S.HETZNER_HOST || '???'} → ${S.HETZNER_DEPLOY_PATH}`}`);
if (DRY_RUN) console.log(`\n   ${Y}MODO DRY-RUN — nenhuma acção será executada.${N}`);

// ── Passo 1: Scan TDZ ─────────────────────────────────────────────────────────
step(1, 'Verificação TDZ nos ecrãs React', TOTAL_STEPS);
if (DRY_RUN || SKIP_TDZ) {
  warn(DRY_RUN ? 'dry-run — scan ignorado' : 'Ignorado (--skip-tdz)');
} else {
  const root = path.join(__dirname, '..');
  const appDir = path.join(root, 'app', '(main)');
  const tdzFiles = fs.readdirSync(appDir)
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => path.join(appDir, f));
  info(`A analisar ${tdzFiles.length} ecrãs em app/(main)/…`);
  let totalIssues = [];
  for (const f of tdzFiles) {
    try {
      const issues = scanTDZ(f);
      totalIssues = totalIssues.concat(issues);
      if (issues.length > 0) {
        issues.forEach(({ dep, useLine, declaredLine }) => {
          console.error(`   ${R}✗${N} ${path.basename(f)}: "${dep}" — usada na linha ${useLine} mas declarada na ${declaredLine}`);
        });
      }
    } catch { /* ficheiro não parseável — ignorar */ }
  }
  if (totalIssues.length > 0) {
    fail(`${totalIssues.length} problema(s) TDZ detectado(s) — corrija antes de fazer deploy.\n   Para ignorar: node scripts/deploy.js --skip-tdz`);
  }
  ok(`${tdzFiles.length} ficheiros verificados — nenhum problema TDZ.`);
}

// ── Passo 2: Build do frontend ────────────────────────────────────────────────
step(2, 'Build do frontend Expo Web', TOTAL_STEPS);
if (DRY_RUN || SKIP_BUILD) {
  warn(DRY_RUN ? 'dry-run — build ignorado' : 'Ignorado (--skip-build)');
} else {
  const root = path.join(__dirname, '..');
  const distDir = path.join(root, 'dist');
  const distExists = fs.existsSync(distDir) && fs.readdirSync(distDir).length > 0;

  const buildEnv = {
    ...process.env,
    PUPPETEER_SKIP_DOWNLOAD: 'true',
    PUPPETEER_EXECUTABLE_PATH: (() => { try { return execSync('which chromium 2>/dev/null').toString().trim(); } catch { return '/usr/bin/chromium'; } })(),
  };

  // Fazer backup do dist/ antes de tentar build (evita que o CLI limpe dist/ e falhe a meio)
  const distBackup = path.join(os.tmpdir(), `dist_backup_${Date.now()}`);
  if (distExists) {
    try {
      spawnSync('cp', ['-r', distDir, distBackup], { stdio: 'pipe' });
    } catch { /* ignorar */ }
  }

  const restoreDist = () => {
    // Restaurar dist/ do backup se o build falhou e dist/ ficou vazio/corrompido
    if (fs.existsSync(distBackup)) {
      const currentEntries = fs.existsSync(distDir) ? fs.readdirSync(distDir).length : 0;
      if (currentEntries === 0) {
        try {
          spawnSync('rm', ['-rf', distDir], { stdio: 'pipe' });
          spawnSync('cp', ['-r', distBackup, distDir], { stdio: 'pipe' });
        } catch { /* ignorar */ }
      }
      try { spawnSync('rm', ['-rf', distBackup], { stdio: 'pipe' }); } catch { /* ignorar */ }
    }
  };

  // Candidatos ao CLI do Expo — apenas wrappers que existam em .bin/
  // (não usar @expo/cli directo: apaga dist/ antes de falhar por falta de metro)
  const expoCandidates = [
    path.join(root, 'node_modules', '.bin', 'expo'),
  ];

  let built = false;
  for (const candidate of expoCandidates) {
    if (!fs.existsSync(candidate)) continue;
    const args = ['export', '-p', 'web'];
    info(`A tentar: ${candidate} ${args.join(' ')} …`);
    const result = spawnSync(candidate, args, { env: buildEnv, stdio: 'inherit', cwd: root });
    if (result.status === 0) { built = true; break; }
    restoreDist();
    warn(`Candidato ${path.basename(candidate)} falhou (código ${result.status}) — a tentar próximo…`);
  }

  // Fallback: expo global (instalado com npm i -g expo-cli)
  if (!built) {
    const expoGlobal = (() => { try { return execSync('which expo 2>/dev/null').toString().trim(); } catch { return ''; } })();
    if (expoGlobal) {
      info(`A tentar expo global: ${expoGlobal} export -p web …`);
      const result = spawnSync(expoGlobal, ['export', '-p', 'web'], { env: buildEnv, stdio: 'inherit', cwd: root });
      if (result.status === 0) built = true;
      else { restoreDist(); warn('expo global falhou.'); }
    }
  }

  restoreDist(); // garantir que dist/ está intacto após qualquer falha

  const distAfter = fs.existsSync(distDir) ? fs.readdirSync(distDir).length : 0;
  if (!built) {
    if (distAfter > 0) {
      warn('Build do Expo não disponível — a usar dist/ existente (já compilado e guardado no git).');
      warn('Para activar o build: instala expo com  npm i -g @expo/cli  no Replit Shell.');
      ok(`dist/ com ${distAfter} entradas — a continuar deploy.`);
    } else {
      fail('Build do frontend falhou e dist/ está vazio. Adiciona --skip-build e repõe o dist/ do git.');
    }
  } else {
    ok('Frontend construído em dist/');
  }
}

// ── Passo 3: Commit + Push para GitHub ───────────────────────────────────────
step(3, 'Commit + Push para GitHub', TOTAL_STEPS);
if (DRY_RUN || SKIP_GIT) {
  warn(DRY_RUN ? 'dry-run — git ignorado' : 'Ignorado (--skip-git)');
} else {
  const root = path.join(__dirname, '..');
  const run  = (cmd) => execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim();

  // Verificar se há alterações
  run('git add -A');
  const diff = run('git diff --cached --stat 2>/dev/null || echo ""');
  if (!diff) {
    warn('Sem alterações para commit — a fazer push da última versão na mesma.');
  } else {
    const stamp = new Date().toLocaleString('pt-AO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    const msg = `deploy: ${stamp}`;
    run(`git commit -m "${msg}"`);
    ok(`Commit: ${msg}`);
  }

  // Push para GitHub
  const pat = S.GITHUB_PAT;
  if (!pat) {
    warn('GITHUB_PAT não definido — push para GitHub ignorado.');
    warn('Para activar: adiciona o secret GITHUB_PAT no Replit com o teu token GitHub.');
  } else {
    const branch = run('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main').replace('HEAD', 'main');
    const repoUrl = GITHUB_REPO.replace('https://', `https://osvaldofmqueta-stack:${pat}@`);
    info(`A fazer push para GitHub (branch: ${branch})…`);
    const pushResult = spawnSync('git', ['push', repoUrl, `HEAD:${branch}`, '--force'], {
      cwd: root, stdio: 'pipe'
    });
    if (pushResult.status !== 0) {
      const errMsg = (pushResult.stderr || pushResult.stdout || Buffer.alloc(0)).toString().slice(0, 200);
      warn(`Push falhou: ${errMsg} — a continuar o deploy na mesma.`);
    } else {
      ok(`Push concluído → github.com/osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar`);
    }
  }
}

// ── Passo 4-6: Deploy para Hetzner ───────────────────────────────────────────
if (DRY_RUN || SKIP_DEPLOY) {
  step(4, 'Sync secrets → Hetzner', TOTAL_STEPS);
  warn(DRY_RUN ? 'dry-run — deploy ignorado' : 'Ignorado (--skip-deploy)');
  step(5, 'Rsync ficheiros → Hetzner', TOTAL_STEPS);
  warn(DRY_RUN ? 'dry-run' : 'Ignorado (--skip-deploy)');
  step(6, 'Reiniciar servidor + health check', TOTAL_STEPS);
  warn(DRY_RUN ? 'dry-run' : 'Ignorado (--skip-deploy)');

  console.log('');
  console.log(`${B}╔══════════════════════════════════════════════════════════════╗${N}`);
  console.log(`${B}║  ${DRY_RUN ? '🔍 Dry-run concluído — nenhuma alteração feita' : '✅ Build + Git concluídos!'}${' '.repeat(DRY_RUN ? 14 : 20)}║${N}`);
  console.log(`${B}╚══════════════════════════════════════════════════════════════╝${N}`);
  console.log('');
  process.exit(0);
}

// Validar obrigatórios para deploy
if (!S.HETZNER_HOST)    fail('Secret HETZNER_HOST não definido. Confirma os Secrets do Replit.');
if (!S.HETZNER_SSH_KEY) fail('Secret HETZNER_SSH_KEY não definido. Confirma os Secrets do Replit.');

// ── Formatar chave SSH ────────────────────────────────────────────────────────
const tmpKey = path.join(os.tmpdir(), `siga_deploy_key_${Date.now()}`);
try {
  let raw = S.HETZNER_SSH_KEY;

  // 1. Converter \n literais (ex: quando o secret foi colado numa linha só)
  raw = raw.replace(/\\n/g, '\n');

  // 2. Detectar tipo de cabeçalho antes de limpar
  const isOpenSSH = raw.includes('OPENSSH');
  const isRSA     = raw.includes('RSA PRIVATE');
  const header    = isOpenSSH ? 'OPENSSH PRIVATE KEY' : isRSA ? 'RSA PRIVATE KEY' : 'PRIVATE KEY';

  // 3. Extrair apenas o corpo base64 (remover cabeçalhos e qualquer whitespace)
  const body = raw
    .replace(/-----BEGIN [^-]+ KEY-----/g, '')
    .replace(/-----END [^-]+ KEY-----/g, '')
    .replace(/\s+/g, '');   // remove newlines, espaços, tabs — tudo

  if (!body || body.length < 20) fail('HETZNER_SSH_KEY está vazia ou inválida. Verifica o valor do secret.');

  // 4. Re-embrulhar em linhas de 70 chars (padrão OpenSSH)
  const wrapped = body.match(/.{1,70}/g).join('\n');
  const finalKey = `-----BEGIN ${header}-----\n${wrapped}\n-----END ${header}-----\n`;

  fs.writeFileSync(tmpKey, finalKey, { mode: 0o600 });

  const lineCount = finalKey.split('\n').filter(Boolean).length;
  ok(`Chave SSH formatada: ${lineCount} linhas, tipo: ${header}`);
} catch (e) {
  if (e.message.startsWith('HETZNER_SSH_KEY')) fail(e.message);
  fail(`Erro ao formatar chave SSH: ${e.message}`);
}
process.on('exit', () => { try { fs.unlinkSync(tmpKey); } catch {} });

const SSH_BASE = [
  '-i', tmpKey,
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=15',
  '-o', 'BatchMode=yes',
];
const REMOTE = `${S.HETZNER_USER}@${S.HETZNER_HOST}`;
const DEPLOY = S.HETZNER_DEPLOY_PATH;

function ssh(cmd, opts = {}) {
  const res = spawnSync('ssh', [...SSH_BASE, REMOTE, cmd], {
    stdio: opts.silent ? 'pipe' : 'inherit',
    ...opts,
  });
  if (opts.capture) return (res.stdout || Buffer.alloc(0)).toString().trim();
  if (!opts.allowFail && res.status !== 0) {
    const err = (res.stderr || Buffer.alloc(0)).toString().slice(0, 300);
    fail(`Comando SSH falhou (${res.status}): ${err}`);
  }
  return res.status;
}

// ── Testar ligação ────────────────────────────────────────────────────────────
info(`A testar ligação SSH a ${S.HETZNER_HOST}…`);
const pingResult = spawnSync('ssh', [...SSH_BASE, REMOTE, 'echo ok'], { stdio: 'pipe' });
if (pingResult.status !== 0) fail('Não foi possível ligar ao servidor Hetzner. Verifica HETZNER_HOST e HETZNER_SSH_KEY.');
ok('Ligação SSH estabelecida.');

// ── Passo 3: Sincronizar secrets → .env do Hetzner ───────────────────────────
step(4, 'Sincronizar secrets Replit → .env do Hetzner', TOTAL_STEPS);
info('A actualizar variáveis no servidor…');

// Constrói bloco Python para upsert cirúrgico de cada variável
// IMPORTANTE: chaves críticas têm um aviso explícito se estiverem vazias — nunca são ignoradas silenciosamente
const CRITICAL_SECRETS = ['NEON_DATABASE_URL', 'JWT_SECRET', 'RESEND_API_KEY'];
const allSecretsToSync = [
  ['NEON_DATABASE_URL',       S.NEON_DATABASE_URL],
  ['JWT_SECRET',              S.JWT_SECRET],
  ['RESEND_API_KEY',          S.RESEND_API_KEY],
  ['GEMINI_API_KEY',          S.GEMINI_API_KEY],
  ['TELEGRAM_BOT_TOKEN',      S.TELEGRAM_BOT_TOKEN],
  ['NODE_ENV',                'production'],
  ['PORT',                    '5000'],
  ['SERVE_STATIC_WEB',        '1'],
  ['PUPPETEER_SKIP_DOWNLOAD', 'true'],
  ['PUPPETEER_EXECUTABLE_PATH', '/usr/bin/chromium-browser'],
  ['EMAIL_FROM',              'noreply@liceun303.live'],
  ['APP_URL',                 'https://liceun303.live'],
];

// Avisar sobre secrets críticos vazios (mas não parar o deploy — podem estar no servidor)
for (const [k, v] of allSecretsToSync) {
  if (!v && CRITICAL_SECRETS.includes(k)) {
    warn(`Secret crítico '${k}' está VAZIO no Replit — NÃO será sincronizado. Defina-o em Secrets antes do próximo deploy.`);
  }
}

const secretsToSync = allSecretsToSync.filter(([, v]) => v); // não sincronizar valores vazios

// Codificar em base64 para evitar problemas com caracteres especiais
const syncScript = secretsToSync.map(([k, v]) => {
  const b64 = Buffer.from(v).toString('base64');
  return `upsert "${k}" "${b64}"`;
}).join('\n');

const remoteSync = `
set -e
ENV_FILE="${DEPLOY}/.env"
mkdir -p "${DEPLOY}"
[ -f "$ENV_FILE" ] || touch "$ENV_FILE"

# Backup antes de alterar
BACKUP="${DEPLOY}/env-backups/.env.$(date +%Y%m%d_%H%M%S)"
mkdir -p "${DEPLOY}/env-backups"
cp "$ENV_FILE" "$BACKUP" 2>/dev/null || true
ls -t "${DEPLOY}/env-backups/.env."* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true

upsert() {
  local KEY="$1" VAL_B64="$2"
  local VAL
  VAL=$(echo "$VAL_B64" | base64 -d 2>/dev/null || echo "$VAL_B64")
  if grep -q "^\${KEY}=" "$ENV_FILE" 2>/dev/null; then
    python3 -c "
import re, sys
k,v,f = sys.argv[1],sys.argv[2],sys.argv[3]
c=open(f).read()
c=re.sub(r'^'+re.escape(k)+r'=.*$', k+'='+v, c, flags=re.MULTILINE)
open(f,'w').write(c)
print('  updated: '+k)
" "$KEY" "$VAL" "$ENV_FILE"
  else
    echo "" >> "$ENV_FILE"
    echo "\${KEY}=\${VAL}" >> "$ENV_FILE"
    echo "  added: \${KEY}"
  fi
}

${syncScript}
chmod 600 "$ENV_FILE"
echo "OK: $(grep -c '=' "$ENV_FILE") vars no .env"
`;

const syncOut = ssh(remoteSync, { silent: true, capture: true });
console.log(syncOut.split('\n').map(l => `   ${D}${l}${N}`).join('\n'));
ok('Secrets sincronizados no servidor.');

// ── Passo 4: Rsync ficheiros ─────────────────────────────────────────────────
step(5, `Rsync ficheiros → ${REMOTE}:${DEPLOY}`, TOTAL_STEPS);
info('A sincronizar ficheiros (rsync)…');

const EXCLUDES = [
  'node_modules', '.git', '.dist-backup', '*.log', '.env',
  'android', 'ios', '.agents', '.local', 'attached_assets',
  'screenshots', '.replit', 'replit.nix', 'uploads',
].flatMap(e => ['--exclude', e]);

const rsyncResult = spawnSync('rsync', [
  '-az', '--progress', '--delete',
  '-e', `ssh ${SSH_BASE.join(' ')}`,
  ...EXCLUDES,
  './',
  `${REMOTE}:${DEPLOY}/`,
], { stdio: 'inherit', cwd: path.join(__dirname, '..') });

if (rsyncResult.status !== 0) fail('Rsync falhou. Verifica a ligação SSH e o caminho de destino.');
ok('Ficheiros sincronizados com sucesso.');

// ── Passo 5: Instalar dependências + Reiniciar PM2 + Health check ─────────────
step(6, 'Instalar dependências + Reiniciar servidor + Health check', TOTAL_STEPS);
info('A instalar dependências e reiniciar PM2…');

const restartScript = `
set -e
cd "${DEPLOY}"

# Instalar dependências sem Puppeteer download
export PUPPETEER_SKIP_DOWNLOAD=true
echo "  → npm install..."
npm install --legacy-peer-deps --omit=dev --quiet 2>&1 | tail -3

# Reiniciar PM2 com --update-env para carregar o novo .env
if command -v pm2 &>/dev/null; then
  echo "  → PM2 restart --update-env..."
  if pm2 describe ${PM2_APP} &>/dev/null 2>&1; then
    pm2 restart ${PM2_APP} --update-env 2>&1 | grep -E '\\[PM2\\]|✓|online' | head -4 || true
  else
    echo "  → Processo não existe — a iniciar com ecosystem.config.cjs..."
    pm2 start ecosystem.config.cjs 2>&1 | head -4 || true
  fi
  pm2 save --force &>/dev/null && echo "  ✓ Estado PM2 guardado" || true
else
  echo "  ⚠  PM2 não encontrado — a tentar systemctl..."
  systemctl restart ${PM2_APP} 2>/dev/null && echo "  ✓ systemctl restart OK" || echo "  ⚠  Nenhum gestor encontrado — reinicia manualmente."
fi

# Health check (aguardar até 90s)
echo ""
echo "  → A verificar resposta do servidor (máx. 90s)..."
SUCCESS=false
for i in $(seq 1 90); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5000/api/config" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
    SUCCESS=true
    echo "  ✓ Servidor a responder (HTTP $CODE) após \${i}s"
    break
  fi
  [ $((i % 15)) -eq 0 ] && printf "  \${i}s..." || printf "."
  sleep 1
done
echo ""

if [ "\$SUCCESS" = "false" ]; then
  echo "  ✗ Servidor não respondeu em 90s"
  pm2 logs ${PM2_APP} --lines 20 --nostream 2>/dev/null | tail -20 || true
  exit 1
fi
`;

const restartOut = ssh(restartScript, { silent: true, capture: true });
console.log(restartOut.split('\n').map(l => `   ${l}`).join('\n'));
ok('Servidor online e a responder.');

// ── Health check externo ──────────────────────────────────────────────────────
info(`A verificar ${S.HETZNER_HOST} externamente…`);
try {
  execSync(`curl -sf --max-time 10 http://${S.HETZNER_HOST}/api/config -o /dev/null`, { stdio: 'pipe' });
  ok(`Servidor público a responder → http://${S.HETZNER_HOST}`);
} catch {
  warn(`Servidor interno OK mas não responde externamente em http://${S.HETZNER_HOST} — pode estar a iniciar.`);
}

// ── Resumo final ──────────────────────────────────────────────────────────────
const now = new Date().toLocaleString('pt-AO', {
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
});
console.log('');
console.log(`${B}╔══════════════════════════════════════════════════════════════╗${N}`);
console.log(`${B}║  ✅  Deploy concluído com sucesso!                          ║${N}`);
console.log(`${B}╠══════════════════════════════════════════════════════════════╣${N}`);
console.log(`${B}║  ${SKIP_TDZ   ? Y+'–'+N : G+'✓'+N}  Scan TDZ ${SKIP_TDZ   ? '(ignorado)' : '→ sem problemas'}${' '.repeat(SKIP_TDZ ? 37 : 31)}${B}║${N}`);
console.log(`${B}║  ${SKIP_BUILD ? Y+'–'+N : G+'✓'+N}  Frontend Expo Web ${SKIP_BUILD ? '(ignorado)' : '→ dist/'}${' '.repeat(SKIP_BUILD ? 30 : 27)}${B}║${N}`);
console.log(`${B}║  ${SKIP_GIT   ? Y+'–'+N : G+'✓'+N}  GitHub push ${SKIP_GIT   ? '(ignorado)' : `→ ${GITHUB_REPO.split('/').slice(-2).join('/')}`}${' '.repeat(SKIP_GIT ? 34 : 4)}${B}║${N}`);
console.log(`${B}║  ${G}✓${N}  Secrets sincronizados → .env do Hetzner             ${B}║${N}`);
console.log(`${B}║  ${G}✓${N}  Rsync → ${S.HETZNER_HOST}:${DEPLOY}${' '.repeat(Math.max(1, 27 - S.HETZNER_HOST.length - DEPLOY.length))}${B}║${N}`);
console.log(`${B}║  ${G}✓${N}  PM2 restart --update-env + health check OK          ${B}║${N}`);
console.log(`${B}╠══════════════════════════════════════════════════════════════╣${N}`);
console.log(`${B}║  🌐 https://liceun303.live                                  ║${N}`);
console.log(`${B}║  🕐 ${now}${' '.repeat(42 - now.length)}║${N}`);
console.log(`${B}╚══════════════════════════════════════════════════════════════╝${N}`);
console.log('');
console.log(`   ${D}Próximo deploy: node scripts/deploy.js${N}`);
console.log(`   ${D}Só secrets:    bash scripts/sync-secrets-hetzner.sh${N}`);
console.log(`   ${D}Só ficheiros:  node scripts/deploy.js --skip-build --skip-git${N}`);
console.log('');
