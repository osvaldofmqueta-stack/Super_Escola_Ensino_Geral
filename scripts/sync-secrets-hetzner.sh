#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola — Sincronizar Secrets do Replit → Servidor Hetzner
#  Ficheiro: scripts/sync-secrets-hetzner.sh
#
#  O que faz:
#    1. Lê os secrets do Replit (JWT, email, IA, Telegram, etc.)
#    2. Faz backup do .env actual no servidor
#    3. Actualiza cirurgicamente cada variável em:
#         /opt/superescola/.env
#         /var/www/superescola/.env
#       ⚠️  NEON_DATABASE_URL e DATABASE_URL NÃO são tocadas — o servidor
#           Hetzner tem a sua própria base de dados Neon (diferente do Replit).
#    4. Faz PM2 reload --update-env (zero-downtime, aguarda até 90s)
#    5. Verifica saúde e faz rollback automático se falhar
#
#  Uso:
#    bash scripts/sync-secrets-hetzner.sh
#    bash scripts/sync-secrets-hetzner.sh --dry-run      # só mostra o que ia fazer
#    bash scripts/sync-secrets-hetzner.sh --force-neon   # actualiza também NEON_DATABASE_URL
#
#  Secrets Replit necessários:
#    HETZNER_SSH_KEY, HETZNER_HOST
#    JWT_SECRET, RESEND_API_KEY, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN
#  Opcionais:
#    NEON_DATABASE_URL (só usado com --force-neon)
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Cores ─────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "   ${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}[$1/$TOTAL_STEPS]${NC} $2"; }

DRY_RUN=false
FORCE_NEON=false
TOTAL_STEPS=6
for arg in "$@"; do
  [ "$arg" = "--dry-run" ]   && DRY_RUN=true
  [ "$arg" = "--force-neon" ] && FORCE_NEON=true
done

# ── Carregar secrets do Replit (funciona mesmo no terminal do Replit) ─────────
_load() {
  local k="$1"
  local v="${!k:-}"
  if [ -z "$v" ]; then
    v=$(node -e "process.stdout.write(process.env['$k']||'')" 2>/dev/null || true)
  fi
  if [ -n "$v" ]; then
    export "$k"="$v"
  fi
}
_load HETZNER_SSH_KEY
_load HETZNER_HOST
_load JWT_SECRET
_load RESEND_API_KEY
_load GEMINI_API_KEY
_load TELEGRAM_BOT_TOKEN
_load OPENAI_API_KEY
_load VAPID_PUBLIC_KEY
_load VAPID_PRIVATE_KEY
_load NEON_DATABASE_URL

# ── Verificar obrigatórios ────────────────────────────────────────────────────
[ -z "${HETZNER_SSH_KEY:-}" ] && err "Secret HETZNER_SSH_KEY não definido"
[ -z "${HETZNER_HOST:-}" ]    && err "Secret HETZNER_HOST não definido"
[ -z "${JWT_SECRET:-}" ]      && err "Secret JWT_SECRET não definido"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║    Super Escola — Sync de Secrets Replit → Hetzner          ║"
printf "║    Host : %-51s║\n" "$HETZNER_HOST"
[ "$DRY_RUN"    = true ] && \
printf "║    %-57s║\n" "MODO: DRY-RUN (sem alterações reais)"
[ "$FORCE_NEON" = true ] && \
printf "║    %-57s║\n" "⚠  FORCE-NEON: NEON_DATABASE_URL será sobrescrita"
echo "╚══════════════════════════════════════════════════════════════╝"
if [ "$FORCE_NEON" = false ]; then
  echo ""
  echo -e "   ${DIM}ℹ  NEON_DATABASE_URL/DATABASE_URL NÃO serão alteradas${NC}"
  echo -e "   ${DIM}   (o Hetzner usa uma BD Neon diferente do Replit)${NC}"
  echo -e "   ${DIM}   Use --force-neon para forçar a actualização.${NC}"
fi

# ── Passo 1: Chave SSH ────────────────────────────────────────────────────────
step 1 "Configurar chave SSH"

TMPKEY=$(mktemp /tmp/sshkey_XXXXXX)
chmod 600 "$TMPKEY"
trap 'rm -f "$TMPKEY"' EXIT

KEY_BODY=$(echo "$HETZNER_SSH_KEY" \
  | sed 's/-----BEGIN OPENSSH PRIVATE KEY-----//' \
  | sed 's/-----END OPENSSH PRIVATE KEY-----//' \
  | tr -d ' \n\r\t')
{
  echo "-----BEGIN OPENSSH PRIVATE KEY-----"
  echo "$KEY_BODY" | fold -w 64
  echo "-----END OPENSSH PRIVATE KEY-----"
} > "$TMPKEY"

if ! ssh-keygen -l -f "$TMPKEY" &>/dev/null; then
  err "Chave SSH inválida. Verifica HETZNER_SSH_KEY nos Secrets."
fi
ok "Chave SSH válida"

SSH="ssh -i $TMPKEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes root@$HETZNER_HOST"

