#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Super Escola / SIGA — Gerador de .env para servidor de produção
#
#  Uso:
#    export NEON_DATABASE_URL="postgresql://..."
#    export JWT_SECRET="..."
#    export RESEND_API_KEY="re_..."
#    export GEMINI_API_KEY="AIza..."
#    bash /var/www/superescola/scripts/gerar-env-producao.sh
#
#  Garantias:
#    • Faz backup automático do .env anterior
#    • Usa "pm2 reload" (zero downtime — sem queda de serviço)
#    • Rollback automático se o servidor não arrancar
#    • Verifica se o servidor responde antes de confirmar
# ═══════════════════════════════════════════════════════════════════

DEST="/var/www/superescola/.env"
APP_DIR="/var/www/superescola"
BACKUP="/var/www/superescola/.env.bak.$(date +%Y%m%d_%H%M%S)"
PM2_APP="superescola"
PORT="${PORT:-5000}"
HEALTH_URL="http://localhost:${PORT}/api/config"
MAX_WAIT=30   # segundos a aguardar o servidor arrancar

# ── Cores para output ─────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'; BOLD='\033[1m'

log_ok()   { echo -e "${GREEN}✅ $*${NC}"; }
log_warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
log_err()  { echo -e "${RED}❌ $*${NC}"; }
log_info() { echo -e "${BLUE}ℹ️  $*${NC}"; }

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   Super Escola — Configuração de Produção${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Verificar variáveis obrigatórias ───────────────────────────
log_info "A verificar variáveis obrigatórias..."
REQUIRED=(NEON_DATABASE_URL JWT_SECRET RESEND_API_KEY GEMINI_API_KEY)
MISSING=()
for v in "${REQUIRED[@]}"; do
  if [ -z "${!v:-}" ]; then
    MISSING+=("$v")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  log_err "Variáveis em falta: ${MISSING[*]}"
  echo ""
  echo "  Define-as antes de correr este script:"
  for v in "${MISSING[@]}"; do
    echo "  export $v=SEU_VALOR"
  done
  echo ""
  exit 1
fi
log_ok "Todas as variáveis obrigatórias estão presentes."

# ── 2. Verificar ligação à base de dados Neon ─────────────────────
log_info "A verificar ligação ao Neon..."
if command -v psql &>/dev/null; then
  if PGPASSWORD="" psql "${NEON_DATABASE_URL}" -c "SELECT 1" &>/dev/null 2>&1; then
    log_ok "Base de dados Neon acessível."
  else
    log_warn "Não foi possível verificar a ligação ao Neon (pode ser normal se psql não tiver SSL)."
    log_warn "O script vai continuar — verifica os logs após o reload."
  fi
else
  log_warn "psql não encontrado — a saltar verificação de BD."
fi

# ── 3. Backup do .env actual ──────────────────────────────────────
if [ -f "$DEST" ]; then
  cp "$DEST" "$BACKUP"
  log_ok "Backup guardado: $BACKUP"
else
  log_warn "Nenhum .env anterior encontrado. A criar do zero."
fi

# ── 4. Gerar o novo .env ──────────────────────────────────────────
log_info "A gerar novo .env..."

cat > "$DEST" <<ENV
# ═══════════════════════════════════════════════════════════
#  Super Escola / SIGA — Configuração de Produção
#  Gerado em: $(date '+%d/%m/%Y %H:%M:%S')
#  NÃO EDITAR MANUALMENTE — usar gerar-env-producao.sh
# ═══════════════════════════════════════════════════════════

# ── Servidor ──────────────────────────────────────────────
PORT=5000
NODE_ENV=production
SERVE_STATIC_WEB=1

# ── Base de dados (Neon) ───────────────────────────────────
DATABASE_URL=${NEON_DATABASE_URL}
NEON_DATABASE_URL=${NEON_DATABASE_URL}

# ── Autenticação JWT ───────────────────────────────────────
JWT_SECRET=${JWT_SECRET}

# ── Email (Resend) ─────────────────────────────────────────
RESEND_API_KEY=${RESEND_API_KEY}
EMAIL_FROM=${EMAIL_FROM:-noreply@liceun303.live}

# ── Inteligência Artificial ────────────────────────────────
GEMINI_API_KEY=${GEMINI_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY:-}

# ── Puppeteer / PDF ────────────────────────────────────────
PUPPETEER_SKIP_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium-browser}

