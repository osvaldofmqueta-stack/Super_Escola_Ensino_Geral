#!/usr/bin/env node

/**
 * Script para acesso direto via IP
 */

const { spawn } = require('child_process');

console.log('📱 Iniciando SIGA Mobile - Acesso Direto via IP');
console.log('=' .repeat(55));

const localIP = '10.246.242.216';
const port = '8001';

// Configurar variáveis de ambiente
process.env.NODE_ENV = 'development';
process.env.CI = '1';
process.env.EXPO_PUBLIC_API_URL = `http://${localIP}:5000/api`;

console.log(`\n🌐 Seu IP local: ${localIP}`);
console.log(`📱 Porta mobile: ${port}`);
console.log(`🔗 API URL: http://${localIP}:5000/api`);

// Iniciar Expo com tunnel
const expo = spawn('npx', ['expo', 'start', '--web', '--port', port, '--tunnel'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true
});

expo.on('close', (code) => {
  console.log(`\n✅ Expo finalizado com código ${code}`);
});

setTimeout(() => {
  console.log('\n📋 Como acessar no celular:');
  console.log('='.repeat(40));
  console.log(`\n🔗 MÉTODO 1 - Tunnel URL:`);
  console.log(`   Espere aparecer uma URL como: exp://xxx.tunnel.expo.dev`);
  console.log(`   Abra esta URL no navegador do celular`);
  
  console.log(`\n📶 MÉTODO 2 - Rede Local:`);
  console.log(`   1. Conecte o celular na mesma Wi-Fi`);
  console.log(`   2. Abra o Expo Go`);
  console.log(`   3. Digite manualmente: exp://${localIP}:${port}`);
  
  console.log(`\n💻 Web no PC: http://localhost:8000`);
  console.log(`📱 Mobile: Via tunnel ou rede local`);
  console.log(`\n🔑 Login: ceo@sige.ao / Ceo@2025`);
}, 2000);
