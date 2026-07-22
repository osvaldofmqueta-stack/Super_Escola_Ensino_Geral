#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  Super Escola (SIGA) — Configuração inicial do servidor Hetzner
#
#  Instala e configura tudo do zero num servidor Ubuntu 22.04 / 24.04 limpo:
#    • Node.js 20 LTS
#    • npm + PM2 (gestor de processos)
#    • Chromium (para geração de PDFs via Puppeteer)
#    • Nginx (proxy reverso: porta 80/443 → 5000)
#    • Certbot / Let's Encrypt (SSL automático)
#    • UFW (firewall)
#    • Directório de deploy e logs
#    • PM2 startup (reinício automático após reboot)
#
#  Uso (correr directamente no servidor Hetzner como root):
#    bash setup-hetzner.sh
#    bash setup-hetzner.sh --skip-ssl    # sem SSL (ex: domínio ainda não aponta)
#    bash setup-hetzner.sh --skip-nginx  # sem Nginx (só Node + PM2)
#
#  Ou a partir do Replit (requer HETZNER_SSH_PASSWORD ou HETZNER_SSH_KEY):
#    bash scripts/setup-hetzner.sh --remote
#
#  Pré-requisitos:
#    • Servidor Ubuntu 22.04 ou 24.04
#    • Acesso root via SSH
#    • Domínio www.liceun303.live a apontar para o IP do servidor
# ══════════════════════════════════════════════════════════════════════════════

set -uo pipefail

# ── Cores ──────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "   ${GREEN}✓${NC} $1"; }
info() { echo -e "   ${CYAN}→${NC} $1"; }
warn() { echo -e "   ${YELLOW}⚠${NC}  $1"; }
fail() { echo -e "\n   ${RED}✗ ERRO:${NC} $1\n"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; \
         echo -e "${BOLD}${CYAN}  $1${NC}"; \
         echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Configuração ───────────────────────────────────────────────────────────────
DOMAIN="www.liceun303.live"
DEPLOY_PATH="/opt/superescola"
APP_PORT="5000"
NODE_VERSION="20"
APP_USER="root"   # usar root (típico em Hetzner VPS simples)
LOG_DIR="/var/log/superescola"

# ── Flags ──────────────────────────────────────────────────────────────────────
SKIP_SSL=false
SKIP_NGINX=false
REMOTE_MODE=false

for arg in "$@"; do
  case $arg in
    --skip-ssl)   SKIP_SSL=true ;;
    --skip-nginx) SKIP_NGINX=true; SKIP_SSL=true ;;
    --remote)     REMOTE_MODE=true ;;
  esac
done

# ── Modo remoto: envia e corre este script no servidor ────────────────────────
if [ "$REMOTE_MODE" = true ]; then
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║     Super Escola — Configuração Remota do Servidor          ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  # Carregar secrets do Replit
  _load() {
    local k="$1"
    local cur="${!k:-}"
    if [ -z "$cur" ]; then
      local v
      v=$(node -e "process.stdout.write(process.env['$k']||'')" 2>/dev/null) || v=""
      if [ -n "$v" ]; then
        export "$k"="$v"
      fi
    fi
  }
  _load HETZNER_SSH_PASSWORD
  _load HETZNER_SSH_KEY
  _load HETZNER_HOST
  _load NEON_DATABASE_URL
  _load JWT_SECRET
  _load RESEND_API_KEY
  _load GEMINI_API_KEY

  HETZNER_HOST="${HETZNER_HOST:-178.104.228.85}"

  USE_SSHPASS=false
  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=30"

  if [ -n "${HETZNER_SSH_KEY:-}" ]; then
    KEY_FILE="$(mktemp /tmp/hkey_XXXXXX)"
    node -e "
      const raw = process.env.HETZNER_SSH_KEY || '';
      if (raw.includes('\n')) { process.stdout.write(raw.trim()+'\n'); process.exit(0); }
      let k = raw.replace(/\\\\n/g,'\n');
      process.stdout.write(k.trim()+'\n');
    " > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    SSH_OPTS="$SSH_OPTS -i $KEY_FILE"
    trap "rm -f '$KEY_FILE'" EXIT
    ok "Autenticação: chave SSH"
  elif [ -n "${HETZNER_SSH_PASSWORD:-}" ]; then
    if ! command -v sshpass &>/dev/null; then
      sudo apt-get install -y -qq sshpass 2>/dev/null || true
    fi
    export SSHPASS="${HETZNER_SSH_PASSWORD}"
    USE_SSHPASS=true
    ok "Autenticação: password SSH"
  else
    fail "Define HETZNER_SSH_KEY ou HETZNER_SSH_PASSWORD nos Secrets do Replit."
  fi

  info "A enviar script para ${HETZNER_HOST} e a executar remotamente..."
  echo ""

  # Enviar este script para o servidor e executá-lo
  SCRIPT_PATH="$(realpath "$0")"
  SSH_RUN="ssh $SSH_OPTS root@${HETZNER_HOST}"
  SCP_RUN="scp $SSH_OPTS"

  if [ "$USE_SSHPASS" = true ]; then
    SSH_RUN="sshpass -e ssh $SSH_OPTS root@${HETZNER_HOST}"
    SCP_RUN="sshpass -e scp $SSH_OPTS"
  fi

  $SCP_RUN "$SCRIPT_PATH" "root@${HETZNER_HOST}:/tmp/setup-hetzner.sh"
  $SSH_RUN "chmod +x /tmp/setup-hetzner.sh && bash /tmp/setup-hetzner.sh"

  echo ""
  ok "Configuração remota concluída!"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
