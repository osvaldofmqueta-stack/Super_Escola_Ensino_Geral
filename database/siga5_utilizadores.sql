-- SIGA v3 — Seed de utilizadores
-- Execute com: npm run db:seed:utilizadores

SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA public;

CREATE TABLE IF NOT EXISTS public.utilizadores (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL,
  senha text NOT NULL,
  role text NOT NULL,
  escola text,
  ativo boolean NOT NULL DEFAULT true,
  "alunoId" varchar,
  "criadoEm" timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT *
    FROM (VALUES
      ('5f50cc2d-84be-4202-8167-2cc7b8862eda'::varchar, 'Administrador do Sistema'::text,   'admin@sige.ao'::text,       'Admin@2025'::text,       'admin'::text,            'Escola SIGA'::text, true::boolean),
      ('usr_ceo'::varchar,                              'Administrador QUETA'::text,        'ceo@sige.ao'::text,         'Ceo@2025'::text,         'ceo'::text,              'Escola SIGA'::text, true::boolean),
      ('03005167-7173-49fd-b587-1947ace982bd'::varchar, 'CEO Escolar'::text,                'ceo2@sige.ao'::text,        'Ceo@2025'::text,         'ceo'::text,              ''::text,            true::boolean),
      ('3e8fafbe-66b8-4f2a-8d7a-0572698b9fea'::varchar, 'Director Académico'::text,         'director@sige.ao'::text,    'Director@2025'::text,    'director'::text,         'Escola SIGA'::text, true::boolean),
      ('329d8b64-dbb9-4309-88a4-b72fbe72efea'::varchar, 'Encarregado de Educação'::text,    'encarregado@sige.ao'::text, 'Enc@2025'::text,         'encarregado'::text,      'Escola SIGA'::text, true::boolean),
      ('a65cf916-e5c1-452f-86c5-22c9744a042c'::varchar, 'PCA Escolar'::text,                'pca@sige.ao'::text,         'PCA@2025'::text,         'pca'::text,              'Escola SIGA'::text, true::boolean),
      ('285cafb9-076a-47af-ae22-ef47b65c5268'::varchar, 'Professor Exemplo'::text,          'professor@sige.ao'::text,   'Prof@2025'::text,        'professor'::text,        'Escola SIGA'::text, true::boolean),
      ('usr_secretaria_001'::varchar,                   'Secretária Académica'::text,       'secretaria@sige.ao'::text,  'Secretaria@2025'::text,  'secretaria'::text,       'Escola SIGA'::text, true::boolean),
      ('usr_chefe_sec_001'::varchar,                    'Chefe de Secretaria'::text,        'chefe.sec@sige.ao'::text,   'ChefeSec@2025'::text,    'chefe_secretaria'::text, 'Escola SIGA'::text, true::boolean),
      ('usr_pedagogico_001'::varchar,                   'Responsável Pedagógico'::text,     'pedagogico@sige.ao'::text,  'Pedagogico@2025'::text,  'pedagogico'::text,       'Escola SIGA'::text, true::boolean),
      ('usr_financeiro_001'::varchar,                   'Gestor Financeiro'::text,          'financeiro@sige.ao'::text,  'Financeiro@2025'::text,  'financeiro'::text,       'Escola SIGA'::text, true::boolean),
      ('usr_rh_001'::varchar,                           'Gestor de Recursos Humanos'::text, 'rh@sige.ao'::text,          'RH@2025'::text,          'rh'::text,               'Escola SIGA'::text, true::boolean)
    ) AS t(id, nome, email, senha, role, escola, ativo)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.utilizadores WHERE id = u.id OR email = u.email
    ) THEN
      INSERT INTO public.utilizadores (id, nome, email, senha, role, escola, ativo)
      VALUES (u.id, u.nome, u.email, u.senha, u.role, u.escola, u.ativo);
    END IF;
  END LOOP;
END $$;
