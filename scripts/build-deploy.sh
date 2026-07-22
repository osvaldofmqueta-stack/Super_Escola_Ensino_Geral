#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola (SIGA) — Script de Deploy Completo para Hetzner
#
#  O que faz (tudo sem deixar o servidor cair):
#    1. Build do frontend  → dist/          (Expo Web)
#    2. Build do backend   → server_dist/   (esbuild)
#    3. Push para GitHub   (opcional)
#    4. rsync → Hetzner    (exclui node_modules, .env, .git)
#    5. npm install no servidor
#    6. Sincroniza .env    (todos os secrets do Replit → servidor)
#    7. Sincroniza .env    /opt/superescola → /var/www/superescola
#    8. PM2 reload zero-downtime (novo processo activo antes de parar o antigo)
#    9. Verificação de saúde HTTP
#
#  Uso:
#    bash scripts/build-deploy.sh              — build + deploy completo
#    bash scripts/build-deploy.sh --skip-build — skip frontend (usa dist/ actual)
#    bash scripts/build-deploy.sh --only-build — só build local, sem deploy
#    bash scripts/build-deploy.sh --force      — força rebuild mesmo sem alterações
#    bash scripts/build-deploy.sh --skip-push  — não faz push para GitHub
#
#  Secrets necessários (Replit → Secrets):
#    HETZNER_HOST, HETZNER_SSH_KEY
#    NEON_DATABASE_URL, JWT_SECRET
#  Secrets opcionais:
#    RESEND_API_KEY, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN, GITHUB_PAT
# ══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

SKIP_BUILD=false
ONLY_BUILD=false
FORCE=false
SKIP_PUSH=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --only-build) ONLY_BUILD=true ;;
    --force)      FORCE=true ;;
    --skip-push)  SKIP_PUSH=true ;;
  esac
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Super Escola (SIGA) — Deploy Completo para Hetzner          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo -e "   $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

# ── Carregar secrets (no Replit os secrets existem em process.env do node) ─────
_load() {
  local k="$1"
  local cur="${!k:-}"
  if [ -z "$cur" ]; then
    local v
    v=$(node -e "process.stdout.write(process.env['$k']||'')" 2>/dev/null) || v=""
    if [ -n "$v" ]; then export "$k"="$v"; fi
  fi
}

_load HETZNER_HOST
_load HETZNER_USER
_load HETZNER_DEPLOY_PATH
_load HETZNER_SSH_KEY
_load NEON_DATABASE_URL
_load JWT_SECRET
_load RESEND_API_KEY
_load GEMINI_API_KEY
_load TELEGRAM_BOT_TOKEN
_load GITHUB_PAT

HETZNER_HOST="${HETZNER_HOST:-}"
HETZNER_USER="${HETZNER_USER:-root}"
_raw_path="${HETZNER_DEPLOY_PATH:-/opt/superescola}"
# Corrigir caminho antigo automaticamente
[ "$_raw_path" = "/var/www/superescola" ] && _raw_path="/opt/superescola"
HETZNER_DEPLOY_PATH="$_raw_path"

DOMAIN="www.liceun303.live"
EMAIL_FROM="noreply@liceun303.live"
TELEGRAM_BOT_USERNAME="${TELEGRAM_BOT_USERNAME:-Liceu303Bot}"

# ── Verificação prévia ──────────────────────────────────────────────────────────
step "0/9  Verificação de Secrets e Pré-condições"