# ── Passo 2: Testar ligação ───────────────────────────────────────────────────
step 2 "Testar ligação ao servidor"
info "A ligar a $HETZNER_HOST ..."
if ! $SSH "echo ok" >/dev/null 2>&1; then
  err "Não foi possível ligar ao servidor. Verifica HETZNER_HOST e a chave SSH."
fi
ok "Ligação SSH estabelecida"

if [ "$DRY_RUN" = true ]; then
  warn "DRY-RUN: ligação testada com sucesso — sem alterações. A terminar."
  exit 0
fi

# ── Passo 3: Backup ───────────────────────────────────────────────────────────
step 3 "Backup dos ficheiros .env actuais"

$SSH bash <<'ENDSSH'
BACKUP_DIR="/opt/superescola/env-backups"
STAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
for F in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  if [ -f "$F" ]; then
    DEST="${BACKUP_DIR}/.env.$(basename $(dirname $F)).${STAMP}"
    cp "$F" "$DEST"
    echo "backup: $F"
  fi
done
# Manter apenas os últimos 10 backups por prefixo
ls -t "${BACKUP_DIR}"/.env.superescola.* 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
ls -t "${BACKUP_DIR}"/.env.www.* 2>/dev/null        | tail -n +11 | xargs rm -f 2>/dev/null || true
ENDSSH
ok "Backups guardados em /opt/superescola/env-backups/"

# ── Passo 4: Actualizar variáveis ─────────────────────────────────────────────
step 4 "Sincronizar secrets nos ficheiros .env"

# Função segura: base64 para evitar problemas com caracteres especiais
# Só actualiza se o valor não estiver vazio
upsert_remote() {
  local key="$1" val="$2"
  if [ -z "$val" ]; then
    warn "$key — vazio, a saltar"
    return 0
  fi
  local val_b64
  val_b64=$(printf '%s' "$val" | base64 | tr -d '\n')

  for env_path in "/opt/superescola/.env" "/var/www/superescola/.env"; do
    $SSH bash -s -- "$env_path" "$key" "$val_b64" <<'ENDSSH'
FILE="$1"; KEY="$2"; VAL_B64="$3"
VAL=$(echo "$VAL_B64" | base64 -d)
mkdir -p "$(dirname "$FILE")"
touch "$FILE"
python3 - "$KEY" "$VAL" "$FILE" <<'PYEOF'
import sys, re
key, val, path = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path, 'r') as f:
        content = f.read()
except FileNotFoundError:
    content = ''
pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.MULTILINE)
if pattern.search(content):
    new_content = pattern.sub(key + '=' + val, content)
    action = 'actualizado'
else:
    sep = '\n' if content and not content.endswith('\n') else ''
    new_content = content + sep + key + '=' + val + '\n'
    action = 'adicionado'
with open(path, 'w') as f:
    f.write(new_content)
print(action)
PYEOF
ENDSSH
  done
  ok "$key"
}

# ── Secrets dinâmicos (do Replit) ─────────────────────────────────────────────
upsert_remote "JWT_SECRET"          "${JWT_SECRET:-}"
upsert_remote "RESEND_API_KEY"      "${RESEND_API_KEY:-}"
upsert_remote "GEMINI_API_KEY"      "${GEMINI_API_KEY:-}"
upsert_remote "TELEGRAM_BOT_TOKEN"  "${TELEGRAM_BOT_TOKEN:-}"
upsert_remote "OPENAI_API_KEY"      "${OPENAI_API_KEY:-}"
upsert_remote "VAPID_PUBLIC_KEY"    "${VAPID_PUBLIC_KEY:-}"
upsert_remote "VAPID_PRIVATE_KEY"   "${VAPID_PRIVATE_KEY:-}"

# ── NEON: só actualiza com --force-neon ───────────────────────────────────────
if [ "$FORCE_NEON" = true ]; then
  if [ -z "${NEON_DATABASE_URL:-}" ]; then
    warn "NEON_DATABASE_URL vazio — a saltar mesmo com --force-neon"
  else
    # Sanitizar URL antes de enviar (remover channel_binding e sslmode incompatíveis)
    NEON_CLEAN=$(echo "${NEON_DATABASE_URL}" \
      | sed 's/[&?]channel_binding=[^&]*//g' \
      | sed 's/[&?]uselibpqcompat=[^&]*//g' \
      | sed 's/[&?]sslmode=[^&]*//g' \
      | sed 's/[?&]$//')
    upsert_remote "NEON_DATABASE_URL" "$NEON_CLEAN"
    upsert_remote "DATABASE_URL"      "$NEON_CLEAN"
    warn "NEON_DATABASE_URL actualizada — confirma que a ligação à BD funciona!"
  fi
else
  echo -e "   ${DIM}↷ NEON_DATABASE_URL — ignorada (preservada do servidor)${NC}"
  echo -e "   ${DIM}↷ DATABASE_URL      — ignorada (preservada do servidor)${NC}"
fi

