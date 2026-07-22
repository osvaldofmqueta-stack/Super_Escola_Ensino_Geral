#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Deploy directo para Hetzner via SSH/rsync
#
#  Pré-requisitos (secrets do Replit):
#    HETZNER_HOST        — IP ou hostname do servidor (ex: 123.456.789.0)
#    HETZNER_USER        — utilizador SSH (ex: root)
#    HETZNER_DEPLOY_PATH — caminho no servidor (ex: /var/www/superescola)
#    HETZNER_SSH_KEY     — conteúdo da chave privada SSH (-----BEGIN...)
#    GITHUB_PAT          — (opcional) token GitHub para push antes de deploy
#
#  Uso:
#    bash scripts/deploy-hetzner-directo.sh              # build + push + deploy
#    bash scripts/deploy-hetzner-directo.sh --skip-build # sem build do frontend
#    bash scripts/deploy-hetzner-directo.sh --skip-push  # sem push para GitHub
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Cores ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}[$1]${NC} $2"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
SKIP_BUILD=false
SKIP_PUSH=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
    --skip-push)  SKIP_PUSH=true  ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Super Escola — Deploy Directo para Hetzner          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ── Carregar variáveis (do ambiente ou dos Secrets do Replit via node) ─────────
# No terminal do Replit, os Secrets não são injectados automaticamente no shell.
# O node tem sempre acesso a process.env com os secrets, por isso usamo-lo como fallback.
_load_secret() {
  local var_name="$1"
  local current_val="${!var_name:-}"
  if [ -z "$current_val" ]; then
    current_val=$(node -e "process.stdout.write(process.env['$var_name'] || '')" 2>/dev/null || true)
    if [ -n "$current_val" ]; then
      export "$var_name"="$current_val"
    fi
  fi
}

_load_secret HETZNER_HOST
_load_secret HETZNER_USER
_load_secret HETZNER_DEPLOY_PATH
_load_secret HETZNER_SSH_KEY
_load_secret GITHUB_PAT

HETZNER_HOST="${HETZNER_HOST:-}"
HETZNER_USER="${HETZNER_USER:-root}"
HETZNER_SSH_KEY="${HETZNER_SSH_KEY:-}"

# Caminho real onde o PM2 corre a aplicação em produção.
# Se o secret/env tiver o valor antigo (/var/www/superescola), corrigir automaticamente.
_raw_path="${HETZNER_DEPLOY_PATH:-/opt/superescola}"
if [ "$_raw_path" = "/var/www/superescola" ]; then
  HETZNER_DEPLOY_PATH="/opt/superescola"
else
  HETZNER_DEPLOY_PATH="$_raw_path"
fi

if [ -z "$HETZNER_HOST" ]; then
  fail "HETZNER_HOST não definido.\n\n   Se estás no terminal do Replit, usa:\n   ${BOLD}node scripts/deploy.js${NC}${RED}  (em vez de bash scripts/deploy-hetzner-directo.sh)\n\n   ${NC}   Ou confirma que o Secret HETZNER_HOST está configurado no painel de Secrets."
fi

echo "   🌐 Servidor : ${HETZNER_USER}@${HETZNER_HOST}"
echo "   📁 Destino  : ${HETZNER_DEPLOY_PATH}"
echo ""

# ── Configurar chave SSH ───────────────────────────────────────────────────────
SSH_KEY_FILE=""
setup_ssh_key() {
  if [ -n "$HETZNER_SSH_KEY" ]; then
    SSH_KEY_FILE="$(mktemp /tmp/hetzner_key_XXXXXX)"

    # Reconstruir chave com quebras de linha correctas (funciona mesmo que o secret
    # tenha sido guardado como uma linha só, com ou sem \n literais)
    node -e "
      const raw = process.env.HETZNER_SSH_KEY || '';
      // Se já tem newlines reais, usar tal qual
      if (raw.includes('\n')) {
        process.stdout.write(raw.trim() + '\n');
        process.exit(0);
      }
      // Separar por \\n literais ou reconstruir a partir de espaços
      let key = raw.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n');
      if (!key.includes('\n')) {
        // Tudo numa linha — reconstruir manualmente
        const beginMatch = key.match(/(-----BEGIN [^-]+ KEY-----)/);
        const endMatch   = key.match(/(-----END [^-]+ KEY-----)/);
        if (beginMatch && endMatch) {
          const header = beginMatch[1];
          const footer = endMatch[1];
          let body = key.slice(key.indexOf(header) + header.length, key.lastIndexOf(footer)).trim();
          // Remover espaços e reformatar base64 a 70 chars por linha
          body = body.replace(/\s+/g, '');
          const lines = body.match(/.{1,70}/g) || [];
          key = header + '\n' + lines.join('\n') + '\n' + footer + '\n';
        }
      }
      process.stdout.write(key.trim() + '\n');
    " > "$SSH_KEY_FILE"

    chmod 600 "$SSH_KEY_FILE"

    # Validar a chave
    if ! ssh-keygen -l -f "$SSH_KEY_FILE" &>/dev/null; then
      fail "Chave SSH inválida ou com formato incorrecta. Verifica o valor de HETZNER_SSH_KEY nos Secrets."
    fi
    ok "Chave SSH configurada e validada."
  elif [ -f "$HOME/.ssh/id_rsa" ]; then
    SSH_KEY_FILE="$HOME/.ssh/id_rsa"
    ok "A usar chave SSH local (~/.ssh/id_rsa)."
  else
    fail "Chave SSH não encontrada. Define HETZNER_SSH_KEY nos Secrets do Replit."
  fi
}

