#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola (SIGA) — Correcção do .env de Produção
#  Ficheiro: scripts/fix-prod-env.sh
#
#  O que faz:
#    1. Faz backup do .env actual
#    2. Corrige NEON_DATABASE_URL (remove -pooler e channel_binding=require)
#    3. Adiciona/actualiza RESEND_API_KEY e EMAIL_FROM
#    4. Faz reload do PM2 sem downtime (zero-downtime)
#    5. Verifica que o servidor ficou online
#
#  Uso:
#    bash scripts/fix-prod-env.sh
#
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────
ENV_FILE="/opt/superescola/.env"
BACKUP_DIR="/opt/superescola/env-backups"
APP_NAME="superescola"
LOG_LINES=20

# ── Cores para output legível ─────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✅ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $*${NC}"; }
err()  { echo -e "${RED}❌ $*${NC}"; exit 1; }
info() { echo -e "${BLUE}ℹ️  $*${NC}"; }
hdr()  { echo -e "\n${BOLD}── $* ──────────────────────────────────────${NC}"; }

# ══════════════════════════════════════════════════════════════════════════════
hdr "SUPER ESCOLA — Correcção do Ambiente de Produção"
echo -e "  Ficheiro alvo : ${BOLD}${ENV_FILE}${NC}"
echo -e "  App PM2       : ${BOLD}${APP_NAME}${NC}"
echo ""

# ── Verificações iniciais ─────────────────────────────────────────────────────
hdr "1. Verificações Iniciais"

[ -f "$ENV_FILE" ] || err "Ficheiro ${ENV_FILE} não encontrado. Verifique o caminho."
ok "Ficheiro .env encontrado"

command -v pm2 &>/dev/null || err "PM2 não encontrado. Instale com: npm i -g pm2"
ok "PM2 disponível"

# Verificar que a app existe no PM2
if ! pm2 show "$APP_NAME" &>/dev/null; then
  err "App '${APP_NAME}' não encontrada no PM2. Use: pm2 list"
fi
ok "App '${APP_NAME}' encontrada no PM2"

# ── Backup ────────────────────────────────────────────────────────────────────
hdr "2. Backup do .env Actual"

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="${BACKUP_DIR}/.env.backup.$(date +%Y%m%d_%H%M%S)"
cp "$ENV_FILE" "$BACKUP_FILE"
ok "Backup guardado em: ${BACKUP_FILE}"

# ── Função para definir/actualizar uma variável no .env ──────────────────────
# Uso: set_env_var KEY "VALUE"
set_env_var() {
  local key="$1"
  local value="$2"
  local file="$ENV_FILE"

  if grep -q "^${key}=" "$file"; then
    # Substituir linha existente (suporta valores com / e & e ?)
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    ok "Actualizado: ${key}"
  else
    # Adicionar nova linha
    echo "${key}=${value}" >> "$file"
    ok "Adicionado: ${key}"
  fi
}

# ── Corrigir NEON_DATABASE_URL ────────────────────────────────────────────────
hdr "3. Correcção do NEON_DATABASE_URL"

# Ler URL actual
CURRENT_NEON_URL=$(grep "^NEON_DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)

if [ -z "$CURRENT_NEON_URL" ]; then
  err "NEON_DATABASE_URL não encontrado no ${ENV_FILE}"
fi

info "URL actual: ${CURRENT_NEON_URL:0:80}..."

# Remover -pooler do hostname
FIXED_NEON_URL=$(echo "$CURRENT_NEON_URL" | sed 's/-pooler\(\.[^\/]*\)/\1/g')

# Remover &channel_binding=require e ?channel_binding=require
FIXED_NEON_URL=$(echo "$FIXED_NEON_URL" | sed 's/[&?]channel_binding=require//g')

# Remover &uselibpqcompat=true se existir
FIXED_NEON_URL=$(echo "$FIXED_NEON_URL" | sed 's/[&?]uselibpqcompat=true//g')

# Limpar & ou ? a mais no fim
FIXED_NEON_URL=$(echo "$FIXED_NEON_URL" | sed 's/[&?]$//')

info "URL corrigido: ${FIXED_NEON_URL:0:80}..."

if [ "$CURRENT_NEON_URL" = "$FIXED_NEON_URL" ]; then
  warn "NEON_DATABASE_URL já estava correcto (sem pooler). Sem alterações."
else
  set_env_var "NEON_DATABASE_URL" "$FIXED_NEON_URL"
  ok "NEON_DATABASE_URL corrigido (removido -pooler e channel_binding)"
fi

# ── Também corrigir DATABASE_URL se for pooler ────────────────────────────────
if grep -q "^DATABASE_URL=" "$ENV_FILE"; then
  CURRENT_DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d'=' -f2-)
  if echo "$CURRENT_DB_URL" | grep -q "\-pooler"; then
    FIXED_DB_URL=$(echo "$CURRENT_DB_URL" | sed 's/-pooler\(\.[^\/]*\)/\1/g' | sed 's/[&?]channel_binding=require//g' | sed 's/[&?]uselibpqcompat=true//g' | sed 's/[&?]$//')
    set_env_var "DATABASE_URL" "$FIXED_DB_URL"
    ok "DATABASE_URL também corrigido (removido -pooler)"
  else
    info "DATABASE_URL já não tem -pooler. Sem alterações."
  fi
