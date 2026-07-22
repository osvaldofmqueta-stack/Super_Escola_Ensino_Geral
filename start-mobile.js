#!/usr/bin/env node

/**
 * Script para iniciar aplicação mobile com QR Code
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('📱 Iniciando SIGA Mobile com QR Code...');
console.log('=' .repeat(50));

// Configurar variáveis de ambiente
process.env.NODE_ENV = 'development';
process.env.CI = '1';

// Iniciar Expo
const expo = spawn('npx', ['expo', 'start', '--web', '--port', '8001', '--clear'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true
});

expo.on('close', (code) => {
  console.log(`\nExpo process exited with code ${code}`);
});

expo.on('error', (error) => {
  console.error('❌ Error starting Expo:', error.message);
});

// Mostrar instruções
setTimeout(() => {
  console.log('\n📋 Instruções para acessar no celular:');
  console.log('1. Instale o app Expo Go (Play Store/App Store)');
  console.log('2. Escaneie o QR Code acima com o Expo Go');
  console.log('3. Ou acesse via tunnel URL que vai aparecer');
  console.log('4. Use as credenciais: ceo@sige.ao / Ceo@2025');
  console.log('\n💻 Web: http://localhost:8000');
  console.log('📱 Mobile: Via Expo Go ou tunnel URL');
}, 3000);
