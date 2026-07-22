-- Migration: adicionar campos de tempo lectivo à tabela funcionarios
-- Data: 2026-05-08

ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS "valorPorTempoLectivo" real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "temposSemanais" integer NOT NULL DEFAULT 0;
