---
name: EMIS / Multicaixa — terminologia e integração
description: Regras de nomenclatura UI, formato de referência sandbox, injecção NIF/BI, webhook signature e localização de call sites.
---

## Terminologia correcta
- **RUPE** (Referência Única de Pagamento do Estado) → apenas para pagamentos à AGT/Estado.
- Esta app usa **EMIS** via banco comercial (BFA, BAI, BIC) → termos correctos na UI: "Referência Bancária", "Ref. Bancária Multicaixa", "Referência Bancária Multicaixa", "Referência EMIS".
- Nomes internos de código (`gerarRUPE`, `getRUPEsAluno`, `RUPEGerado`, tabela `rupes`) **mantêm-se inalterados** — mudar só labels visíveis ao utilizador.

**Why:** Escolas privadas angolanas não usam RUPE (AGT). Usar "RUPE" na UI é tecnicamente errado e confunde os encarregados.

## Formato de referência sandbox (Multicaixa)
Formato real Multicaixa: `EEEEE RRRRRRRRR` (entidade 5 dígitos + referência 9 dígitos).
```typescript
const ent = (emisCfg.entidadeId || '99999').padStart(5, '0');
const seq = String(Date.now() % 999999999).padStart(9, '0');
const referencia = `${ent} ${seq}`;
```
**Why:** O formato antigo gerava `99999 1234 ABCDE` (alfanumérico) que os ATM rejeitam.

## Injecção NIF/BI do aluno nas chamadas EMIS
BFA, BAI e BIC exigem NIF ou BI do pagador. Antes de chamar `chamarEmisGerarReferencia`, fazer:
```sql
SELECT nif, "numeroBi", "numeroCedula" FROM public.alunos WHERE id=$1 LIMIT 1
```
Passar `nif?` e `numeroBi?` para `chamarEmisGerarReferencia`. A função aceita opcionais e inclui-os no body do POST.

**Call sites:** `/api/emis/gerar-referencia/self`, `/api/emis/gerar-referencia` (admin), `gerarRupeRecargaSaldo`.

## Webhook signature verification
Variável de ambiente: `EMIS_WEBHOOK_SECRET`. Se definida, o banco deve enviar o segredo em `X-Webhook-Secret`, `X-Api-Key` ou `X-Signature`.
Se o segredo não estiver configurado, a verificação é ignorada (retrocompatível).
```typescript
const webhookSecret = process.env.EMIS_WEBHOOK_SECRET || '';
if (webhookSecret) {
  const fornecido = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || req.headers['x-signature'] || '';
  if (!fornecido || fornecido !== webhookSecret) return json(res, 401, { error: '...' });
}
```

## Modal "Registar Pagamento" (financeiro.tsx) — só 2 métodos
Decisão: o modal manual de registo de pagamento usa apenas `multicaixa` (imediato, status `pago`) e `referencia_bancaria` (chama `gerarRUPE`, fica pendente e é confirmado automaticamente pelo `[rupe-polling]`/webhook via `confirmarRupeComoPago`). `dinheiro` e `transferencia` foram removidos deste modal específico (mantidos noutros filtros/relatórios/modais que não foram alterados).
**Why:** a escola só aceita Multicaixa e referência bancária nesse fluxo; "Por Referência" reaproveita 100% a infra RUPE já existente (mesma tabela `rupes`, mesmo polling) — não precisou de migração de BD porque `metodoPagamento` é `text` sem CHECK/enum.
**How to apply:** ao tocar no modal de "Registar Pagamento", manter esta escolha; qualquer novo método de pagamento manual deve decidir explicitamente se é "imediato" ou "pendente via RUPE".

## Secções de referências pendentes nos portais
- **aluno-perfil.tsx** (tab Financeiro): mostra só referências `status === 'ativo'` via `getRUPEsAluno(aluno.id)`. Hook adicionado ao `useFinanceiro()` destructuring neste ficheiro.
- **portal-encarregado.tsx**: secção "Referências Bancárias Multicaixa" com instruções passo-a-passo de pagamento ATM e cartão visual por referência activa/paga/expirada.
- **rupes-historico.tsx**: dashboard admin com título "Referências Bancárias Multicaixa", label "REF. BANCÁRIA MULTICAIXA" e dica de consulta actualizada.
