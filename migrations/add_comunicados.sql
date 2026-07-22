CREATE TABLE IF NOT EXISTS public.comunicados (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  destinatarios TEXT NOT NULL DEFAULT 'todos',
  imagem_url TEXT NOT NULL DEFAULT '',
  duracao INTEGER NOT NULL DEFAULT 5,
  bg_color TEXT NOT NULL DEFAULT '#0A1628',
  data_inicio TEXT NOT NULL DEFAULT '',
  data_fim TEXT NOT NULL DEFAULT '',
  ativa BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_comunicados_criado_em ON public.comunicados (criado_em DESC);
