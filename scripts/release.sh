#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola (SIGA) — Release Completo
#
#  Faz tudo numa passagem:
#    1. Build do frontend Expo Web  → dist/
#    2. Build do servidor esbuild   → server_dist/index.js
#    3. Commit + Push para GitHub
#    4. Deploy para servidor Hetzner via rsync + SSH
#    5. Reinicio do PM2 no servidor
#    6. Verificação final
#
#  Uso:
#    bash scripts/release.sh                      # release completo
#    bash scripts/release.sh --skip-frontend      # sem build do frontend
#    bash scripts/release.sh --skip-server-build  # sem build do servidor
#    bash scripts/release.sh --skip-git           # sem commit/push GitHub
#    bash scripts/release.sh --skip-deploy        # sem deploy Hetzner
#    bash scripts/release.sh --skip-frontend --skip-server-build  # só git + deploy
#
#  Secrets necessários (Replit → Secrets):
#    GITHUB_PAT            — token pessoal GitHub (push)
#    HETZNER_HOST          — IP do servidor (ex: 178.104.228.85)
#    HETZNER_USER          — utilizador SSH (padrão: root)
#    HETZNER_DEPLOY_PATH   — caminho no servidor (padrão: /opt/superescola)
#    HETZNER_SSH_KEY       — chave privada SSH
#    NEON_DATABASE_URL     — URL da base de dados Neon
#    JWT_SECRET            — segredo JWT
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Cores ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()    { echo -e "   ${GREEN}✓${NC} $1"; }
info()  { echo -e "   ${CYAN}→${NC} $1"; }
warn()  { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail()  { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }
banner(){ echo -e "\n${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
          echo -e "${BOLD}${GREEN}║  $1${NC}"
          echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
SKIP_FRONTEND=false
SKIP_SERVER_BUILD=false
SKIP_GIT=false
SKIP_DEPLOY=false

for arg in "$@"; do
  case $arg in
    --skip-frontend)      SKIP_FRONTEND=true ;;
    --skip-server-build)  SKIP_SERVER_BUILD=true ;;
    --skip-git)           SKIP_GIT=true ;;
    --skip-deploy)        SKIP_DEPLOY=true ;;
  esac
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        Super Escola (SIGA) — Release Completo               ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Carregar secrets do Replit ────────────────────────────────────────────────
_load() {
  local k="$1"
  local cur="${!k:-}"
  if [ -z "$cur" ]; then
    local v
    v=$(node -e "process.stdout.write(process.env['$k']||'')" 2>/dev/null) || v=""
    if [ -n "$v" ]; then export "$k"="$v"; fi
  fi
}
_load GITHUB_PAT
_load GITHUB_PERSONAL_ACCESS_TOKEN
_load HETZNER_HOST
_load HETZNER_USER
_load HETZNER_DEPLOY_PATH
_load HETZNER_SSH_KEY
_load HETZNER_SSH_PASSWORD
_load NEON_DATABASE_URL
_load JWT_SECRET
_load RESEND_API_KEY
_load GEMINI_API_KEY

HETZNER_USER="${HETZNER_USER:-root}"
HETZNER_DEPLOY_PATH="${HETZNER_DEPLOY_PATH:-/opt/superescola}"
GITHUB_REPO="${GITHUB_REPO:-osvaldofmqueta-stack/liceun_303_cacuso_complexo_escolar}"
TOKEN="${GITHUB_PAT:-${GITHUB_PERSONAL_ACCESS_TOKEN:-}}"

# Limpar caracteres inválidos dos valores críticos (espaços, newlines, etc.)
HETZNER_HOST="$(echo "${HETZNER_HOST:-}" | tr -d '[:space:]')"
HETZNER_USER="$(echo "${HETZNER_USER}" | tr -d '[:space:]')"
HETZNER_DEPLOY_PATH="$(echo "${HETZNER_DEPLOY_PATH}" | tr -d '[:space:]')"

# ── Verificação de secrets ────────────────────────────────────────────────────
step "0/6  Verificação de secrets"

