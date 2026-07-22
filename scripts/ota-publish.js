#!/usr/bin/env node
/**
 * Script de publicação OTA para o Super Escola
 * Uso: node scripts/ota-publish.js [canal] [mensagem]
 *   canal: production (padrão) | preview | development
 *   mensagem: descrição da actualização (opcional)
 *
 * Exemplos:
 *   node scripts/ota-publish.js
 *   node scripts/ota-publish.js production "Correcção de erro no módulo de notas"
 *   node scripts/ota-publish.js preview "Teste de nova funcionalidade"
 */

const { execSync } = require("child_process");
const path = require("path");

const channel = process.argv[2] || "production";
const message = process.argv[3] || `OTA update - ${new Date().toISOString().slice(0, 10)}`;

const ALLOWED_CHANNELS = ["production", "preview", "development"];
if (!ALLOWED_CHANNELS.includes(channel)) {
  console.error(`❌ Canal inválido: "${channel}". Use: ${ALLOWED_CHANNELS.join(", ")}`);
  process.exit(1);
}

const easBin = path.resolve(process.cwd(), "node_modules/.bin/eas");

console.log(`\n🚀 Super Escola — Publicação OTA`);
console.log(`   Canal: ${channel}`);
console.log(`   Mensagem: ${message}`);
console.log(`   Token EAS: ${process.env.EXPO_TOKEN ? "✅ configurado" : "❌ EXPO_TOKEN não definido"}\n`);

if (!process.env.EXPO_TOKEN) {
  console.error("❌ EXPO_TOKEN não está definido. Configure-o nas variáveis de ambiente.");
  process.exit(1);
}

try {
  console.log("📦 A publicar actualização OTA...");
  execSync(
    `"${easBin}" update --channel ${channel} --message "${message}" --non-interactive`,
    {
      stdio: "inherit",
      env: { ...process.env },
      cwd: process.cwd(),
    }
  );
  console.log(`\n✅ Actualização OTA publicada com sucesso no canal "${channel}"!`);
  console.log("   Os dispositivos receberão a actualização na próxima abertura da app.");
} catch (err) {
  console.error("\n❌ Erro ao publicar actualização OTA:", err.message);
  process.exit(1);
}
