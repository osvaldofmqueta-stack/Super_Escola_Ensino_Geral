#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  Super Escola / SIGA — Diagnóstico Completo do Servidor
#
#  Uso:
#    bash /var/www/superescola/scripts/verificar-producao.sh
#
#  Verifica: PM2, Servidor HTTP, Base de dados, Email, IA,
#            SSL/HTTPS, Espaço em disco, Memória, Portos
# ═══════════════════════════════════════════════════════════════════

APP_DIR="/var/www/superescola"
ENV_FILE="$APP_DIR/.env"
PM2_APP="superescola"
PORT="${PORT:-5000}"
BASE_URL="http://localhost:${PORT}"
DOMAIN="${DOMAIN:-liceun303.live}"

# ── Cores ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

OK="${GREEN}✅ OK${NC}"
FAIL="${RED}❌ FALHOU${NC}"
WARN="${YELLOW}⚠️  AVISO${NC}"
INFO="${CYAN}ℹ️ ${NC}"

ERROS=0
AVISOS=0

report_ok()   { echo -e "  ${GREEN}✅${NC} $*"; }
report_fail() { echo -e "  ${RED}❌${NC} $*"; ((ERROS++)) || true; }
report_warn() { echo -e "  ${YELLOW}⚠️ ${NC} $*"; ((AVISOS++)) || true; }
report_info() { echo -e "  ${CYAN}ℹ️ ${NC} $*"; }

section() {
  echo ""
  echo -e "${BOLD}${BLUE}── $* ──────────────────────────────────────────${NC}"
}

# Carregar .env se existir
if [ -f "$ENV_FILE" ]; then
  set -o allexport
  # shellcheck disable=SC1090
  source <(grep -v '^#' "$ENV_FILE" | grep -v '^$')
  set +o allexport
fi

# ════════════════════════════════════════════════════════════════════
clear
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Super Escola / SIGA — Diagnóstico de Produção  ║${NC}"
echo -e "${BOLD}║   $(date '+%d/%m/%Y %H:%M:%S')                          ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${NC}"

# ── 1. Ficheiro .env ─────────────────────────────────────────────
section "Ficheiro .env"
if [ -f "$ENV_FILE" ]; then
  PERMS=$(stat -c "%a" "$ENV_FILE")
  report_ok ".env existe ($ENV_FILE)"
  if [ "$PERMS" = "600" ]; then
    report_ok "Permissões correctas: 600"
  else
    report_warn "Permissões: $PERMS (recomendado: 600) — corre: chmod 600 $ENV_FILE"
  fi
  LAST_MOD=$(stat -c "%y" "$ENV_FILE" | cut -d'.' -f1)
  report_info "Última modificação: $LAST_MOD"
else
  report_fail ".env não encontrado em $ENV_FILE"
fi

# ── 2. Variáveis de ambiente ──────────────────────────────────────
section "Variáveis de Ambiente"
check_var() {
  local name="$1" val="${!1:-}"
  if [ -n "$val" ]; then
    # Mascarar valor — mostrar apenas primeiros/últimos caracteres
    local masked="${val:0:6}...${val: -4}"
    report_ok "$name = $masked"
  else
    report_fail "$name — NÃO CONFIGURADA"
  fi
}
check_var "NEON_DATABASE_URL"
check_var "JWT_SECRET"
check_var "RESEND_API_KEY"
check_var "GEMINI_API_KEY"
[ -n "${EMAIL_FROM:-}" ]          && report_ok  "EMAIL_FROM = $EMAIL_FROM" \
                                  || report_warn "EMAIL_FROM não definida (default: onboarding@resend.dev)"
[ -n "${VAPID_PUBLIC_KEY:-}" ]    && report_ok  "VAPID_PUBLIC_KEY configurada" \
                                  || report_warn "VAPID_PUBLIC_KEY não configurada (push notifications desactivadas)"
[ "${NODE_ENV:-}" = "production" ] && report_ok  "NODE_ENV = production" \
                                  || report_warn "NODE_ENV = '${NODE_ENV:-não definido}' (esperado: production)"

