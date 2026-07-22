#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola — Configurar Git via SSH (resolve erro "workflow scope")
#  Uso: bash scripts/configurar-git-ssh.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }

REPO="osvaldofmqueta-stack/superescola"
KEY_FILE="$HOME/.ssh/github_superescola"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   Super Escola — Configurar Git SSH para GitHub          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Gerar chave SSH ────────────────────────────────────────────────────
mkdir -p ~/.ssh
chmod 700 ~/.ssh

if [ -f "$KEY_FILE" ]; then
  warn "Chave SSH já existe em $KEY_FILE — a reutilizar."
else
  info "A gerar chave SSH Ed25519..."
  ssh-keygen -t ed25519 -C "superescola-replit-$(date +%Y%m%d)" -f "$KEY_FILE" -N ""
  ok "Chave gerada: $KEY_FILE"
fi

# ── 2. Configurar ssh-agent ───────────────────────────────────────────────
eval "$(ssh-agent -s)" > /dev/null 2>&1
ssh-add "$KEY_FILE" > /dev/null 2>&1
ok "Chave carregada no ssh-agent"

# ── 3. Configurar ~/.ssh/config ───────────────────────────────────────────
SSH_CONFIG="$HOME/.ssh/config"
if ! grep -q "Host github.com" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" << EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY_FILE
  StrictHostKeyChecking no
EOF
  chmod 600 "$SSH_CONFIG"
  ok "~/.ssh/config configurado"
else
  ok "~/.ssh/config já configurado"
fi

# ── 4. Mudar remote para SSH ──────────────────────────────────────────────
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [[ "$CURRENT_REMOTE" == git@github.com* ]]; then
  ok "Remote já usa SSH: $CURRENT_REMOTE"
else
  git remote set-url origin "git@github.com:${REPO}.git"
  ok "Remote alterado para SSH: git@github.com:${REPO}.git"
fi

# ── 5. Mostrar a chave pública ────────────────────────────────────────────
PUB_KEY=$(cat "${KEY_FILE}.pub")

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  CHAVE PÚBLICA — copia e adiciona ao GitHub              ${NC}"
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}${PUB_KEY}${NC}"
echo ""
echo -e "${BOLD}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Passos seguintes:${NC}"
echo ""
echo -e "  1. Copia a chave acima (linha toda, do 'ssh-ed25519' até ao fim)"
echo ""
echo -e "  2. Vai a: ${CYAN}https://github.com/settings/ssh/new${NC}"
echo -e "     • Title: SuperEscola Replit"
echo -e "     • Key type: Authentication Key"
echo -e "     • Cole a chave e clica 'Add SSH key'"
echo ""
echo -e "  3. Volta aqui e corre:"
echo -e "     ${CYAN}git push origin master${NC}"
echo ""
echo -e "  Pronto! O push vai funcionar sem precisar de token 'workflow'."
echo ""

# ── 6. Testar ligação (sem falhar se ainda não adicionaste a chave) ───────
info "A testar ligação ao GitHub..."
if ssh -T git@github.com 2>&1 | grep -q "successfully authenticated"; then
  ok "Ligação SSH ao GitHub confirmada! Podes fazer push já."
  echo ""
  echo -e "${BOLD}Corre agora:${NC}"
  echo -e "   ${CYAN}git push origin master${NC}"
else
  warn "Chave ainda não adicionada ao GitHub — segue os passos acima primeiro."
fi
echo ""
