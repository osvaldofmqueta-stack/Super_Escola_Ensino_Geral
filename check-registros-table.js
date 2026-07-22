#!/usr/bin/env node

/**
 * Script para verificar tabela de registros
 */

async function checkRegistrosTable() {
  console.log('🔍 Verificando tabela registros...');
  
  try {
    // Import dinâmico
    const db = await import('./server/db.js');
    const { query } = db;
    
    // Verificar se tabela registros existe
    const result = await query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'registros'
    `);
    
    if (result[0]?.count > 0) {
      console.log('✅ Tabela registros existe no Neon');
      
      // Verificar estrutura da tabela
      const structure = await query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'registros'
        ORDER BY ordinal_position
      `);
      
      console.log('\n📋 Estrutura da tabela:');
      structure.forEach(col => {
        console.log(`  • ${col.column_name}: ${col.data_type} (${col.is_nullable})`);
      });
      
      // Contar registros
      const count = await query('SELECT COUNT(*) as total FROM registros');
      console.log(`\n📊 Total de registros: ${count[0]?.total || 0}`);
      
    } else {
      console.log('❌ Tabela registros NÃO existe no Neon');
      console.log('\n🔧 Criando tabela registros...');
      
      // Criar tabela registros
      await query(`
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
        )
      `);
      
      console.log('✅ Tabela registros criada com sucesso!');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkRegistrosTable();
