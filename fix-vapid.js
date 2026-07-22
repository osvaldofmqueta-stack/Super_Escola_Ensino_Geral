#!/usr/bin/env node

/**
 * Script para Corrigir Chaves VAPID
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function fixVapidKeys() {
  console.log('🔧 Gerando chaves VAPID válidas...');
  
  // Gerar chaves VAPID válidas
  const vapidKeys = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });
  
  // Converter para base64url
  const publicKey = vapidKeys.publicKey.toString('base64url');
  const privateKey = vapidKeys.privateKey.toString('base64url');
  
  // Ler .env atual
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (error) {
    console.error('❌ Erro ao ler .env:', error.message);
    return;
  }
  
  // Substituir chaves VAPID
  envContent = envContent.replace(
    /VAPID_PUBLIC_KEY=your_vapid_public_key/g,
    `VAPID_PUBLIC_KEY=${publicKey}`
  );
  
  envContent = envContent.replace(
    /VAPID_PRIVATE_KEY=your_vapid_private_key/g,
    `VAPID_PRIVATE_KEY=${privateKey}`
  );
  
  // Escrever .env atualizado
  fs.writeFileSync(envPath, envContent);
  
  console.log('✅ Chaves VAPID geradas e configuradas!');
  console.log('');
  console.log('📋 Chaves geradas:');
  console.log(`  • Public Key: ${publicKey}`);
  console.log(`  • Private Key: ${privateKey}`);
  console.log('');
  console.log('🚀 Agora pode executar a aplicação!');
  
  return { publicKey, privateKey };
}

// Executar correção
if (require.main === module) {
  fixVapidKeys();
}

module.exports = { fixVapidKeys };
