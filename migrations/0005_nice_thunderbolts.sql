CREATE TABLE IF NOT EXISTS "cartao_leituras" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "alunoId" varchar NOT NULL,
  "leitorUserId" varchar NOT NULL,
  "leitorNome" text,
  "resultado" text NOT NULL,
  "motivo" text,
  "mesesAtraso" integer DEFAULT 0 NOT NULL,
  "valorDivida" real DEFAULT 0 NOT NULL,
  "cartaoPago" boolean DEFAULT false NOT NULL,
  "anoLetivo" text NOT NULL,
  "origemLeitura" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "cartao_leituras" ADD CONSTRAINT "cartao_leituras_alunoId_alunos_id_fk"
    FOREIGN KEY ("alunoId") REFERENCES "public"."alunos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cartao_leituras_aluno" ON "cartao_leituras" ("alunoId", "createdAt" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cartao_leituras_data" ON "cartao_leituras" ("createdAt" DESC);