#  A partir daqui, o script corre DIRECTAMENTE no servidor Hetzner
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     Super Escola — Configuração do Servidor Hetzner         ║${NC}"
echo -e "${BOLD}║     Domínio: ${DOMAIN}                          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verificar que está a correr como root
if [ "$(id -u)" -ne 0 ]; then
  fail "Este script tem de ser corrido como root. Usa: sudo bash setup-hetzner.sh"
fi

# Detectar versão Ubuntu
OS_VERSION=$(lsb_release -rs 2>/dev/null || echo "unknown")
ok "Sistema: Ubuntu ${OS_VERSION}"

# ── PASSO 1: Actualizar sistema ────────────────────────────────────────────────
step "1/9  Actualizar sistema"
info "apt-get update + upgrade (pode demorar alguns minutos)..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
ok "Sistema actualizado."

# ── PASSO 2: Instalar dependências base ────────────────────────────────────────
step "2/9  Dependências base"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl wget git rsync unzip \
  build-essential python3 \
  ca-certificates gnupg \
  ufw fail2ban \
  htop nano
ok "Dependências base instaladas."

# ── PASSO 3: Node.js 20 LTS ───────────────────────────────────────────────────
step "3/9  Node.js ${NODE_VERSION} LTS"

if command -v node &>/dev/null; then
  CURRENT_NODE=$(node --version)
  info "Node.js já instalado: ${CURRENT_NODE}"
  # Verificar se é a versão correcta
  NODE_MAJOR=$(node --version | cut -d'.' -f1 | tr -d 'v')
  if [ "$NODE_MAJOR" -ge "$NODE_VERSION" ]; then
    ok "Versão adequada (>= v${NODE_VERSION}) — a saltar instalação."
  else
    warn "Versão antiga (${CURRENT_NODE}) — a actualizar para v${NODE_VERSION}..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt-get install -y -qq nodejs
    ok "Node.js actualizado: $(node --version)"
  fi
else
  info "A instalar Node.js ${NODE_VERSION} via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y -qq nodejs
  ok "Node.js instalado: $(node --version)"
fi

ok "npm: $(npm --version)"

# ── PASSO 4: PM2 ──────────────────────────────────────────────────────────────
step "4/9  PM2 (gestor de processos)"
if command -v pm2 &>/dev/null; then
  ok "PM2 já instalado: $(pm2 --version)"
  npm install -g pm2 --quiet 2>/dev/null || true  # actualizar
else
  info "A instalar PM2 globalmente..."
  npm install -g pm2 --quiet
  ok "PM2 instalado: $(pm2 --version)"
fi

# ── PASSO 5: Chromium ─────────────────────────────────────────────────────────
step "5/9  Chromium (para geração de PDFs)"

CHROMIUM_CMD=""
if command -v chromium-browser &>/dev/null; then
  CHROMIUM_CMD="chromium-browser"
  ok "Chromium já instalado: $(chromium-browser --version 2>/dev/null | head -1)"
elif command -v chromium &>/dev/null; then
  CHROMIUM_CMD="chromium"
  ok "Chromium já instalado: $(chromium --version 2>/dev/null | head -1)"
