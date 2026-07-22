---
name: Texto vertical (1 letra por linha) por style em falta no StyleSheet
description: Causa raiz de bug clássico de texto renderizado verticalmente no React Native Web — chave de estilo referenciada no JSX mas nunca definida no StyleSheet.create.
---

Quando um `<View style={styles.algumNome}>` referencia uma chave que não existe no
`StyleSheet.create({...})`, `styles.algumNome` é `undefined` e a View cai no
`flexDirection` default do React Native, que é `'column'` (diferente do CSS web,
cujo default é `'row'`). Se essa View continha um filho com `flex: 1` a par de um
`<Text numberOfLines={1}>`, o filho colapsa para largura ~0 no runtime web, e o
texto acaba por quebrar carácter a carácter, uma letra por linha.

**Como detectar:** procurar no JSX todas as chaves `styles.xxx` usadas e confirmar
que cada uma tem uma entrada correspondente em `StyleSheet.create`. TypeScript
não acusa erro nisto por defeito (o objecto de estilos não é suficientemente
tipado), e o `tsc --noEmit` deste projecto demora demasiado (>100s) para correr
como verificação rápida — não é fiável como grelha de segurança aqui.

**Como aplicar:** ao investigar qualquer bug de layout estranho (texto vertical,
elementos empilhados quando deviam estar em linha, elementos com largura 0),
verificar primeiro se todas as chaves de estilo usadas no componente estão de
facto definidas no StyleSheet do ficheiro.

**Auditoria completa (Jul/2026):** varrer `app/` e `components/` inteiros por este
padrão exige um scanner próprio (regex ingénua falha com strings/template
literals/comentários com chaves, múltiplas variáveis de estilo com o mesmo nome
em escopos diferentes, e merges via `Object.assign(styles, patchObj)` — incluindo
a variante `Object.assign((styles as any), patchObj)`, que precisa de regex à
parte por causa do cast). Verificar também o prop `contentContainerStyle={...}`,
não só `style={...}` — o mesmo bug ocorre aí. Ficheiros já corrigidos nesta
auditoria: admin.tsx, financeiro.tsx, pedagogico.tsx, portal-encarregado.tsx,
portal-estudante.tsx, quadro-honra.tsx, rh-controle.tsx, secretaria-hub.tsx,
licenca.tsx (med-integracao.tsx corrigido antes, ver commit anterior),
rh-faltas-tempos.tsx (`pillContent` em falta, encontrado só depois de o
scanner passar a limitar-se ao conteúdo de `style={}`/`contentContainerStyle={}`
em vez de qualquer `varName.chave`, o que eliminou falsos positivos de nomes de
variável reutilizados, ex.: `s` a servir de `Set<string>` E de StyleSheet no
mesmo ficheiro).

**Verificação automatizada:** `scripts/check-undefined-styles.js` faz esta
verificação e está registado como validação `check-styles`
(`node scripts/check-undefined-styles.js`) — correr antes de builds/PRs
futuros para apanhar regressões deste padrão.

**Bug relacionado — corte de texto em cabeçalhos título+acção (Jul/2026):**
padrão distinto: `View` `flexDirection:'row', justifyContent:'space-between'`
com título à esquerda e botão "Ver todos/mais" à direita, sem `flexShrink`/
`minWidth: 0` no lado do título nem `flexShrink: 0` no lado da acção — títulos
longos espremem/cortam o botão de acção. Ao auditar, basta verificar os
COMPONENTES PARTILHADOS (`SectionTitle`/`SectionHeader`/`CollapsibleStats`),
não cada local de uso — a maioria dos ecrãs reutiliza os mesmos 2-3
componentes, por isso corrigir na fonte cobre dezenas de sítios de uma vez.
Componentes sem botão de acção (só ícone+título) não têm este risco.