# ── 3. PM2 ────────────────────────────────────────────────────────
section "PM2 — Gestor de Processos"
if command -v pm2 &>/dev/null; then
  report_ok "pm2 instalado: $(pm2 --version 2>/dev/null)"
  PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
    try {
      const list = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
      const app = list.find(p => p.name === '${PM2_APP}');
      if (!app) { console.log('not_found'); process.exit(); }
      console.log(app.pm2_env.status + '|' + app.pid + '|' + app.pm2_env.restart_time + '|' + Math.round((Date.now() - app.pm2_env.pm_uptime)/1000));
    } catch(e) { console.log('error'); }
  " 2>/dev/null || echo "error")

  if [[ "$PM2_STATUS" == *"|"* ]]; then
    IFS='|' read -r STATUS PID RESTARTS UPTIME <<< "$PM2_STATUS"
    if [ "$STATUS" = "online" ]; then
      report_ok "Processo '$PM2_APP': online (PID: $PID)"
      report_info "Uptime: ${UPTIME}s | Restarts: $RESTARTS"
      [ "$RESTARTS" -gt 10 ] && report_warn "Muitos restarts ($RESTARTS) — pode indicar crash em loop"
    else
      report_fail "Processo '$PM2_APP': $STATUS"
    fi
  elif [ "$PM2_STATUS" = "not_found" ]; then
    report_fail "Processo '$PM2_APP' não encontrado no PM2"
    report_info "Para iniciar: cd $APP_DIR && pm2 start ecosystem.config.cjs"
  else
    report_warn "Não foi possível ler estado PM2"
    pm2 status 2>/dev/null | grep -E "name|$PM2_APP" || true
  fi
else
  report_fail "pm2 não instalado — instala com: npm install -g pm2"
fi

# ── 4. Servidor HTTP ──────────────────────────────────────────────
section "Servidor HTTP (porta $PORT)"
HTTP_CONFIG=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/config" 2>/dev/null || echo "000")
if [ "$HTTP_CONFIG" = "200" ]; then
  report_ok "API /api/config responde (HTTP 200)"
  SCHOOL=$(curl -s --max-time 5 "$BASE_URL/api/config" 2>/dev/null | node -e "
    try { const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.nomeEscola||'?'); } catch(e){console.log('?');}
  " 2>/dev/null || echo "?")
  report_info "Escola configurada: $SCHOOL"
elif [ "$HTTP_CONFIG" = "401" ]; then
  report_ok "Servidor responde (HTTP 401 — normal para rota protegida)"
else
  report_fail "Servidor não responde em $BASE_URL (código: $HTTP_CONFIG)"
fi

HTTP_LOGIN=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL/api/anos-academicos" 2>/dev/null || echo "000")
[ "$HTTP_LOGIN" = "200" ] && report_ok "API /api/anos-academicos responde (HTTP 200)" \
                          || report_warn "API /api/anos-academicos: HTTP $HTTP_LOGIN"

# ── 5. Base de dados (Neon) ───────────────────────────────────────
section "Base de Dados — Neon PostgreSQL"
if [ -n "${NEON_DATABASE_URL:-}" ]; then
  if command -v psql &>/dev/null; then
    DB_TEST=$(PGPASSWORD="" psql "${NEON_DATABASE_URL}" -t -c "SELECT COUNT(*) FROM utilizadores;" 2>&1)
    if echo "$DB_TEST" | grep -qE "^[[:space:]]*[0-9]+"; then
      COUNT=$(echo "$DB_TEST" | tr -d ' ')
      report_ok "Ligação ao Neon bem-sucedida"
      report_info "Utilizadores na BD: $COUNT"
    else
      report_fail "Ligação ao Neon falhou: $(echo "$DB_TEST" | head -1)"
    fi
  else
    # Testar via API do servidor
    DB_VIA_API=$(curl -s --max-time 8 "$BASE_URL/api/config" 2>/dev/null)
    if echo "$DB_VIA_API" | grep -q '"id"'; then
      report_ok "BD acessível (verificado via API)"
    else
      report_warn "psql não disponível — não foi possível testar directamente"
    fi
  fi
