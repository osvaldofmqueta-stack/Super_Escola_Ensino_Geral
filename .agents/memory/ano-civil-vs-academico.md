---
name: Ano civil vs Ano académico
description: Regras e infra-estrutura para distinguir ano civil (getFullYear) de ano académico ("2025/2026") em toda a aplicação.
---

## Regra fundamental

- **Ano civil** (número inteiro, ex: 2026) — usar APENAS para: datas de nascimento, meses de processamento salarial, numeração sequencial de documentos (PROF-2026-0001).
- **Ano lectivo** (string "YYYY/YYYY", ex: "2025/2026") — usar em TUDO o que diz respeito a registos académicos: turmas, matrículas, propinas, notas, sumários, relatórios, PDFs.

## Infra-estrutura criada

### Servidor (`server/routes.ts`)
```ts
// Helper cacheado (60s TTL) — nunca lança excepção
async function getAnoLetivoAtivo(): Promise<string>
// Invalida o cache — chamar após activar/desactivar um ano
function invalidarCacheAnoAtivo()
```
- Cache invalidado automaticamente no PUT `/api/anos-academicos/:id` quando `ativo` é alterado.
- Fallback: `anoLetivoDeHoje()` (calcula de hoje com mês de início 9 = Setembro).

### `lib/anoLetivo.ts`
- `anoLetivoDeHoje(mesInicio?)` — alias claro para o ano lectivo de hoje
- `normalizeAnoLetivo(raw)` — normaliza "2025-2026", "2025/2026", 2025 → "2025/2026"
- `anoLetivoMatch(a, b)` — comparação tolerante a separadores

### Frontend (`context/AnoAcademicoContext.tsx`)
- `anoLetivoStr: string` — ano lectivo activo em formato canónico "YYYY/YYYY", nunca ano civil
- `anoLetivoInicio: number` — ano de início (ex: 2025 para "2025/2026")
- Exportados via `useAnoAcademico()`

## Locais corrigidos no servidor
- `ensureTaxaForPagamento` — `anoAcademico` da taxa usa `getAnoLetivoAtivo()`
- Pagamentos RUPE/Multicaixa — campo `ano` usa `getAnoLetivoAtivo()`
- `confirmarPagamentoRegistro` — campo `ano` usa `getAnoLetivoAtivo()`
- `completar-matricula` — matching de turmas e geração de `numeroMatricula` usam ano lectivo activo
- `calcularStatusCartao` — fallback do `anoLetivo` usa `getAnoLetivoAtivo()`
- Endpoint de licença/sumários — fallback do `anoLetivo` corrigido

## Why
`new Date().getFullYear()` devolve o ano civil (ex: 2026). Em Angola o ano lectivo começa em Setembro (ex: "2025/2026"), por isso em Junho de 2026 o ano lectivo correcto é "2025/2026" mas `getFullYear()` devolvia "2026" — causando erros em filtros de turmas, pagamentos e relatórios.
