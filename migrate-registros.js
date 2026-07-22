#!/usr/bin/env node

/**
 * Script para criar tabela registros via Drizzle
 */

async function createRegistrosTable() {
  console.log('🔧 Criando tabela registros no Neon...');
  
  try {
    const { Pool } = require('pg');
    require('dotenv').config();
    
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    // Ler e executar SQL
    const fs = require('fs');
    const sql = fs.readFileSync('create-registros-table.sql', 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Tabela registros criada com sucesso!');
    
    // Verificar se foi criada
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'registros'
    `);
    
    if (result.rows[0].count > 0) {
      console.log('✅ Confirmação: Tabela registros existe no Neon!');
      
      // Mostrar estrutura
      const structure = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'registros'
        ORDER BY ordinal_position
        LIMIT 10
      `);
      
      console.log('\n📋 Primeiras colunas:');
      structure.rows.forEach(col => {
        console.log(`  • ${col.column_name}: ${col.data_type}`);
      });
    }
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

createRegistrosTable();