else
  report_fail "NEON_DATABASE_URL não configurada"
fi

# ── 6. Email (Resend) ─────────────────────────────────────────────
section "Email — Resend"
if [ -n "${RESEND_API_KEY:-}" ]; then
  RESEND_TEST=$(curl -s --max-time 10 \
    -H "Authorization: Bearer ${RESEND_API_KEY}" \
    "https://api.resend.com/domains" 2>/dev/null)
  if echo "$RESEND_TEST" | grep -q '"data"'; then
    report_ok "API key Resend válida"
    DOMAINS=$(echo "$RESEND_TEST" | node -e "
      try {
        const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
        const verified = (d.data||[]).filter(x=>x.status==='verified').map(x=>x.name);
        const pending  = (d.data||[]).filter(x=>x.status!=='verified').map(x=>x.name);
        if(verified.length) console.log('VERIFIED:'+verified.join(','));
        if(pending.length)  console.log('PENDING:'+pending.join(','));
      } catch(e){ console.log('?'); }
    " 2>/dev/null || echo "?")
    if echo "$DOMAINS" | grep -q "VERIFIED:"; then
      VLIST=$(echo "$DOMAINS" | grep "VERIFIED:" | cut -d: -f2)
      report_ok "Domínios verificados: $VLIST"
    else
      report_warn "Nenhum domínio verificado no Resend"
      report_info "Emails vão sair de onboarding@resend.dev até verificares o domínio"
      report_info "Verifica em: https://resend.com/domains"
    fi
    if echo "$DOMAINS" | grep -q "PENDING:"; then
      PLIST=$(echo "$DOMAINS" | grep "PENDING:" | cut -d: -f2)
      report_warn "Domínios pendentes de verificação: $PLIST"
    fi
  elif echo "$RESEND_TEST" | grep -q '"statusCode":401'; then
    report_fail "API key Resend inválida ou expirada"
  else
    report_warn "Não foi possível verificar Resend (sem acesso externo?)"
  fi
else
  report_fail "RESEND_API_KEY não configurada — emails OTP não serão enviados"
fi

# ── 7. IA (Google Gemini) ─────────────────────────────────────────
section "Inteligência Artificial — Google Gemini"
if [ -n "${GEMINI_API_KEY:-}" ]; then
  GEMINI_TEST=$(curl -s --max-time 10 \
    "https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}" 2>/dev/null)
  if echo "$GEMINI_TEST" | grep -q '"models"'; then
    report_ok "API key Gemini válida"
    report_info "Modelo activo: gemini-2.0-flash"
  elif echo "$GEMINI_TEST" | grep -q '400\|401\|403\|API_KEY_INVALID'; then
    report_fail "API key Gemini inválida"
  else
    report_warn "Não foi possível verificar Gemini"
  fi
else
  report_warn "GEMINI_API_KEY não configurada (IA desactivada)"
fi

# ── 8. SSL / HTTPS ────────────────────────────────────────────────
section "SSL / HTTPS — $DOMAIN"
if command -v curl &>/dev/null; then
  SSL_TEST=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "https://$DOMAIN/api/config" 2>/dev/null || echo "000")
  if [ "$SSL_TEST" = "200" ] || [ "$SSL_TEST" = "401" ]; then
    report_ok "HTTPS activo em $DOMAIN (HTTP $SSL_TEST)"
    # Verificar expiração do certificado
    CERT_EXPIRY=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
      | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$CERT_EXPIRY" ]; then
      EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
      NOW_EPOCH=$(date +%s)
      DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
      if [ "$DAYS_LEFT" -gt 30 ]; then
        report_ok "Certificado SSL válido por mais $DAYS_LEFT dias"
      elif [ "$DAYS_LEFT" -gt 7 ]; then
        report_warn "Certificado SSL expira em $DAYS_LEFT dias — renova em breve"
      else
        report_fail "Certificado SSL expira em $DAYS_LEFT dias — URGENTE renovar"
      fi
    fi
  elif [ "$SSL_TEST" = "000" ]; then
    report_warn "HTTPS não acessível de dentro do servidor (normal se nginx faz proxy)"
  else
    report_fail "HTTPS retornou HTTP $SSL_TEST"
  fi