if [ "$SKIP_GIT" = false ]; then
  if [ -z "$TOKEN" ]; then
    warn "GITHUB_PAT não definido — push GitHub vai falhar."
  else
    ok "GitHub PAT configurado"
  fi
fi

if [ "$SKIP_DEPLOY" = false ]; then
  [ -z "${HETZNER_HOST:-}" ] && fail "HETZNER_HOST não definido. Adiciona nos Secrets."
  ok "HETZNER_HOST = ${HETZNER_HOST}"
  [ -z "${HETZNER_SSH_KEY:-}" ] && [ -z "${HETZNER_SSH_PASSWORD:-}" ] && \
    fail "HETZNER_SSH_KEY ou HETZNER_SSH_PASSWORD não definido."
  [ -n "${HETZNER_SSH_KEY:-}" ] && ok "Autenticação SSH: chave privada" || ok "Autenticação SSH: password"
  [ -z "${NEON_DATABASE_URL:-}" ] && warn "NEON_DATABASE_URL não definido — base de dados vai falhar no servidor."
  [ -n "${NEON_DATABASE_URL:-}" ] && ok "NEON_DATABASE_URL configurado"
  [ -z "${JWT_SECRET:-}" ] && warn "JWT_SECRET não definido — autenticação vai falhar."
  [ -n "${JWT_SECRET:-}" ] && ok "JWT_SECRET configurado"
fi

# ── PASSO 1: Build do Frontend ────────────────────────────────────────────────
step "1/6  Build do Frontend Expo Web"

if [ "$SKIP_FRONTEND" = true ]; then
  warn "Build do frontend ignorado (--skip-frontend) — a usar dist/ existente."
else
  DIST_DIR="$(pwd)/dist"
  BACKUP_DIR="$(pwd)/.dist-backup"

  if [ -f "$DIST_DIR/index.html" ]; then
    info "Backup do dist/ actual..."
    rm -rf "$BACKUP_DIR"
    cp -r "$DIST_DIR" "$BACKUP_DIR"
    ok "Backup guardado em .dist-backup/"
  fi

  info "A aplicar patches pré-build..."
  bash "$(pwd)/scripts/pre-build-patches.sh"

  info "A construir frontend Expo Web (3-5 min)..."
  echo ""

  EXPO_BIN=""
  if [ -x "node_modules/.bin/expo-internal" ]; then
    EXPO_BIN="node_modules/.bin/expo-internal"
  elif [ -x "node_modules/@expo/cli/build/bin/cli" ]; then
    EXPO_BIN="node node_modules/@expo/cli/build/bin/cli"
  else
    warn "Binário expo não encontrado — a tentar npx expo..."
    EXPO_BIN="npx expo"
  fi

  CHROMIUM_PATH="$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo '')"
  BUILD_TMP_DIR="/tmp/expo-dist-$$"

  PUPPETEER_SKIP_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH="$CHROMIUM_PATH" \
  SERVE_STATIC_WEB=1 \
    $EXPO_BIN export -p web --output-dir "$BUILD_TMP_DIR"
  BUILD_EXIT=$?

  if [ $BUILD_EXIT -eq 0 ] && [ -d "$BUILD_TMP_DIR" ]; then
    [ -d "$BUILD_TMP_DIR/_expo" ] && cp -r "$BUILD_TMP_DIR/_expo" "$DIST_DIR/"
    [ -f "$BUILD_TMP_DIR/index.html" ] && cp "$BUILD_TMP_DIR/index.html" "$DIST_DIR/"
    [ -d "$BUILD_TMP_DIR/assets" ] && cp -r "$BUILD_TMP_DIR/assets" "$DIST_DIR/"
    rm -rf "$BUILD_TMP_DIR"
    echo ""
    ok "Frontend construído em dist/"
    rm -rf "$BACKUP_DIR"
  else
    warn "Build falhado — a restaurar versão anterior..."
    if [ -d "$BACKUP_DIR" ]; then
      rm -rf "$DIST_DIR"
      mv "$BACKUP_DIR" "$DIST_DIR"
      ok "dist/ restaurado."
    fi
    fail "Build do frontend falhou (código ${BUILD_EXIT:-1})."
  fi

  # Copiar fontes Inter
  INTER_BASE="node_modules/@expo-google-fonts/inter"
  if [ -f "$INTER_BASE/400Regular/Inter_400Regular.ttf" ]; then
    mkdir -p dist/fonts
    cp "$INTER_BASE/400Regular/Inter_400Regular.ttf"   dist/fonts/
    cp "$INTER_BASE/500Medium/Inter_500Medium.ttf"     dist/fonts/
    cp "$INTER_BASE/600SemiBold/Inter_600SemiBold.ttf" dist/fonts/
    cp "$INTER_BASE/700Bold/Inter_700Bold.ttf"         dist/fonts/
    ok "Fontes Inter copiadas para dist/fonts/"
  fi
