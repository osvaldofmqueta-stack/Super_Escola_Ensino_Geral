#!/usr/bin/env node
/**
 * bump-version.js
 * Incrementa automaticamente o patch da versão em package.json.
 * Executado no arranque do servidor — a versão cresce de forma permanente.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const parts = (pkg.version || '3.0.0').split('.').map(Number);
parts[2] = (parts[2] || 0) + 1;
pkg.version = parts.join('.');

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(`[SIGA] Versão actualizada para ${pkg.version}`);
