#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola (SIGA) — Deploy Inteligente
#
#  Detecta automaticamente o que mudou comparando timestamps:
#    app/  vs dist/          → se app/ mais recente, reconstrói frontend
#    server/ vs server_dist/ → se server/ mais recente, reconstrói servidor
#
#  Uso:
#    bash scripts/deploy.sh            # detecta automaticamente
#    bash scripts/deploy.sh --force    # força build completo (frontend + servidor)
#    bash scripts/deploy.sh --dry-run  # mostra o que faria sem executar
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

FORCE=false
DRY_RUN=false
for arg in "$@"; do
  case $arg in
    --force)   FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║        Super Escola (SIGA) — Deploy Inteligente             ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Detectar alterações por timestamps ────────────────────────────────────────
step "Análise de alterações"

NEED_FRONTEND=false
NEED_SERVER=false

newest_mtime() {
  # Devolve o timestamp Unix mais recente dos ficheiros encontrados nas pastas
  local dirs=("$@")
  local max=0
  for dir in "${dirs[@]}"; do
    [ -d "$dir" ] || continue
    local t
    t=$(find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" -o -name "*.json" \) \
          -not -path "*/node_modules/*" \
          -exec stat -c '%Y' {} + 2>/dev/null \
        | sort -rn | head -1)
    [ -n "$t" ] && [ "$t" -gt "$max" ] && max=$t
  done
  echo "$max"
}

newest_file() {
  # Devolve o caminho do ficheiro mais recentemente modificado
  local dirs=("$@")
  for dir in "${dirs[@]}"; do
    [ -d "$dir" ] || continue
    find "$dir" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
          -not -path "*/node_modules/*" \
          -exec stat -c '%Y %n' {} + 2>/dev/null \
        | sort -rn | head -1 | awk '{print $2}'
  done | head -1
}

if [ "$FORCE" = true ]; then
  NEED_FRONTEND=true
  NEED_SERVER=true
  ok "Modo --force: a reconstruir tudo."
else

  # ── Verificar Frontend (app/ vs dist/) ──────────────────────────────────────
  APP_MTIME=$(newest_mtime app components hooks lib context 2>/dev/null || echo 0)
  DIST_MTIME=0
  if [ -f "dist/index.html" ]; then
    DIST_MTIME=$(stat -c %Y dist/index.html 2>/dev/null || echo 0)
  fi

  if [ "$APP_MTIME" -eq 0 ]; then
    warn "Pasta app/ vazia ou não encontrada — a ignorar frontend."
  elif [ "$DIST_MTIME" -eq 0 ]; then
    NEED_FRONTEND=true
    warn "dist/index.html não existe — frontend precisa de ser construído."
  elif [ "$APP_MTIME" -gt "$DIST_MTIME" ]; then
    NEED_FRONTEND=true
    NEWEST=$(newest_file app components hooks lib context 2>/dev/null || echo "")
    info "Frontend desactualizado — ficheiro mais recente: ${NEWEST:-app/}"
    FRONTEND_AGE=$(( (APP_MTIME - DIST_MTIME) / 60 ))
    info "app/ é mais recente que dist/ por ${FRONTEND_AGE} minuto(s)."
  else
    ok "Frontend actualizado — dist/ está mais recente que app/."
  fi

  # ── Verificar Servidor (server/ vs server_dist/) ─────────────────────────────
  SERVER_MTIME=$(newest_mtime server shared 2>/dev/null || echo 0)
  BUNDLE_MTIME=0
  if [ -f "server_dist/index.js" ]; then
    BUNDLE_MTIME=$(stat -c %Y server_dist/index.js 2>/dev/null || echo 0)
  fi

  if [ "$SERVER_MTIME" -eq 0 ]; then
    warn "Pasta server/ vazia ou não encontrada — a ignorar servidor."
  elif [ "$BUNDLE_MTIME" -eq 0 ]; then
    NEED_SERVER=true
    warn "server_dist/index.js não existe — servidor precisa de ser construído."
  elif [ "$SERVER_MTIME" -gt "$BUNDLE_MTIME" ]; then
    NEED_SERVER=true
    NEWEST_S=$(newest_file server shared 2>/dev/null || echo "")
    info "Servidor desactualizado — ficheiro mais recente: ${NEWEST_S:-server/}"
    SERVER_AGE=$(( (SERVER_MTIME - BUNDLE_MTIME) / 60 ))
    info "server/ é mais recente que server_dist/ por ${SERVER_AGE} minuto(s)."
  else
    ok "Servidor actualizado — server_dist/ está mais recente que server/."
  fi

  # Se nada mudou, fazer deploy mínimo (pode haver mudanças em .env, etc.)
  if [ "$NEED_FRONTEND" = false ] && [ "$NEED_SERVER" = false ]; then
    echo ""
    warn "Nenhuma alteração detectada nos ficheiros de código."
    info "A fazer deploy mínimo (só rsync + PM2 restart) — usa --force para reconstruir tudo."
  fi
fi

# ── Resumo do plano ────────────────────────────────────────────────────────────
echo ""
echo -e "   ${BOLD}Plano de deploy:${NC}"
if [ "$NEED_FRONTEND" = true ]; then
  echo -e "   ${GREEN}[✓]${NC} Build do frontend Expo Web → dist/               ~5-8 min"
else
  echo -e "   ${YELLOW}[–]${NC} Frontend sem alterações — a usar dist/ existente  0 min"
fi
if [ "$NEED_SERVER" = true ]; then
  echo -e "   ${GREEN}[✓]${NC} Build do servidor esbuild → server_dist/          ~5 seg"
else
  echo -e "   ${YELLOW}[–]${NC} Servidor sem alterações — a usar bundle existente  0 min"
fi
echo -e "   ${GREEN}[✓]${NC} rsync → Hetzner (178.104.228.85) + PM2 restart    ~1 min"

if [ "$DRY_RUN" = true ]; then
  echo ""
  warn "Modo --dry-run: nenhum deploy foi executado."
  if [ "$NEED_FRONTEND" = true ] && [ "$NEED_SERVER" = false ]; then
    echo -e "   Comando que seria executado: ${BOLD}bash scripts/build-deploy.sh${NC}"
  elif [ "$NEED_FRONTEND" = false ]; then
    echo -e "   Comando que seria executado: ${BOLD}bash scripts/build-deploy.sh --skip-build${NC}"
  else
    echo -e "   Comando que seria executado: ${BOLD}bash scripts/build-deploy.sh${NC}"
  fi
  echo ""
  exit 0
fi

echo ""
echo -e "   ${CYAN}A iniciar em 3 segundos... (Ctrl+C para cancelar)${NC}"
sleep 3

# ── Executar deploy com os flags correctos ────────────────────────────────────
if [ "$NEED_FRONTEND" = true ]; then
  bash scripts/build-deploy.sh
else
  bash scripts/build-deploy.sh --skip-build
fi

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo ""
  echo -e "   ${RED}✗ Deploy falhou (código $EXIT_CODE).${NC}"
  exit $EXIT_CODE
fi
