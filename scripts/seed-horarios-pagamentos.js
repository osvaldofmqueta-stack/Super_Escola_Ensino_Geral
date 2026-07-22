/**
 * SIGA v3 — Seed de Horários e Pagamentos (optimizado com batch inserts)
 */

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sep = t.indexOf("=");
    if (sep <= 0) continue;
    const k = t.slice(0, sep).trim();
    const v = t.slice(sep + 1).trim();
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) { console.error("ERRO: DATABASE_URL não definida."); process.exit(1); }
const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

const ANO_LETIVO = "2025/2026";

// Batch insert helper
async function batchInsert(client, table, cols, rows, chunkSize = 200) {
  if (rows.length === 0) return;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params = [];
    const valParts = chunk.map((row, ri) => {
      const placeholders = row.map((_, ci) => {
        params.push(row[ci]);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `INSERT INTO public.${table} (${cols.join(",")}) VALUES ${valParts.join(",")} ON CONFLICT DO NOTHING`,
      params
    );
  }
}

// ─── TURNOS ───────────────────────────────────────────────────────────────────
const TURNOS = {
  "Manhã": [
    { periodo: 1, horaInicio: "07:00", horaFim: "07:45" },
    { periodo: 2, horaInicio: "07:50", horaFim: "08:35" },
    { periodo: 3, horaInicio: "08:40", horaFim: "09:25" },
    { periodo: 4, horaInicio: "09:45", horaFim: "10:30" },
    { periodo: 5, horaInicio: "10:35", horaFim: "11:20" },
    { periodo: 6, horaInicio: "11:25", horaFim: "12:10" },
  ],
  "Tarde": [
    { periodo: 1, horaInicio: "13:00", horaFim: "13:45" },
    { periodo: 2, horaInicio: "13:50", horaFim: "14:35" },
    { periodo: 3, horaInicio: "14:40", horaFim: "15:25" },
    { periodo: 4, horaInicio: "15:45", horaFim: "16:30" },
    { periodo: 5, horaInicio: "16:35", horaFim: "17:20" },
    { periodo: 6, horaInicio: "17:25", horaFim: "18:10" },
  ],
  "Noite": [
    { periodo: 1, horaInicio: "19:00", horaFim: "19:45" },
    { periodo: 2, horaInicio: "19:50", horaFim: "20:35" },
    { periodo: 3, horaInicio: "20:40", horaFim: "21:10" },
    { periodo: 4, horaInicio: "21:10", horaFim: "21:55" },
    { periodo: 5, horaInicio: "22:00", horaFim: "22:45" },
  ],
};

const TURMA_CONFIG = [
  { id: "turma-4-a",      turno:"Manhã", sala:"Sala A1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-jose", pNm:"José Gonçalves",    dias:[1,4],      periodos:[6]},
    {nome:"Educação Visual",       pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[2,5],      periodos:[6]},
  ]},
  { id: "turma-4-b",      turno:"Tarde", sala:"Sala A2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-jose", pNm:"José Gonçalves",    dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-5-a",      turno:"Manhã", sala:"Sala A3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Visual",       pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-5-b",      turno:"Tarde", sala:"Sala B1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
  ]},
  { id: "turma-6-a",      turno:"Manhã", sala:"Sala B2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Visual",       pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-6-b",      turno:"Tarde", sala:"Sala B3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-jose",  pNm:"José Gonçalves",    dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,3],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
  ]},
  { id: "turma-7-a",      turno:"Manhã", sala:"Sala A1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[1,2,3,4,5],periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,3,5],    periodos:[4]},
    {nome:"História",              pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[2,4],      periodos:[4]},
    {nome:"Geografia",             pId:"prof-eduardo",pNm:"Eduardo Mendes",   dias:[1,4],      periodos:[5]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[2,5],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[3],        periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-ana",  pNm:"Ana Pinto",         dias:[4,5],      periodos:[4]},
  ]},
  { id: "turma-7-b",      turno:"Tarde", sala:"Sala A2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[1,2,3,4,5],periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[4]},
    {nome:"História",              pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[1,5],      periodos:[4]},
    {nome:"Geografia",             pId:"prof-eduardo",pNm:"Eduardo Mendes",   dias:[2,4],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[5],        periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-ana",  pNm:"Ana Pinto",         dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-8-a",      turno:"Manhã", sala:"Sala A3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos",pNm:"Carlos Sousa",      dias:[1,2,3,4,5],periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,3,5],    periodos:[4]},
    {nome:"História",              pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[2,4],      periodos:[4]},
    {nome:"Geografia",             pId:"prof-eduardo",pNm:"Eduardo Mendes",   dias:[1,5],      periodos:[5]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[3],        periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-ana",  pNm:"Ana Pinto",         dias:[4,5],      periodos:[6]},
  ]},
  { id: "turma-8-b",      turno:"Tarde", sala:"Sala B1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos",pNm:"Carlos Sousa",      dias:[1,2,4,5],  periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[4]},
    {nome:"História",              pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[1,3],      periodos:[4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[3,5],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-ana",  pNm:"Ana Pinto",         dias:[5],        periodos:[6]},
  ]},
  { id: "turma-9-a",      turno:"Manhã", sala:"Sala B2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos",pNm:"Carlos Sousa",      dias:[1,2,3,4,5],periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,3,5],    periodos:[4]},
    {nome:"História",              pId:"prof-paulo", pNm:"Paulo Rodrigues",   dias:[2,5],      periodos:[4]},
    {nome:"Geografia",             pId:"prof-eduardo",pNm:"Eduardo Mendes",   dias:[1,4],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,4],      periodos:[5]},
    {nome:"Educação Moral e Cívica",pId:"prof-paulo",pNm:"Paulo Rodrigues",   dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-9-b",      turno:"Tarde", sala:"Sala B3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-ana",   pNm:"Ana Pinto",         dias:[1,2,3],    periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos",pNm:"Carlos Sousa",      dias:[1,2,4,5],  periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,5],      periodos:[4]},
    {nome:"História",              pId:"prof-eduardo",pNm:"Eduardo Mendes",   dias:[2,4],      periodos:[4]},
    {nome:"Ciências da Natureza",  pId:"prof-rosa",  pNm:"Rosa Cardoso",      dias:[1,4],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas", pNm:"Tomás Neves",       dias:[2,5],      periodos:[5]},
  ]},
  { id: "turma-10-gi-a",  turno:"Manhã", sala:"Lab. Informática 1", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,4,5],  periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade Geral",   pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,2,4],    periodos:[5]},
    {nome:"Economia",              pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[3,5],      periodos:[5]},
    {nome:"Programação",           pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[2,4],      periodos:[6]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[3],        periodos:[6]},
  ]},
  { id: "turma-10-gi-b",  turno:"Tarde", sala:"Lab. Informática 2", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4],  periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,5],      periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade Geral",   pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[2,4],      periodos:[5]},
    {nome:"Economia",              pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,5],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[4],        periodos:[6]},
  ]},
  { id: "turma-11-gi-a",  turno:"Manhã", sala:"Lab. Informática 1", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-beatriz",pNm:"Beatriz Fernandes",dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade Geral",   pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,3,5],    periodos:[5]},
    {nome:"Economia",              pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[2,4],      periodos:[5]},
    {nome:"Programação",           pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,3,5],    periodos:[6]},
    {nome:"Sistemas de Informação",pId:"prof-beatriz",pNm:"Beatriz Fernandes",dias:[2,4],      periodos:[6]},
  ]},
  { id: "turma-11-gi-b",  turno:"Tarde", sala:"Lab. Informática 2", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[2,4],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,4,5],  periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,3,5],    periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Programação",           pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,3],      periodos:[5]},
    {nome:"Sistemas de Informação",pId:"prof-beatriz",pNm:"Beatriz Fernandes",dias:[2,4,5],    periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-12-gi-a",  turno:"Manhã", sala:"Lab. Informática 1", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,2,3],    periodos:[3,4]},
    {nome:"Contabilidade Geral",   pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,2,4],    periodos:[5]},
    {nome:"Economia",              pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[3,5],      periodos:[5]},
    {nome:"Programação",           pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[4,5],      periodos:[3,4]},
    {nome:"Bases de Dados",        pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[2,4],      periodos:[6]},
    {nome:"Sistemas de Informação",pId:"prof-beatriz",pNm:"Beatriz Fernandes",dias:[1,3],      periodos:[6]},
  ]},
  { id: "turma-13-gi-a",  turno:"Manhã", sala:"Lab. Informática 1", disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Informática de Gestão", pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade Geral",   pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,2,4],    periodos:[5]},
    {nome:"Economia",              pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[3,5],      periodos:[5]},
    {nome:"Programação",           pId:"prof-pedro",  pNm:"Pedro Costa",      dias:[1,3],      periodos:[6]},
    {nome:"Sistemas de Informação",pId:"prof-beatriz",pNm:"Beatriz Fernandes",dias:[2,4],      periodos:[6]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[5],        periodos:[6]},
  ]},
  { id: "turma-10-ce-a",  turno:"Tarde", sala:"Sala A1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,5],      periodos:[1]},
    {nome:"Economia Política",     pId:"prof-sandra", pNm:"Sandra Lima",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade e Gestão",pId:"prof-sandra", pNm:"Sandra Lima",      dias:[1,3,5],    periodos:[5]},
    {nome:"Direito Comercial",     pId:"prof-sandra", pNm:"Sandra Lima",      dias:[2,4],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-11-ce-a",  turno:"Tarde", sala:"Sala A2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,4],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[3,5],      periodos:[1]},
    {nome:"Economia Política",     pId:"prof-sandra", pNm:"Sandra Lima",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade e Gestão",pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,3,5],    periodos:[5]},
    {nome:"Estatística",           pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[2,4],      periodos:[5]},
    {nome:"Direito Comercial",     pId:"prof-sandra", pNm:"Sandra Lima",      dias:[2,4],      periodos:[6]},
  ]},
  { id: "turma-12-ce-a",  turno:"Tarde", sala:"Sala A3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[2,4],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,5],      periodos:[1]},
    {nome:"Economia Política",     pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,2,3],    periodos:[3,4]},
    {nome:"Contabilidade e Gestão",pId:"prof-sandra", pNm:"Sandra Lima",      dias:[4,5],      periodos:[3,4]},
    {nome:"Estatística",           pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,3],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[3,5],      periodos:[6]},
  ]},
  { id: "turma-13-ce-a",  turno:"Tarde", sala:"Sala B1",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Economia Política",     pId:"prof-sandra", pNm:"Sandra Lima",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Contabilidade e Gestão",pId:"prof-fernanda",pNm:"Fernanda Lopes",  dias:[1,3],      periodos:[5]},
    {nome:"Estatística",           pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[2,4],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[3],        periodos:[6]},
  ]},
  { id: "turma-10-ct-a",  turno:"Noite", sala:"Lab. Ciências",      disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,4],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,5],      periodos:[1]},
    {nome:"Física",                pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Química",               pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,3,5],    periodos:[5]},
    {nome:"Biologia",              pId:"prof-rosa",   pNm:"Rosa Cardoso",     dias:[2,4],      periodos:[5]},
  ]},
  { id: "turma-11-ct-a",  turno:"Noite", sala:"Lab. Ciências",      disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[2,5],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[1,4],      periodos:[1]},
    {nome:"Física Aplicada",       pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Química Aplicada",      pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,3],      periodos:[5]},
    {nome:"Biologia Aplicada",     pId:"prof-rosa",   pNm:"Rosa Cardoso",     dias:[2,4,5],    periodos:[5]},
  ]},
  { id: "turma-12-ct-a",  turno:"Noite", sala:"Lab. Ciências",      disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,4],      periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[3,5],      periodos:[1]},
    {nome:"Física Aplicada",       pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,2,4,5],  periodos:[3,4]},
    {nome:"Química Aplicada",      pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,3,5],    periodos:[5]},
    {nome:"Biologia Aplicada",     pId:"prof-rosa",   pNm:"Rosa Cardoso",     dias:[2,4],      periodos:[5]},
  ]},
  { id: "turma-13-ct-a",  turno:"Noite", sala:"Lab. Ciências",      disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,3,5],    periodos:[1]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,2,3,4,5],periodos:[2]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[1]},
    {nome:"Física Aplicada",       pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,2,3,4,5],periodos:[3,4]},
    {nome:"Química Aplicada",      pId:"prof-rui",    pNm:"Rui Marques",      dias:[1,3],      periodos:[5]},
    {nome:"Biologia Aplicada",     pId:"prof-rosa",   pNm:"Rosa Cardoso",     dias:[2,4,5],    periodos:[5]},
  ]},
  { id: "turma-10-hum-a", turno:"Noite", sala:"Sala B2",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,3,5],    periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,4],      periodos:[3]},
    {nome:"História",              pId:"prof-david",  pNm:"David Rocha",      dias:[1,2,4],    periodos:[4]},
    {nome:"Filosofia",             pId:"prof-david",  pNm:"David Rocha",      dias:[3,5],      periodos:[4]},
    {nome:"Sociologia",            pId:"prof-david",  pNm:"David Rocha",      dias:[1,3],      periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[2,4],      periodos:[5]},
  ]},
  { id: "turma-11-hum-a", turno:"Noite", sala:"Sala B3",            disc:[
    {nome:"Língua Portuguesa",     pId:"prof-antonio",pNm:"António Silva",    dias:[1,2,3,4,5],periodos:[1,2]},
    {nome:"Matemática",            pId:"prof-carlos", pNm:"Carlos Sousa",     dias:[1,3],      periodos:[3]},
    {nome:"Inglês",                pId:"prof-maria-h",pNm:"Maria Helena",     dias:[2,5],      periodos:[3]},
    {nome:"Literatura",            pId:"prof-david",  pNm:"David Rocha",      dias:[1,4],      periodos:[4]},
    {nome:"Filosofia",             pId:"prof-david",  pNm:"David Rocha",      dias:[2,5],      periodos:[4]},
    {nome:"Sociologia",            pId:"prof-david",  pNm:"David Rocha",      dias:[3],        periodos:[5]},
    {nome:"Educação Física",       pId:"prof-tomas",  pNm:"Tomás Neves",      dias:[4,5],      periodos:[5]},
  ]},
];

