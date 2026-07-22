/**
 * patch-drawer-secretaria.js
 * Move a secção "Secretaria" para logo após "Área Pedagógica" em
 * CEO_PCA_SECTIONS e ADMIN_DIRECTOR_SECTIONS do DrawerLeft.tsx,
 * adiciona "Painel da Secretaria" como primeiro item e renomeia
 * "Secretaria & Documentos" → "Secretaria".
 */
const fs = require('fs');
const FILE = 'components/DrawerLeft.tsx';
let src = fs.readFileSync(FILE, 'utf8');

// ── Bloco Secretaria a injectar (JSX) ─────────────────────────────────────
const SECRETARIA_SECTION = `    {
      title: 'Secretaria',
      items: [
        { label: 'Painel da Secretaria', route: '/(main)/secretaria-hub?tab=visao', icon: <Ionicons name="grid" size={20} color="inherit" />, permKey: 'secretaria_hub' },
        { label: 'Consulta de Aluno', route: '/(main)/consulta-aluno', icon: <MaterialCommunityIcons name="account-search" size={20} color="inherit" />, permKey: 'consultar_aluno' },
        { label: 'Editor de Documentos', route: '/(main)/editor-documentos', icon: <Ionicons name="newspaper" size={20} color="inherit" />, permKey: 'editor_documentos' },
        { label: 'Arquivo de Documentos', route: '/(main)/arquivo-documentos', icon: <MaterialCommunityIcons name="folder-multiple" size={20} color="inherit" />, permKey: 'arquivo_documentos' },
      ],
    },`;

// ── Helper: patchSection ──────────────────────────────────────────────────
// Dado o nome da constante (ex: "CEO_PCA_SECTIONS"), localiza o array no
// ficheiro TSX e faz as transformações necessárias.
function patchSection(src, constName) {
  // Encontrar o início da constante
  const startMarker = `const ${constName}: NavSection[] = [`;
  const constStart = src.indexOf(startMarker);
  if (constStart === -1) {
    console.error(`❌ Constante ${constName} não encontrada`);
    return src;
  }

  // Encontrar o fim do array (balancear colchetes)
  let depth = 0;
  let arrayStart = -1;
  let arrayEnd = -1;
  for (let i = constStart + startMarker.length - 1; i < src.length; i++) {
    if (src[i] === '[') { depth++; if (arrayStart === -1) arrayStart = i; }
    else if (src[i] === ']') { depth--; if (depth === 0) { arrayEnd = i; break; } }
  }
  if (arrayEnd === -1) { console.error(`❌ Fim do array ${constName} não encontrado`); return src; }

  let block = src.slice(arrayStart + 1, arrayEnd); // conteúdo entre [ e ]
  console.log(`\n📋 A processar ${constName} (${block.length} chars)`);

  // ── 1. Remover secção "Secretaria & Documentos" (ou "Secretaria" se já renomeada) ──
  // Padrão: { title: 'Secretaria...',\n      items: [\n        ...todos os items...\n      ],\n    },
  // Vamos capturar desde o início do objecto até ao seu fecho
  const SEC_TITLE_RE = /,?\s*\{\s*\n\s*title:\s*'Secretaria[^']*',\s*\n\s*items:\s*\[[^\]]*\],?\s*\n\s*\},/g;
  const beforeRemove = block;
  block = block.replace(SEC_TITLE_RE, (m) => {
    // Só remover se NÃO tiver "Painel da Secretaria" (esse é o novo que iremos inserir)
    if (m.includes('Painel da Secretaria')) return m; // já tem — deixar
    console.log(`  ✂️  Removida secção antiga: ${m.slice(0, 80).trim()}...`);
    return '';
  });
  if (block === beforeRemove) {
    // Tentar regex mais permissivo (itens multi-linha)
    const SEC_TITLE_RE2 = /,?\s*\{\s*\n\s*title:\s*'Secretaria[^']*',[^}]*(?:\{[^}]*\}[^}]*)*\},/gs;
    block = block.replace(SEC_TITLE_RE2, (m) => {
      if (m.includes('Painel da Secretaria')) return m;
      console.log(`  ✂️  Removida secção antiga (re2): ${m.slice(0, 80).trim()}...`);
      return '';
    });
  }

  // ── 2. Verificar se "Painel da Secretaria" já existe ──
  if (block.includes("Painel da Secretaria")) {
    console.log(`  ⏭  Painel da Secretaria já presente em ${constName} — sem inserção.`);
  } else {
    // ── 3. Inserir nova secção Secretaria após o bloco "Área Pedagógica" ──
    // Encontrar o fim da secção 'Área Pedagógica' dentro deste bloco.
    // A secção termina com o padrão: `\n      ],\n    },\n` e depois começa outra secção.
    // Vamos encontrar o `title: 'Área Pedagógica'` e depois balancear as chaves do objecto.
    const AREA_PED_TITLE = "title: 'Área Pedagógica'";
    const apIdx = block.indexOf(AREA_PED_TITLE);
    if (apIdx === -1) {
      console.error(`  ❌ 'Área Pedagógica' não encontrada em ${constName}`);
    } else {
      // Encontrar o início do objecto { que contém este título
      // (recuar para encontrar o { anterior ao title)
      let objStart = apIdx;
      while (objStart > 0 && block[objStart] !== '{') objStart--;

      // Balancear chaves para encontrar o fim do objecto
      let braceDepth = 0;
      let objEnd = -1;
      for (let i = objStart; i < block.length; i++) {
        if (block[i] === '{') braceDepth++;
        else if (block[i] === '}') { braceDepth--; if (braceDepth === 0) { objEnd = i; break; } }
      }

      if (objEnd === -1) {
        console.error(`  ❌ Fim do objecto 'Área Pedagógica' não encontrado`);
      } else {
        // Avançar para incluir a vírgula e newline depois do }
        let insertAfter = objEnd + 1;
        while (insertAfter < block.length && (block[insertAfter] === ',' || block[insertAfter] === '\n')) insertAfter++;
        // Recuar para o início da próxima linha
        // Inserir antes da próxima secção
        const before = block.slice(0, objEnd + 1);
        const after = block.slice(objEnd + 1);
        block = before + ',\n' + SECRETARIA_SECTION + after;
        console.log(`  ✅ Secção Secretaria inserida após 'Área Pedagógica'`);
      }
    }
  }

  // Reconstruir o src
  return src.slice(0, arrayStart + 1) + block + src.slice(arrayEnd);
}

// ── Aplicar a CEO_PCA_SECTIONS ────────────────────────────────────────────
src = patchSection(src, 'CEO_PCA_SECTIONS');

// ── Aplicar a ADMIN_DIRECTOR_SECTIONS ─────────────────────────────────────
src = patchSection(src, 'ADMIN_DIRECTOR_SECTIONS');

// ── Guardar ───────────────────────────────────────────────────────────────
fs.copyFileSync(FILE, FILE + '.bak');
fs.writeFileSync(FILE, src);
console.log(`\n✅ ${FILE} actualizado com sucesso.`);
