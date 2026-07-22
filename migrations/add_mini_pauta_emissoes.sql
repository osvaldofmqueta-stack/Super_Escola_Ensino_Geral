-- Tabela de histórico de emissão de mini-pautas
CREATE TABLE IF NOT EXISTS public.mini_pauta_emissoes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  "turmaId" VARCHAR NOT NULL,
  "turmaNome" TEXT,
  "turmaClasse" TEXT,
  "anoLetivo" TEXT NOT NULL,
  trimestre INTEGER,
  disciplina TEXT,
  "templateId" VARCHAR,
  "templateNome" TEXT,
  "emitidoPorId" VARCHAR NOT NULL,
  "emitidoPorNome" TEXT,
  "emitidoPorRole" TEXT,
  formato TEXT NOT NULL DEFAULT 'pdf',
  "emitidoEm" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mini_pauta_emissoes_turma ON public.mini_pauta_emissoes("turmaId");
CREATE INDEX IF NOT EXISTS idx_mini_pauta_emissoes_ano_tri ON public.mini_pauta_emissoes("anoLetivo", trimestre);
CREATE INDEX IF NOT EXISTS idx_mini_pauta_emissoes_emitido_por ON public.mini_pauta_emissoes("emitidoPorId");
