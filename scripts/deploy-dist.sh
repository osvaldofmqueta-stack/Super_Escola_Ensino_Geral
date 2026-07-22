#!/bin/bash
# Deploy dist/ para o servidor Hetzner de produção
# Uso: bash scripts/deploy-dist.sh
# Requer: HETZNER_HOST e HETZNER_SSH_KEY nas variáveis de ambiente

set -e

if [ -z "$HETZNER_HOST" ] || [ -z "$HETZNER_SSH_KEY" ]; then
  echo "❌ HETZNER_HOST e HETZNER_SSH_KEY são obrigatórios."
  exit 1
fi

if [ ! -d "dist" ]; then
  echo "❌ Pasta dist/ não encontrada. Corre primeiro: npx expo export --platform web"
  exit 1
fi

# Usar Node.js para formatar a chave correctamente
TMP_KEY=$(node -e "
const fs = require('fs'), os = require('os'), path = require('path');
let key = (process.env.HETZNER_SSH_KEY || '').replace(/\\\\n/g, '\n').trim();
if (!key.includes('\n')) {
  key = key
    .replace('-----BEGIN OPENSSH PRIVATE KEY----- ', '-----BEGIN OPENSSH PRIVATE KEY-----\n')
    .replace(' -----END OPENSSH PRIVATE KEY-----', '\n-----END OPENSSH PRIVATE KEY-----');
  const parts = key.split('\n');
  const header = parts[0], footer = parts[parts.length-1];
  const b64 = parts.slice(1,-1).join('').replace(/\s+/g,'');
  const b64Lines = b64.match(/.{1,64}/g) || [];
  key = [header, ...b64Lines, footer, ''].join('\n');
}
const tmp = path.join(os.tmpdir(), 'siga_deploy_key_' + Date.now());
fs.writeFileSync(tmp, key, {mode: 0o600});
process.stdout.write(tmp);
")

SSH_OPTS="-i $TMP_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=30 -o BatchMode=yes"
REMOTE="root@$HETZNER_HOST"

echo "📦 A enviar dist/ para $HETZNER_HOST:/opt/superescola/dist/ ..."
ssh $SSH_OPTS "$REMOTE" "mkdir -p /opt/superescola/dist /var/www/superescola/dist"
scp $SSH_OPTS -r dist/. "$REMOTE:/opt/superescola/dist/"

echo "🔄 A sincronizar /var/www/superescola/dist/ ..."
ssh $SSH_OPTS "$REMOTE" "rsync -a --delete /opt/superescola/dist/ /var/www/superescola/dist/ 2>/dev/null || cp -r /opt/superescola/dist/. /var/www/superescola/dist/"

echo "♻️  A reiniciar pm2 superescola ..."
ssh $SSH_OPTS "$REMOTE" "pm2 restart superescola && sleep 2 && pm2 show superescola | grep -E 'status|uptime'"

echo "🎉 Deploy concluído!"
rm -f "$TMP_KEY"