cleanup_ssh_key() {
  if [ -n "$SSH_KEY_FILE" ] && [[ "$SSH_KEY_FILE" == /tmp/hetzner_key_* ]]; then
    rm -f "$SSH_KEY_FILE"
  fi
}
trap cleanup_ssh_key EXIT

setup_ssh_key

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes -i $SSH_KEY_FILE"

ssh_run() {
  ssh $SSH_OPTS "${HETZNER_USER}@${HETZNER_HOST}" "$1"
}

# ── Passo 1: Build do frontend ────────────────────────────────────────────────
step "1/4" "Build do frontend Expo Web"
if [ "$SKIP_BUILD" = false ]; then
  info "A construir frontend (pode demorar 3-5 min)..."
  echo ""
  PUPPETEER_SKIP_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH="$(which chromium 2>/dev/null || echo '')" \
    npx expo export -p web
  echo ""
  ok "Frontend construído em dist/"
else
  warn "Build ignorado (--skip-build)"
fi

# ── Passo 2: Push para GitHub ─────────────────────────────────────────────────
step "2/4" "Push para GitHub"
if [ "$SKIP_PUSH" = false ]; then
  TOKEN="${GITHUB_PAT:-${GITHUB_PERSONAL_ACCESS_TOKEN:-}}"
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "master")
  [ "$BRANCH" = "HEAD" ] && BRANCH="master"

  git add -A
  if git diff --cached --quiet; then
    warn "Sem alterações para commit."
  else
    COMMIT_MSG="deploy: $(date '+%d/%m/%Y %H:%M') — hetzner deploy"
    git commit -m "$COMMIT_MSG"
    ok "Commit: $COMMIT_MSG"
  fi

  if [ -n "$TOKEN" ]; then
    REPO_URL="https://osvaldofmqueta-stack:${TOKEN}@github.com/osvaldofmqueta-stack/superescola.git"
    git push "$REPO_URL" "HEAD:$BRANCH" --force 2>&1 || warn "Push falhou (continua o deploy na mesma)."
    ok "Push para GitHub concluído (branch: $BRANCH)."
  else
    warn "GITHUB_PAT não definido — push para GitHub ignorado."
  fi
else
  warn "Push ignorado (--skip-push)"
fi

# ── Passo 3: Copiar ficheiros para o servidor ─────────────────────────────────
step "3/4" "A copiar ficheiros para o servidor Hetzner"
info "A sincronizar ficheiros via rsync..."

rsync -az --progress \
  -e "ssh $SSH_OPTS" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.dist-backup' \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude 'android' \
  --exclude 'ios' \
  --exclude '.agents' \
  --exclude '.local' \
  --exclude 'attached_assets' \
  --exclude 'screenshots' \
  --exclude '.replit' \
  --exclude 'replit.nix' \
  . "${HETZNER_USER}@${HETZNER_HOST}:${HETZNER_DEPLOY_PATH}/"

ok "Ficheiros copiados com sucesso."

# ── Passo 3b: Sincronizar secrets do Replit → .env do Hetzner ─────────────────
step "3b/4" "A sincronizar secrets (NEON, JWT, etc.) para o servidor"
info "A garantir que os secrets do Replit estão actualizados no servidor..."

# Carregar secrets via node (no Replit os secrets estão em process.env)
_load_secret NEON_DATABASE_URL
_load_secret JWT_SECRET
_load_secret RESEND_API_KEY
_load_secret GEMINI_API_KEY
_load_secret TELEGRAM_BOT_TOKEN