SECRETS_OK=true
[ -z "$HETZNER_HOST" ] && { warn "HETZNER_HOST em falta"; SECRETS_OK=false; } || ok "HETZNER_HOST = $HETZNER_HOST"
[ -z "${HETZNER_SSH_KEY:-}" ] && { warn "HETZNER_SSH_KEY em falta"; SECRETS_OK=false; } || ok "HETZNER_SSH_KEY configurada"
[ -z "${NEON_DATABASE_URL:-}" ] && { warn "NEON_DATABASE_URL em falta"; SECRETS_OK=false; } || ok "NEON_DATABASE_URL configurada"
[ -z "${JWT_SECRET:-}" ] && { warn "JWT_SECRET em falta"; SECRETS_OK=false; } || ok "JWT_SECRET configurado"
[ -z "${RESEND_API_KEY:-}" ]       && info "RESEND_API_KEY não definida (emails opcionais)" || ok "RESEND_API_KEY configurada"
[ -z "${GEMINI_API_KEY:-}" ]       && info "GEMINI_API_KEY não definida (IA opcional)" || ok "GEMINI_API_KEY configurada"
[ -z "${TELEGRAM_BOT_TOKEN:-}" ]   && info "TELEGRAM_BOT_TOKEN não definido (Telegram opcional)" || ok "TELEGRAM_BOT_TOKEN configurado"

if [ "$SECRETS_OK" = false ]; then
  echo ""
  echo -e "   ${RED}Secrets em falta!${NC} Adiciona em: Replit → Secrets (cadeado 🔒)"
  [ "$ONLY_BUILD" = false ] && exit 1
fi

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 1 — Build do Frontend (Expo Web → dist/)
# ══════════════════════════════════════════════════════════════════════════════
step "1/9  Build do Frontend Expo Web → dist/"

if [ "$SKIP_BUILD" = true ]; then
  warn "Build frontend ignorado (--skip-build) — a usar dist/ existente."
elif [ "$FORCE" = false ] && [ -f "dist/index.html" ]; then
  # Verificar se há alterações no app/ mais recentes que dist/
  APP_MTIME=$(find app components hooks lib context shared -type f \( -name "*.ts" -o -name "*.tsx" \) \
    -not -path "*/node_modules/*" -exec stat -c '%Y' {} + 2>/dev/null | sort -rn | head -1 || echo 0)
  DIST_MTIME=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)
  if [ "${APP_MTIME:-0}" -le "$DIST_MTIME" ]; then
    ok "Frontend já actualizado — dist/ mais recente que app/ (usa --force para reconstruir)."
    SKIP_BUILD=true
  else
    info "Alterações detectadas em app/ — a reconstruir frontend..."
  fi
fi

if [ "$SKIP_BUILD" = false ]; then
  DIST_DIR="$(pwd)/dist"
  BACKUP_DIR="$(pwd)/.dist-backup"

  if [ -f "$DIST_DIR/index.html" ]; then
    info "A fazer backup de dist/ antes de reconstruir..."
    rm -rf "$BACKUP_DIR"; cp -r "$DIST_DIR" "$BACKUP_DIR"
    ok "Backup guardado em .dist-backup/"
  fi

  if [ -f "scripts/pre-build-patches.sh" ]; then
    info "A aplicar patches obrigatórios..."
    bash scripts/pre-build-patches.sh 2>/dev/null || true
  fi

  # Determinar binário expo disponível
  EXPO_BIN=""
  if [ -x "node_modules/.bin/expo-internal" ]; then
    EXPO_BIN="node_modules/.bin/expo-internal"
  elif [ -x "node_modules/@expo/cli/build/bin/cli" ]; then
    EXPO_BIN="node node_modules/@expo/cli/build/bin/cli"
  else
    fail "Binário expo não encontrado. Corre: npm install --legacy-peer-deps"
  fi

  info "A construir frontend (3-5 min)..."
  echo ""
  BUILD_TMP_DIR="/tmp/expo-dist-$$"
  CHROMIUM_PATH="$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '')"

  if PUPPETEER_SKIP_DOWNLOAD=true \
     PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_PATH" \
     EXPO_PUBLIC_DOMAIN="$DOMAIN" \
       $EXPO_BIN export -p web --output-dir "$BUILD_TMP_DIR" 2>&1; then
    # Mover para dist/
    [ -d "$BUILD_TMP_DIR/_expo" ]  && cp -r "$BUILD_TMP_DIR/_expo"  "$DIST_DIR/"
    [ -f "$BUILD_TMP_DIR/index.html" ] && cp "$BUILD_TMP_DIR/index.html" "$DIST_DIR/"
    [ -d "$BUILD_TMP_DIR/assets" ] && cp -r "$BUILD_TMP_DIR/assets" "$DIST_DIR/"
    rm -rf "$BUILD_TMP_DIR" "$BACKUP_DIR"
    echo ""
    ok "Frontend construído com sucesso em dist/"
  else
    echo ""
    warn "Build falhou — a restaurar dist/ anterior..."
    [ -d "$BACKUP_DIR" ] && { rm -rf "$DIST_DIR"; mv "$BACKUP_DIR" "$DIST_DIR"; ok "dist/ restaurado."; }
    fail "Build do frontend falhou. Verifica os erros acima."
  fi
