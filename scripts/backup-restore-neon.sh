#!/bin/bash
# =============================================================================
#  Super Escola / SIGA — Backup & Restore da Base de Dados Neon
# =============================================================================
#  USO:
#    Exportar (backup completo):
#      bash scripts/backup-restore-neon.sh export
#      bash scripts/backup-restore-neon.sh export backups/meu_backup.sql
#
#    Importar (restauro completo):
#      bash scripts/backup-restore-neon.sh import backups/meu_backup.sql
#
#    Listar backups disponíveis:
#      bash scripts/backup-restore-neon.sh list
#
#  VARIÁVEL OBRIGATÓRIA:
#    NEON_DATABASE_URL — connection string do Neon (definida nos Secrets do Replit)
#
#  REQUISITOS:
#    pg_dump e psql disponíveis no PATH (incluídos no ambiente Replit/Nix)
# =============================================================================

set -euo pipefail

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()    { echo -e "${GREEN}[✔]${NC} $*"; }
warn()   { echo -e "${YELLOW}[⚠]${NC} $*"; }
error()  { echo -e "${RED}[✘]${NC} $*" >&2; }
info()   { echo -e "${BLUE}[ℹ]${NC} $*"; }
header() { echo -e "\n${BOLD}${CYAN}$*${NC}\n"; }

# ── Verificações iniciais ────────────────────────────────────────────────────
check_deps() {
  for cmd in pg_dump psql node; do
    if ! command -v "$cmd" &>/dev/null; then
      error "Comando '$cmd' não encontrado. Instala o PostgreSQL client tools."
      exit 1
    fi
  done
}

check_env() {
  if [ -z "${NEON_DATABASE_URL:-}" ]; then
    # Tentar carregar do .env se existir
    if [ -f ".env" ]; then
      export $(grep -v '^#' .env | grep NEON_DATABASE_URL | xargs) 2>/dev/null || true
    fi
  fi

  if [ -z "${NEON_DATABASE_URL:-}" ]; then
    error "NEON_DATABASE_URL não está definida."
    echo ""
    echo "  Define nos Secrets do Replit ou exporta temporariamente:"
    echo "  export NEON_DATABASE_URL='postgresql://user:pass@host/db?sslmode=require'"
    exit 1
  fi
}

# ── Extrair componentes da URL ────────────────────────────────────────────────
parse_url() {
  DB_HOST=$(node -e "const u=new URL(process.env.NEON_DATABASE_URL);console.log(u.hostname)")
  DB_PORT=$(node -e "const u=new URL(process.env.NEON_DATABASE_URL);const p=u.port;console.log(p||'5432')")
  DB_USER=$(node -e "const u=new URL(process.env.NEON_DATABASE_URL);console.log(u.username)")
  DB_PASS=$(node -e "const u=new URL(process.env.NEON_DATABASE_URL);console.log(u.password)")
  DB_NAME=$(node -e "const u=new URL(process.env.NEON_DATABASE_URL);console.log(u.pathname.slice(1))")

  export PGPASSWORD="$DB_PASS"
  export PGHOST="$DB_HOST"
  export PGPORT="$DB_PORT"
  export PGUSER="$DB_USER"
  export PGDATABASE="$DB_NAME"
}

# ── Pasta de backups ─────────────────────────────────────────────────────────
BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"

# ── Estatísticas rápidas ──────────────────────────────────────────────────────
show_stats() {
  info "A consultar estatísticas da base de dados..."
  psql "sslmode=require" -t -c "
    SELECT
      'Utilizadores: ' || COUNT(*) FROM utilizadores
    UNION ALL SELECT 'Alunos: '      || COUNT(*) FROM alunos
    UNION ALL SELECT 'Professores: ' || COUNT(*) FROM professores
    UNION ALL SELECT 'Turmas: '      || COUNT(*) FROM turmas
    UNION ALL SELECT 'Pagamentos: '  || COUNT(*) FROM pagamentos
    UNION ALL SELECT 'Notas: '       || COUNT(*) FROM notas
  " 2>/dev/null | sed 's/^/ │  /' || warn "Não foi possível obter estatísticas."
}

