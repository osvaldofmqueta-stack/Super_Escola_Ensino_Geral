const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL });

// Ordem de classes para comparação
const CLASSE_ORDER = {
  '4ª Classe': 4, '4': 4,
  '5ª Classe': 5, '5': 5,
  '6ª Classe': 6, '6': 6,
  '7ª Classe': 7, '7': 7,
  '8ª Classe': 8, '8': 8,
  '9ª Classe': 9, '9': 9,
  '10ª Classe': 10, '10': 10,
  '11ª Classe': 11, '11': 11,
  '12ª Classe': 12, '12': 12,
  '13ª Classe': 13, '13': 13,
};

function classeNum(str) { return CLASSE_ORDER[str] || 0; }

async function run() {
  const turmas = await pool.query('SELECT id, nome, "cursoId", classe, nivel FROM turmas WHERE ativo = true');
  const disciplinas = await pool.query('SELECT id, nome, "cursoId", "classeInicio", "classeFim" FROM disciplinas WHERE ativo = true');
  
  let inserted = 0;
  let skipped = 0;

  for (const turma of turmas.rows) {
    const discsForTurma = [];
    
    for (const disc of disciplinas.rows) {
      let matches = false;
      
      // 1. Disciplina universal (sem cursoId e sem classeInicio) → aplica a todas as turmas
      if (!disc.cursoId && !disc.classeInicio) {
        matches = true;
      }
      
      // 2. Disciplina específica do curso → aplica quando cursoId coincide
      if (disc.cursoId && turma.cursoId && disc.cursoId === turma.cursoId) {
        matches = true;
      }
      
      // 3. Disciplina com range de classes (sem cursoId específico) → verifica se turma está no range
      if (!disc.cursoId && disc.classeInicio && disc.classeFim) {
        const turmaNum = classeNum(turma.classe);
        const inicioNum = classeNum(disc.classeInicio);
        const fimNum = classeNum(disc.classeFim);
        if (turmaNum >= inicioNum && turmaNum <= fimNum) {
          matches = true;
        }
      }
      
      if (matches) {
        discsForTurma.push(disc.id);
      }
    }
    
    // Inserir todas as ligações para esta turma
    for (let i = 0; i < discsForTurma.length; i++) {
      const discId = discsForTurma[i];
      try {
        await pool.query(
          'INSERT INTO turma_disciplinas ("turmaId", "disciplinaId", "ordem") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [turma.id, discId, i + 1]
        );
        inserted++;
      } catch (e) {
        // Ignorar conflitos
        skipped++;
      }
    }
    
    console.log(`[OK] ${turma.nome} (${turma.classe}) → ${discsForTurma.length} disciplinas`);
  }
  
  console.log(`\nTotal inseridas: ${inserted} | Ignoradas (duplicados): ${skipped}`);
  
  const total = await pool.query('SELECT COUNT(*) FROM turma_disciplinas');
  console.log(`Total em turma_disciplinas: ${total.rows[0].count}`);
  
  await pool.end();
}

run().catch(e => { console.error('Erro:', e.message); process.exit(1); });