else
  info "A instalar Chromium..."
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    chromium-browser \
    libnss3 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    fonts-liberation fonts-noto-cjk 2>/dev/null || \
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium 2>/dev/null || \
    warn "Chromium não disponível nos repositórios — PDFs podem não funcionar."

  if command -v chromium-browser &>/dev/null; then
    CHROMIUM_CMD="chromium-browser"
    ok "Chromium instalado: $(chromium-browser --version 2>/dev/null | head -1)"
  elif command -v chromium &>/dev/null; then
    CHROMIUM_CMD="chromium"
    ok "Chromium instalado: $(chromium --version 2>/dev/null | head -1)"
  fi
fi

# ── PASSO 6: Nginx ────────────────────────────────────────────────────────────
if [ "$SKIP_NGINX" = false ]; then
  step "6/9  Nginx (proxy reverso)"

  if command -v nginx &>/dev/null; then
    ok "Nginx já instalado: $(nginx -v 2>&1)"
  else
    info "A instalar Nginx..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx
    ok "Nginx instalado."
  fi

  # Configurar Nginx como proxy reverso
  info "A configurar Nginx → porta ${APP_PORT}..."
  cat > "/etc/nginx/sites-available/superescola" << NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} ${DOMAIN#www.};

    # Redireccionamento HTTP → HTTPS (activado após SSL)
    # return 301 https://\$host\$request_uri;

    # Proxy para a aplicação Node.js
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 30s;
        proxy_send_timeout 300s;

        # Limite de tamanho para uploads
        client_max_body_size 50M;
    }

    # Ficheiros estáticos com cache longa
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf)$ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_set_header Host \$host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Logs
    access_log /var/log/nginx/superescola.access.log;
    error_log  /var/log/nginx/superescola.error.log;
}
NGINX_EOF

  # Activar site e desactivar default
  ln -sf /etc/nginx/sites-available/superescola /etc/nginx/sites-enabled/
  if [ -f /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
  fi

  # Testar configuração Nginx
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    ok "Nginx configurado e recarregado."
  else
    warn "Erro na configuração do Nginx — verifica /etc/nginx/sites-available/superescola"
  fi
else
  step "6/9  Nginx"
  warn "Nginx ignorado (--skip-nginx)."
fi

# ── PASSO 7: SSL com Let's Encrypt ────────────────────────────────────────────
if [ "$SKIP_SSL" = false ]; then
  step "7/9  SSL / Let's Encrypt (Certbot)"

  # Verificar se o domínio aponta para este servidor
  SERVER_IP=$(curl -4s --max-time 5 ifconfig.me 2>/dev/null || echo "")
  DOMAIN_IP=$(dig +short "${DOMAIN}" 2>/dev/null | tail -1 || host "${DOMAIN}" 2>/dev/null | awk '/has address/{print $4}' | head -1 || echo "")

  if [ -z "$DOMAIN_IP" ]; then
    warn "Não foi possível resolver ${DOMAIN} — DNS pode não estar configurado."
    warn "Verifica se ${DOMAIN} aponta para ${SERVER_IP:-este servidor}."
    warn "A saltar SSL — podes activá-lo depois com: certbot --nginx -d ${DOMAIN}"
    SKIP_SSL=true
  elif [ "$DOMAIN_IP" != "$SERVER_IP" ] && [ -n "$SERVER_IP" ]; then
    warn "DNS: ${DOMAIN} → ${DOMAIN_IP} (esperado: ${SERVER_IP})"
    warn "O domínio ainda não aponta para este servidor."
    warn "A saltar SSL — podes activá-lo depois com: certbot --nginx -d ${DOMAIN}"
    SKIP_SSL=true
  fi

  if [ "$SKIP_SSL" = false ]; then
    info "A instalar Certbot..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq certbot python3-certbot-nginx

    info "A obter certificado SSL para ${DOMAIN}..."
    if certbot --nginx \
        --non-interactive \
        --agree-tos \
        --email "admin@${DOMAIN}" \
        -d "${DOMAIN}" \
        -d "${DOMAIN#www.}" 2>/dev/null; then
      ok "Certificado SSL obtido e Nginx configurado para HTTPS."

      # Activar redireccionamento HTTP→HTTPS na config Nginx
      sed -i 's/# return 301/return 301/' /etc/nginx/sites-available/superescola
      systemctl reload nginx
      ok "Redireccionamento HTTP → HTTPS activado."
    else
      warn "Certbot falhou — SSL não configurado."
      warn "Para tentar manualmente: certbot --nginx -d ${DOMAIN} -d ${DOMAIN#www.}"
    fi
  fi
else
  step "7/9  SSL"
  warn "SSL ignorado (--skip-ssl ou domínio não resolvido)."
  info "Para activar SSL depois: certbot --nginx -d ${DOMAIN}"
fi

# ── PASSO 8: Directório de deploy e logs ──────────────────────────────────────
step "8/9  Directório de deploy e logs"

mkdir -p "${DEPLOY_PATH}"
mkdir -p "${LOG_DIR}"
chmod 755 "${DEPLOY_PATH}"
chmod 755 "${LOG_DIR}"
ok "Directório de deploy: ${DEPLOY_PATH}"
ok "Directório de logs: ${LOG_DIR}"

# Criar .env vazio se não existir (será preenchido pelo deploy)
if [ ! -f "${DEPLOY_PATH}/.env" ]; then
  cat > "${DEPLOY_PATH}/.env" << 'ENVEOF'
# Variáveis de ambiente do Super Escola (SIGA)
# Este ficheiro é preenchido automaticamente pelo script de deploy.
# NÃO editar manualmente — usar o deploy para actualizar.
NODE_ENV=production
PORT=5000
SERVE_STATIC_WEB=1
PUPPETEER_SKIP_DOWNLOAD=true
ENVEOF
  chmod 600 "${DEPLOY_PATH}/.env"
  ok ".env inicial criado em ${DEPLOY_PATH}/.env"
else
  ok ".env já existe em ${DEPLOY_PATH}/.env"
fi

# ── PASSO 9: Firewall (UFW) ───────────────────────────────────────────────────
step "9/9  Firewall (UFW)"

# Configurar regras mínimas
ufw default deny incoming 2>/dev/null || true
ufw default allow outgoing 2>/dev/null || true
ufw allow 22/tcp comment "SSH"    2>/dev/null || true
ufw allow 80/tcp comment "HTTP"   2>/dev/null || true
ufw allow 443/tcp comment "HTTPS" 2>/dev/null || true

# Activar UFW (sem bloquear a sessão SSH actual)
if ufw status | grep -q "Status: inactive"; then
  echo "y" | ufw enable 2>/dev/null || ufw --force enable 2>/dev/null || true
  ok "UFW activado."
else
  ok "UFW já estava activo."
fi
ufw status numbered 2>/dev/null || true

# ── Configurar PM2 startup ────────────────────────────────────────────────────
echo ""
info "A configurar PM2 para arrancar automaticamente após reboot..."
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -3 || \
  systemctl enable pm2-root 2>/dev/null || true
ok "PM2 startup configurado."

# ── Resumo final ──────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║  ✅  Servidor Hetzner configurado com sucesso!               ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "   ${CYAN}Node.js:${NC}  $(node --version)"
echo -e "   ${CYAN}npm:${NC}      $(npm --version)"
echo -e "   ${CYAN}PM2:${NC}      $(pm2 --version 2>/dev/null)"
if [ -n "$CHROMIUM_CMD" ]; then
  echo -e "   ${CYAN}Chromium:${NC} $($CHROMIUM_CMD --version 2>/dev/null | head -1)"
fi
echo -e "   ${CYAN}Deploy:${NC}   ${DEPLOY_PATH}"
echo -e "   ${CYAN}Logs:${NC}     ${LOG_DIR}"
echo ""
echo -e "${BOLD}Próximos passos:${NC}"
echo -e "   1. Faz o primeiro deploy a partir do Replit:"
echo -e "      ${CYAN}bash scripts/build-deploy.sh${NC}"
echo ""
if [ "$SKIP_SSL" = true ]; then
  echo -e "   2. Quando o DNS estiver configurado, activa o SSL:"
  echo -e "      ${CYAN}certbot --nginx -d ${DOMAIN} -d ${DOMAIN#www.}${NC}"
  echo ""
fi
echo -e "   Verificar app: ${CYAN}pm2 list${NC}"
echo -e "   Ver logs:      ${CYAN}pm2 logs superescola --lines 50${NC}"
echo -e "   Nginx status:  ${CYAN}systemctl status nginx${NC}"
echo ""
