---
name: PM2 ecosystem.config.cjs reload quirk
description: pm2 reload/restart --update-env não re-executa o ecosystem JS; forçar pm2 delete + pm2 start após mudar .env
---

## Regra

Após alterar `/opt/superescola/.env` no Hetzner, **nunca usar** `pm2 reload --update-env` nem `pm2 restart --update-env` isoladamente. O PM2 não re-executa o JavaScript do `ecosystem.config.cjs` — apenas reaplicaas as variáveis que já estavam em memória da sessão anterior.

**Sequência correcta para aplicar novo .env:**
```bash
cd /opt/superescola
pm2 delete superescola
pm2 start ecosystem.config.cjs
pm2 save
```

**Why:** O `ecosystem.config.cjs` lê o `.env` dinamicamente com `fs.readFileSync` em tempo de execução do Node.js. Esse código só é executado quando o PM2 processa o ficheiro ecosystem de raiz (no `pm2 start`). Os comandos `reload`/`restart --update-env` apenas actualizam as variáveis que o PM2 já conhece do estado anterior — não re-executam o ficheiro JS.

**How to apply:** Sempre que mudar `/opt/superescola/.env` em produção no Hetzner, usar `pm2 delete + pm2 start ecosystem.config.cjs + pm2 save`.