fi

# ── PASSO 2: Build do Servidor ────────────────────────────────────────────────
# SEMPRE construído localmente no Replit — o esbuild NÃO está no servidor Hetzner.
# O flag --skip-server-build só faz sentido se não houve alterações ao servidor.
step "2/6  Build do Servidor (esbuild local)"

if [ "$SKIP_SERVER_BUILD" = true ]; then
  warn "Build do servidor ignorado (--skip-server-build) — a usar server_dist/index.js existente."
  if [ ! -f server_dist/index.js ]; then
    warn "server_dist/index.js não existe — o servidor vai arrancar em modo tsx (mais lento)."
  else
    SIZE=$(du -sh server_dist/index.js | cut -f1)
    ok "A usar bundle existente: server_dist/index.js (${SIZE})"
  fi
else
  if [ -x "node_modules/.bin/esbuild" ]; then
    info "A compilar server/index.ts → server_dist/index.js..."
    mkdir -p server_dist

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

    if [ -f server_dist/index.js ]; then
      SIZE=$(du -sh server_dist/index.js | cut -f1)
      ok "Bundle do servidor criado: server_dist/index.js (${SIZE})"
    else
      warn "esbuild falhou — o servidor vai arrancar em modo tsx."
    fi
  else
    warn "esbuild não encontrado em node_modules — a continuar sem build do servidor."
  fi
fi

# ── PASSO 3: Commit + Push GitHub ─────────────────────────────────────────────
step "3/6  Git — Commit + Push para GitHub"

if [ "$SKIP_GIT" = true ]; then
  warn "Git ignorado (--skip-git)."
else
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
  [ "$BRANCH" = "HEAD" ] && BRANCH="main"
  info "Ramo: $BRANCH"

  git add -A

  if git diff --cached --quiet; then
    ok "Sem alterações para fazer commit — repositório já actualizado."
  else
    COMMIT_MSG="release: $(date '+%d/%m/%Y %H:%M') — build + deploy automático"
    git commit -m "$COMMIT_MSG"
    ok "Commit: $COMMIT_MSG"
  fi

  info "A fazer push para GitHub (${GITHUB_REPO})..."

  _do_push() {
    local url="$1" branch="$2"
    if git push "$url" "HEAD:$branch" 2>/tmp/push_err; then
      return 0
    fi
    local err; err=$(cat /tmp/push_err)
    if echo "$err" | grep -qE "non-fast-forward|rejected|fetch first|stale"; then
      warn "Histórico divergente — a forçar push..."
      git push --force "$url" "HEAD:$branch" 2>&1
      return $?
    fi
    echo "$err" >&2
    return 1
  }

  PUSH_OK=false
  if [ -n "$TOKEN" ]; then
    REPO_URL="https://osvaldofmqueta-stack:${TOKEN}@github.com/${GITHUB_REPO}.git"
    if _do_push "$REPO_URL" "$BRANCH"; then
      ok "Push para GitHub concluído."
      PUSH_OK=true
    else
      warn "Push com PAT falhou. A tentar via origin..."
    fi
  fi

  if [ "$PUSH_OK" = false ]; then
    if _do_push "origin" "$BRANCH" 2>/dev/null; then
      ok "Push via origin concluído."
    else
      warn "Push para GitHub falhou — verifica GITHUB_PAT nos Secrets."
    fi
  fi
fi

