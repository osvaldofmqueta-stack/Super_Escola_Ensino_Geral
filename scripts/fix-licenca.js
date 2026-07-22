const { Pool } = require('pg');
const NEON_URL = process.env.NEON_DATABASE_URL;
const LOCAL_URL = process.env.DATABASE_URL;
const url = NEON_URL || LOCAL_URL;
const pool = new Pool({ connectionString: url, ...(NEON_URL ? { ssl: { rejectUnauthorized: false } } : {}) });
async function main() {
  const r = await pool.query(`
    UPDATE public.config_geral SET
      "licencaPlano"     = 'anual',
      "licencaNivel"     = 'rubi',
      "licencaAtivacao"  = '2026-06-12',
      "licencaExpiracao" = '2027-06-12'
  `);
  console.log('Linhas actualizadas:', r.rowCount);
  await pool.end();
}
main().then(() => console.log('Licença reposta para anual/rubi!')).catch(e => { console.error(e); process.exit(1); });
