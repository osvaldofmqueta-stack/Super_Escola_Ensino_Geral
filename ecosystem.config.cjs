'use strict';

// ══════════════════════════════════════════════════════════════════════════════
//  Super Escola (SIGA) — PM2 Ecosystem Config
//  Ficheiro: ecosystem.config.cjs
//
//  Uso no servidor Hetzner:
//    pm2 start ecosystem.config.cjs          # arrancar
//    pm2 restart superescola --update-env    # reiniciar com vars actualizadas
//    pm2 reload superescola                  # zero-downtime reload
//    pm2 stop superescola                    # parar
//    pm2 delete superescola                  # remover da lista PM2
//    pm2 logs superescola --lines 100        # ver logs
//    pm2 save                                # guardar lista para auto-start
//    pm2 startup                             # configurar auto-start no boot
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const rootDir   = __dirname;
const distEntry = path.join(rootDir, 'server_dist', 'index.js');
const hasDistBuild = fs.existsSync(distEntry);

// ── Carregar .env do disco (garante que PM2 passa as vars ao processo filho) ──
// dotenv.config() dentro do bundle só funciona se o CWD tiver o .env.
// Passar as vars aqui é mais fiável: funciona independentemente do CWD e em
// qualquer cenário de restart/reload do PM2.
const envFile = path.join(rootDir, '.env');
const envFromFile = {};
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) envFromFile[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Caminho para o Chromium — tenta os locais mais comuns em Ubuntu/Debian
const chromiumCandidates = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/local/bin/chromium',
  '/snap/bin/chromium',
];
const chromiumPath = chromiumCandidates.find(p => fs.existsSync(p)) || '/usr/bin/chromium-browser';

// Variáveis de runtime (sobrepõem o .env se necessário)
const runtimeEnv = {
  NODE_ENV:                  'production',
  PORT:                      '5000',
  SERVE_STATIC_WEB:          '1',
  PUPPETEER_SKIP_DOWNLOAD:   'true',
  PUPPETEER_EXECUTABLE_PATH: chromiumPath,
  UV_THREADPOOL_SIZE:        '16',
};

// Combinar: .env como base + runtimeEnv por cima (runtime tem prioridade)
const fullEnv = { ...envFromFile, ...runtimeEnv };

// ── Configuração da aplicação principal ───────────────────────────────────────
const appConfig = hasDistBuild
  ? {
      name:        'superescola',
      script:      distEntry,
      interpreter: 'node',
      args:        '',
    }
  : {
      name:        'superescola',
      script:      path.join(rootDir, 'node_modules', '.bin', 'tsx'),
      interpreter: 'none',
      args:        'server/index.ts',
    };

module.exports = {
  apps: [
    {
      ...appConfig,

      cwd: rootDir,

      env: fullEnv,

      autorestart:        true,
      restart_delay:      3000,
      max_restarts:       10,
      min_uptime:         '10s',

      exec_mode:          'fork',
      instances:          1,

      out_file:           '/var/log/superescola/out.log',
      error_file:         '/var/log/superescola/error.log',
      merge_logs:         true,
      log_date_format:    'YYYY-MM-DD HH:mm:ss',

      max_memory_restart: '1500M',

      watch:              false,
    },
  ],
};