const TAXAS = [
  { id:"taxa-prop-prim",    tipo:"propina",  descricao:"Propina Mensal — Primário",          valor:5000,  frequencia:"mensal",    nivel:"Primário" },
  { id:"taxa-prop-icilo",   tipo:"propina",  descricao:"Propina Mensal — I Ciclo",           valor:7500,  frequencia:"mensal",    nivel:"I Ciclo"  },
  { id:"taxa-prop-iicilo",  tipo:"propina",  descricao:"Propina Mensal — II Ciclo",          valor:10000, frequencia:"mensal",    nivel:"II Ciclo" },
  { id:"taxa-mat-prim",     tipo:"matricula",descricao:"Taxa de Matrícula — Primário",       valor:15000, frequencia:"anual",     nivel:"Primário" },
  { id:"taxa-mat-icilo",    tipo:"matricula",descricao:"Taxa de Matrícula — I Ciclo",        valor:20000, frequencia:"anual",     nivel:"I Ciclo"  },
  { id:"taxa-mat-iicilo",   tipo:"matricula",descricao:"Taxa de Matrícula — II Ciclo",       valor:25000, frequencia:"anual",     nivel:"II Ciclo" },
  { id:"taxa-did-prim",     tipo:"material", descricao:"Material Didáctico — Primário",      valor:8000,  frequencia:"anual",     nivel:"Primário" },
  { id:"taxa-did-icilo",    tipo:"material", descricao:"Material Didáctico — I Ciclo",       valor:10000, frequencia:"anual",     nivel:"I Ciclo"  },
  { id:"taxa-did-iicilo",   tipo:"material", descricao:"Material Didáctico — II Ciclo",      valor:12000, frequencia:"anual",     nivel:"II Ciclo" },
  { id:"taxa-exame-icilo",  tipo:"exame",    descricao:"Taxa de Exame — I Ciclo",            valor:5000,  frequencia:"trimestral",nivel:"I Ciclo"  },
  { id:"taxa-exame-iicilo", tipo:"exame",    descricao:"Taxa de Exame — II Ciclo",           valor:7500,  frequencia:"trimestral",nivel:"II Ciclo" },
];

