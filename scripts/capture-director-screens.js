/**
 * Captura screenshots de todas as secções do Director para a apresentação DOCX.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:5000';
const TOKEN = process.env.DIRECTOR_TOKEN;
const OUT_DIR = path.join(__dirname, '../apresentacao/screens-director');
fs.mkdirSync(OUT_DIR, { recursive: true });

const AUTH_USER = {
  id: 'd1rec702-0000-4000-a000-000000000001',
  nome: 'Director Pedagógico',
  email: 'director@sige.ao',
  role: 'director',
  escola: 'Super Escola',
  biometricEnabled: false,
  genero: 'M',
};

const SECTIONS = [
  { name: '01-dashboard',          path: '/',                                                   label: 'Painel de Controlo' },
  { name: '02-secretaria-hub',     path: '/secretaria-hub?tab=visao',                           label: 'Painel da Secretaria' },
  { name: '03-pedagogico',         path: '/pedagogico',                                         label: 'Área Pedagógica' },
  { name: '04-alunos',             path: '/alunos',                                             label: 'Alunos' },
  { name: '05-admissao',           path: '/admissao',                                           label: 'Processo de Admissão' },
  { name: '06-transferencias',     path: '/transferencias',                                     label: 'Transferências' },
  { name: '07-professores',        path: '/professores',                                        label: 'Professores' },
  { name: '08-turmas',             path: '/turmas',                                             label: 'Turmas' },
  { name: '09-salas',              path: '/salas',                                              label: 'Salas de Aula' },
  { name: '10-notas',              path: '/notas',                                              label: 'Notas' },
  { name: '11-presencas',          path: '/presencas',                                          label: 'Presenças' },
  { name: '12-horario',            path: '/horario',                                            label: 'Horário' },
  { name: '13-historico',          path: '/historico',                                          label: 'Histórico Académico' },
  { name: '14-grelha',             path: '/grelha',                                             label: 'Grelha Curricular' },
  { name: '15-consulta-aluno',     path: '/consulta-aluno',                                     label: 'Consulta de Aluno' },
  { name: '16-avaliacao-profs',    path: '/avaliacao-professores',                              label: 'Avaliação de Professores' },
  { name: '17-quadro-honra',       path: '/quadro-honra',                                       label: 'Quadro de Honra' },
  { name: '18-finalistas',         path: '/finalistas',                                         label: 'Estudantes Finalistas' },
  { name: '19-alumni',             path: '/alumni',                                             label: 'Antigos Alunos (Alumni)' },
  { name: '20-acomp-pautas',       path: '/acompanhamento-pautas',                              label: 'Acompanhamento de Pautas' },
  { name: '21-conselho',           path: '/conselho',                                           label: 'Conselho de Avaliação' },
  { name: '22-diagnostica',        path: '/diagnostica',                                        label: 'Avaliação Diagnóstica' },
  { name: '23-formativa',          path: '/formativa',                                          label: 'Avaliação Formativa' },
  { name: '24-exclusoes',          path: '/exclusoes-faltas',                                   label: 'Exclusões & Faltas' },
  { name: '25-exame-recurso',      path: '/exame-recurso',                                      label: 'Exame de Recurso' },
  { name: '26-melhoria-nota',      path: '/melhoria-nota',                                      label: 'Melhoria de Nota' },
  { name: '27-reapreciacao',       path: '/pedidos-reapreciacao',                               label: 'Pedido de Reapreciação' },
  { name: '28-exame-nacional',     path: '/exame-nacional',                                     label: 'Exame Nacional' },
  { name: '29-arquivo-pautas',     path: '/arquivo-pautas',                                     label: 'Arquivo de Pautas' },
  { name: '30-editor-docs',        path: '/editor-documentos',                                  label: 'Editor de Documentos' },
  { name: '31-arquivo-docs',       path: '/arquivo-documentos',                                 label: 'Arquivo de Documentos' },
  { name: '32-visao-geral',        path: '/visao-geral',                                        label: 'Visão Geral Multi-Ano' },
  { name: '33-relatorios',         path: '/relatorios',                                         label: 'Relatórios' },
  { name: '34-financeiro',         path: '/financeiro',                                         label: 'Gestão Financeira' },
  { name: '35-tesouraria',         path: '/tesouraria',                                         label: 'Tesouraria' },
  { name: '36-rh-hub',             path: '/rh-hub',                                             label: 'Recursos Humanos (Hub)' },
  { name: '37-rh-controle',        path: '/rh-controle',                                        label: 'Gestão de Pessoal' },
  { name: '38-rh-payroll',         path: '/rh-payroll',                                         label: 'Folha de Salários' },
  { name: '39-calendario',         path: '/calendario-academico',                               label: 'Calendário Académico' },
  { name: '40-eventos',            path: '/eventos',                                            label: 'Eventos Escolares' },
  { name: '41-biblioteca',         path: '/biblioteca',                                         label: 'Biblioteca' },
  { name: '42-trabalhos-finais',   path: '/trabalhos-finais',                                   label: 'Trabalhos Finais de Curso' },
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
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(btn => {
      if (btn.textContent?.trim() === 'Agora não') btn.click();
    });
  }).catch(() => {});
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

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(1500);
  await injectAuth(page, TOKEN, AUTH_USER);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
  await sleep(6000);
  await dismissOverlays(page);

  // Verificar se auth completou — esperar até login modal desaparecer
  for (let i = 0; i < 10; i++) {
    const loginStillVisible = await page.evaluate(() =>
      !!document.querySelector('input[placeholder*="utilizador"], input[placeholder*="email"]')
    ).catch(() => false);
    if (!loginStillVisible) break;
    console.log(`[auth] Aguardar auth... tentativa ${i+1}`);
    await injectAuth(page, TOKEN, AUTH_USER);
    await sleep(2000);
  }
  console.log('[auth] Director autenticado');

  const results = [];

  for (const section of SECTIONS) {
    try {
      process.stdout.write(`[screenshot] ${section.name} — ${section.label} ... `);
      await page.goto(`${BASE}${section.path}`, { waitUntil: 'load', timeout: 20000 });
      await sleep(3500);
      await dismissOverlays(page);
      await sleep(300);

      // Se login modal aparecer, re-injectar e aguardar
      const needsReauth = await page.evaluate(() =>
        !!document.querySelector('input[placeholder*="utilizador"], input[placeholder*="email"]')
      ).catch(() => false);
      if (needsReauth) {
        await injectAuth(page, TOKEN, AUTH_USER);
        await sleep(3000);
        // reload silencioso sem navegar
        await page.evaluate(() => location.reload());
        await sleep(5000);
        await dismissOverlays(page);
      }

      const outPath = path.join(OUT_DIR, `${section.name}.png`);
      await page.screenshot({ path: outPath });
      results.push({ ...section, file: outPath, ok: true });
      console.log('✅');
    } catch (err) {
      console.log(`❌ ${err.message.slice(0, 60)}`);
      results.push({ ...section, ok: false });
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(results, null, 2));
  console.log('\n✅ Capturas:', results.filter(r => r.ok).length, '/', results.length);
})();
