---
name: Neon sync script
description: Script para sincronizar dados do Neon (produção) para a DB local do Replit.
---

## Script
`scripts/sync-neon-to-local.js` — copia todos os dados do Neon para o Replit local.

**Why:** Útil para desenvolvimento offline e testes com dados reais de produção.

**How to apply:** `node scripts/sync-neon-to-local.js`. Requer NEON_DATABASE_URL e DATABASE_URL no ambiente.

## Quirks resolvidos
1. SET search_path = public no Neon antes de qualquer query
2. session_replication_role = replica na DB local para desactivar FKs
3. Serializar objectos JS para JSON string antes de INSERT em cols jsonb
4. Excluir col id em tabelas com IDENTITY PK (ver neon-identity-pk.md)
5. pg_dump não funciona (versão mismatch: Neon PG17 vs local PG16)