NEON_URL_VAL="${NEON_DATABASE_URL:-}"
JWT_VAL="${JWT_SECRET:-}"
RESEND_VAL="${RESEND_API_KEY:-}"
GEMINI_VAL="${GEMINI_API_KEY:-}"
TELEGRAM_VAL="${TELEGRAM_BOT_TOKEN:-}"

if [ -n "$NEON_URL_VAL" ]; then
  # Usar base64 para transportar valores com caracteres especiais (&, =, ?, etc.)
  NEON_B64=$(printf '%s' "$NEON_URL_VAL" | base64 | tr -d '\n')
  JWT_B64=$(printf '%s' "$JWT_VAL" | base64 | tr -d '\n')
  RESEND_B64=$(printf '%s' "$RESEND_VAL" | base64 | tr -d '\n')
  GEMINI_B64=$(printf '%s' "$GEMINI_VAL" | base64 | tr -d '\n')
  TELEGRAM_B64=$(printf '%s' "$TELEGRAM_VAL" | base64 | tr -d '\n')

  ssh_run "
    python3 - '${HETZNER_DEPLOY_PATH}/.env' '$NEON_B64' '$JWT_B64' '$RESEND_B64' '$GEMINI_B64' '$TELEGRAM_B64' <<'PYEOF'
import sys, re, base64
env_file = sys.argv[1]
keys_b64 = {
  'NEON_DATABASE_URL': sys.argv[2],
  'JWT_SECRET':        sys.argv[3],
  'RESEND_API_KEY':    sys.argv[4],
  'GEMINI_API_KEY':    sys.argv[5],
  'TELEGRAM_BOT_TOKEN': sys.argv[6],
}
try:
    content = open(env_file).read()
except:
    content = ''
for key, val_b64 in keys_b64.items():
    if not val_b64:
        continue
    val = base64.b64decode(val_b64).decode()
    pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.MULTILINE)
    if pattern.search(content):
        content = pattern.sub(key + '=' + val, content)
    else:
        sep = '\n' if content and not content.endswith('\n') else ''
        content += sep + key + '=' + val + '\n'
open(env_file, 'w').write(content)
print('Secrets sincronizados via Python (safe para URLs com &).')
PYEOF
  "
  ok "Secrets sincronizados — NEON_DATABASE_URL, JWT_SECRET e restantes actualizados."
else
  warn "NEON_DATABASE_URL não encontrada nos secrets do Replit — .env do servidor não alterado."
fi

# ── Passo 4: Reiniciar a aplicação no servidor ────────────────────────────────
step "4/4" "A reiniciar aplicação no servidor"
info "A instalar dependências e reiniciar serviço..."

ssh_run "
  set -e
  cd '${HETZNER_DEPLOY_PATH}'

  # Instalar dependências Node (sem download do Puppeteer)
  export PUPPETEER_SKIP_DOWNLOAD=true
  echo '   → npm install...'
  npm install --legacy-peer-deps --omit=dev --quiet 2>&1 | tail -3

  # Reiniciar serviço via PM2 (se existir) ou systemctl
  if command -v pm2 &>/dev/null; then
    echo '   → PM2 restart...'
    pm2 reload superescola 2>/dev/null || \
    pm2 start node_modules/.bin/tsx \
      --name superescola \
      --interpreter none \
      -- server/index.ts \
      --env PUPPETEER_SKIP_DOWNLOAD=true \
         PUPPETEER_EXECUTABLE_PATH=\$(which chromium 2>/dev/null || which chromium-browser) \
         SERVE_STATIC_WEB=1 \
         NODE_ENV=production 2>/dev/null || \
    (echo '   ⚠  PM2 start falhou — a tentar como pre-built...'; \
     pm2 start server_dist/index.js --name superescola 2>/dev/null || true)
  elif systemctl is-active --quiet superescola 2>/dev/null; then
    echo '   → systemctl restart superescola...'
    systemctl restart superescola
  else
    echo '   ⚠  Nenhum gestor de processos detectado (PM2 ou systemctl).'
    echo '   ℹ  Inicia manualmente: pm2 start node_modules/.bin/tsx --name superescola -- server/index.ts'
  fi
" && ok "Aplicação reiniciada com sucesso."

# ── Verificação de saúde ──────────────────────────────────────────────────────
echo ""
info "A verificar se o servidor responde..."
sleep 3
if curl -sf --max-time 10 "http://${HETZNER_HOST}/api/config" -o /dev/null 2>/dev/null; then
  ok "Servidor a responder correctamente em http://${HETZNER_HOST}"
else
  warn "O servidor pode ainda estar a iniciar. Verifica em http://${HETZNER_HOST}"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Deploy para Hetzner concluído com sucesso!          ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
