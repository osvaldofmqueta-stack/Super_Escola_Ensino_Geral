/**
 * patch-bundle-nav.js
 * Remenda o bundle compilado do Expo para adicionar a secção Secretaria
 * ao menu do CEO/PCA/Admin/Director sem precisar de reconstruir o frontend.
 */

const fs = require("fs");
const path = require("path");

const BUNDLE = "dist/_expo/static/js/web/entry-9490fb95215ea14158e004104153d08b.js";

if (!fs.existsSync(BUNDLE)) {
  console.error("Bundle não encontrado:", BUNDLE);
  process.exit(1);
}

let src = fs.readFileSync(BUNDLE, "utf8");
let changed = false;

// ── 1. Renomear "Secretaria & Documentos" → "Secretaria" ──────────────────
const OLD_SECTION = "Secretaria & Documentos";
const NEW_SECTION = "Secretaria";
if (src.includes(OLD_SECTION)) {
  src = src.split(OLD_SECTION).join(NEW_SECTION);
  console.log("✅ Secção renomeada: Secretaria & Documentos → Secretaria");
  changed = true;
} else {
  console.log("⏭  Secção já renomeada ou não encontrada.");
}

// ── 2. Injectar itens Secretaria no bloco CEO_PCA_ITEMS ───────────────────
// No bundle minificado, o bloco CEO tem a entrada consulta-aluno na secção
// "Secretaria" (após a renomeação acima). Precisamos de inserir sec-hub
// ANTES dessa entrada E adicionar os outros itens do hub.

// Âncora: primeiro item da secção Secretaria no bloco CEO (consulta-aluno)
// Pode ter variantes de formatação - tentar as duas mais comuns
const ANCHORS = [
  '{key:"consulta-aluno",label:"Consulta de Aluno",section:"Secretaria",icon:"account-search",iconLib:"mci",route:"/(main)/consulta-aluno",color:"#4A90D9"}',
  "{key:\"consulta-aluno\",label:\"Consulta de Aluno\",section:\"Secretaria\",icon:\"account-search\",iconLib:\"mci\",route:\"/(main)/consulta-aluno\",color:\"#4A90D9\"}",
];

const NEW_ITEMS = [
  '{key:"sec-hub",label:"Painel da Secretaria",section:"Secretaria",icon:"grid",route:"/(main)/secretaria-hub?tab=visao",color:"#4A90D9"}',
  '{key:"consulta-aluno",label:"Consulta de Aluno",section:"Secretaria",icon:"account-search",iconLib:"mci",route:"/(main)/consulta-aluno",color:"#4A90D9"}',
  '{key:"sec-pautas",label:"Pautas (Hub)",section:"Secretaria",icon:"ribbon",route:"/(main)/secretaria-hub?tab=pautas",color:"#22C47A"}',
  '{key:"sec-processos",label:"Processos (Hub)",section:"Secretaria",icon:"folder",route:"/(main)/secretaria-hub?tab=processos",color:"#3E9BD4"}',
  '{key:"sec-docs",label:"Documentos (Hub)",section:"Secretaria",icon:"document-text",route:"/(main)/secretaria-hub?tab=documentos",color:"#3E9BD4"}',
  '{key:"sec-corresp",label:"Of\\u00edcios / Correspond\\u00eancia",section:"Secretaria",icon:"mail",route:"/(main)/secretaria-hub?tab=correspondencia",color:"#4A90D9"}',
].join(",");

// Verificar se sec-hub já existe no bloco CEO (pode já ter sido patchado)
if (src.includes('"sec-hub"') && src.includes('"Painel da Secretaria"')) {
  console.log("⏭  sec-hub já existe no bundle — sem alterações adicionais.");
} else {
  // Tentar encontrar a âncora de várias formas
  let anchorFound = false;
  for (const anchor of ANCHORS) {
    const idx = src.indexOf(anchor);
    if (idx !== -1) {
      // Verificar se já existe um sec-hub antes desta posição (dentro de ~500 chars)
      const before = src.slice(Math.max(0, idx - 500), idx);
      if (before.includes("sec-hub")) {
        console.log("⏭  sec-hub já existe próximo do âncora — sem alterações.");
        anchorFound = true;
        break;
      }
      // Substituir a âncora pelos novos itens
      src = src.slice(0, idx) + NEW_ITEMS + src.slice(idx + anchor.length);
      console.log("✅ Itens Secretaria injectados no bloco CEO_PCA_ITEMS");
      anchorFound = true;
      changed = true;
      break;
    }
  }

  if (!anchorFound) {
    // Fallback: tentar encontrar pelo padrão parcial
    const partialAnchor = 'section:"Secretaria",icon:"account-search"';
    const idx = src.indexOf(partialAnchor);
    if (idx !== -1) {
      // Recuar para encontrar o início do objecto
      const start = src.lastIndexOf("{key:", idx);
      const end = src.indexOf("}", idx) + 1;
      if (start !== -1 && end > start) {
        const before = src.slice(Math.max(0, start - 200), start);
        if (!before.includes("sec-hub")) {
          const hubEntry = '{key:"sec-hub",label:"Painel da Secretaria",section:"Secretaria",icon:"grid",route:"/(main)/secretaria-hub?tab=visao",color:"#4A90D9"},';
          src = src.slice(0, start) + hubEntry + src.slice(start);
          console.log("✅ sec-hub injectado via fallback anchor");
          changed = true;
        } else {
          console.log("⏭  sec-hub já existe (fallback check).");
        }
      }
    } else {
      console.warn("⚠️  Âncora não encontrada — o bundle pode ter estrutura diferente.");
      console.warn("    Verifica manualmente o bundle:", BUNDLE);
    }
  }
}

// ── 3. Guardar se houve alterações ────────────────────────────────────────
if (changed) {
  // Backup
  fs.writeFileSync(BUNDLE + ".bak", fs.readFileSync(BUNDLE));
  fs.writeFileSync(BUNDLE, src);
  console.log("✅ Bundle guardado com sucesso.");
  console.log("   Backup em:", BUNDLE + ".bak");
} else {
  console.log("ℹ️  Nenhuma alteração guardada.");
}