fi

# ── 9. Recursos do sistema ────────────────────────────────────────
section "Recursos do Sistema"
# Disco
DISK=$(df -h "$APP_DIR" 2>/dev/null | tail -1)
DISK_USE=$(echo "$DISK" | awk '{print $5}' | tr -d '%')
DISK_FREE=$(echo "$DISK" | awk '{print $4}')
if [ -n "$DISK_USE" ]; then
  if [ "$DISK_USE" -lt 80 ]; then
    report_ok "Disco: ${DISK_USE}% usado, ${DISK_FREE} livre"
  elif [ "$DISK_USE" -lt 90 ]; then
    report_warn "Disco: ${DISK_USE}% usado — começa a ficar cheio"
  else
    report_fail "Disco: ${DISK_USE}% usado — CRÍTICO, limpa espaço"
  fi
fi

# Memória
MEM=$(free -m 2>/dev/null | grep Mem)
MEM_TOTAL=$(echo "$MEM" | awk '{print $2}')
MEM_USED=$(echo "$MEM" | awk '{print $3}')
if [ -n "$MEM_TOTAL" ] && [ "$MEM_TOTAL" -gt 0 ]; then
  MEM_PCT=$(( MEM_USED * 100 / MEM_TOTAL ))
  MEM_FREE=$(( MEM_TOTAL - MEM_USED ))
  if [ "$MEM_PCT" -lt 80 ]; then
    report_ok "Memória: ${MEM_PCT}% usada (${MEM_FREE}MB livre)"
  elif [ "$MEM_PCT" -lt 92 ]; then
    report_warn "Memória: ${MEM_PCT}% usada — considera aumentar RAM"
  else
    report_fail "Memória: ${MEM_PCT}% usada — risco de OOM"
  fi
fi

# Node.js
NODE_VER=$(node --version 2>/dev/null || echo "não encontrado")
report_info "Node.js: $NODE_VER"

# ── 10. Backups .env ──────────────────────────────────────────────
section "Backups do .env"
BACKUP_COUNT=$(ls "$APP_DIR"/.env.bak.* 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt 0 ]; then
  report_ok "$BACKUP_COUNT backup(s) disponível(eis)"
  LAST_BK=$(ls -t "$APP_DIR"/.env.bak.* 2>/dev/null | head -1)
  report_info "Mais recente: $(basename "$LAST_BK")"
  # Manter apenas os 5 mais recentes
  if [ "$BACKUP_COUNT" -gt 5 ]; then
    ls -t "$APP_DIR"/.env.bak.* 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null
    report_info "Backups antigos removidos (mantidos os 5 mais recentes)"
  fi
else
  report_warn "Nenhum backup do .env encontrado"
fi

# ── Resumo Final ──────────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}   RESUMO DO DIAGNÓSTICO${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if [ "$ERROS" -eq 0 ] && [ "$AVISOS" -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}🎉 Tudo operacional — nenhum problema detectado!${NC}"
elif [ "$ERROS" -eq 0 ]; then
  echo -e "  ${YELLOW}${BOLD}⚠️  $AVISOS aviso(s) — servidor operacional${NC}"
else
  echo -e "  ${RED}${BOLD}❌ $ERROS erro(s) crítico(s) e $AVISOS aviso(s)${NC}"
fi

echo ""
echo -e "  ${CYAN}Comandos úteis:${NC}"
echo -e "  pm2 logs $PM2_APP --lines 50     # ver logs recentes"
echo -e "  pm2 status                        # estado dos processos"
echo -e "  pm2 monit                         # monitor em tempo real"
echo ""
echo -e "  Para reconfigurar:  bash $APP_DIR/scripts/gerar-env-producao.sh"
echo ""
