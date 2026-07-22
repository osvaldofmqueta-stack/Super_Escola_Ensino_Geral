/**
 * sync-neon-to-local.js
 * Copia todos os dados do Neon (produção) para a DB local do Replit.
 * Uso: node scripts/sync-neon-to-local.js
 *
 * NOTAS IMPORTANTES:
 * - O Neon tem search_path vazio por defeito — este script define explicitamente.
 * - Tabelas com PKs identity (provincias, municipios, lookup_items) são copiadas
 *   sem o campo id (auto-gerado localmente).
 * - Campos JSON/JSONB são serializados correctamente antes do INSERT.
 * - session_replication_role=replica desactiva FKs durante a carga.
 */
const { Client } = require('pg');

const NEON_URL = process.env.NEON_DATABASE_URL;
const LOCAL_URL = process.env.DATABASE_URL;

// Tabelas a excluir completamente
const SKIP = new Set([
  '__drizzle_migrations',
  'disciplina_deleted_seeds', 'doc_deleted_seeds',
  'feriado_deleted_seeds', 'horario_deleted_turmas', 'lookup_deleted_seeds',
]);

// Tabelas com PK gerada automaticamente (GENERATED ALWAYS AS IDENTITY)
const IDENTITY_PK_TABLES = new Set([
  'provincias', 'municipios', 'lookup_items',
  'saft_hashes', 'saft_sequencias', 'login_approvals',
]);

function serializeValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object' && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

async function syncTable(src, dst, table) {
  const cntRes = await src.query(`SELECT COUNT(*) FROM public."${table}"`);
  const cnt = parseInt(cntRes.rows[0].count);
  if (cnt === 0) return { table, status: 'empty', rows: 0 };

  const nColsRes = await src.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  const lColsRes = await dst.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
    [table]
  );
  const lCols = new Set(lColsRes.rows.map(r => r.column_name));

  let cols = nColsRes.rows.map(r => r.column_name).filter(c => lCols.has(c));
  if (IDENTITY_PK_TABLES.has(table)) {
    cols = cols.filter(c => c !== 'id');
  }
  if (cols.length === 0) return { table, status: 'skip', reason: 'sem colunas comuns' };

  await dst.query(`DELETE FROM "${table}"`).catch(() => {});

  const colList = cols.map(c => `"${c}"`).join(',');
  let copied = 0, errs = 0;
  const BATCH = 300;

  for (let off = 0; off < cnt; off += BATCH) {
    const rows = await src.query(
      `SELECT ${cols.map(c => `"${c}"`).join(',')} FROM public."${table}" LIMIT ${BATCH} OFFSET ${off}`
    );
    for (const row of rows.rows) {
      const vals = cols.map(c => serializeValue(row[c]));
      const ph = vals.map((_, i) => `$${i + 1}`).join(',');
      await dst.query(
        `INSERT INTO "${table}" (${colList}) VALUES (${ph}) ON CONFLICT DO NOTHING`,
        vals
      ).then(() => copied++).catch(() => errs++);
    }
  }

  return { table, status: 'ok', rows: copied, total: cnt, errs };
}

async function main() {
  console.log('🔄 Sincronização Neon → Local\n');

  const src = new Client({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });
  const dst = new Client({ connectionString: LOCAL_URL });

  await src.connect();
  await dst.connect();

  // CRÍTICO: Neon tem search_path vazio
  await src.query('SET search_path = public');
  // Desactivar verificação de FKs durante carga em massa
  await dst.query('SET session_replication_role = replica');

  const neonRes = await src.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
  );
  const localRes = await dst.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
  );
  const localSet = new Set(localRes.rows.map(r => r.table_name));

  let tablesOk = 0, tablesEmpty = 0, tablesSkip = 0, totalRows = 0;

  for (const { table_name } of neonRes.rows) {
    if (SKIP.has(table_name)) { tablesSkip++; continue; }
    if (!localSet.has(table_name)) {
      console.log('⏭️  ' + table_name + ': não existe localmente');
      tablesSkip++; continue;
    }

    try {
      const res = await syncTable(src, dst, table_name);
      if (res.status === 'ok') {
        const note = res.errs > 0 ? ` (${res.errs} conflitos ignorados)` : '';
        console.log(`✅ ${res.table}: ${res.rows}/${res.total}${note}`);
        tablesOk++;
        totalRows += res.rows;
      } else if (res.status === 'empty') {
        tablesEmpty++;
      } else {
        console.log(`⏭️  ${res.table}: ${res.reason}`);
        tablesSkip++;
      }
    } catch (e) {
      console.log('❌ ' + table_name + ': ' + e.message.substring(0, 100));
    }
  }

  await dst.query('SET session_replication_role = DEFAULT');

  console.log('\n📊 RESUMO FINAL:');
  console.log('  ✅ Tabelas com dados copiados: ' + tablesOk);
  console.log('  ⬜ Tabelas vazias no Neon: ' + tablesEmpty);
  console.log('  ⏭️  Saltadas: ' + tablesSkip);
  console.log('  📝 Total de registos copiados: ' + totalRows);

  await src.end();
  await dst.end();
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