// Map nivel → taxas ids e valores
const NIV = {
  "Primário": { prop:"taxa-prop-prim",   mat:"taxa-mat-prim",   did:"taxa-did-prim",   vProp:5000,  vMat:15000,vDid:8000  },
  "I Ciclo":  { prop:"taxa-prop-icilo",  mat:"taxa-mat-icilo",  did:"taxa-did-icilo",  vProp:7500,  vMat:20000,vDid:10000, exame:"taxa-exame-icilo",  vExame:5000  },
  "II Ciclo": { prop:"taxa-prop-iicilo", mat:"taxa-mat-iicilo", did:"taxa-did-iicilo", vProp:10000, vMat:25000,vDid:12000, exame:"taxa-exame-iicilo", vExame:7500  },
};

async function main() {
  const client = await pool.connect();
  try {
    // ── 1. TAXAS ──────────────────────────────────────────────────────────────
    console.log("→ Taxas...");
    await client.query("BEGIN");
    for (const t of TAXAS) {
      await client.query(
        `INSERT INTO public.taxas (id,tipo,descricao,valor,frequencia,nivel,"anoAcademico",ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         ON CONFLICT (id) DO UPDATE SET valor=EXCLUDED.valor, descricao=EXCLUDED.descricao`,
        [t.id,t.tipo,t.descricao,t.valor,t.frequencia,t.nivel,ANO_LETIVO]
      );
    }
    await client.query("COMMIT");
    console.log(`   ✓ ${TAXAS.length} taxas`);

    // ── 2. HORÁRIOS ───────────────────────────────────────────────────────────
    console.log("→ Horários...");
    await client.query("BEGIN");
    await client.query(`DELETE FROM public.horarios WHERE "anoAcademico"=$1`, [ANO_LETIVO]);

    // Build all rows in memory first
    const horRows = [];
    for (const turma of TURMA_CONFIG) {
      const tempos = TURNOS[turma.turno] || TURNOS["Manhã"];
      for (const disc of turma.disc) {
        for (const dia of disc.dias) {
          for (const periodo of disc.periodos) {
            const tempo = tempos[periodo - 1];
            if (!tempo) continue;
            horRows.push([turma.id, disc.nome, disc.pId, disc.pNm, dia, periodo,
                          tempo.horaInicio, tempo.horaFim, turma.sala, ANO_LETIVO]);
          }
        }
      }
    }
    await batchInsert(client,
      "horarios",
      ['"turmaId"','disciplina','"professorId"','"professorNome"',
       '"diaSemana"','periodo','"horaInicio"','"horaFim"','sala','"anoAcademico"'],
      horRows, 100
    );
    await client.query("COMMIT");
    console.log(`   ✓ ${horRows.length} horários`);

    // ── 3. PAGAMENTOS DEMO ────────────────────────────────────────────────────
    console.log("→ Pagamentos demo...");
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.pagamentos WHERE "alunoId" IN ('aluno-prim-001','aluno-icilo-001','aluno-final-001')`
    );

    const demoConfig = [
      { id:"aluno-prim-001",  nivel:"Primário" },
      { id:"aluno-icilo-001", nivel:"I Ciclo"  },
      { id:"aluno-final-001", nivel:"II Ciclo" },
    ];
    const metodos = ["multicaixa","transferencia","dinheiro"];

    const pagDemoRows = [];
    for (const a of demoConfig) {
      const n = NIV[a.nivel];
      const shortId = a.id.slice(-4);
      // Matrícula paga
      pagDemoRows.push([a.id,n.mat,n.vMat,"2026-01-10",null,null,"2026","pago","multicaixa",`MAT-${shortId}`,"Matrícula 2025/2026"]);
      // Material pago
      pagDemoRows.push([a.id,n.did,n.vDid,"2026-01-12",null,null,"2026","pago","transferencia",`DID-${shortId}`,"Material Didáctico"]);
      // Jan-Mar pagos
      pagDemoRows.push([a.id,n.prop,n.vProp,"2026-01-15",1,null,"2026","pago",metodos[0],`JAN-${shortId}`,null]);
      pagDemoRows.push([a.id,n.prop,n.vProp,"2026-02-14",2,null,"2026","pago",metodos[1],`FEV-${shortId}`,null]);
      pagDemoRows.push([a.id,n.prop,n.vProp,"2026-03-13",3,null,"2026","pago",metodos[2],`MAR-${shortId}`,null]);
      // Abr pendente
      pagDemoRows.push([a.id,n.prop,n.vProp,"2026-04-09",4,null,"2026","pendente","multicaixa",null,"Propina Abril — aguarda pagamento"]);
      // Exames
      if (n.exame) {
        pagDemoRows.push([a.id,n.exame,n.vExame,"2026-02-20",null,1,"2026","pago","multicaixa",`EX1-${shortId}`,"Exame 1.º Trim."]);
        if (a.nivel === "II Ciclo") {
          pagDemoRows.push([a.id,n.exame,n.vExame,"2026-03-25",null,2,"2026","pago","multicaixa",`EX2-${shortId}`,"Exame 2.º Trim."]);
          pagDemoRows.push([a.id,n.exame,n.vExame,"2026-04-09",null,3,"2026","pendente","multicaixa",null,"Exame 3.º Trim. — pendente"]);
        }
      }
    }
    await batchInsert(client,
      "pagamentos",
      ['"alunoId"','"taxaId"',"valor","data","mes","trimestre","ano","status",'"metodoPagamento"',"referencia","observacao"],
      pagDemoRows, 100
    );
    await client.query("COMMIT");
    console.log(`   ✓ ${pagDemoRows.length} pagamentos demo`);

    // ── 4. PAGAMENTOS MASSA (lotes por nível, transacção separada) ─────────────
    console.log("→ Pagamentos em massa...");

    const niveisCfg = [
      { nivel:"Primário", limit:80  },
      { nivel:"I Ciclo",  limit:120 },
      { nivel:"II Ciclo", limit:200 },
    ];

    let totalMassa = 0;
    for (const cfg of niveisCfg) {
      const n = NIV[cfg.nivel];
      const alunosRes = await client.query(
        `SELECT a.id FROM public.alunos a
         JOIN public.turmas t ON a."turmaId"=t.id
         WHERE t.nivel=$1 AND t."anoLetivo"=$2
           AND a."numeroMatricula" LIKE 'BULK-%'
         ORDER BY a."createdAt" LIMIT $3`,
        [cfg.nivel, ANO_LETIVO, cfg.limit]
      );

      // Delete existing pagamentos for this batch
      const ids = alunosRes.rows.map(r => r.id);
      if (ids.length === 0) continue;

      // Delete in chunks to avoid huge IN clause
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i+50);
        await client.query(
          `DELETE FROM public.pagamentos WHERE "alunoId" = ANY($1::text[])`, [chunk]
        );
      }

      const pagRows = [];
      for (let i = 0; i < ids.length; i++) {
        const alunoId = ids[i];
        const metodo = metodos[i % metodos.length];
        const temDivida = i % 5 === 0;  // 20% em atraso (Mar + Abr pendentes)
        const poucosPagos = i % 7 === 0; // só Jan pago

        // Matrícula
        pagRows.push([alunoId,n.mat,n.vMat,"2026-01-10",null,null,"2026","pago",metodo,`BM-${i}`,null]);
        // Material
        pagRows.push([alunoId,n.did,n.vDid,"2026-01-12",null,null,"2026","pago",metodo,`BD-${i}`,null]);
        // Propinas pagas
        const mesesPagos = poucosPagos ? [1] : temDivida ? [1,2] : [1,2,3];
        const datas = ["2026-01-15","2026-02-14","2026-03-13"];
        for (const mes of mesesPagos) {
          pagRows.push([alunoId,n.prop,n.vProp,datas[mes-1],mes,null,"2026","pago",metodo,`BP${mes}-${i}`,null]);
        }
        // Abr sempre pendente
        pagRows.push([alunoId,n.prop,n.vProp,"2026-04-09",4,null,"2026","pendente","multicaixa",null,"Propina Abril"]);
        // Devedores: Mar também pendente
        if (temDivida) {
          pagRows.push([alunoId,n.prop,n.vProp,"2026-03-13",3,null,"2026","pendente","multicaixa",null,"Propina Março — atraso"]);
        }
        // Exame T1 pago para todos de II Ciclo e I Ciclo
        if (n.exame && !poucosPagos) {
          pagRows.push([alunoId,n.exame,n.vExame,"2026-02-20",null,1,"2026","pago",metodo,`BEX1-${i}`,null]);
        }
      }

      // Insert em lotes dentro de transacções de 100 rows para evitar timeout
      const LOTE = 500;
      for (let start = 0; start < pagRows.length; start += LOTE) {
        const chunk = pagRows.slice(start, start+LOTE);
        await client.query("BEGIN");
        await batchInsert(client,
          "pagamentos",
          ['"alunoId"','"taxaId"',"valor","data","mes","trimestre","ano","status",'"metodoPagamento"',"referencia","observacao"],
          chunk, 100
        );
        await client.query("COMMIT");
      }
      totalMassa += pagRows.length;
      console.log(`   ✓ ${cfg.nivel}: ${ids.length} alunos → ${pagRows.length} pagamentos`);
    }

    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log("║     ✅  HORÁRIOS E PAGAMENTOS INSERIDOS!            ║");
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Taxas               : ${TAXAS.length}                                ║`);
    console.log(`║  Horários            : ${horRows.length}                              ║`);
    console.log(`║  Pagamentos demo     : ${pagDemoRows.length}                               ║`);
    console.log(`║  Pagamentos em massa : ${totalMassa}                          ║`);
    console.log("╚══════════════════════════════════════════════════════╝\n");

  } catch (err) {
    try { await client.query("ROLLBACK"); } catch(_) {}
    console.error("\n❌ Erro:", err.message, err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
