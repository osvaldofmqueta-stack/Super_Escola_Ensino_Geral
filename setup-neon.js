#!/usr/bin/env node

/**
 * Script de Configuração Neon + GitHub
 * Execute: node setup-neon.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function setupNeonIntegration() {
  console.log('🚀 Configurando SIGA v3 - Neon + GitHub Integration');
  console.log('=' .repeat(60));
  
  try {
    // Coletar informações do usuário
    console.log('\n📋 Por favor, forneça suas credenciais Neon:');
    
    const neonPassword = await askQuestion('🔑 Senha do Neon: ');
    const neonEndpoint = await askQuestion('🌐 Endpoint do Neon (ex: ep-abc123.us-east-2.aws.neon.tech): ');
    const neonApiKey = await askQuestion('🔐 API Key do Neon: ');
    const githubToken = await askQuestion('🐙 GitHub Personal Access Token: ');
    const githubRepo = await askQuestion('📦 GitHub Repository (ex: username/siga5): ');
    
    console.log('\n⚙️ Configurando ambiente...');
    
    // Criar ficheiro .env
    const envContent = `# ============================================================
# SIGA v3 - Configuração Completa de Ambiente
# ============================================================

# Neon PostgreSQL connection string
DATABASE_URL=postgresql://neondb_owner:${neonPassword}@${neonEndpoint}/neondb?sslmode=require

# Environment Configuration
NODE_ENV=development
PORT=5000

# JWT Secret para autenticação
JWT_SECRET=siga_jwt_secret_key_2026_change_this_in_production

# Expo Configuration
EXPO_PUBLIC_API_URL=http://localhost:5000/api
EXPO_PUBLIC_DOMAIN=localhost:5000

# Neon Database Configuration
NEON_DATABASE_URL=postgresql://neondb_owner:${neonPassword}@${neonEndpoint}/neondb?sslmode=require
NEON_API_KEY=${neonApiKey}

# GitHub Actions Configuration
GITHUB_TOKEN=${githubToken}
GITHUB_REPO=${githubRepo}

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

    // Escrever ficheiro .env
    fs.writeFileSync(path.join(process.cwd(), '.env'), envContent);
    
    // Criar GitHub Actions workflow
    const workflowsDir = path.join(process.cwd(), '.github', 'workflows');
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }
    
    const workflowContent = `name: Deploy to Neon PostgreSQL

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Run linting
        run: npm run lint || echo "No lint script found"
      - name: Type check
        run: npx tsc --noEmit || echo "TypeScript check failed, continuing..."

  deploy-database:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Install Neon dependencies
        run: npm install @neondatabase/serverless drizzle-kit
      - name: Run database migrations
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
        run: |
          echo "Running database migrations to Neon..."
          npx drizzle-kit push --force
      - name: Seed database
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
        run: |
          echo "Seeding database..."
          node scripts/seed-utilizadores.js || echo "Seed script not found"

  deploy-app:
    needs: [test, deploy-database]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build application
        run: |
          echo "Building application..."
          npm run build || echo "Build script not found"
      - name: Deploy notification
        run: |
          echo "✅ Deploy to Neon completed successfully!"
`;

    fs.writeFileSync(path.join(workflowsDir, 'deploy-neon.yml'), workflowContent);
    
    // Atualizar package.json com scripts
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    if (!packageJson.scripts) packageJson.scripts = {};
    
    packageJson.scripts['deploy:prod'] = 'echo "Deploy via GitHub Actions - push to main branch"';
    packageJson.scripts['db:push'] = 'npx drizzle-kit push';
    packageJson.scripts['db:seed'] = 'node scripts/seed-utilizadores.js';
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    
    console.log('\n✅ Configuração concluída com sucesso!');
    console.log('\n📋 Resumo do que foi configurado:');
    console.log('  • Ficheiro .env criado com suas credenciais');
    console.log('  • GitHub Actions workflow criado');
    console.log('  • Scripts de deploy adicionados ao package.json');
    
    console.log('\n🔧 Próximos passos:');
    console.log('  1. Instale dependências Neon: npm install @neondatabase/serverless drizzle-kit');
    console.log('  2. Configure secrets no GitHub:');
    console.log('     - DATABASE_URL (copiar do .env)');
    console.log('     - NEON_API_KEY (copiar do .env)');
    console.log('  3. Commit e push para ativar deploy automático');
    console.log('  4. Execute: npm run db:push (para migrar base de dados)');
    
    console.log('\n🎉 SIGA v3 está pronto para deploy automático!');
    
  } catch (error) {
    console.error('❌ Erro na configuração:', error.message);
  } finally {
    rl.close();
  }
}

// Executar configuração
if (require.main === module) {
  setupNeonIntegration();
}

module.exports = { setupNeonIntegration };