# ── PASSO 4: Configurar SSH ───────────────────────────────────────────────────
if [ "$SKIP_DEPLOY" = false ]; then
  step "4/6  Configurar SSH para Hetzner"

  SSH_KEY_FILE=""
  USE_SSHPASS=false
  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=20"

  if [ -n "${HETZNER_SSH_KEY:-}" ]; then
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
    SSH_OPTS="$SSH_OPTS -o BatchMode=yes -i $SSH_KEY_FILE"
    # shellcheck disable=SC2064
    trap "rm -f '$SSH_KEY_FILE'" EXIT
    ok "Chave SSH configurada."
  elif [ -n "${HETZNER_SSH_PASSWORD:-}" ]; then
    command -v sshpass &>/dev/null || {
      info "A instalar sshpass..."
      sudo apt-get install -y -qq sshpass 2>/dev/null || fail "Não foi possível instalar sshpass."
    }
    export SSHPASS="$HETZNER_SSH_PASSWORD"
    USE_SSHPASS=true
    ok "Autenticação por password configurada."
  fi

  ssh_run()   {
    if [ "$USE_SSHPASS" = true ]; then sshpass -e ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "$1"
    else ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "$1"; fi
  }
  rsync_run() {
    if [ "$USE_SSHPASS" = true ]; then sshpass -e rsync "$@"
    else rsync "$@"; fi
  }

  # ── Verificação de conectividade SSH ─────────────────────────────────────────
  step "4.5/6  Verificar ligação SSH ao Hetzner"
  info "A testar ligação SSH para ${HETZNER_USER}@${HETZNER_HOST}..."

  SSH_TEST_OUTPUT=""
  SSH_TEST_OK=false

  if [ "$USE_SSHPASS" = true ]; then
    SSH_TEST_OUTPUT=$(sshpass -e ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "echo OK" 2>&1) && SSH_TEST_OK=true || true
  else
    SSH_TEST_OUTPUT=$(ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "echo OK" 2>&1) && SSH_TEST_OK=true || true
  fi

  if [ "$SSH_TEST_OK" = true ] && echo "$SSH_TEST_OUTPUT" | grep -q "^OK"; then
    ok "Ligação SSH estabelecida com sucesso ✅"
  else
    echo ""
    echo -e "   ${RED}✗ ERRO: Não foi possível ligar ao servidor via SSH.${NC}"
    echo ""
    echo -e "   ${YELLOW}Diagnóstico:${NC}"
    echo -e "   • Host:      ${HETZNER_HOST}"
    echo -e "   • Utilizador: ${HETZNER_USER}"
    echo -e "   • Saída SSH:  $(echo "$SSH_TEST_OUTPUT" | head -3)"
    echo ""
    echo -e "   ${YELLOW}Possíveis causas:${NC}"
    echo -e "   1. IP do servidor errado → verifica o secret HETZNER_HOST"
    echo -e "   2. Chave SSH inválida ou sem permissão → verifica HETZNER_SSH_KEY"
    echo -e "   3. Servidor inacessível / firewall → verifica se a porta 22 está aberta"
    echo -e "   4. Utilizador errado → define o secret HETZNER_USER (padrão: root)"
    echo ""
    echo -e "   ${CYAN}Para testar manualmente:${NC}"
    echo -e "   ssh root@${HETZNER_HOST}"
    echo ""
    fail "Ligação SSH falhou. Corrige os secrets e tenta novamente."
  fi

  # ── PASSO 5: Rsync para Hetzner ─────────────────────────────────────────────
  step "5/6  Sincronizar ficheiros → Hetzner"
  info "A enviar via rsync (pode demorar 1-2 min na primeira vez)..."

  rsync_run -az --delete \
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
    --exclude='*.apk' \
    --exclude='*.aab' \
    ./ "${HETZNER_USER}@${HETZNER_HOST}:${HETZNER_DEPLOY_PATH}/"

  [ $? -ne 0 ] && fail "rsync falhou. Verifica a ligação SSH."
  ok "Ficheiros sincronizados com sucesso."

  # ── Actualizar .env no servidor ──────────────────────────────────────────────
  ENV_TMP="$(mktemp /tmp/siga_env_XXXXXX)"
  cat > "$ENV_TMP" << EOF
