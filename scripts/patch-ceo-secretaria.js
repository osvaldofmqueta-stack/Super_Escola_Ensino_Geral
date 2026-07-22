/**
 * patch-ceo-secretaria.js
 * Injeta a secção Secretaria no bloco CEO_PCA_ITEMS do bundle compilado.
 * Encontra o ponto exacto: após {key:'pedagogico'...} e antes de {key:'tesouraria'...}
 */

const fs = require("fs");

const BUNDLE = "dist/_expo/static/js/web/entry-9490fb95215ea14158e004104153d08b.js";

if (!fs.existsSync(BUNDLE)) {
  console.error("Bundle não encontrado:", BUNDLE);
  process.exit(1);
}

let src = fs.readFileSync(BUNDLE, "utf8");

// ── 1. Encontrar os itens Secretaria já existentes no bloco F (SECRETARIA_ITEMS) ──
// O bloco F começa com sec-hub e tem section:'Secretaria'
// Vamos encontrá-lo e extrair os itens até ao fim do array
const F_START = "F=[";
const fIdx = src.indexOf(F_START);
if (fIdx === -1) {
  console.error("Bloco F não encontrado no bundle");
  process.exit(1);
}

// Encontrar o fim do array F (balanceamento de parênteses rectos)
let depth = 0;
let fEnd = fIdx + F_START.length - 1; // posição do '['
for (let i = fEnd; i < src.length; i++) {
  if (src[i] === "[") depth++;
  else if (src[i] === "]") {
    depth--;
    if (depth === 0) { fEnd = i; break; }
  }
}

const fContent = src.slice(fIdx + F_START.length, fEnd); // conteúdo entre [ e ]
console.log("Bloco F encontrado, tamanho:", fContent.length);
console.log("Prévia F:", fContent.slice(0, 200));

// ── 2. Encontrar o ponto de injecção no CEO_PCA_ITEMS ──
// Padrão único: pedagogico seguido de tesouraria (sem Secretaria entre eles)
const ANCHOR = ",{key:'tesouraria'";
const BEFORE_ANCHOR = "section:'\\xc1rea Pedag\\xf3gica',icon:'clipboard-list',iconLib:'mci',route:'/(main)/pedagogico',color:";

// Encontrar a posição depois do item pedagogico completo
const pedagogicoIdx = src.indexOf("key:'pedagogico',label:'\\xc1rea Pedag\\xf3gica',section:'\\xc1rea Pedag\\xf3gica'");

if (pedagogicoIdx === -1) {
  console.error("Item 'pedagogico' não encontrado no bundle");
  process.exit(1);
}

// Encontrar o fim do objecto pedagogico (procurar o '},' seguinte)
let pedagogicoEnd = pedagogicoIdx;
let braceDepth = 0;
for (let i = pedagogicoIdx - 1; i < src.length; i++) {
  if (src[i] === "{") braceDepth++;
  else if (src[i] === "}") {
    braceDepth--;
    if (braceDepth === 0) { pedagogicoEnd = i + 1; break; }
  }
}

console.log("Fim do item pedagogico:", pedagogicoEnd);
console.log("Texto após pedagogico (100 chars):", src.slice(pedagogicoEnd, pedagogicoEnd + 100));

// Verificar se já existe Secretaria logo depois
const afterPedagogico = src.slice(pedagogicoEnd, pedagogicoEnd + 200);
if (afterPedagogico.includes("'Secretaria'") || afterPedagogico.includes("sec-hub")) {
  console.log("⏭  Secção Secretaria já existe no bloco CEO — sem alterações.");
  process.exit(0);
}

// ── 3. Construir os itens a injectar ──
// Usar os itens do bloco F directamente (já têm as variáveis de cor correctas)
// Mas como as variáveis de cor (o, c, n...) são locais ao módulo, vamos usar hex directamente
const SECRETARIA_ITEMS = [
  "{key:'sec-hub',label:'Painel da Secretaria',section:'Secretaria',icon:'grid',route:'/(main)/secretaria-hub?tab=visao',color:'#4A90D9'}",
  "{key:'consulta-aluno',label:'Consulta de Aluno',section:'Secretaria',icon:'account-search',iconLib:'mci',route:'/(main)/consulta-aluno',color:'#4A90D9'}",
  "{key:'sec-pautas',label:'Pautas (Hub)',section:'Secretaria',icon:'ribbon',route:'/(main)/secretaria-hub?tab=pautas',color:'#22C47A'}",
  "{key:'sec-processos',label:'Processos (Hub)',section:'Secretaria',icon:'folder',route:'/(main)/secretaria-hub?tab=processos',color:'#3E9BD4'}",
  "{key:'sec-docs',label:'Documentos (Hub)',section:'Secretaria',icon:'document-text',route:'/(main)/secretaria-hub?tab=documentos',color:'#3E9BD4'}",
  "{key:'sec-corresp',label:'Of\\xedcios / Correspond\\xeancia',section:'Secretaria',icon:'mail',route:'/(main)/secretaria-hub?tab=correspondencia',color:'#4A90D9'}",
  "{key:'editor-docs',label:'Editor de Documentos',section:'Secretaria',icon:'newspaper',route:'/(main)/editor-documentos',color:'#3E9BD4'}",
  "{key:'arquivo-docs',label:'Arquivo de Documentos',section:'Secretaria',icon:'folder-multiple',iconLib:'mci',route:'/(main)/arquivo-documentos',color:'#3E9BD4'}",
].join(",");

// ── 4. Injectar após o item pedagogico ──
const injection = "," + SECRETARIA_ITEMS;
src = src.slice(0, pedagogicoEnd) + injection + src.slice(pedagogicoEnd);

console.log("✅ Itens Secretaria injectados no bloco CEO_PCA_ITEMS");
console.log("Verificação (200 chars após pedagogico):", src.slice(pedagogicoEnd, pedagogicoEnd + 200));

// ── 5. Guardar ──
fs.copyFileSync(BUNDLE, BUNDLE + ".bak2");
fs.writeFileSync(BUNDLE, src);
console.log("✅ Bundle guardado. Backup em:", BUNDLE + ".bak2");
