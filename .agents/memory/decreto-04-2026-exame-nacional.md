---
name: Decreto 04/2026 — Exame Nacional access control
description: Regras de acesso ao lançamento do Exame Nacional (EN) na Pauta Final, conforme Decreto Executivo nº 04/2026.
---

## Regra fundamental

EN (ex1/ex2) é EXCLUSIVO da Secretaria. Professores NUNCA lançam EN.

## Permissão controlada: `exame_nacional`

- **Quem tem:** secretaria, chefe_secretaria, director, admin, ceo (ROLE_DEFAULTS em server/auth.ts)
- **Quem não tem:** professor (exame_nacional=false explícito na BD via migração)
- **Individual:** pode ser concedido a qualquer utilizador via Gestão de Acessos

## Protecção na API (dupla camada)

- `POST /api/notas` — guard: se ex1>0 ou ex2>0, exige permissão `exame_nacional`
- `PUT /api/notas/:id` — guard: se 'ex1' ou 'ex2' no body, exige permissão `exame_nacional`
- `/api/exame-nacional/*` (turmas, disciplinas-nucleares, dados, progresso) — todos usam `requirePermission("exame_nacional")`

**Why:** O UI já bloqueava EN para professores, mas a API estava aberta. Agora há validação server-side.

## Classes de Exame (isClasseExame)

6ª, 9ª, 12ª, Módulo 3, 2º ano EJA (variantes: "2º EJA", "2 EJA", "2 ano EJA", etc.)

## Fórmulas por classe (Anexo III)

| Classe | Disciplina | MFD |
|---|---|---|
| 6ª/9ª | Nuclear | 0.6×MT3 + 0.4×NEN |
| 12ª | Nuclear | 0.5×MT3 + 0.5×NEN (ou MENC se combinado) |
| 6ª/9ª/12ª | Não-nuclear | (MT1+MT2+MACT3)/3 |
| Transição | Todas | (MT1+MT2+MT3)/3 |

## Mini-Pauta (Anexo IV/V)

- Transição: MAC + NPT todas as colunas, MFD
- Exame: T3 sem NPT (só MACT3), SEM coluna EN — sempre
- Template mini-pauta.html confirmado sem EN

## DB migration

Corre automaticamente no arranque. Garante:
- exame_nacional=true para secretaria, chefe_secretaria, director, admin, ceo
- exame_nacional=false para professor