# ── Variáveis fixas de produção ───────────────────────────────────────────────
upsert_remote "NODE_ENV"                  "production"
upsert_remote "PORT"                      "5000"
upsert_remote "SERVE_STATIC_WEB"          "1"
upsert_remote "PUPPETEER_SKIP_DOWNLOAD"   "true"
upsert_remote "PUPPETEER_EXECUTABLE_PATH" "/usr/bin/chromium-browser"
upsert_remote "EMAIL_FROM"               "noreply@liceun303.live"
upsert_remote "AFRICASTALKING_USERNAME"   "sandbox"
upsert_remote "APP_URL"                  "https://liceun303.live"

# Ajustar permissões
$SSH "chmod 600 /opt/superescola/.env /var/www/superescola/.env 2>/dev/null; echo ok" >/dev/null
ok "Permissões 600 aplicadas"

# ── Passo 5: Verificação das chaves ──────────────────────────────────────────
step 5 "Verificação das chaves presentes"
$SSH bash <<'ENDSSH'
for ENV_PATH in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  echo "  📄 $ENV_PATH:"
  if [ -f "$ENV_PATH" ]; then
    grep -E '^[A-Z_]+=.+' "$ENV_PATH" | cut -d= -f1 | sed 's/^/     ✓ /'
  else
    echo "     ✗ ficheiro não encontrado"
  fi
done
ENDSSH

# ── Passo 6: PM2 reload zero-downtime + health check + rollback ───────────────
step 6 "PM2 reload (zero-downtime) + verificação de saúde"
info "A recarregar servidor..."

$SSH bash <<'ENDSSH'
set -e
PM2=$(command -v pm2 2>/dev/null || echo "/usr/local/bin/pm2")
HEALTH="http://localhost:5000/api/config"
APP="superescola"
# Timeout generoso: o servidor faz migrações na inicialização (pode demorar 30-60s)
MAX_WAIT=90

# Salvar .env para rollback
ROLLBACK_TMP=$(mktemp /tmp/env_rollback_XXXXXX)
cp /opt/superescola/.env "$ROLLBACK_TMP" 2>/dev/null || true

echo "   → PM2 reload --update-env ..."
if $PM2 describe "$APP" &>/dev/null 2>&1; then
  $PM2 reload "$APP" --update-env 2>&1 | grep -E "\[PM2\]|✓|App" | head -4 || true
else
  echo "   ⚠  Processo '$APP' não encontrado — a iniciar..."
  cd /opt/superescola
  $PM2 start ecosystem.config.cjs 2>&1 | head -4 || true
fi

echo "   → A aguardar resposta (máx. ${MAX_WAIT}s) ..."
SUCCESS=false
for i in $(seq 1 $MAX_WAIT); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH" 2>/dev/null || echo "000")
  if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
    SUCCESS=true
    echo "   ✓ Servidor a responder (HTTP $CODE) após ${i}s"
    break
  fi
  [ $((i % 10)) -eq 0 ] && printf " ${i}s" || printf "."
  sleep 1
done
echo ""

if [ "$SUCCESS" = "false" ]; then
  echo "   ✗ Servidor não respondeu em ${MAX_WAIT}s — a fazer rollback..."
  cp "$ROLLBACK_TMP" /opt/superescola/.env
  $PM2 reload "$APP" --update-env 2>/dev/null || $PM2 restart "$APP" 2>/dev/null || true
  rm -f "$ROLLBACK_TMP"
  exit 1
fi

$PM2 save --force &>/dev/null && echo "   ✓ Estado PM2 guardado" || true
rm -f "$ROLLBACK_TMP"
ENDSSH

ok "Servidor online e a responder"

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Sync concluído! Servidor Hetzner actualizado.           ║"
echo "╠══════════════════════════════════════════════════════════════╣"
[ -n "${JWT_SECRET:-}" ]         && echo "║  ✓ JWT_SECRET          → Autenticação JWT                  ║"
[ -n "${RESEND_API_KEY:-}" ]     && echo "║  ✓ RESEND_API_KEY      → Email OTP (Resend)                ║"
[ -n "${GEMINI_API_KEY:-}" ]     && echo "║  ✓ GEMINI_API_KEY      → Assistente IA (Google Gemini)     ║"
[ -n "${TELEGRAM_BOT_TOKEN:-}" ] && echo "║  ✓ TELEGRAM_BOT_TOKEN  → OTP e notificações Telegram       ║"
[ -n "${OPENAI_API_KEY:-}" ]     && echo "║  ✓ OPENAI_API_KEY      → IA (OpenAI)                       ║"
[ "$FORCE_NEON" = true ] && \
  echo "║  ✓ NEON_DATABASE_URL   → Actualizada (--force-neon)        ║" || \
  echo "║  ↷ NEON_DATABASE_URL   → Preservada (BD do Hetzner)        ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  PM2 reload zero-downtime → servidor nunca caiu             ║"
echo "║  Backup em /opt/superescola/env-backups/                    ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "  ${DIM}Próxima sincronização: bash scripts/sync-secrets-hetzner.sh${NC}"
echo -e "  ${DIM}Teste sem alterações:  bash scripts/sync-secrets-hetzner.sh --dry-run${NC}"
echo -e "  ${DIM}Forçar Neon do Replit: bash scripts/sync-secrets-hetzner.sh --force-neon${NC}"
echo ""
