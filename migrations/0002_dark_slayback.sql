ALTER TABLE "config_geral" ADD COLUMN "licencaNivel" text DEFAULT 'rubi';--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "licencaPrecoPorAluno" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "licencaSaldoCredito" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percMac" real DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percPp" real DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percNt" real DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percPt" real DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percPg" real DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "percExame" real DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "config_geral" ADD COLUMN "provaRecuperacaoHabilitada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "pg1" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "pg2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "ex1" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "ex2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notas" ADD COLUMN "provaRecuperacao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "utilizadores" ADD COLUMN "avatar" text;