fi

# ── Configurar Email (Resend) ──────────────────────────────────────────────────
hdr "4. Configuração do Email (Resend)"

set_env_var "RESEND_API_KEY" "re_dAtqQ396_2j4rKoBjQKefs2gozTqDsYTx"
set_env_var "EMAIL_FROM" "noreply@liceun303.live"

# ── Mostrar .env final (sem passwords) ───────────────────────────────────────
hdr "5. Resumo do .env (valores sensíveis mascarados)"

while IFS= read -r line; do
  if [[ "$line" =~ ^(NEON_DATABASE_URL|DATABASE_URL|JWT_SECRET|RESEND_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY)= ]]; then
    key=$(echo "$line" | cut -d'=' -f1)
    val=$(echo "$line" | cut -d'=' -f2-)
    # Mostrar apenas primeiros 30 chars
    echo "  ${key}=${val:0:30}..."
  elif [[ "$line" =~ ^[A-Z] ]]; then
    echo "  $line"
  fi
done < "$ENV_FILE"

# ── Reload PM2 (zero-downtime) ────────────────────────────────────────────────
hdr "6. Reload do PM2 (zero-downtime)"

info "A fazer reload da app '${APP_NAME}' com novas variáveis..."

# Usar reload em vez de restart para zero-downtime
if pm2 reload "$APP_NAME" --update-env 2>&1; then
  ok "PM2 reload iniciado com sucesso"
else
  warn "reload falhou — a tentar restart..."
  pm2 restart "$APP_NAME" --update-env
  ok "PM2 restart concluído"
fi

# ── Aguardar estabilização ────────────────────────────────────────────────────
hdr "7. Verificação de Saúde"

info "A aguardar 8 segundos para o servidor estabilizar..."
sleep 8

# Verificar status
STATUS=$(pm2 show "$APP_NAME" 2>/dev/null | grep -E "status\s*│" | awk '{print $3}' | tr -d ' ')

if [ "$STATUS" = "online" ]; then
  ok "App está ONLINE ✓"
else
  warn "Status actual: '${STATUS}'"
  info "A verificar logs de erro..."
fi

# ── Logs finais ───────────────────────────────────────────────────────────────
echo ""
info "Últimos ${LOG_LINES} logs da aplicação:"
echo "────────────────────────────────────────────────────────"
pm2 logs "$APP_NAME" --lines "$LOG_LINES" --nostream 2>/dev/null || true
echo "────────────────────────────────────────────────────────"

# ── Resumo final ──────────────────────────────────────────────────────────────
hdr "Concluído"
echo ""
echo -e "  ${GREEN}${BOLD}NEON_DATABASE_URL${NC}  → URL directo (sem -pooler)"
echo -e "  ${GREEN}${BOLD}RESEND_API_KEY${NC}     → Configurado"
echo -e "  ${GREEN}${BOLD}EMAIL_FROM${NC}         → noreply@liceun303.live"
echo ""
echo -e "  ${BOLD}Backup guardado em:${NC} ${BACKUP_FILE}"
echo ""
echo -e "  ${BLUE}Para ver os logs em tempo real:${NC}"
echo -e "  pm2 logs ${APP_NAME} --lines 50"
echo ""
