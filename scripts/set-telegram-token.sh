#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Adicionar/Actualizar TELEGRAM_BOT_TOKEN no servidor Hetzner
#  Actualiza /opt/superescola/.env e /var/www/superescola/.env
#  sem interromper o servidor de produção (PM2 reload --update-env).
#
#  Uso: bash scripts/set-telegram-token.sh
#
#  Requer os seguintes segredos Replit:
#    HETZNER_SSH_KEY    — chave privada SSH
#    HETZNER_HOST       — IP/hostname do servidor
#    TELEGRAM_BOT_TOKEN — token HTTP API do Telegram Bot
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "   ${RED}✗${NC} $1"; exit 1; }

# ── Verificar variáveis obrigatórias ──────────────────────────────────────────
: "${HETZNER_SSH_KEY:?Variável HETZNER_SSH_KEY não definida}"
: "${HETZNER_HOST:?Variável HETZNER_HOST não definida}"
: "${TELEGRAM_BOT_TOKEN:?Variável TELEGRAM_BOT_TOKEN não definida}"

echo ""
echo "  ══════════════════════════════════════════════════════"
echo "   Super Escola — Configurar TELEGRAM_BOT_TOKEN"
echo "   Host: $HETZNER_HOST"
echo "  ══════════════════════════════════════════════════════"

# ── Reconstruir chave SSH com quebras de linha correctas ──────────────────────
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

ok "Chave SSH reconstruída"
trap 'rm -f "$TMPKEY"; info "Chave SSH temporária removida."' EXIT

SSH="ssh -i $TMPKEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes root@$HETZNER_HOST"

# ── Testar ligação ────────────────────────────────────────────────────────────
info "A testar ligação SSH a $HETZNER_HOST ..."
if ! $SSH "echo ok" >/dev/null 2>&1; then
  err "Não foi possível ligar ao servidor. Verifique a chave SSH e o host."
fi
ok "Ligação SSH estabelecida."

# ── Função cirúrgica: actualiza ou adiciona KEY=VAL no ficheiro ───────────────
# Usa Python3 no servidor para evitar problemas com caracteres especiais
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

# ── Actualizar ambos os ficheiros .env ────────────────────────────────────────
TOKEN="$TELEGRAM_BOT_TOKEN"

for ENV_PATH in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  echo ""
  info "A actualizar $ENV_PATH ..."

  if $SSH "[ -f '$ENV_PATH' ]" 2>/dev/null; then
    RESULT=$(update_var "$ENV_PATH" "TELEGRAM_BOT_TOKEN" "$TOKEN")
    ok "TELEGRAM_BOT_TOKEN → $RESULT em $ENV_PATH"
  else
    warn "Ficheiro $ENV_PATH não encontrado — a criar..."
    RESULT=$(update_var "$ENV_PATH" "TELEGRAM_BOT_TOKEN" "$TOKEN")
    ok "TELEGRAM_BOT_TOKEN → $RESULT (ficheiro criado)"
  fi
done

# ── Verificar (sem mostrar o token completo) ──────────────────────────────────
echo ""
info "Verificação (token mascarado):"
for ENV_PATH in "/opt/superescola/.env" "/var/www/superescola/.env"; do
  if $SSH "[ -f '$ENV_PATH' ]" 2>/dev/null; then
    TOKEN_LINE=$($SSH "grep '^TELEGRAM_BOT_TOKEN=' '$ENV_PATH' 2>/dev/null || echo 'NÃO ENCONTRADO'")
    MASKED=$(echo "$TOKEN_LINE" | sed 's/\(.\{20\}\).*/\1.../')
    echo "    📄 $ENV_PATH → $MASKED"
  fi
done

# ── Reload PM2 sem downtime ───────────────────────────────────────────────────
echo ""
info "A recarregar PM2 com novas variáveis (sem downtime) ..."
$SSH bash <<'ENDSSH'
set -e
if ! command -v pm2 >/dev/null 2>&1; then
  echo "⚠ PM2 não encontrado no PATH — a tentar com: /usr/local/bin/pm2"
  PM2_BIN="/usr/local/bin/pm2"
else
  PM2_BIN="pm2"
fi

ONLINE=$($PM2_BIN list 2>/dev/null | grep -c "online" || true)

if [ "${ONLINE:-0}" -gt 0 ]; then
  # reload faz graceful restart de cada instância uma a uma — zero downtime
  $PM2_BIN reload all --update-env 2>&1 | grep -E "reload|restart|online|✓|✗|error|App" | head -8 || true
  echo "✓ PM2 recarregado — $ONLINE processo(s) online mantidos"
else
  warn_msg="⚠ Nenhum processo PM2 online — verifique com: pm2 list"
  echo "$warn_msg"
fi
ENDSSH

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo "  ══════════════════════════════════════════════════════"
ok "TELEGRAM_BOT_TOKEN configurado em /opt/superescola/.env"
ok "TELEGRAM_BOT_TOKEN configurado em /var/www/superescola/.env"
ok "PM2 recarregado — servidor de produção manteve-se online"
echo ""
echo -e "   ${CYAN}O OTP por Telegram deverá estar activo de imediato.${NC}"
echo "  ══════════════════════════════════════════════════════"
echo ""
