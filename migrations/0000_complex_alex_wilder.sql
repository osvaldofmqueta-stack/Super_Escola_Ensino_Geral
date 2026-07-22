CREATE TABLE "alunos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numeroMatricula" text NOT NULL,
	"nome" text NOT NULL,
	"apelido" text NOT NULL,
	"dataNascimento" text NOT NULL,
	"genero" text NOT NULL,
	"provincia" text NOT NULL,
	"municipio" text NOT NULL,
	"turmaId" varchar,
	"cursoId" varchar,
	"nomeEncarregado" text NOT NULL,
	"telefoneEncarregado" text NOT NULL,
	"emailEncarregado" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"permitirAcessoComPendencia" boolean DEFAULT false NOT NULL,
	"foto" text,
	"falecido" boolean DEFAULT false NOT NULL,
	"dataFalecimento" text,
	"observacoesFalecimento" text,
	"registadoFalecimentoPor" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anos_academicos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ano" text NOT NULL,
	"dataInicio" text NOT NULL,
	"dataFim" text NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"trimestres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"epocasExame" jsonb DEFAULT '{}'::jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anulacoes_matricula" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"alunoNome" text NOT NULL,
	"turmaId" varchar,
	"turmaNome" text DEFAULT '' NOT NULL,
	"anoLetivo" text NOT NULL,
	"motivo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"dataAnulacao" text NOT NULL,
	"registadoPor" text NOT NULL,
	"registadoPorId" varchar,
	"documentos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reAdmissaoPermitida" boolean DEFAULT false NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" varchar NOT NULL,
	"userEmail" text NOT NULL,
	"userRole" text NOT NULL,
	"userName" text,
	"acao" text NOT NULL,
	"modulo" text NOT NULL,
	"descricao" text NOT NULL,
	"recursoId" varchar,
	"ipAddress" text,
	"userAgent" text,
	"dados" jsonb,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avaliacoes_professores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professorId" varchar NOT NULL,
	"periodoLetivo" text NOT NULL,
	"avaliador" text NOT NULL,
	"avaliadorId" text,
	"notaPlaneamento" real DEFAULT 0,
	"notaPontualidade" real DEFAULT 0,
	"notaMetodologia" real DEFAULT 0,
	"notaRelacaoAlunos" real DEFAULT 0,
	"notaRelacaoColegas" real DEFAULT 0,
	"notaResultados" real DEFAULT 0,
	"notaDisciplina" real DEFAULT 0,
	"notaDesenvolvimento" real DEFAULT 0,
	"notaFinal" real DEFAULT 0,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"pontosFuertes" text DEFAULT '',
	"areasMelhoria" text DEFAULT '',
	"recomendacoes" text DEFAULT '',
	"avaliacaoEm" timestamp with time zone,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bolsas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"tipo" text DEFAULT 'social' NOT NULL,
	"percentagem" real DEFAULT 100 NOT NULL,
	"descricao" text DEFAULT '',
	"dataInicio" text,
	"dataFim" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"aprovadoPor" text,
	"observacao" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendario_provas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"turmasIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disciplina" text NOT NULL,
	"data" text NOT NULL,
	"hora" text NOT NULL,
	"tipo" text NOT NULL,
	"publicado" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_mensagens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remetenteId" varchar NOT NULL,
	"remetenteNome" text NOT NULL,
	"remetenteRole" text NOT NULL,
	"destinatarioId" varchar NOT NULL,
	"destinatarioNome" text NOT NULL,
	"destinatarioRole" text DEFAULT '' NOT NULL,
	"corpo" text NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config_geral" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomeEscola" text DEFAULT 'Escola Secundária N.º 1 de Luanda' NOT NULL,
	"logoUrl" text,
	"pp1Habilitado" boolean DEFAULT true NOT NULL,
	"pptHabilitado" boolean DEFAULT true NOT NULL,
	"notaMinimaAprovacao" integer DEFAULT 10 NOT NULL,
	"maxAlunosTurma" integer DEFAULT 35 NOT NULL,
	"numAvaliacoes" integer DEFAULT 4 NOT NULL,
	"macMin" integer DEFAULT 1 NOT NULL,
	"macMax" integer DEFAULT 5 NOT NULL,
	"horarioFuncionamento" text DEFAULT 'Seg-Sex: 07:00-19:00 | Sáb: 07:00-13:00' NOT NULL,
	"flashScreen" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"multaConfig" jsonb DEFAULT '{"percentagem":10,"diasCarencia":5,"ativo":true}'::jsonb NOT NULL,
	"inscricoesAbertas" boolean DEFAULT false NOT NULL,
	"inscricaoDataInicio" text,
	"inscricaoDataFim" text,
	"propinaHabilitada" boolean DEFAULT true NOT NULL,
	"numeroEntidade" text,
	"iban" text,
	"nomeBeneficiario" text,
	"bancoTransferencia" text,
	"telefoneMulticaixaExpress" text,
	"nib" text,
	"codigoMED" text,
	"nifEscola" text,
	"provinciaEscola" text,
	"municipioEscola" text,
	"tipoEnsino" text DEFAULT 'Secundário',
	"modalidade" text DEFAULT 'Presencial',
	"directorGeral" text,
	"directorPedagogico" text,
	"directorProvincialEducacao" text,
	"licencaAtivacao" text,
	"licencaExpiracao" text,
	"licencaPlano" text DEFAULT 'avaliacao',
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"inssEmpPerc" real DEFAULT 3 NOT NULL,
	"inssPatrPerc" real DEFAULT 8 NOT NULL,
	"irtTabela" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mesesAnoAcademico" jsonb DEFAULT '[9,10,11,12,1,2,3,4,5,6,7]'::jsonb NOT NULL,
	"exameAntecipadoHabilitado" boolean DEFAULT false NOT NULL,
	"exclusaoDuasReprovacoes" boolean DEFAULT false NOT NULL,
	"papHabilitado" boolean DEFAULT false NOT NULL,
	"estagioComoDisciplina" boolean DEFAULT false NOT NULL,
	"papDisciplinasContribuintes" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracao_rh" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"valorPorFalta" real DEFAULT 0 NOT NULL,
	"valorMeioDia" real DEFAULT 0 NOT NULL,
	"taxaTempoLectivo" real DEFAULT 0 NOT NULL,
	"taxaAdminPorDia" real DEFAULT 0 NOT NULL,
	"descontoPorTempoNaoDado" real DEFAULT 0 NOT NULL,
	"semanasPorMes" integer DEFAULT 4 NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracoes_falta" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"anoLetivo" text NOT NULL,
	"maxFaltasMensais" integer DEFAULT 3 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"definidoPor" text DEFAULT '' NOT NULL,
	"definidoPorId" varchar,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contas_pagar" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"descricao" text NOT NULL,
	"fornecedor" text DEFAULT '' NOT NULL,
	"valor" real NOT NULL,
	"dataVencimento" text NOT NULL,
	"dataPagamento" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"metodoPagamento" text,
	"planoContaId" varchar,
	"referencia" text,
	"comprovante" text,
	"observacao" text,
	"registadoPor" text DEFAULT 'Sistema' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conteudos_programaticos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disciplina" text NOT NULL,
	"classe" text NOT NULL,
	"trimestre" integer NOT NULL,
	"anoLetivo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"cumprido" boolean DEFAULT false NOT NULL,
	"percentagem" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curso_disciplinas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cursoId" varchar NOT NULL,
	"disciplinaId" varchar NOT NULL,
	"obrigatoria" boolean DEFAULT true NOT NULL,
	"cargaHoraria" integer DEFAULT 0 NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"removida" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cursos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"codigo" text DEFAULT '' NOT NULL,
	"areaFormacao" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"cargaHoraria" integer DEFAULT 0 NOT NULL,
	"duracao" text DEFAULT '' NOT NULL,
	"ementa" text DEFAULT '' NOT NULL,
	"portaria" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disciplinas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"codigo" text DEFAULT '' NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"tipo" text DEFAULT 'continuidade' NOT NULL,
	"classeInicio" text DEFAULT '' NOT NULL,
	"classeFim" text DEFAULT '' NOT NULL,
	"cursoId" varchar,
	"cargaHoraria" integer DEFAULT 0 NOT NULL,
	"obrigatoria" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"conteudo" text NOT NULL,
	"insignia_base64" text,
	"marca_agua_base64" text,
	"classe_alvo" text,
	"bloqueado" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos_emitidos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aluno_id" varchar,
	"aluno_nome" text NOT NULL,
	"aluno_num" text NOT NULL,
	"aluno_turma" text,
	"tipo" text NOT NULL,
	"finalidade" text DEFAULT '',
	"ano_academico" text DEFAULT '',
	"emitido_por" text NOT NULL,
	"emitido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"dados_snapshot" text
);
--> statement-breakpoint
CREATE TABLE "emprestimos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"livroId" varchar NOT NULL,
	"livroTitulo" text NOT NULL,
	"alunoId" varchar,
	"nomeLeitor" text NOT NULL,
	"tipoLeitor" text DEFAULT 'aluno' NOT NULL,
	"dataEmprestimo" text NOT NULL,
	"dataPrevistaDevolucao" text NOT NULL,
	"dataDevolucao" text,
	"status" text DEFAULT 'emprestado' NOT NULL,
	"observacao" text,
	"registadoPor" text DEFAULT 'Sistema' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"data" text NOT NULL,
	"hora" text NOT NULL,
	"tipo" text NOT NULL,
	"local" text NOT NULL,
	"turmasIds" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exclusoes_falta" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"anoLetivo" text NOT NULL,
	"trimestre" integer NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"totalFaltasAcumuladas" integer DEFAULT 0 NOT NULL,
	"limiteFaltas" integer DEFAULT 3 NOT NULL,
	"tipoExclusao" text DEFAULT 'exclusao_disciplina' NOT NULL,
	"motivo" text DEFAULT '' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"registadoPor" text NOT NULL,
	"registadoPorId" varchar,
	"status" text DEFAULT 'ativo' NOT NULL,
	"dataExclusao" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faltas_funcionarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funcionarioId" varchar NOT NULL,
	"data" text NOT NULL,
	"tipo" text DEFAULT 'injustificada' NOT NULL,
	"motivo" text DEFAULT '' NOT NULL,
	"descontavel" boolean DEFAULT true NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"registadoPor" text DEFAULT '' NOT NULL,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feriados" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"data" text NOT NULL,
	"tipo" text DEFAULT 'nacional' NOT NULL,
	"recorrente" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folhas_salarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"totalBruto" real DEFAULT 0 NOT NULL,
	"totalLiquido" real DEFAULT 0 NOT NULL,
	"totalInssEmpregado" real DEFAULT 0 NOT NULL,
	"totalInssPatronal" real DEFAULT 0 NOT NULL,
	"totalIrt" real DEFAULT 0 NOT NULL,
	"totalSubsidios" real DEFAULT 0 NOT NULL,
	"numFuncionarios" integer DEFAULT 0 NOT NULL,
	"processadaPor" text,
	"observacoes" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funcionarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"apelido" text NOT NULL,
	"dataNascimento" text DEFAULT '' NOT NULL,
	"genero" text DEFAULT '' NOT NULL,
	"bi" text DEFAULT '' NOT NULL,
	"nif" text DEFAULT '' NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"foto" text,
	"provincia" text DEFAULT '' NOT NULL,
	"municipio" text DEFAULT '' NOT NULL,
	"morada" text DEFAULT '' NOT NULL,
	"departamento" text NOT NULL,
	"cargo" text NOT NULL,
	"especialidade" text DEFAULT '' NOT NULL,
	"tipoContrato" text DEFAULT 'efectivo' NOT NULL,
	"dataContratacao" text DEFAULT '' NOT NULL,
	"dataFimContrato" text,
	"habilitacoes" text DEFAULT '' NOT NULL,
	"salarioBase" real DEFAULT 0 NOT NULL,
	"subsidioAlimentacao" real DEFAULT 0 NOT NULL,
	"subsidioTransporte" real DEFAULT 0 NOT NULL,
	"subsidioHabitacao" real DEFAULT 0 NOT NULL,
	"outrosSubsidios" real DEFAULT 0 NOT NULL,
	"subsidios" jsonb DEFAULT '[]'::jsonb,
	"valorPorTempoLectivo" real DEFAULT 0 NOT NULL,
	"temposSemanais" integer DEFAULT 0 NOT NULL,
	"utilizadorId" varchar,
	"professorId" varchar,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "horarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"professorId" varchar,
	"professorNome" text DEFAULT '—' NOT NULL,
	"diaSemana" integer NOT NULL,
	"periodo" integer NOT NULL,
	"horaInicio" text NOT NULL,
	"horaFim" text NOT NULL,
	"sala" text DEFAULT '' NOT NULL,
	"anoAcademico" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itens_folha" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folhaId" varchar NOT NULL,
	"professorId" varchar NOT NULL,
	"professorNome" text NOT NULL,
	"cargo" text DEFAULT 'Professor' NOT NULL,
	"categoria" text DEFAULT '' NOT NULL,
	"salarioBase" real DEFAULT 0 NOT NULL,
	"subsidioAlimentacao" real DEFAULT 0 NOT NULL,
	"subsidioTransporte" real DEFAULT 0 NOT NULL,
	"subsidioHabitacao" real DEFAULT 0 NOT NULL,
	"outrosSubsidios" real DEFAULT 0 NOT NULL,
	"salarioBruto" real DEFAULT 0 NOT NULL,
	"inssEmpregado" real DEFAULT 0 NOT NULL,
	"inssPatronal" real DEFAULT 0 NOT NULL,
	"irt" real DEFAULT 0 NOT NULL,
	"descontoFaltas" real DEFAULT 0 NOT NULL,
	"numFaltasInj" integer DEFAULT 0 NOT NULL,
	"numMeioDia" integer DEFAULT 0 NOT NULL,
	"outrosDescontos" real DEFAULT 0 NOT NULL,
	"totalDescontos" real DEFAULT 0 NOT NULL,
	"remuneracaoTempos" real DEFAULT 0 NOT NULL,
	"numTempos" integer DEFAULT 0 NOT NULL,
	"salarioLiquido" real DEFAULT 0 NOT NULL,
	"tipoFuncionario" text DEFAULT 'professor' NOT NULL,
	"departamento" text DEFAULT '' NOT NULL,
	"seccao" text DEFAULT '' NOT NULL,
	"observacao" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livros" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"autor" text NOT NULL,
	"isbn" text DEFAULT '' NOT NULL,
	"categoria" text DEFAULT 'Geral' NOT NULL,
	"editora" text DEFAULT '' NOT NULL,
	"anoPublicacao" integer,
	"quantidadeTotal" integer DEFAULT 1 NOT NULL,
	"quantidadeDisponivel" integer DEFAULT 1 NOT NULL,
	"localizacao" text DEFAULT '' NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookup_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "lookup_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"categoria" text NOT NULL,
	"valor" text NOT NULL,
	"label" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materiais" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professorId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"turmaNome" text NOT NULL,
	"disciplina" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"tipo" text NOT NULL,
	"conteudo" text NOT NULL,
	"nomeArquivo" text,
	"tamanhoArquivo" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remetenteId" text NOT NULL,
	"remetenteNome" text NOT NULL,
	"tipo" text NOT NULL,
	"turmaId" varchar,
	"turmaNome" text,
	"destinatarioId" text,
	"destinatarioNome" text,
	"destinatarioTipo" text,
	"assunto" text NOT NULL,
	"corpo" text NOT NULL,
	"lidaPor" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens_financeiras" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"remetente" text NOT NULL,
	"texto" text NOT NULL,
	"data" text NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"tipo" text DEFAULT 'geral' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimentos_saldo" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"tipo" text NOT NULL,
	"valor" real NOT NULL,
	"descricao" text NOT NULL,
	"pagamentoId" varchar,
	"criadoPor" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "municipios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	"provinciaId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"trimestre" integer NOT NULL,
	"aval1" integer DEFAULT 0 NOT NULL,
	"aval2" integer DEFAULT 0 NOT NULL,
	"aval3" integer DEFAULT 0 NOT NULL,
	"aval4" integer DEFAULT 0 NOT NULL,
	"aval5" integer DEFAULT 0 NOT NULL,
	"aval6" integer DEFAULT 0 NOT NULL,
	"aval7" integer DEFAULT 0 NOT NULL,
	"aval8" integer DEFAULT 0 NOT NULL,
	"mac1" integer DEFAULT 0 NOT NULL,
	"pp1" integer DEFAULT 0 NOT NULL,
	"ppt" integer DEFAULT 0 NOT NULL,
	"mt1" integer DEFAULT 0 NOT NULL,
	"nf" integer DEFAULT 0 NOT NULL,
	"mac" integer DEFAULT 0 NOT NULL,
	"anoLetivo" text NOT NULL,
	"professorId" varchar NOT NULL,
	"data" text NOT NULL,
	"lancamentos" jsonb,
	"camposAbertos" jsonb DEFAULT '[]'::jsonb,
	"pedidosReabertura" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "notificacoes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text NOT NULL,
	"tipo" text DEFAULT 'info' NOT NULL,
	"data" text NOT NULL,
	"lida" boolean DEFAULT false NOT NULL,
	"link" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ocorrencias" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"professorId" varchar,
	"registadoPor" text NOT NULL,
	"tipo" text NOT NULL,
	"gravidade" text DEFAULT 'leve' NOT NULL,
	"descricao" text NOT NULL,
	"medidaTomada" text DEFAULT '' NOT NULL,
	"data" text NOT NULL,
	"resolvida" boolean DEFAULT false NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagamentos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"taxaId" varchar NOT NULL,
	"valor" real NOT NULL,
	"data" text NOT NULL,
	"mes" integer,
	"trimestre" integer,
	"ano" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"metodoPagamento" text NOT NULL,
	"referencia" text,
	"observacao" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pap_alunos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"anoLetivo" text NOT NULL,
	"notaEstagio" real,
	"notaDefesa" real,
	"notasDisciplinas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notaPAP" real,
	"professorId" varchar NOT NULL,
	"observacoes" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "pautas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"trimestre" integer NOT NULL,
	"professorId" varchar NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"anoLetivo" text NOT NULL,
	"dataFecho" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planificacoes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professorId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"trimestre" integer NOT NULL,
	"semana" integer NOT NULL,
	"anoLetivo" text NOT NULL,
	"tema" text NOT NULL,
	"objectivos" text DEFAULT '' NOT NULL,
	"conteudos" text DEFAULT '' NOT NULL,
	"metodologia" text DEFAULT '' NOT NULL,
	"recursos" text DEFAULT '' NOT NULL,
	"avaliacao" text DEFAULT '' NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"numAulas" integer DEFAULT 1 NOT NULL,
	"cumprida" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plano_contas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" text NOT NULL,
	"parentId" varchar,
	"descricao" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planos_aula" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professorId" varchar NOT NULL,
	"professorNome" text NOT NULL,
	"turmaId" varchar,
	"turmaNome" text DEFAULT '' NOT NULL,
	"disciplina" text NOT NULL,
	"unidade" text DEFAULT '' NOT NULL,
	"sumario" text DEFAULT '' NOT NULL,
	"classe" text DEFAULT '' NOT NULL,
	"escola" text DEFAULT '' NOT NULL,
	"perfilEntrada" text DEFAULT '' NOT NULL,
	"perfilSaida" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"periodo" text DEFAULT '' NOT NULL,
	"tempo" text DEFAULT '' NOT NULL,
	"duracao" text DEFAULT '' NOT NULL,
	"anoLetivo" text DEFAULT '' NOT NULL,
	"objectivoGeral" text DEFAULT '' NOT NULL,
	"objectivosEspecificos" text DEFAULT '' NOT NULL,
	"fases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"observacaoDirector" text,
	"aprovadoPor" text,
	"aprovadoEm" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presencas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"data" text NOT NULL,
	"status" text NOT NULL,
	"observacao" text
);
--> statement-breakpoint
CREATE TABLE "processos_secretaria" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"solicitante" text NOT NULL,
	"prazo" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"criadoPor" text DEFAULT 'Secretaria' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numeroProfessor" text NOT NULL,
	"nome" text NOT NULL,
	"apelido" text NOT NULL,
	"disciplinas" jsonb NOT NULL,
	"turmasIds" jsonb NOT NULL,
	"telefone" text NOT NULL,
	"email" text NOT NULL,
	"habilitacoes" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"seccao" text DEFAULT '' NOT NULL,
	"cargo" text DEFAULT 'Professor',
	"categoria" text DEFAULT '',
	"salarioBase" real DEFAULT 0,
	"subsidioAlimentacao" real DEFAULT 0,
	"subsidioTransporte" real DEFAULT 0,
	"subsidioHabitacao" real DEFAULT 0,
	"dataContratacao" text,
	"tipoContrato" text DEFAULT 'efectivo',
	"valorPorTempoLectivo" real DEFAULT 0,
	"temposSemanais" integer DEFAULT 0,
	"nivelEnsino" text DEFAULT 'I Ciclo' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professores_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "provincias" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "provincias_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nome" text NOT NULL,
	CONSTRAINT "provincias_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"utilizadorId" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"userAgent" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "quadro_honra" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"alunoNome" text NOT NULL,
	"turmaId" varchar NOT NULL,
	"turmaNome" text NOT NULL,
	"anoLetivo" text NOT NULL,
	"trimestre" integer,
	"mediaGeral" real DEFAULT 0 NOT NULL,
	"posicaoClasse" integer DEFAULT 1 NOT NULL,
	"posicaoGeral" integer,
	"melhorEscola" boolean DEFAULT false NOT NULL,
	"mencionado" text DEFAULT '' NOT NULL,
	"publicado" boolean DEFAULT false NOT NULL,
	"geradoPor" text DEFAULT 'Sistema' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registos_falta_mensal" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"trimestre" integer DEFAULT 1 NOT NULL,
	"totalFaltas" integer DEFAULT 0 NOT NULL,
	"faltasJustificadas" integer DEFAULT 0 NOT NULL,
	"faltasInjustificadas" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'normal' NOT NULL,
	"observacao" text DEFAULT '' NOT NULL,
	"registadoPor" text DEFAULT '' NOT NULL,
	"registadoPorId" varchar,
	"dataRegisto" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registros" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomeCompleto" text NOT NULL,
	"dataNascimento" text NOT NULL,
	"genero" text NOT NULL,
	"provincia" text NOT NULL,
	"municipio" text NOT NULL,
	"telefone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"endereco" text DEFAULT '' NOT NULL,
	"bairro" text DEFAULT '' NOT NULL,
	"numeroBi" text DEFAULT '' NOT NULL,
	"numeroCedula" text DEFAULT '' NOT NULL,
	"nivel" text NOT NULL,
	"classe" text NOT NULL,
	"cursoId" varchar,
	"nomeEncarregado" text NOT NULL,
	"telefoneEncarregado" text NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"senhaProvisoria" text,
	"dataProva" text,
	"notaAdmissao" real,
	"resultadoAdmissao" text,
	"matriculaCompleta" boolean DEFAULT false NOT NULL,
	"rupeInscricao" text,
	"rupeMatricula" text,
	"avaliadoEm" text,
	"avaliadoPor" text,
	"motivoRejeicao" text,
	"tipoInscricao" text DEFAULT 'novo' NOT NULL,
	"pagamentoInscricaoConfirmado" boolean DEFAULT false NOT NULL,
	"pagamentoInscricaoConfirmadoEm" text,
	"pagamentoInscricaoConfirmadoPor" text,
	"pagamentoMatriculaConfirmado" boolean DEFAULT false NOT NULL,
	"pagamentoMatriculaConfirmadoEm" text,
	"pagamentoMatriculaConfirmadoPor" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rupes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"taxaId" varchar NOT NULL,
	"valor" real NOT NULL,
	"referencia" text NOT NULL,
	"dataGeracao" text NOT NULL,
	"dataValidade" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"bloco" text DEFAULT '' NOT NULL,
	"capacidade" integer DEFAULT 30 NOT NULL,
	"tipo" text DEFAULT 'Sala Normal' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saldo_alunos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"saldo" real DEFAULT 0 NOT NULL,
	"dataProximaCobranca" text,
	"observacoes" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saldo_alunos_alunoId_unique" UNIQUE("alunoId")
);
--> statement-breakpoint
CREATE TABLE "solicitacoes_abertura" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pautaId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"turmaNome" text NOT NULL,
	"disciplina" text NOT NULL,
	"trimestre" integer NOT NULL,
	"professorId" varchar NOT NULL,
	"professorNome" text NOT NULL,
	"motivo" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"respondidoEm" text,
	"observacao" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "solicitacoes_prova_justificada" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alunoId" varchar NOT NULL,
	"turmaId" varchar NOT NULL,
	"disciplina" text NOT NULL,
	"anoLetivo" text NOT NULL,
	"trimestre" integer NOT NULL,
	"tipoProva" text DEFAULT 'teste' NOT NULL,
	"dataProvaOriginal" text NOT NULL,
	"dataProvaJustificada" text,
	"motivo" text NOT NULL,
	"documentoJustificacao" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"resposta" text DEFAULT '' NOT NULL,
	"respondidoPor" text DEFAULT '' NOT NULL,
	"respondidoEm" text,
	"solicitadoPor" text NOT NULL,
	"solicitadoPorId" varchar,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sumarios" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"professorId" varchar NOT NULL,
	"professorNome" text NOT NULL,
	"turmaId" varchar NOT NULL,
	"turmaNome" text NOT NULL,
	"disciplina" text NOT NULL,
	"data" text NOT NULL,
	"horaInicio" text NOT NULL,
	"horaFim" text NOT NULL,
	"numeroAula" integer NOT NULL,
	"conteudo" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"observacaoRH" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"valor" real NOT NULL,
	"frequencia" text NOT NULL,
	"nivel" text NOT NULL,
	"anoAcademico" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tempos_lectivos" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funcionarioId" varchar NOT NULL,
	"mes" integer NOT NULL,
	"ano" integer NOT NULL,
	"totalUnidades" integer DEFAULT 0 NOT NULL,
	"valorUnitario" real DEFAULT 0 NOT NULL,
	"totalCalculado" real DEFAULT 0 NOT NULL,
	"tipo" text DEFAULT 'professor' NOT NULL,
	"departamento" text DEFAULT '' NOT NULL,
	"observacoes" text DEFAULT '' NOT NULL,
	"aprovado" boolean DEFAULT false NOT NULL,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trabalhos_finais" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"titulo" text NOT NULL,
	"autor" text NOT NULL,
	"orientador" text NOT NULL,
	"anoConclusao" integer NOT NULL,
	"curso" text NOT NULL,
	"imagemCapa" text,
	"resumo" text DEFAULT '',
	"visitas" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"nomeAluno" text NOT NULL,
	"alunoId" varchar,
	"escolaOrigem" text,
	"escolaDestino" text,
	"classeOrigem" text,
	"classeDestino" text,
	"turmaDestinoId" varchar,
	"motivo" text,
	"observacoes" text,
	"documentosRecebidos" jsonb DEFAULT '[]'::jsonb,
	"dataRequisicao" text,
	"dataAprovacao" text,
	"dataConclusao" text,
	"criadoPor" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turmas" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"classe" text NOT NULL,
	"turno" text NOT NULL,
	"anoLetivo" text NOT NULL,
	"nivel" text NOT NULL,
	"professorId" varchar,
	"professoresIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cursoId" varchar,
	"sala" text NOT NULL,
	"capacidade" integer NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"permissoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_permissions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "utilizadores" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha" text NOT NULL,
	"role" text NOT NULL,
	"escola" text DEFAULT '' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"alunoId" varchar,
	"departamento" text,
	"cargo" text,
	"criadoEm" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utilizadores_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alunos" ADD CONSTRAINT "alunos_cursoId_cursos_id_fk" FOREIGN KEY ("cursoId") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anulacoes_matricula" ADD CONSTRAINT "anulacoes_matricula_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliacoes_professores" ADD CONSTRAINT "avaliacoes_professores_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bolsas" ADD CONSTRAINT "bolsas_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "configuracoes_falta" ADD CONSTRAINT "configuracoes_falta_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curso_disciplinas" ADD CONSTRAINT "curso_disciplinas_cursoId_cursos_id_fk" FOREIGN KEY ("cursoId") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curso_disciplinas" ADD CONSTRAINT "curso_disciplinas_disciplinaId_disciplinas_id_fk" FOREIGN KEY ("disciplinaId") REFERENCES "public"."disciplinas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disciplinas" ADD CONSTRAINT "disciplinas_cursoId_cursos_id_fk" FOREIGN KEY ("cursoId") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emprestimos" ADD CONSTRAINT "emprestimos_livroId_livros_id_fk" FOREIGN KEY ("livroId") REFERENCES "public"."livros"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusoes_falta" ADD CONSTRAINT "exclusoes_falta_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusoes_falta" ADD CONSTRAINT "exclusoes_falta_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faltas_funcionarios" ADD CONSTRAINT "faltas_funcionarios_funcionarioId_funcionarios_id_fk" FOREIGN KEY ("funcionarioId") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "horarios" ADD CONSTRAINT "horarios_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itens_folha" ADD CONSTRAINT "itens_folha_folhaId_folhas_salarios_id_fk" FOREIGN KEY ("folhaId") REFERENCES "public"."folhas_salarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiais" ADD CONSTRAINT "materiais_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_financeiras" ADD CONSTRAINT "mensagens_financeiras_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentos_saldo" ADD CONSTRAINT "movimentos_saldo_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "municipios" ADD CONSTRAINT "municipios_provinciaId_provincias_id_fk" FOREIGN KEY ("provinciaId") REFERENCES "public"."provincias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas" ADD CONSTRAINT "notas_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ocorrencias" ADD CONSTRAINT "ocorrencias_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_taxaId_taxas_id_fk" FOREIGN KEY ("taxaId") REFERENCES "public"."taxas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pap_alunos" ADD CONSTRAINT "pap_alunos_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pap_alunos" ADD CONSTRAINT "pap_alunos_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pap_alunos" ADD CONSTRAINT "pap_alunos_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pautas" ADD CONSTRAINT "pautas_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pautas" ADD CONSTRAINT "pautas_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planificacoes" ADD CONSTRAINT "planificacoes_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planificacoes" ADD CONSTRAINT "planificacoes_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadro_honra" ADD CONSTRAINT "quadro_honra_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quadro_honra" ADD CONSTRAINT "quadro_honra_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registos_falta_mensal" ADD CONSTRAINT "registos_falta_mensal_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registos_falta_mensal" ADD CONSTRAINT "registos_falta_mensal_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registros" ADD CONSTRAINT "registros_cursoId_cursos_id_fk" FOREIGN KEY ("cursoId") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rupes" ADD CONSTRAINT "rupes_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rupes" ADD CONSTRAINT "rupes_taxaId_taxas_id_fk" FOREIGN KEY ("taxaId") REFERENCES "public"."taxas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saldo_alunos" ADD CONSTRAINT "saldo_alunos_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_abertura" ADD CONSTRAINT "solicitacoes_abertura_pautaId_pautas_id_fk" FOREIGN KEY ("pautaId") REFERENCES "public"."pautas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_abertura" ADD CONSTRAINT "solicitacoes_abertura_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_abertura" ADD CONSTRAINT "solicitacoes_abertura_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_prova_justificada" ADD CONSTRAINT "solicitacoes_prova_justificada_alunoId_alunos_id_fk" FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "solicitacoes_prova_justificada" ADD CONSTRAINT "solicitacoes_prova_justificada_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sumarios" ADD CONSTRAINT "sumarios_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sumarios" ADD CONSTRAINT "sumarios_turmaId_turmas_id_fk" FOREIGN KEY ("turmaId") REFERENCES "public"."turmas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tempos_lectivos" ADD CONSTRAINT "tempos_lectivos_funcionarioId_funcionarios_id_fk" FOREIGN KEY ("funcionarioId") REFERENCES "public"."funcionarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_professorId_professores_id_fk" FOREIGN KEY ("professorId") REFERENCES "public"."professores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turmas" ADD CONSTRAINT "turmas_cursoId_cursos_id_fk" FOREIGN KEY ("cursoId") REFERENCES "public"."cursos"("id") ON DELETE no action ON UPDATE no action;