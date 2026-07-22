---
name: Neon search_path quirk
description: O Neon PostgreSQL tem search_path vazio por defeito, causando "relation does not exist" mesmo com tabelas em public.
---

## Regra
Sempre que ligar ao Neon via `pg` (node-postgres), executar `SET search_path = public` logo após `connect()`, ou usar o prefixo explícito `public."tabela"` em todas as queries.

**Why:** O Neon configura `search_path = ''` na ligação, ao contrário do PostgreSQL local que usa `"$user", public`. Sem este fix, todas as queries falham com "relation X does not exist" mesmo que a tabela exista.

**How to apply:** Em qualquer script ou serviço que ligue ao Neon directamente, adicionar `await client.query('SET search_path = public')` após connect. O `db-sync.ts` já trata disto internamente.
