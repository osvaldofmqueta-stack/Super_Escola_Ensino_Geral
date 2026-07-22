---
name: Neon identity PK tables
description: Algumas tabelas usam GENERATED ALWAYS AS IDENTITY na col id — não aceitam INSERT com valor explícito de id.
---

## Tabelas afectadas
provincias, municipios, lookup_items, saft_hashes, saft_sequencias, login_approvals

**Why:** Estas tabelas foram criadas com `integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY` (ou `generatedAlwaysAsIdentity()` no Drizzle). O PostgreSQL não permite inserir um valor explícito nestas colunas sem `OVERRIDING SYSTEM VALUE`.

**How to apply:** Ao copiar dados para estas tabelas (sync, seeds), excluir a coluna `id` do INSERT e deixar a DB gerar automaticamente. Aceitar que os IDs locais diferem dos do Neon — não são usados como FKs noutras tabelas.
