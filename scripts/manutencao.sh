#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
#  manutencao.sh — Activar / desactivar modo de manutenção SIGA
#
#  O estado é guardado SIMULTANEAMENTE:
#    • Ficheiro .maintenance  (servidor de desenvolvimento / Replit)
#    • Base de dados Neon     (servidor de produção)
#
#  Uso:
#    bash scripts/manutencao.sh on  "Mensagem de manutenção"
#    bash scripts/manutencao.sh off
#    bash scripts/manutencao.sh status
# ──────────────────────────────────────────────────────────────

ACTION="$1"
MESSAGE="${2:-Manutenção em curso. O sistema voltará em breve.}"
FILE=".maintenance"

# ── Função: actualizar a base de dados Neon ──────────────────
update_db() {
  local ATIVA="$1"   # true | false
  local MSG="$2"

  if [ -z "$NEON_DATABASE_URL" ]; then
    echo "  ⚠️  NEON_DATABASE_URL não definida — a saltar actualização da BD."
    return
  fi

  # Escapar plicas na mensagem
  local MSG_ESCAPED
  MSG_ESCAPED=$(printf "%s" "$MSG" | sed "s/'/''/g")

  if [ "$ATIVA" = "true" ]; then
    psql "$NEON_DATABASE_URL" -q -c \
      "UPDATE public.config_geral SET manutencao_ativa=true, manutencao_mensagem='${MSG_ESCAPED}', manutencao_ativada_em=NOW();" \
      2>/dev/null && echo "  ✔  Base de dados Neon actualizada (manutenção ACTIVA)." \
                   || echo "  ⚠️  Falha ao actualizar a BD Neon (tente manualmente)."
  else
    psql "$NEON_DATABASE_URL" -q -c \
      "UPDATE public.config_geral SET manutencao_ativa=false, manutencao_mensagem='', manutencao_ativada_em=NULL;" \
      2>/dev/null && echo "  ✔  Base de dados Neon actualizada (manutenção INACTIVA)." \
                   || echo "  ⚠️  Falha ao actualizar a BD Neon (tente manualmente)."
  fi
}

case "$ACTION" in
  on)
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    # Gera JSON seguro usando printf (evita problemas com aspas na mensagem)
    printf '{"active":true,"message":"%s","activatedAt":"%s"}\n' \
      "$(echo "$MESSAGE" | sed 's/"/\\"/g')" \
      "$NOW" > "$FILE"

    # Actualizar também a BD (produção)
    update_db "true" "$MESSAGE"

    echo ""
    echo "┌─────────────────────────────────────────────────────┐"
    echo "│  ⚠️  MODO DE MANUTENÇÃO ACTIVADO                     │"
    echo "├─────────────────────────────────────────────────────┤"
    printf "│  Mensagem : %-37s │\n" "$MESSAGE"
    printf "│  Hora     : %-37s │\n" "$NOW"
    echo "│  Ficheiro : .maintenance                            │"
    echo "│  BD Neon  : config_geral.manutencao_ativa = true    │"
    echo "├─────────────────────────────────────────────────────┤"
    echo "│  → Dev (Replit)  : página de manutenção activa      │"
    echo "│  → Produção      : página de manutenção activa      │"
    echo "│  Admins (CEO/PCA/Admin) entram normalmente.         │"
    echo "│                                                     │"
    echo "│  Para desactivar:                                   │"
    echo "│    bash scripts/manutencao.sh off                   │"
    echo "└─────────────────────────────────────────────────────┘"
    echo ""
    ;;

  off)
    # Remover ficheiro
    if [ -f "$FILE" ]; then
      rm -f "$FILE"
    fi

    # Actualizar também a BD (produção)
    update_db "false" ""

    echo ""
    echo "┌─────────────────────────────────────────────────────┐"
    echo "│  ✅  MODO DE MANUTENÇÃO DESACTIVADO                  │"
    echo "├─────────────────────────────────────────────────────┤"
    echo "│  Ficheiro .maintenance removido.                    │"
    echo "│  BD Neon actualizada — manutencao_ativa = false.    │"
    echo "│  O sistema voltou ao normal em dev e produção.      │"
    echo "└─────────────────────────────────────────────────────┘"
    echo ""
    ;;

  status)
    echo ""
    # Estado do ficheiro
    if [ -f "$FILE" ]; then
      echo "⚠️  FICHEIRO LOCAL (.maintenance): ACTIVO"
      cat "$FILE"
    else
      echo "✅  Ficheiro local: INACTIVO"
    fi
    echo ""
    # Estado da BD
    if [ -n "$NEON_DATABASE_URL" ]; then
      RESULT=$(psql "$NEON_DATABASE_URL" -t -q -c \
        "SELECT manutencao_ativa, manutencao_mensagem, manutencao_ativada_em FROM public.config_geral LIMIT 1;" \
        2>/dev/null)
      if [ -n "$RESULT" ]; then
        echo "BD Neon — config_geral:"
        echo "$RESULT"
      else
        echo "⚠️  Não foi possível ler a BD Neon."
      fi
    else
      echo "ℹ️  NEON_DATABASE_URL não definida — não foi possível verificar a BD."
    fi
    echo ""
    ;;

  *)
    echo ""
    echo "Uso:"
    echo "  bash scripts/manutencao.sh on  \"Mensagem de manutenção\""
    echo "  bash scripts/manutencao.sh off"
    echo "  bash scripts/manutencao.sh status"
    echo ""
    exit 1
    ;;
esac
