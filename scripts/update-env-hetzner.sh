#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Actualização cirúrgica do .env no servidor Hetzner
#  Actualiza /opt/superescola/.env e /var/www/superescola/.env
#  sem interromper o servidor de produção (PM2 reload --update-env).
#
#  Uso: bash scripts/update-env-hetzner.sh
#
#  Requer os seguintes segredos Replit:
#    HETZNER_SSH_KEY   — chave privada SSH (pode estar numa só linha)
#    HETZNER_HOST      — IP/hostname do servidor (ex: 178.104.228.85)
#    RESEND_API_KEY    — chave API Resend (emails OTP)
#    GEMINI_API_KEY    — chave API Google Gemini (IA)
#    NEON_DATABASE_URL — connection string Neon PostgreSQL
#    JWT_SECRET        — segredo JWT (pode ser passado via env na invocação)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "   ${RED}✗${NC} $1"; exit 1; }

# ── Verificar variáveis obrigatórias ──────────────────────────────────────────
: "${HETZNER_SSH_KEY:?Variável HETZNER_SSH_KEY não definida}"
: "${HETZNER_HOST:?Variável HETZNER_HOST não definida}"
: "${RESEND_API_KEY:?Variável RESEND_API_KEY não definida}"
: "${GEMINI_API_KEY:?Variável GEMINI_API_KEY não definida}"
: "${NEON_DATABASE_URL:?Variável NEON_DATABASE_URL não definida}"
: "${JWT_SECRET:?Variável JWT_SECRET não definida}"

echo ""
echo "  ══════════════════════════════════════════════════════"
echo "   Super Escola — Actualização de Ambiente Hetzner"
echo "   Host: $HETZNER_HOST"
echo "  ══════════════════════════════════════════════════════"

# ── Reconstruir chave SSH com quebras de linha correctas ──────────────────────
# (O Replit guarda segredos multilinhas numa só linha — é necessário reformatar)
TMPKEY=$(mktemp /tmp/sshkey_XXXXXX)
chmod 600 "$TMPKEY"

KEY_BODY=$(echo "$HETZNER_SSH_KEY" \
  | sed 's/-----BEGIN OPENSSH PRIVATE KEY-----//' \
  | sed 's/-----END OPENSSH PRIVATE KEY-----//' \
  | tr -d ' \n\r\t')

{
  echo "-----BEGIN OPENSSH PRIVATE KEY-----"
  echo "$KEY_BODY" | fold -w 64
  echo "-----END OPENSSH PRIVATE KEY-----"
} > "$TMPKEY"

ok "Chave SSH reconstruída ($(wc -l < "$TMPKEY") linhas)"
trap 'rm -f "$TMPKEY"; info "Chave SSH temporária removida."' EXIT

SSH="ssh -i $TMPKEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes root@$HETZNER_HOST"

# ── Testar ligação ────────────────────────────────────────────────────────────
info "A testar ligação SSH a $HETZNER_HOST..."
if ! $SSH "echo ok" >/dev/null 2>&1; then
  err "Não foi possível ligar ao servidor. Verifique a chave SSH e o host."
fi
ok "Ligação SSH estabelecida."

# ── Função cirúrgica de actualização via Python3 ──────────────────────────────
# Usa Python3 no servidor para evitar problemas com caracteres especiais em sed
update_var() {
  local FILE="$1" KEY="$2" VAL="$3"
  $SSH bash -s -- "$FILE" "$KEY" "$VAL" <<'ENDSSH'
FILE="$1"; KEY="$2"; VAL="$3"
mkdir -p "$(dirname "$FILE")"
touch "$FILE"
python3 - "$KEY" "$VAL" "$FILE" <<'PYEOF'
import sys, re
key, val, path = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, 'r') as f:
    content = f.read()
pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.MULTILINE)
if pattern.search(content):
    new_content = pattern.sub(key + '=' + val, content)
    action = 'actualizado'
else:
    new_content = content.rstrip('\n') + ('\n' if content else '') + key + '=' + val + '\n'
    action = 'adicionado'
with open(path, 'w') as f:
    f.write(new_content)
print(action)
PYEOF
ENDSSH
}

# ── Variáveis a actualizar ────────────────────────────────────────────────────
declare -A VARS=(
  [RESEND_API_KEY]="$RESEND_API_KEY"
  [GEMINI_API_KEY]="$GEMINI_API_KEY"
  [NEON_DATABASE_URL]="$NEON_DATABASE_URL"
  [JWT_SECRET]="$JWT_SECRET"
  [EMAIL_FROM]="noreply@liceun303.live"
  [NODE_ENV]="production"
  [PORT]="5000"
  [SERVE_STATIC_WEB]="1"
  [PUPPETEER_SKIP_DOWNLOAD]="true"
  [PUPPETEER_EXECUTABLE_PATH]="/usr/bin/chromium-browser"
)

# ── Actualizar ambos os ficheiros .env ────────────────────────────────────────
for ENV_PATH in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  echo ""
  info "A actualizar $ENV_PATH ..."
  for KEY in "${!VARS[@]}"; do
    RESULT=$(update_var "$ENV_PATH" "$KEY" "${VARS[$KEY]}")
    ok "$KEY → $RESULT"
  done
done

# ── Verificar (apenas chaves, sem mostrar valores) ────────────────────────────
echo ""
info "Verificação (chaves presentes):"
for ENV_PATH in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  echo "  📄 $ENV_PATH:"
  $SSH "grep -E '^[A-Z_]+=' '$ENV_PATH' | cut -d= -f1 | sed 's/^/     ✓ /'"
done

# ── Recarregar PM2 sem downtime ───────────────────────────────────────────────
echo ""
info "A recarregar PM2 (sem downtime)..."
$SSH bash <<'ENDSSH'
if command -v pm2 >/dev/null 2>&1; then
  ONLINE=$(pm2 list 2>/dev/null | grep -c "online" || true)
  if [ "${ONLINE:-0}" -gt 0 ]; then
    pm2 reload all --update-env 2>&1 | grep -E "reload|restart|✓|✗|error" | head -5
    echo "✓ PM2 recarregado ($ONLINE processo(s) online)"
  else
    echo "⚠ Nenhum processo PM2 online"
  fi
else
  echo "⚠ PM2 não encontrado — reinicie o servidor manualmente"
fi
ENDSSH

echo ""
echo "  ══════════════════════════════════════════════════════"
ok "Concluído! .env actualizados em ambos os caminhos."
ok "Resend API  → emails OTP activos (liceun303.live)"
ok "Groq API    → Assistente IA activo"
ok "Neon DB     → Base de dados Neon ligada"
ok "JWT Secret  → Autenticação actualizada"
echo "  ══════════════════════════════════════════════════════"
echo ""
