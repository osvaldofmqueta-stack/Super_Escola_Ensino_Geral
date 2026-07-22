---
name: Replit secrets configurados
description: Lista de secrets do projecto Super Escola configurados no Replit e a decisão de usar exclusivamente Neon como BD.
---

Todos os secrets necessários do projecto estão nos Secrets do Replit: `NEON_DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `HETZNER_HOST`, `HETZNER_SSH_KEY`, `GITHUB_PAT` (adicionados em 2026-07-03; outros como `VAPID_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `GOOGLE_AI_API_KEY`, `EXPO_TOKEN` podem ter sido configurados em sessões anteriores — confirmar com `viewEnvVars` antes de pedir de novo).

**Why:** O utilizador exigiu explicitamente que a base de dados fique exclusivamente no Neon (ver `db-neon-only.md`) e nada no Replit built-in PostgreSQL. Confirmado a funcionar: logs mostram `[db-sync] 🔗 A usar base de dados Neon (NEON_DATABASE_URL)`.

**How to apply:** Antes de pedir qualquer secret ao utilizador, correr `viewEnvVars` para não duplicar pedidos. Depois de adicionar secrets, é preciso reiniciar o workflow — atenção a `EADDRINUSE` se um processo antigo ainda estiver a segurar a porta 5000 (matar com `pkill -9 -f "tsx server/index.ts"` antes de reiniciar).

**Nota lateral:** Após trocar de ambiente/hardware, o sistema de protecção anti-clonagem pode acusar "Fingerprint MUDOU" e entrar em "modo DEGRADADO" (ver `server/protection.ts`, ficheiro `.server_fp`). Isto não bloqueia a app mas é um aviso a considerar se o utilizador reportar funcionalidades limitadas.