# ══════════════════════════════════════════════════════════════════════════════
#  EXPORTAR (BACKUP)
# ══════════════════════════════════════════════════════════════════════════════
cmd_export() {
  local OUTPUT_FILE="${1:-}"

  if [ -z "$OUTPUT_FILE" ]; then
    local TIMESTAMP
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    OUTPUT_FILE="${BACKUP_DIR}/siga_backup_${TIMESTAMP}.sql"
  fi

  header "🗄️  SIGA — Exportar Base de Dados Neon"
  info "Host:     $DB_HOST"
  info "Base:     $DB_NAME"
  info "Destino:  $OUTPUT_FILE"
  echo ""

  show_stats
  echo ""

  log "A exportar base de dados completa..."

  PGSSLMODE=require pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-acl \
    --no-privileges \
    --verbose \
    --format=plain \
    --encoding=UTF8 \
    --file="$OUTPUT_FILE" \
    2>&1 | grep -v "^pg_dump: last built-in OID" | sed 's/^/  /'

  local DUMP_EXIT=${PIPESTATUS[0]}

  if [ $DUMP_EXIT -eq 0 ] && [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
    local SIZE
    SIZE=$(du -sh "$OUTPUT_FILE" | cut -f1)
    echo ""
    log "✅ Backup concluído com sucesso!"
    log "Ficheiro: ${BOLD}$OUTPUT_FILE${NC}"
    log "Tamanho:  $SIZE"
    echo ""
    info "Para restaurar este backup mais tarde:"
    echo "  bash scripts/backup-restore-neon.sh import $OUTPUT_FILE"
  else
    error "Falha na exportação. Verifica as credenciais e conectividade."
    exit 1
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  IMPORTAR (RESTAURO)
# ══════════════════════════════════════════════════════════════════════════════
cmd_import() {
  local INPUT_FILE="${1:-}"

  if [ -z "$INPUT_FILE" ]; then
    error "Especifica o ficheiro SQL a importar."
    echo "  Uso: bash scripts/backup-restore-neon.sh import backups/siga_backup_XXXX.sql"
    exit 1
  fi

  if [ ! -f "$INPUT_FILE" ]; then
    error "Ficheiro não encontrado: $INPUT_FILE"
    echo ""
    echo "  Backups disponíveis:"
    ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}' || echo "  (nenhum backup encontrado)"
    exit 1
  fi

  header "🔄  SIGA — Importar/Restaurar Base de Dados Neon"
  info "Host:     $DB_HOST"
  info "Base:     $DB_NAME"
  info "Ficheiro: $INPUT_FILE"
  local SIZE
  SIZE=$(du -sh "$INPUT_FILE" | cut -f1)
  info "Tamanho:  $SIZE"
  echo ""

  warn "ATENÇÃO: Esta operação VAI SOBRESCREVER dados existentes na base de dados!"
  warn "Certifica-te de que tens um backup recente antes de continuar."
  echo ""
  read -p "$(echo -e "${YELLOW}Confirmas o restauro? (escreve 'sim' para continuar):${NC} ")" CONFIRM

  if [ "$CONFIRM" != "sim" ]; then
    warn "Operação cancelada pelo utilizador."
    exit 0
  fi

  echo ""
  log "A importar base de dados..."

  # Usar psql para executar o ficheiro SQL
  PGSSLMODE=require psql \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --file="$INPUT_FILE" \
    --echo-errors \
    2>&1 | grep -E "^(ERROR|WARNING|NOTICE|psql:)" | head -50 | sed 's/^/  /'

  local EXIT_CODE=${PIPESTATUS[0]}

  echo ""
  if [ $EXIT_CODE -eq 0 ]; then
    log "✅ Importação concluída com sucesso!"
    echo ""
    info "Estado actual da base de dados:"
    show_stats
  else
    warn "Importação concluída com alguns avisos (código: $EXIT_CODE)."
    warn "Verifica os erros acima. Alguns podem ser normais (tabelas já existentes, etc.)"
    echo ""
    info "Estado actual da base de dados:"
    show_stats
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
#  LISTAR BACKUPS
# ══════════════════════════════════════════════════════════════════════════════
cmd_list() {
  header "📋  Backups disponíveis em ./${BACKUP_DIR}/"

  if [ -z "$(ls -A "$BACKUP_DIR"/*.sql 2>/dev/null)" ]; then
    warn "Nenhum backup encontrado em ./$BACKUP_DIR/"
    echo ""
    info "Cria um backup com:"
    echo "  bash scripts/backup-restore-neon.sh export"
  else
    echo -e "  ${BOLD}Ficheiro${NC}                                    ${BOLD}Tamanho${NC}   ${BOLD}Data${NC}"
    echo "  ─────────────────────────────────────────────────────────────────"
    ls -lh "$BACKUP_DIR"/*.sql 2>/dev/null | awk '{
      split($NF, a, "/");
      printf "  %-42s %6s   %s %s\n", a[length(a)], $5, $6" "$7, $8
    }'
  fi
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  AJUDA
# ══════════════════════════════════════════════════════════════════════════════
cmd_help() {
  echo ""
  echo -e "${BOLD}${CYAN}Super Escola / SIGA — Script de Backup & Restauro${NC}"
  echo ""
  echo -e "  ${BOLD}COMANDOS:${NC}"
  echo ""
  echo "  export [ficheiro.sql]    Exporta a BD completa para um ficheiro SQL"
  echo "                           (se não indicares ficheiro, gera um com data/hora)"
  echo ""
  echo "  import <ficheiro.sql>    Importa/restaura a BD a partir de um ficheiro SQL"
  echo "                           (pede confirmação antes de executar)"
  echo ""
  echo "  list                     Lista todos os backups disponíveis"
  echo ""
  echo -e "  ${BOLD}EXEMPLOS:${NC}"
  echo ""
  echo "  bash scripts/backup-restore-neon.sh export"
  echo "  bash scripts/backup-restore-neon.sh export backups/antes_da_migracao.sql"
  echo "  bash scripts/backup-restore-neon.sh import backups/siga_backup_20260618_120000.sql"
  echo "  bash scripts/backup-restore-neon.sh list"
  echo ""
  echo -e "  ${BOLD}VARIÁVEL NECESSÁRIA:${NC}"
  echo ""
  echo "  NEON_DATABASE_URL   Connection string do Neon PostgreSQL"
  echo "                      (já configurada nos Secrets do Replit)"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
#  PONTO DE ENTRADA
# ══════════════════════════════════════════════════════════════════════════════
check_deps
check_env
parse_url

COMMAND="${1:-help}"

case "$COMMAND" in
  export)  cmd_export  "${2:-}" ;;
  import)  cmd_import  "${2:-}" ;;
  list)    cmd_list ;;
  help|--help|-h)  cmd_help ;;
  *)
    error "Comando desconhecido: '$COMMAND'"
    cmd_help
    exit 1
    ;;
esac