# ── Push Notifications (VAPID) ────────────────────────────
VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY:-}
VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY:-}
VAPID_SUBJECT=${VAPID_SUBJECT:-mailto:admin@liceun303.live}

# ── SMS / Africa's Talking (opcional) ─────────────────────
AFRICASTALKING_USERNAME=${AFRICASTALKING_USERNAME:-sandbox}
AFRICASTALKING_API_KEY=${AFRICASTALKING_API_KEY:-}

# ── WhatsApp (opcional) ────────────────────────────────────
WHATSAPP_NOTIFY_NUMBER=${WHATSAPP_NOTIFY_NUMBER:-}
ENV

chmod 600 "$DEST"
log_ok ".env gerado com permissões 600 (apenas root)."

# ── 5. Reload zero-downtime com PM2 ───────────────────────────────
log_info "A fazer reload do servidor (sem queda de serviço)..."
echo ""

# Verificar se o processo PM2 existe
if pm2 describe "$PM2_APP" &>/dev/null 2>&1; then
  # Reload zero-downtime (mantém conexões activas durante o reload)
  if pm2 reload "$PM2_APP" --update-env 2>&1; then
    log_ok "PM2 reload iniciado."
  else
    log_warn "pm2 reload falhou — a tentar pm2 restart..."
    pm2 restart "$PM2_APP" --update-env 2>&1 || true
  fi
else
  log_warn "Processo '$PM2_APP' não encontrado no PM2. A iniciar do zero..."
  cd "$APP_DIR" && pm2 start ecosystem.config.cjs 2>&1 || {
    log_err "Falha ao iniciar o servidor. Verifica o ecosystem.config.cjs."
    exit 1
  }
fi

# ── 6. Aguardar arranque e verificar saúde ────────────────────────
echo ""
log_info "A aguardar que o servidor responda (máx. ${MAX_WAIT}s)..."
SUCCESS=false
for i in $(seq 1 $MAX_WAIT); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
    SUCCESS=true
    log_ok "Servidor a responder (HTTP $HTTP_CODE) após ${i}s."
    break
  fi
  printf "."
  sleep 1
done
echo ""

# ── 7. Rollback automático se falhou ─────────────────────────────
if [ "$SUCCESS" = false ]; then
  log_err "Servidor não respondeu em ${MAX_WAIT}s!"
  if [ -f "$BACKUP" ]; then
    log_warn "A restaurar backup: $BACKUP"
    cp "$BACKUP" "$DEST"
    pm2 reload "$PM2_APP" --update-env 2>/dev/null || pm2 restart "$PM2_APP" --update-env 2>/dev/null || true
    echo ""
    log_warn "Rollback efectuado. Verifica o erro com: pm2 logs $PM2_APP"
  else
    log_err "Sem backup para restaurar. Verifica manualmente: pm2 logs $PM2_APP"
  fi
  exit 1
fi

# ── 8. Guardar estado PM2 para auto-start ─────────────────────────
pm2 save --force &>/dev/null && log_ok "Estado PM2 guardado (auto-start preservado)."

# ── 9. Resumo final ───────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   ✅ SERVIDOR ACTUALIZADO COM SUCESSO${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Base de dados:${NC} Neon PostgreSQL"
echo -e "  ${BLUE}Email OTP:${NC}     Resend (${EMAIL_FROM:-noreply@liceun303.live})"
echo -e "  ${BLUE}IA (Groq):${NC}     Configurado"
echo -e "  ${BLUE}Backup .env:${NC}   $BACKUP"
echo ""
echo -e "  ${YELLOW}Comandos úteis:${NC}"
echo -e "  pm2 logs $PM2_APP --lines 50"
echo -e "  pm2 status"
echo ""
