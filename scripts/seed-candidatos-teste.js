/**
 * Seed 30 candidatos de teste para a lista de inscritos/admissão
 * 15 do I Ciclo (7ª, 8ª, 9ª) e 15 do II Ciclo (10ª, 11ª, 12ª, 13ª) com cursos
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const PROVINCIAS = ['Luanda', 'Benguela', 'Huambo', 'Bié', 'Malanje', 'Uíge', 'Zaire', 'Cabinda', 'Lunda Norte', 'Moxico'];
const MUNICIPIOS = ['Ingombota', 'Rangel', 'Cazenga', 'Sambizanga', 'Maianga', 'Kilamba', 'Viana', 'Cacuaco', 'Talatona', 'Lobito'];

const NOMES = [
  'Ana Maria Fernandes', 'João Pedro Silva', 'Maria da Conceição Neto', 'Carlos Eduardo Mendes',
  'Filomena Joana Lopes', 'António Manuel Costa', 'Rosa Beatriz Tavares', 'Pedro Augusto Carvalho',
  'Luísa Margarida Santos', 'Francisco Xavier Pinto', 'Beatriz Helena Rodrigues', 'Manuel Domingos Bessa',
  'Catarina Isabel Ferreira', 'Rui Alexandre Martins', 'Sofia Cristina Pereira',
  'David Mário Gonçalves', 'Marta Joana Alves', 'Paulo Sérgio Figueiredo', 'Ângela Filipa Castro',
  'Tiago Nuno Monteiro', 'Leonor Patrícia Sousa', 'Bruno Miguel Cardoso', 'Inês Raquel Correia',
  'Sérgio Filipe Andrade', 'Daniela Marta Ribeiro', 'Vasco Hugo Melo', 'Cristina Laura Azevedo',
  'Ricardo Luís Teixeira', 'Helena Sofia Cunha', 'Nuno Filipe Moreira'
];

const ENCARREGADOS = [
  'Manuel Fernandes', 'Maria Silva', 'José Neto', 'Luísa Mendes',
  'António Lopes', 'Rosa Costa', 'Pedro Tavares', 'Ana Carvalho',
  'Francisco Santos', 'Joana Pinto', 'Carlos Rodrigues', 'Filomena Bessa',
  'Domingos Ferreira', 'Helena Martins', 'Eduardo Pereira',
  'Mário Gonçalves', 'Paula Alves', 'Sérgio Figueiredo', 'Marta Castro',
  'Paulo Monteiro', 'Clara Sousa', 'Miguel Cardoso', 'Laura Correia',
  'Filipe Andrade', 'Graça Ribeiro', 'Hugo Melo', 'Júlia Azevedo',
  'Luís Teixeira', 'Sofia Cunha', 'Nuno Moreira'
];

// I Ciclo: 7ª, 8ª, 9ª — sem curso
const I_CICLO_CLASSES = [
  { classe: '7ª Classe', nivel: 'I Ciclo', cursoId: null, count: 5 },
  { classe: '8ª Classe', nivel: 'I Ciclo', cursoId: null, count: 5 },
  { classe: '9ª Classe', nivel: 'I Ciclo', cursoId: null, count: 5 },
];

// II Ciclo: 10ª, 11ª, 12ª, 13ª — com cursos
const II_CICLO_CLASSES = [
  { classe: '10ª Classe', nivel: 'II Ciclo', cursoId: 'curso-gi', count: 4 },
  { classe: '10ª Classe', nivel: 'II Ciclo', cursoId: 'curso-ce', count: 3 },
  { classe: '11ª Classe', nivel: 'II Ciclo', cursoId: 'curso-ct', count: 4 },
  { classe: '12ª Classe', nivel: 'II Ciclo', cursoId: 'curso-hum', count: 4 },
];

const STATUSES = ['pendente', 'pendente_pagamento', 'aguardando_prova', 'inscrito'];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomDate(startYear, endYear) {
  const y = randomBetween(startYear, endYear);
  const m = String(randomBetween(1, 12)).padStart(2, '0');
  const d = String(randomBetween(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function randomBi() {
  const digits = Array.from({length: 9}, () => randomBetween(0, 9)).join('');
  const letters = 'ABCDEFGHIJKLMNOPRSTUVXYZ';
  const suffix = randomItem(letters.split('')) + randomItem(letters.split('')) + randomBetween(10, 99).toString();
  return `${digits}${suffix}`;
}
function randomPhone() {
  const prefixes = ['923', '924', '925', '926', '927', '928', '929', '931', '932', '933'];
  return `+244 ${randomItem(prefixes)} ${randomBetween(100, 999)} ${randomBetween(100, 999)}`;
}
function gerarRupe() {
  const ano = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const seq = String(randomBetween(1000, 9999));
  return `RUPE-${ano}-${rand}-${seq}`;
}

async function checkCursosExist(client) {
  const cursoIds = ['curso-gi', 'curso-ce', 'curso-ct', 'curso-hum'];
  const res = await client.query(`SELECT id FROM public.cursos WHERE id = ANY($1)`, [cursoIds]);
  return res.rows.map(r => r.id);
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('🔍 A verificar cursos existentes...');
    const cursosExistentes = await checkCursosExist(client);
    console.log(`   Cursos encontrados: ${cursosExistentes.join(', ') || 'nenhum'}`);

    // Count existing test records
    const existing = await client.query(`SELECT COUNT(*) FROM public.registros WHERE email LIKE '%@teste.ao'`);
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`⚠️  Já existem ${existing.rows[0].count} candidatos de teste. A limpar...`);
      await client.query(`DELETE FROM public.registros WHERE email LIKE '%@teste.ao'`);
    }

    let nomeIdx = 0;
    let count = 0;

    async function inserir(classe, nivel, cursoId, genero) {
      const nome = NOMES[nomeIdx % NOMES.length];
      const encarregado = ENCARREGADOS[nomeIdx % ENCARREGADOS.length];
      nomeIdx++;

      // Validate cursoId - if curso doesn't exist in DB, set to null
      const validCursoId = cursoId && cursosExistentes.includes(cursoId) ? cursoId : null;

      const anoNasc = nivel === 'I Ciclo'
        ? randomBetween(2010, 2014)
        : randomBetween(2005, 2009);

      const id = `teste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const emailSlug = nome.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z.]/g, '').slice(0, 20);
      const email = `${emailSlug}${count}@teste.ao`;
      const status = randomItem(STATUSES);
      const rupe = gerarRupe();

      await client.query(`
        INSERT INTO public.registros (
          id, "nomeCompleto", "dataNascimento", genero, provincia, municipio,
          telefone, email, endereco, bairro, "numeroBi", "numeroCedula",
          nivel, classe, "cursoId", "nomeEncarregado", "telefoneEncarregado",
          observacoes, status, "senhaProvisoria", "tipoInscricao", "rupeInscricao", "origemInscricao"
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        ) ON CONFLICT (id) DO NOTHING`,
        [
          id, nome, `${anoNasc}-${String(randomBetween(1,12)).padStart(2,'0')}-${String(randomBetween(1,28)).padStart(2,'0')}`,
          genero, randomItem(PROVINCIAS), randomItem(MUNICIPIOS),
          randomPhone(), email,
          `Rua ${randomBetween(1,100)} de Outubro`, randomItem(['Rangel','Cazenga','Sambizanga','Maianga']),
          randomBi(), '',
          nivel, classe, validCursoId,
          encarregado, randomPhone(),
          '', status, 'Senha@123', 'novo', rupe, 'presencial'
        ]
      );
      count++;
    }

    console.log('\n📋 A inserir candidatos do I Ciclo...');
    for (const grp of I_CICLO_CLASSES) {
      for (let i = 0; i < grp.count; i++) {
        const genero = i % 2 === 0 ? 'Masculino' : 'Feminino';
        await inserir(grp.classe, grp.nivel, grp.cursoId, genero);
      }
      console.log(`   ✓ ${grp.count} candidatos inseridos para ${grp.classe}`);
    }

    console.log('\n📋 A inserir candidatos do II Ciclo...');
    for (const grp of II_CICLO_CLASSES) {
      for (let i = 0; i < grp.count; i++) {
        const genero = i % 2 === 0 ? 'Feminino' : 'Masculino';
        await inserir(grp.classe, grp.nivel, grp.cursoId, genero);
      }
      const cursoLabel = grp.cursoId ? `curso ${grp.cursoId.replace('curso-','').toUpperCase()}` : 'sem curso';
      console.log(`   ✓ ${grp.count} candidatos inseridos para ${grp.classe} (${cursoLabel})`);
    }

    // Verify
    const total = await client.query(`SELECT COUNT(*) FROM public.registros WHERE email LIKE '%@teste.ao'`);
    console.log(`\n✅ Total de candidatos de teste inseridos: ${total.rows[0].count}`);

    const byCiclo = await client.query(`
      SELECT nivel, classe, COUNT(*) as total FROM public.registros
      WHERE email LIKE '%@teste.ao'
      GROUP BY nivel, classe ORDER BY nivel, classe
    `);
    console.log('\nDistribuição:');
    for (const row of byCiclo.rows) {
      console.log(`   ${row.nivel} — ${row.classe}: ${row.total} candidatos`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌ Erro:', e.message); process.exit(1); });
