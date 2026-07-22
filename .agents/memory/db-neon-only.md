---
name: DB exclusivo Neon
description: A app usa exclusivamente Neon como base de dados; a DATABASE_URL do Replit é ignorada intencionalmente.
---

A base de dados é exclusivamente o Neon PostgreSQL via `NEON_DATABASE_URL` (Replit secret).

**Regra:** `server/db-sync.ts` e `drizzle.config.ts` lêem apenas `NEON_DATABASE_URL`. Se não estiver definida, o servidor falha com erro explícito. Nunca fazer fallback para `DATABASE_URL`.

**Why:** O utilizador pediu explicitamente que toda a persistência fique no Neon e nada no Replit built-in PostgreSQL.

**How to apply:** Se alguém sugerir usar `DATABASE_URL` ou o Replit DB, recusar — a única fonte de verdade é `NEON_DATABASE_URL`. Para migrações via `drizzle-kit push`, o segredo tem de estar presente.
