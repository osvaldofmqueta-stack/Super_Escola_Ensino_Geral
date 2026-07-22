-- Art. 23º §3 e §4 — Exame Extraordinário
-- Adiciona suporte a matrícula condicional e exames extraordinários multi-ano

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS "matriculaCondicional" boolean NOT NULL DEFAULT false;

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS "disciplinasCondicionais" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.exames_extraordinarios (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "alunoId" varchar NOT NULL,
  "alunoNome" text NOT NULL,
  "alunoNumeroMatricula" text NOT NULL DEFAULT '',
  "turmaIdOrigem" varchar NOT NULL,
  "turmaNomeOrigem" text NOT NULL,
  "turmaIdAtual" varchar,
  "turmaNomeAtual" text,
  "disciplina" text NOT NULL,
  "anoLetivoOrigem" text NOT NULL,
  "anoLetivoAtual" text NOT NULL,
  "trimestre" integer NOT NULL DEFAULT 1,
  "nota" real,
  "notaAnterior" real,
  "resultado" text NOT NULL DEFAULT 'pendente',
  "status" text NOT NULL DEFAULT 'pendente',
  "dataExame" text,
  "professorId" varchar,
  "professorNome" text,
  "observacoes" text,
  "registadoPor" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exames_ext_aluno
  ON public.exames_extraordinarios ("alunoId");

CREATE INDEX IF NOT EXISTS idx_exames_ext_ano
  ON public.exames_extraordinarios ("anoLetivoAtual");

CREATE UNIQUE INDEX IF NOT EXISTS idx_exames_ext_unique
  ON public.exames_extraordinarios ("alunoId", "disciplina", "anoLetivoOrigem");