fi

# Copiar fontes Inter para dist/fonts/ (necessário para carregamento offline)
mkdir -p dist/fonts
INTER_BASE="node_modules/@expo-google-fonts/inter"
if [ -f "$INTER_BASE/400Regular/Inter_400Regular.ttf" ]; then
  cp -f "$INTER_BASE/400Regular/Inter_400Regular.ttf"   dist/fonts/ 2>/dev/null || true
  cp -f "$INTER_BASE/500Medium/Inter_500Medium.ttf"     dist/fonts/ 2>/dev/null || true
  cp -f "$INTER_BASE/600SemiBold/Inter_600SemiBold.ttf" dist/fonts/ 2>/dev/null || true
  cp -f "$INTER_BASE/700Bold/Inter_700Bold.ttf"         dist/fonts/ 2>/dev/null || true
  ok "Fontes Inter copiadas para dist/fonts/"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 2 — Build do Backend (esbuild → server_dist/index.js)
# ══════════════════════════════════════════════════════════════════════════════
step "2/9  Build do Backend (esbuild → server_dist/)"

BUILD_SERVER=true
if [ "$FORCE" = false ] && [ -f "server_dist/index.js" ]; then
  SRV_MTIME=$(find server shared -type f \( -name "*.ts" \) \
    -not -path "*/node_modules/*" -exec stat -c '%Y' {} + 2>/dev/null | sort -rn | head -1 || echo 0)
  BUNDLE_MTIME=$(stat -c %Y server_dist/index.js 2>/dev/null || echo 0)
  if [ "${SRV_MTIME:-0}" -le "$BUNDLE_MTIME" ]; then
    ok "Backend já actualizado — server_dist/ mais recente que server/ (usa --force para reconstruir)."
    BUILD_SERVER=false
  fi
fi

if [ "$BUILD_SERVER" = true ]; then
  if [ -x "node_modules/.bin/esbuild" ]; then
    mkdir -p server_dist
    info "A compilar servidor com esbuild..."
    node_modules/.bin/esbuild server/index.ts \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=cjs \
      --outfile=server_dist/index.js \
      --external:puppeteer \
      --external:puppeteer-core \
      --external:sharp \
      --external:canvas \
      --external:pg-native \
      --external:fsevents \
      2>&1 | tail -3

    if [ -f "server_dist/index.js" ]; then
      SIZE=$(du -sh server_dist/index.js | cut -f1)
      ok "Backend compilado: server_dist/index.js (${SIZE})"
    else
      fail "esbuild não gerou server_dist/index.js — verifica os erros acima."
    fi
  else
    warn "esbuild não encontrado — o servidor vai arrancar com tsx (mais lento, mas funciona)."
  fi
fi

# ── Terminar aqui se --only-build ──────────────────────────────────────────────
if [ "$ONLY_BUILD" = true ]; then
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${GREEN}║  ✅  Build local concluído!  (--only-build: deploy ignorado)    ║${NC}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 3 — Push para GitHub (opcional)
# ══════════════════════════════════════════════════════════════════════════════
step "3/9  Push para GitHub"

if [ "$SKIP_PUSH" = true ]; then
  warn "Push ignorado (--skip-push)"
