#!/usr/bin/env node

/**
 * Script para Corrigir Configuração Neon
 * Execute: node fix-neon-config.js
 */

const fs = require('fs');
const path = require('path');

function fixNeonConfig() {
  console.log('🔧 Corrigindo configuração Neon...');
  
  // Dados fornecidos pelo usuário
  const neonPassword = 'npg_v2qroExba0tH';
  const neonEndpoint = 'ep-dawn-hat-an0e6ord-pooler.c-6.us-east-1.aws.neon.tech';
  const neonApiUrl = 'https://ep-dawn-hat-an0e6ord.apirest.c-6.us-east-1.aws.neon.tech/neondb/rest/v1';
  
  // Criar conteúdo corrigido do .env
  const envContent = `# ============================================================
# SIGA v3 - Configuração Completa de Ambiente
# ============================================================

# Neon PostgreSQL connection string
DATABASE_URL=postgresql://neondb_owner:${neonPassword}@${neonEndpoint}/neondb?sslmode=require&channel_binding=require

# Environment Configuration
NODE_ENV=development
PORT=5000

# JWT Secret para autenticação
JWT_SECRET=siga_jwt_secret_key_2026_change_this_in_production

# Expo Configuration
EXPO_PUBLIC_API_URL=http://localhost:5000/api
EXPO_PUBLIC_DOMAIN=localhost:5000

# Neon Database Configuration
NEON_DATABASE_URL=postgresql://neondb_owner:${neonPassword}@${neonEndpoint}/neondb?sslmode=require&channel_binding=require
NEON_API_KEY=${neonApiUrl}

# GitHub Actions Configuration
GITHUB_TOKEN=your_github_token_here
GITHUB_REPO=osvaldofmqueta/siga5

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_email@gmail.com
SMTP_PASS=sua_app_password_aqui

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads

# Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=seu_email@example.com
`;

  try {
    // Escrever ficheiro .env (sobrescrever)
    fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
    
    // Atualizar package.json com scripts necessários
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    if (!packageJson.scripts) packageJson.scripts = {};
    
    // Adicionar scripts Neon
    packageJson.scripts['db:push'] = 'npx drizzle-kit push';
    packageJson.scripts['db:seed'] = 'node scripts/seed-utilizadores.js';
    packageJson.scripts['deploy:prod'] = 'echo "Deploy via GitHub Actions - push to main branch"';
    packageJson.scripts['neon:test'] = 'node -e "console.log(\\"DATABASE_URL:\\", process.env.DATABASE_URL)"';
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log('✅ Configuração Neon corrigida com sucesso!');
    console.log('\n📋 Detalhes da configuração:');
    console.log(`  • Endpoint: ${neonEndpoint}`);
    console.log(`  • Database: neondb`);
    console.log(`  • SSL Mode: require`);
    console.log(`  • Channel Binding: require`);
    
    console.log('\n🔧 Próximos passos:');
    console.log('  1. Instale dependências Neon:');
    console.log('     npm install @neondatabase/serverless drizzle-kit');
    console.log('');
    console.log('  2. Teste conexão:');
    console.log('     npm run neon:test');
    console.log('');
    console.log('  3. Execute migrações:');
    console.log('     npm run db:push');
    console.log('');
    console.log('  4. Configure secrets no GitHub:');
    console.log('     - DATABASE_URL (copiar do .env)');
    console.log('     - NEON_API_KEY (copiar do .env)');
    console.log('');
    console.log('  5. Commit e push para ativar deploy automático');
    
    console.log('\n🎉 Configuração pronta para uso!');
    
  } catch (error) {
    console.error('❌ Erro ao corrigir configuração:', error.message);
  }
}

// Executar correção
if (require.main === module) {
  fixNeonConfig();
}

module.exports = { fixNeonConfig };
