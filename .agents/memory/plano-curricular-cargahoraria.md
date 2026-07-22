---
name: Carga horária semanal única vs. horas variáveis por classe
description: Como o SIGA representa disciplinas cuja carga horária oficial (INIDE/MED) varia por classe/ano, dado que o schema só guarda um número por disciplina/curso.
---

O schema (`disciplinas.cargaHoraria` e `curso_disciplinas.cargaHoraria`) guarda apenas UM valor semanal por disciplina (ou por disciplina+curso), mas os planos curriculares oficiais (INIDE/MED) frequentemente têm cargas diferentes por classe (ex.: Física 3h/2h/2h nas 7ª/8ª/9ª).

**Solução adoptada:** usar um valor semanal representativo (o mais frequente entre os anos, ou o valor do ano em que a disciplina é leccionada quando só ocorre num ano) no campo numérico, e guardar a repartição exacta por classe em texto:
- Em `disciplinas.descricao` para disciplinas do catálogo global.
- Em `cursos.ementa` para o detalhe completo de um curso/área (todas as disciplinas, 3 anos, totais).
- No frontend (`app/(main)/grelha.tsx`), no campo opcional `observacao` de cada disciplina.

**Porquê:** evita alterar o schema (preferência do utilizador) e mantém compatibilidade com o `curso_disciplinas` existente (Produção Vegetal/Gestão Informática), sem perder a informação exacta do documento oficial.

**Como aplicar:** ao adicionar/actualizar disciplinas cuja carga varia por classe, sempre preencher a descrição/ementa com a repartição exacta, mesmo que o campo numérico seja uma aproximação.

Nota adicional: `disciplinas.nome` tem constraint UNIQUE — não é possível ter duas disciplinas com o mesmo nome mesmo que os códigos sejam diferentes (ex.: "Física" do I Ciclo vs. II Ciclo exigiu nomear a segunda "Física (II Ciclo)").
