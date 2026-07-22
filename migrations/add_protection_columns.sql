-- Colunas de protecção anti-clonagem
ALTER TABLE public.config_geral
  ADD COLUMN IF NOT EXISTS "serverFingerprint" text,
  ADD COLUMN IF NOT EXISTS "dominiosAutorizados" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "antiClonagemAtivo" boolean NOT NULL DEFAULT true;

-- Tabela de alertas de segurança (se não existir)
CREATE TABLE IF NOT EXISTS public.alertas_seguranca (
  id text PRIMARY KEY,
  tipo text NOT NULL,
  descricao text,
  "criadoEm" timestamptz NOT NULL DEFAULT now(),
  "resolvidoEm" timestamptz,
  resolvido boolean NOT NULL DEFAULT false,
  metadados jsonb
);

CREATE INDEX IF NOT EXISTS idx_alertas_seguranca_tipo ON public.alertas_seguranca(tipo);
CREATE INDEX IF NOT EXISTS idx_alertas_seguranca_criado ON public.alertas_seguranca("criadoEm" DESC);
