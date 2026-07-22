#!/bin/bash
# Script seguro para actualizar variáveis de ambiente em produção
# Não reinicia nem derruba o servidor — apenas actualiza o ficheiro .env

set -euo pipefail

ENV_FILE="/opt/superescola/.env"
BACKUP_FILE="/opt/superescola/.env.bak.$(date +%Y%m%d_%H%M%S)"

# ─── Verificar se o ficheiro .env existe ─────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Ficheiro $ENV_FILE não encontrado!"
  echo "   Verifique o caminho e tente novamente."
  exit 1
fi

echo "✅ Ficheiro encontrado: $ENV_FILE"

# ─── Fazer backup antes de qualquer alteração ─────────────────────────────────
cp "$ENV_FILE" "$BACKUP_FILE"
echo "✅ Backup guardado em: $BACKUP_FILE"

# ─── Função para definir/actualizar uma variável no .env ─────────────────────
set_env_var() {
  local KEY="$1"
  local VALUE="$2"

  if grep -q "^${KEY}=" "$ENV_FILE" 2>/dev/null; then
    # Actualizar linha existente
    sed -i "s|^${KEY}=.*|${KEY}=${VALUE}|" "$ENV_FILE"
    echo "🔄 Actualizado: ${KEY}"
  else
    # Adicionar nova linha no fim
    echo "" >> "$ENV_FILE"
    echo "${KEY}=${VALUE}" >> "$ENV_FILE"
    echo "➕ Adicionado: ${KEY}"
  fi
}

# ─── Actualizar GEMINI_API_KEY ────────────────────────────────────────────────
GEMINI_KEY="${GEMINI_API_KEY:-}"
if [ -z "$GEMINI_KEY" ]; then
  echo "❌ Variável GEMINI_API_KEY não definida no ambiente."
  echo "   Define-a antes de correr: export GEMINI_API_KEY=AIza..."
  exit 1
fi
set_env_var "GEMINI_API_KEY" "$GEMINI_KEY"

# ─── Verificar resultado ──────────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────────────────"
echo "📋 Verificação (chave mascarada):"
grep "^GEMINI_API_KEY=" "$ENV_FILE" | sed 's/=.\{10\}/=AIza***(oculto).../'
echo "─────────────────────────────────────────────"
echo ""
echo "✅ .env actualizado com sucesso!"
echo ""
echo "⚠️  ATENÇÃO: O servidor em execução ainda usa as variáveis antigas."
echo "   Para aplicar a mudança SEM derrubar, use um dos seguintes:"
echo ""
echo "   Opção A — Reinício gracioso (recomendado com PM2):"
echo "   sudo pm2 reload superescola --update-env"
echo ""
echo "   Opção B — Se usar systemd:"
echo "   sudo systemctl reload superescola  (se suportado)"
echo "   ou"
echo "   sudo systemctl restart superescola"
echo ""
echo "   Opção C — Se o processo suportar SIGHUP:"
echo "   sudo kill -HUP \$(pgrep -f 'node.*superescola')"
echo ""