NODE_ENV=production
PORT=5000
SERVE_STATIC_WEB=1
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
UV_THREADPOOL_SIZE=16
NEON_DATABASE_URL=${NEON_DATABASE_URL:-}
JWT_SECRET=${JWT_SECRET:-}
RESEND_API_KEY=${RESEND_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
EOF

  if [ "$USE_SSHPASS" = true ]; then
    sshpass -e scp $SSH_OPTS "$ENV_TMP" "${HETZNER_USER}@${HETZNER_HOST}:${HETZNER_DEPLOY_PATH}/.env"
  else
    scp $SSH_OPTS "$ENV_TMP" "${HETZNER_USER}@${HETZNER_HOST}:${HETZNER_DEPLOY_PATH}/.env"
  fi
  rm -f "$ENV_TMP"
  ssh_run "chmod 600 '${HETZNER_DEPLOY_PATH}/.env'"
  ok ".env actualizado no servidor."

  # ── PASSO 6: Reiniciar PM2 ───────────────────────────────────────────────────
  step "6/6  Reiniciar aplicação no servidor"

  # ⚠️  ZERO-DOWNTIME: o npm install corre ANTES de parar o servidor.
  #   1. npm install enquanto servidor antigo ainda serve pedidos
  #   2. pm2 reload (graceful) — substitui o processo sem downtime
  #   3. pm2 start (só se o processo não existia)
  ssh_run "
    cd '${HETZNER_DEPLOY_PATH}'

    export PUPPETEER_SKIP_DOWNLOAD=true

    echo '   → Garantir directório de logs...'
    mkdir -p /var/log/superescola

    echo '   → npm install (enquanto servidor antigo continua a servir)...'
    if ! npm install --legacy-peer-deps --omit=dev 2>&1 | tail -3; then
      echo '   ⚠  npm install falhou — a limpar cache e tentar novamente...'
      npm cache clean --force 2>/dev/null || true
      rm -rf node_modules/.cache 2>/dev/null || true
      npm install --legacy-peer-deps --omit=dev 2>&1 | tail -3 || echo '   ⚠  npm install com erros (não crítico se bundle server_dist/index.js estiver presente)'
    fi

    echo '   → PM2 reload / start (zero-downtime)...'
    if pm2 describe superescola > /dev/null 2>&1; then
      echo '      Processo existe — a fazer reload gracioso...'
      pm2 reload superescola --update-env 2>&1 | grep -E '\[PM2\]|✓|App' | head -4 || true
    else
      echo '      Processo não existe — a iniciar...'
      pm2 start ecosystem.config.cjs
    fi

    pm2 save --force
    sleep 5
    pm2 list
  "

  [ $? -ne 0 ] && fail "Erro no servidor. Verifica: ssh root@${HETZNER_HOST} 'pm2 logs superescola'"
  ok "Aplicação reiniciada."

  # ── Verificação final ────────────────────────────────────────────────────────
  echo ""
  info "A verificar se a app está a responder (aguarda 10s)..."
  sleep 10

  if curl -sf --max-time 15 "https://www.liceun303.live/api/config" -o /dev/null 2>/dev/null; then
    ok "App a responder em https://www.liceun303.live ✅"
  elif curl -sf --max-time 15 "http://${HETZNER_HOST}:5000/api/config" -o /dev/null 2>/dev/null; then
    ok "App a responder em http://${HETZNER_HOST}:5000 ✅"
  else
    warn "App pode ainda estar a iniciar."
    warn "Verifica: ssh root@${HETZNER_HOST} 'pm2 logs superescola --lines 30'"
  fi
fi

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  ✅  Release concluído com sucesso!                          ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "   ${CYAN}🌐 Produção:${NC} https://www.liceun303.live"
echo -e "   ${CYAN}📦 GitHub:${NC}   https://github.com/${GITHUB_REPO}"
echo -e "   ${CYAN}📋 Logs:${NC}     ssh root@${HETZNER_HOST:-servidor} 'pm2 logs superescola --lines 50'"
echo ""
