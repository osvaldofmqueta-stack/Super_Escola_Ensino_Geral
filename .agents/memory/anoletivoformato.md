---
name: anoLetivo — formato canónico e consistência
description: Regras e pontos de normalização do campo anoLetivo em turmas, notas e pautas.
---

## Regra
O campo `anoLetivo` em `turmas`, `notas`, `pautas` e tabelas relacionadas deve ser **sempre** o campo `ano` da tabela `anos_academicos` — formato `"YYYY/YYYY"` (ex: `"2025/2026"`). Nunca o `id` do registo (ex: `"aa-2025-2026"`).

## Pontos de normalização (já corrigidos)

| Onde | O quê |
|------|-------|
| `lib/anoLetivo.ts` → `normalizeAnoLetivo()` | Agora aceita IDs como `"aa-2025-2026"` e extrai `"2025/2026"` via regex `(\d{4})[-\/](\d{4})` |
| `server/routes.ts` turma INSERT (~linha 3779) | Usa `normalizeAnoLetivo(b.anoLetivo)` em vez de `.replace(/-/g, '/')` |
| `server/routes.ts` turma UPDATE (~linha 3841) | Usa `normalizeAnoLetivo(v)` em vez de `.replace(/-/g, '/')` |
| `/api/exame-nacional/turmas` | Aceita `anoLetivo = $ano OR anoLetivo = $id` (ambos os formatos) |
| `/api/exame-nacional/progresso` | Idem — aceita ambos os formatos |

## Causa raiz do bug
Seed scripts que passavam o `id` do ano académico (`aa-2025-2026`) em vez do `ano` texto (`2025/2026`) ao campo `anoLetivo` de turmas.

**Why:** `.replace(/-/g, '/')` converte `"aa-2025-2026"` em `"aa/2025/2026"` — ainda errado. `normalizeAnoLetivo` com o novo regex extrai correctamente `"2025/2026"`.

## Regra para seed scripts
Nos seed scripts, usar **sempre** o texto do ano (`"2025/2026"`), não o `id` do registo (`"aa-2025-2026"`). Confirmar com:
```sql
SELECT ano FROM anos_academicos WHERE ativo = true LIMIT 1;
```
