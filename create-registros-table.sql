-- Criar tabela de registros para matrículas no Neon PostgreSQL
CREATE TABLE IF NOT EXISTS registros (
  id TEXT PRIMARY KEY,
  "nomeCompleto" TEXT NOT NULL,
  "dataNascimento" TEXT NOT NULL,
  "genero" TEXT,
  "provincia" TEXT,
  "municipio" TEXT,
  "telefone" TEXT,
  "email" TEXT,
  "endereco" TEXT,
  "bairro" TEXT,
  "numeroBi" TEXT,
  "numeroCedula" TEXT,
  "nivel" TEXT,
  "classe" TEXT,
  "cursoId" TEXT,
  "nomeEncarregado" TEXT,
  "telefoneEncarregado" TEXT,
  "observacoes" TEXT,
  "status" TEXT DEFAULT 'pendente',
  "senhaProvisoria" TEXT,
  "criadoEm" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "avaliadoEm" TIMESTAMP,
  "avaliadoPor" TEXT,
  "motivoRejeicao" TEXT,
  "dataProva" TEXT,
  "notaAdmissao" INTEGER,
  "resultadoAdmissao" TEXT,
  "matriculaCompleta" BOOLEAN DEFAULT false,
  "rupeInscricao" TEXT,
  "rupeMatricula" TEXT
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_registros_email ON registros(email);
CREATE INDEX IF NOT EXISTS idx_registros_status ON registros(status);
CREATE INDEX IF NOT EXISTS idx_registros_criadoEm ON registros("criadoEm");
