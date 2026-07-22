/**
 * Captura screenshots de todas as secções do admin para a apresentação DOCX.
 * Uso: ADMIN_TOKEN=<jwt> node scripts/capture-admin-screens.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5000';
const TOKEN = process.env.ADMIN_TOKEN;
const OUT_DIR = path.join(__dirname, '../apresentacao/screens');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Objecto AuthUser completo que o React app espera em @siga_user
const AUTH_USER = {
  id: '5f50cc2d-84be-4202-8167-2cc7b8862eda',
  nome: 'Administrador do Sistema',
  email: 'admin@sige.ao',
  role: 'admin',
  escola: 'Super Escola',
  biometricEnabled: false,
  genero: 'M',
};

const SECTIONS = [
  { name: '01-dashboard',        path: '/',                                                label: 'Painel de Controlo' },
  { name: '02-config',           path: '/admin?section=config&group=sistema',              label: 'Configurações Gerais' },
  { name: '03-escola',           path: '/admin?section=escola&group=sistema',              label: 'Configuração da Escola' },
  { name: '04-anos',             path: '/admin?section=anos&group=academico',              label: 'Ano Académico' },
  { name: '05-matriculas',       path: '/admin?section=matriculas&group=academico',        label: 'Matrículas Pendentes' },
  { name: '06-cursos',           path: '/admin?section=cursos&group=academico',            label: 'Gestão de Cursos' },
  { name: '07-disciplinas',      path: '/admin?section=disciplinas&group=academico',       label: 'Disciplinas' },
  { name: '08-reabertura',       path: '/admin?section=reabertura&group=academico',        label: 'Reabertura de Notas' },
  { name: '09-avaliacoes',       path: '/admin?section=solicit_avaliacao&group=academico', label: 'Lançamento de Notas' },
  { name: '10-usuarios',         path: '/admin?section=usuarios&group=pessoal',            label: 'Utilizadores' },
  { name: '11-acessos',          path: '/admin?section=acessos&group=pessoal',             label: 'Permissões e Acessos' },
  { name: '12-comunicacoes',     path: '/admin?section=comunicacoes&group=sistema',        label: 'Comunicações' },
  { name: '13-seguranca',        path: '/admin?section=seguranca&group=sistema',           label: 'Segurança & Backups' },
  { name: '14-turmas',           path: '/turmas',                                          label: 'Turmas' },
  { name: '15-alunos',           path: '/alunos',                                          label: 'Alunos' },
  { name: '16-professores',      path: '/professores',                                     label: 'Professores' },
  { name: '17-notas',            path: '/notas',                                           label: 'Notas' },
  { name: '18-presencas',        path: '/presencas',                                       label: 'Presenças' },
  { name: '19-financeiro',       path: '/financeiro',                                      label: 'Financeiro' },
  { name: '20-relatorios',       path: '/relatorios',                                      label: 'Relatórios' },
  { name: '21-auditoria',        path: '/auditoria',                                       label: 'Auditoria do Sistema' },
  { name: '22-sessoes',          path: '/sessoes-ativas',                                  label: 'Sessões Activas' },
  { name: '23-gestao-academica', path: '/gestao-academica',                                label: 'Gestão Académica' },
  { name: '24-gestao-acessos',   path: '/gestao-acessos',                                  label: 'Gestão de Acessos' },
];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function injectAuth(page, token, user) {
  await page.evaluate((t, u) => {
    localStorage.setItem('@siga_token', t);
    localStorage.setItem('@siga_user', JSON.stringify(u));
    localStorage.setItem('@siga_last_user', JSON.stringify(u));
  }, token, user);
}

async function dismissOverlays(page) {
  // Fechar banner PWA "Instalar aplicação"
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent?.trim() === 'Agora não') btn.click();
    });
  }).catch(() => {});
  // Fechar modais de tour se existirem
  await page.keyboard.press('Escape').catch(() => {});
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // ── 1. Carregar app pela primeira vez e injectar auth ──────────────
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1500);
  await injectAuth(page, TOKEN, AUTH_USER);
  console.log('[auth] Injectado: token + @siga_user');

  // ── 2. Recarregar para que o React leia o novo localStorage ────────
  await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
  await sleep(3000);
  await dismissOverlays(page);
  await sleep(500);

  // Verificar se o login modal ainda aparece
  const loginVisible = await page.evaluate(() => {
    return !!document.querySelector('input[placeholder*="utilizador"], input[placeholder*="email"]');
  }).catch(() => false);
  if (loginVisible) {
    console.warn('[auth] ⚠️  Login modal ainda visível após injecção — a tentar novamente...');
    await injectAuth(page, TOKEN, AUTH_USER);
    await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
    await sleep(3000);
    await dismissOverlays(page);
  }

  const results = [];

  for (const section of SECTIONS) {
    try {
      console.log(`[screenshot] ${section.name} — ${section.label}`);

      await page.goto(`${BASE}${section.path}`, { waitUntil: 'networkidle2', timeout: 20000 });
      await sleep(2500);
      await dismissOverlays(page);
      await sleep(400);

      // Re-injectar auth se modal aparecer de novo
      const needsReauth = await page.evaluate(() => {
        return !!document.querySelector('input[placeholder*="utilizador"], input[placeholder*="email"]');
      }).catch(() => false);
      if (needsReauth) {
        console.warn(`  ↻ Re-injectando auth para ${section.name}`);
        await injectAuth(page, TOKEN, AUTH_USER);
        await page.reload({ waitUntil: 'networkidle2', timeout: 20000 });
        await sleep(2500);
        await dismissOverlays(page);
      }

      const outPath = path.join(OUT_DIR, `${section.name}.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      results.push({ ...section, file: outPath, ok: true });
      console.log(`  ✅ ${outPath}`);
    } catch (err) {
      console.error(`  ❌ ${section.name}: ${err.message}`);
      results.push({ ...section, ok: false });
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Capturas concluídas:', results.filter(r => r.ok).length, '/', results.length);
})();
