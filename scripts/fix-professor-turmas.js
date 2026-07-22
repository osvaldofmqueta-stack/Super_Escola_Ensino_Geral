#!/usr/bin/env node
/**
 * Fix professor turmasIds — derived from the TURMAS seed definition
 * Run: node scripts/fix-professor-turmas.js
 */
import postgres from "postgres";

const DB_URL = process.env.NEON_DATABASE_URL;
if (!DB_URL) { console.error("NEON_DATABASE_URL not set"); process.exit(1); }

const sql = postgres(DB_URL, { ssl: "require" });

// Mapping: seed prof-id → list of turma-ids (from TURMAS[].profs arrays)
const TURMAS = [
  { id: "turma-4-a",     profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-4-b",     profs: ["prof-rosa","prof-jose","prof-tomas"] },
  { id: "turma-5-a",     profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-5-b",     profs: ["prof-rosa","prof-jose","prof-tomas"] },
  { id: "turma-6-a",     profs: ["prof-jose","prof-rosa","prof-tomas"] },
  { id: "turma-6-b",     profs: ["prof-rosa","prof-jose","prof-tomas"] },
  { id: "turma-7-a",     profs: ["prof-paulo","prof-ana","prof-eduardo","prof-maria-h","prof-tomas"] },
  { id: "turma-7-b",     profs: ["prof-ana","prof-paulo","prof-eduardo","prof-maria-h","prof-tomas"] },
  { id: "turma-8-a",     profs: ["prof-paulo","prof-ana","prof-eduardo","prof-maria-h","prof-carlos","prof-tomas"] },
  { id: "turma-8-b",     profs: ["prof-ana","prof-paulo","prof-carlos","prof-tomas"] },
  { id: "turma-9-a",     profs: ["prof-paulo","prof-eduardo","prof-carlos","prof-maria-h","prof-tomas"] },
  { id: "turma-9-b",     profs: ["prof-eduardo","prof-ana","prof-carlos","prof-tomas"] },
  { id: "turma-10-gi-a", profs: ["prof-pedro","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-10-gi-b", profs: ["prof-carlos","prof-pedro","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-gi-a", profs: ["prof-beatriz","prof-pedro","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-gi-b", profs: ["prof-pedro","prof-beatriz","prof-carlos","prof-tomas"] },
  { id: "turma-12-gi-a", profs: ["prof-carlos","prof-pedro","prof-beatriz","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-13-gi-a", profs: ["prof-beatriz","prof-antonio","prof-carlos","prof-maria-h","prof-pedro","prof-fernanda","prof-tomas"] },
  { id: "turma-10-ce-a", profs: ["prof-sandra","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-11-ce-a", profs: ["prof-sandra","prof-carlos","prof-maria-h","prof-fernanda","prof-antonio","prof-tomas"] },
  { id: "turma-12-ce-a", profs: ["prof-fernanda","prof-sandra","prof-carlos","prof-tomas"] },
  { id: "turma-13-ce-a", profs: ["prof-sandra","prof-fernanda","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-10-ct-a", profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-11-ct-a", profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-12-ct-a", profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-13-ct-a", profs: ["prof-rui","prof-carlos","prof-maria-h","prof-antonio","prof-tomas"] },
  { id: "turma-10-hum-a",profs: ["prof-david","prof-antonio","prof-carlos","prof-maria-h","prof-tomas"] },
  { id: "turma-11-hum-a",profs: ["prof-david","prof-antonio","prof-carlos","prof-maria-h","prof-tomas"] },
];

// Build reverse map: prof-seed-id → Set<turma-id>
const profToTurmas = {};
for (const t of TURMAS) {
  for (const p of t.profs) {
    if (!profToTurmas[p]) profToTurmas[p] = new Set();
    profToTurmas[p].add(t.id);
  }
}

// Map seed prof-id → numeric professor id in DB
const SEED_TO_DB_ID = {
  "prof-antonio":  "prof-antonio",
  "prof-beatriz":  "prof-beatriz",
  "prof-jose":     "prof-jose",
  "prof-paulo":    "prof-paulo",
  "prof-carlos":   "prof-carlos",
  "prof-maria-h":  "prof-maria-h",
  "prof-pedro":    "prof-pedro",
  "prof-fernanda": "prof-fernanda",
  "prof-eduardo":  "prof-eduardo",
  "prof-rosa":     "prof-rosa",
  "prof-tomas":    "prof-tomas",
  "prof-ana":      "prof-ana",
  "prof-rui":      "prof-rui",
  "prof-sandra":   "prof-sandra",
  "prof-david":    "prof-david",
};

async function main() {
  // Confirm professors in DB
  const profs = await sql`SELECT id, "numeroProfessor", nome FROM public.professores ORDER BY "numeroProfessor"`;
  console.log(`Found ${profs.length} professors in DB`);

  let updated = 0;
  for (const [seedId, dbId] of Object.entries(SEED_TO_DB_ID)) {
    const turmasSet = profToTurmas[seedId];
    if (!turmasSet || turmasSet.size === 0) continue;

    const turmasArr = [...turmasSet];
    const prof = profs.find(p => p.id === dbId);
    if (!prof) {
      console.warn(`  Professor not found in DB: ${seedId} (${dbId})`);
      continue;
    }

    await sql`
      UPDATE public.professores
      SET "turmasIds" = ${JSON.stringify(turmasArr)}::jsonb
      WHERE id = ${dbId}
    `;
    console.log(`  Updated ${prof.nome} (${dbId}) → ${turmasArr.length} turmas`);
    updated++;
  }
  console.log(`\nDone. Updated ${updated} professors.`);
  await sql.end();
}

main().catch(e => { console.error(e); process.exit(1); });
