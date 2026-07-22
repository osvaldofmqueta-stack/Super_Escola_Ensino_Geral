-- ─────────────────────────────────────────────────────────────────────────────
-- SAF-T Angola (AGT) — Tabelas de suporte à conformidade fiscal
-- Decreto Presidencial n.º 71/25, de 20 de Março de 2025
-- ─────────────────────────────────────────────────────────────────────────────

-- Sequenciador por série e ano (garante numeração sem lacunas e sem duplicados)
CREATE TABLE IF NOT EXISTS public.saft_sequencias (
  id          SERIAL PRIMARY KEY,
  serie       TEXT NOT NULL,         -- ex: 'PROP', 'MAT', 'MUL', 'EXA', 'OUT'
  ano         INTEGER NOT NULL,      -- ex: 2025
  ultimo_num  INTEGER NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (serie, ano)
);

-- Hash chain por documento (garante imutabilidade — cada hash referencia o anterior)
CREATE TABLE IF NOT EXISTS public.saft_hashes (
  id              SERIAL PRIMARY KEY,
  pagamento_id    TEXT NOT NULL UNIQUE REFERENCES public.pagamentos(id),
  numero_serie    TEXT NOT NULL,     -- ex: 'PROP 2025/47'
  serie           TEXT NOT NULL,
  ano             INTEGER NOT NULL,
  sequencial      INTEGER NOT NULL,
  hash_doc        TEXT NOT NULL,     -- SHA-256 deste documento
  hash_anterior   TEXT NOT NULL,     -- SHA-256 do documento anterior (ou '0' se for o 1.º)
  data_emissao    TEXT NOT NULL,
  valor_bruto     REAL NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saft_hashes_serie_ano ON public.saft_hashes (serie, ano, sequencial);

-- Colunas auxiliares na tabela pagamentos (retrocompatíveis — nullable)
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS "numeroSerie"  TEXT;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS "hashDoc"      TEXT;
ALTER TABLE public.pagamentos ADD COLUMN IF NOT EXISTS "hashAnterior" TEXT;

-- Historial de exportações SAF-T
CREATE TABLE IF NOT EXISTS public.saft_exportacoes (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ano           INTEGER NOT NULL,
  mes_inicio    INTEGER,
  mes_fim       INTEGER,
  total_docs    INTEGER NOT NULL DEFAULT 0,
  total_valor   REAL NOT NULL DEFAULT 0,
  gerado_por    TEXT,
  gerado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nome_ficheiro TEXT
);
