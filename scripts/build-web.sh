#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Super Escola — Build seguro do frontend Web
#
#  Protege o dist/ existente: faz backup antes de construir e restaura
#  automaticamente se o build falhar ou for interrompido.
#
#  Uso:
#    bash scripts/build-web.sh          # build normal
#    bash scripts/build-web.sh --push   # build + commit + push para GitHub
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DIST_DIR="$(pwd)/dist"
BACKUP_DIR="$(pwd)/.dist-backup"
PUSH_AFTER=false

for arg in "$@"; do
  case "$arg" in
    --push) PUSH_AFTER=true ;;
  esac
done

# ── Cores ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; }

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     Super Escola — Build seguro do Frontend Web     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Função de restauro em caso de falha ──────────────────────────────────────
restore_backup() {
  echo ""
  warn "Build interrompido ou falhado — a restaurar versão anterior..."
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$DIST_DIR"
    mv "$BACKUP_DIR" "$DIST_DIR"
    ok "dist/ restaurado com sucesso — app continua a funcionar."
  else
    fail "Sem backup disponível para restaurar."
  fi
  echo ""
  exit 1
}

trap restore_backup ERR INT TERM

# ── 1. Verificar se há dist/ existente ───────────────────────────────────────
if [ -f "$DIST_DIR/index.html" ]; then
  info "A fazer backup do dist/ actual..."
  rm -rf "$BACKUP_DIR"
  cp -r "$DIST_DIR" "$BACKUP_DIR"
  ok "Backup guardado em .dist-backup/"
else
  warn "Sem dist/ anterior — a construir do zero."
fi

# ── 2. Build do Expo Web ──────────────────────────────────────────────────────
echo ""
info "A aplicar patches pré-build..."
bash "$(dirname "$0")/pre-build-patches.sh"

info "A construir frontend Expo Web (pode demorar 3-5 minutos)..."
echo ""

PUPPETEER_SKIP_DOWNLOAD=true \
PUPPETEER_EXECUTABLE_PATH="$(which chromium 2>/dev/null || echo '')" \
EXPO_PUBLIC_API_URL="" \
  npx expo export -p web

echo ""
ok "Bundle Expo criado com sucesso!"

# ── 3. Copiar fontes Inter (necessário após cada build) ──────────────────────
echo ""
info "A copiar fontes Inter para dist/fonts/..."
mkdir -p dist/fonts
find node_modules/@expo-google-fonts/inter -name "Inter_*.ttf" -exec cp {} dist/fonts/ \;
FONT_COUNT=$(ls dist/fonts/ | wc -l)
ok "Fontes copiadas: ${FONT_COUNT} ficheiros"

# ── 4. Limpar backup (build correu bem) ──────────────────────────────────────
if [ -d "$BACKUP_DIR" ]; then
  rm -rf "$BACKUP_DIR"
  ok "Backup temporário removido."
fi

# ── 4. Push opcional ─────────────────────────────────────────────────────────
if [ "$PUSH_AFTER" = true ]; then
  echo ""
  info "A fazer commit e push do novo dist/..."
  git add dist/
  git commit -m "build: frontend web actualizado — $(date '+%d/%m/%Y %H:%M')"

  TOKEN="${GITHUB_PAT:-${GITHUB_PERSONAL_ACCESS_TOKEN:-}}"
  REMOTE=$(git remote get-url origin 2>/dev/null || echo "origin")
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

  if [ -n "$TOKEN" ] && echo "$REMOTE" | grep -q "github.com"; then
    REPO=$(echo "$REMOTE" | sed 's|https://[^@]*@||' | sed 's|https://||')
    REPO_URL="https://osvaldofmqueta-stack:${TOKEN}@${REPO}"
    git push "$REPO_URL" "HEAD:$BRANCH"
  else
    git push origin "$BRANCH"
  fi
  ok "Push concluído!"
fi

# Desactivar trap (correu tudo bem)
trap - ERR INT TERM

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ Frontend actualizado e protegido com sucesso!   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