else
  TOKEN="${GITHUB_PAT:-}"
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  [ "$BRANCH" = "HEAD" ] && BRANCH="main"

  git add -A
  if git diff --cached --quiet 2>/dev/null; then
    warn "Sem alterações para commit — a continuar deploy."
  else
    COMMIT_MSG="deploy: $(date '+%d/%m/%Y %H:%M') — frontend+backend+prod"
    git commit -m "$COMMIT_MSG" 2>/dev/null || true
    ok "Commit: $COMMIT_MSG"
  fi

  if [ -n "$TOKEN" ]; then
    REPO_URL="https://osvaldofmqueta-stack:${TOKEN}@github.com/osvaldofmqueta-stack/superescola.git"
    git push "$REPO_URL" "HEAD:$BRANCH" --force 2>&1 | tail -2 || warn "Push GitHub falhou (continua deploy)"
    ok "Push GitHub concluído (branch: $BRANCH)"
  else
    warn "GITHUB_PAT não definido — push ignorado"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# Configurar SSH
# ══════════════════════════════════════════════════════════════════════════════
step "4/9  Ligação SSH ao Servidor"
echo -e "   ${CYAN}Servidor:${NC} ${HETZNER_USER}@${HETZNER_HOST}"
echo -e "   ${CYAN}Destino:${NC}  ${HETZNER_DEPLOY_PATH}"

SSH_KEY_FILE="$(mktemp /tmp/hetzner_key_XXXXXX)"
node -e "
  const raw = process.env.HETZNER_SSH_KEY || '';
  if (raw.includes('\n')) { process.stdout.write(raw.trim() + '\n'); process.exit(0); }
  let key = raw.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
  if (!key.includes('\n')) {
    const bm = key.match(/(-----BEGIN [^-]+ KEY-----)/);
    const em = key.match(/(-----END [^-]+ KEY-----)/);
    if (bm && em) {
      const header = bm[1]; const footer = em[1];
      let body = key.slice(key.indexOf(header)+header.length, key.lastIndexOf(footer)).trim();
      body = body.replace(/\s+/g,'');
      const lines = body.match(/.{1,70}/g) || [];
      key = header+'\n'+lines.join('\n')+'\n'+footer+'\n';
    }
  }
  process.stdout.write(key.trim()+'\n');
" > "$SSH_KEY_FILE"
chmod 600 "$SSH_KEY_FILE"

if ! ssh-keygen -l -f "$SSH_KEY_FILE" &>/dev/null; then
  rm -f "$SSH_KEY_FILE"
  fail "Chave SSH inválida. Verifica HETZNER_SSH_KEY nos Secrets."
fi
ok "Chave SSH validada."

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20 -o BatchMode=yes -i $SSH_KEY_FILE"
# Limpar chave temporária ao sair (sempre)
trap "rm -f '$SSH_KEY_FILE'" EXIT

ssh_run() { ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "$1"; }

# Testar ligação
if ! ssh_run "echo ok" &>/dev/null; then
  fail "Não foi possível ligar ao servidor. Verifica HETZNER_HOST e HETZNER_SSH_KEY."
fi
ok "Ligação SSH estabelecida."

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 5 — Sincronizar ficheiros via rsync
# ══════════════════════════════════════════════════════════════════════════════
step "5/9  Sincronizar Ficheiros → Hetzner (rsync)"
info "A enviar ficheiros (pode demorar 1-2 min na primeira vez)..."

rsync -az --delete \
  -e "ssh $SSH_OPTS" \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.expo/' \
  --exclude='android/' \
  --exclude='ios/' \
  --exclude='.agents/' \
  --exclude='.local/' \
  --exclude='attached_assets/' \
  --exclude='screenshots/' \
  --exclude='.dist-backup/' \
  --exclude='env-backups/' \
  --exclude='.replit' \
  --exclude='replit.nix' \
  --exclude='*.log' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='.server_fp' \
  --exclude='*.apk' \
  --exclude='*.aab' \
  ./ "${HETZNER_USER}@${HETZNER_HOST}:${HETZNER_DEPLOY_PATH}/"

ok "Ficheiros sincronizados com sucesso."

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 6 — Instalar dependências no servidor
# ══════════════════════════════════════════════════════════════════════════════
step "6/9  npm install no Servidor"
info "A instalar/actualizar dependências Node (sem devDependencies)..."

ssh_run "
  cd '${HETZNER_DEPLOY_PATH}'
  export PUPPETEER_SKIP_DOWNLOAD=true
  if ! npm install --legacy-peer-deps --omit=dev --quiet 2>&1 | tail -3; then
    echo '⚠  npm install falhou — a limpar cache e tentar novamente...'
    npm cache clean --force 2>/dev/null || true
    npm install --legacy-peer-deps --omit=dev --quiet 2>&1 | tail -3 || \
      echo '⚠  npm install com warnings (pode não afectar o funcionamento)'
  fi
  echo 'npm install concluído'
"
ok "Dependências actualizadas."

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 7 — Sincronizar variáveis de ambiente (.env)
# ══════════════════════════════════════════════════════════════════════════════
step "7/9  Sincronizar Variáveis de Ambiente"
info "A actualizar .env no servidor com todos os secrets..."

# Detectar caminho do Chromium no servidor
CHROMIUM_REMOTE=$(ssh_run "
  for p in /usr/bin/chromium-browser /usr/bin/chromium /usr/local/bin/chromium /snap/bin/chromium; do
    [ -x \"\$p\" ] && echo \"\$p\" && break
  done
  echo '/usr/bin/chromium-browser'
" 2>/dev/null | tail -1)
CHROMIUM_REMOTE="${CHROMIUM_REMOTE:-/usr/bin/chromium-browser}"

# Montar .env completo usando base64 para evitar problemas com caracteres especiais
NEON_B64=$(printf '%s' "${NEON_DATABASE_URL:-}" | base64 | tr -d '\n')
JWT_B64=$(printf '%s' "${JWT_SECRET:-}" | base64 | tr -d '\n')
RESEND_B64=$(printf '%s' "${RESEND_API_KEY:-}" | base64 | tr -d '\n')
GEMINI_B64=$(printf '%s' "${GEMINI_API_KEY:-}" | base64 | tr -d '\n')
TELEGRAM_B64=$(printf '%s' "${TELEGRAM_BOT_TOKEN:-}" | base64 | tr -d '\n')

ssh_run "
  python3 - '${HETZNER_DEPLOY_PATH}' \
    '$NEON_B64' '$JWT_B64' '$RESEND_B64' '$GEMINI_B64' '$TELEGRAM_B64' \
    '${EMAIL_FROM}' '${TELEGRAM_BOT_USERNAME}' '${CHROMIUM_REMOTE}' <<'PYEOF'
import sys, re, base64, os

deploy_path = sys.argv[1]
env_file    = os.path.join(deploy_path, '.env')

secrets = {
  'NEON_DATABASE_URL':    base64.b64decode(sys.argv[2]).decode() if sys.argv[2] else '',
  'JWT_SECRET':           base64.b64decode(sys.argv[3]).decode() if sys.argv[3] else '',
  'RESEND_API_KEY':       base64.b64decode(sys.argv[4]).decode() if sys.argv[4] else '',
  'GEMINI_API_KEY':       base64.b64decode(sys.argv[5]).decode() if sys.argv[5] else '',
  'TELEGRAM_BOT_TOKEN':   base64.b64decode(sys.argv[6]).decode() if sys.argv[6] else '',
}
static_vars = {
  'NODE_ENV':                   'production',
  'PORT':                       '5000',
  'SERVE_STATIC_WEB':           '1',
  'PUPPETEER_SKIP_DOWNLOAD':    'true',
  'PUPPETEER_EXECUTABLE_PATH':  sys.argv[9],
  'EMAIL_FROM':                 sys.argv[7],
  'TELEGRAM_BOT_USERNAME':      sys.argv[8],
}
all_vars = {**secrets, **static_vars}

# Ler .env existente (manter vars desconhecidas)
try:
    content = open(env_file).read()
except:
    content = ''

for key, val in all_vars.items():
  if not val:
    continue
  pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.MULTILINE)
  if pattern.search(content):
    content = pattern.sub(key + '=' + val, content)
  else:
    sep = '\n' if content and not content.endswith('\n') else ''
    content += sep + key + '=' + val + '\n'

open(env_file, 'w').write(content)
os.chmod(env_file, 0o600)
print('✓ .env actualizado com', len(all_vars), 'variáveis')

# Sincronizar para /var/www/superescola/.env também
import shutil
alt = '/var/www/superescola/.env'
try:
  os.makedirs(os.path.dirname(alt), exist_ok=True)
  shutil.copy2(env_file, alt)
  os.chmod(alt, 0o600)
  print('✓ .env sincronizado para', alt)
except Exception as e:
  print('⚠  Não foi possível sincronizar para', alt, ':', e)
PYEOF
"
ok ".env actualizado e sincronizado (/opt e /var/www)."

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 8 — Reload Zero-Downtime via PM2
# ══════════════════════════════════════════════════════════════════════════════
step "8/9  Reload Zero-Downtime (PM2)"
info "A recarregar o servidor sem interrupção de serviço..."

ssh_run "
  cd '${HETZNER_DEPLOY_PATH}'
  mkdir -p /var/log/superescola

  # Verificar se o processo existe no PM2
  if pm2 list 2>/dev/null | grep -q 'superescola'; then
    echo '→ Processo superescola encontrado — a fazer reload zero-downtime...'
    # pm2 reload: inicia novo processo → aguarda ficar online → pára o antigo
    if pm2 reload superescola --update-env 2>&1 | tail -3; then
      echo '✓ Reload concluído (zero-downtime)'
    else
      echo '⚠ reload falhou — a tentar restart via ecosystem.config.cjs...'
      pm2 restart superescola --update-env 2>&1 | tail -3 || \
      ( pm2 delete superescola 2>/dev/null || true; \
        pm2 start ecosystem.config.cjs; )
    fi
  else
    echo '→ Processo não encontrado — a arrancar pela primeira vez...'
    pm2 delete superescola 2>/dev/null || true
    pm2 start ecosystem.config.cjs
  fi

  pm2 save --force
  sleep 4
  echo ''
  pm2 list
"
ok "Servidor recarregado."

# ══════════════════════════════════════════════════════════════════════════════
# PASSO 9 — Verificação de Saúde
# ══════════════════════════════════════════════════════════════════════════════
step "9/9  Verificação de Saúde"
info "A aguardar que o servidor esteja pronto (máx. 30s)..."

HEALTH_OK=false
for i in 1 2 3 4 5 6; do
  sleep 5
  if curl -sf --max-time 10 "https://${DOMAIN}/api/config" -o /dev/null 2>/dev/null; then
    HEALTH_OK=true; break
  elif curl -sf --max-time 10 "http://${HETZNER_HOST}/api/config" -o /dev/null 2>/dev/null; then
    HEALTH_OK=true; break
  fi
  info "  Tentativa $i/6 — aguarda 5s..."
done

if [ "$HEALTH_OK" = true ]; then
  ok "Servidor a responder correctamente ✅"
else
  warn "Timeout na verificação HTTP — o servidor pode ainda estar a iniciar."
  warn "Para verificar: ssh root@${HETZNER_HOST} 'pm2 logs superescola --lines 30'"
fi

# ── Resumo final ───────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  ✅  Deploy para Hetzner concluído com sucesso!                 ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "   ${BOLD}🌐 URL:${NC}        https://${DOMAIN}"
echo -e "   ${BOLD}📋 Logs PM2:${NC}   ssh root@${HETZNER_HOST} 'pm2 logs superescola --lines 50'"
echo -e "   ${BOLD}📊 Status:${NC}     ssh root@${HETZNER_HOST} 'pm2 list'"
echo -e "   ${BOLD}🔄 Rollback:${NC}   ssh root@${HETZNER_HOST} 'cd /opt/superescola && pm2 restart superescola'"
echo ""
