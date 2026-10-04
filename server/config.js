'use strict';
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}
// Datas de relatórios ("vendas do dia") usam o fuso da loja.
process.env.TZ = process.env.TZ || 'America/Sao_Paulo';

const bool = (v, def) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'sim'].includes(String(v).toLowerCase()));

module.exports = {
  root,
  port: Number(process.env.PORT) || 3000,
  dbFile: process.env.DATABASE_FILE === ':memory:' ? ':memory:' : path.resolve(root, process.env.DATABASE_FILE || 'data/cardoso.db'),
  seedOnEmpty: bool(process.env.SEED_ON_EMPTY, true),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  sessionHours: Number(process.env.SESSION_HOURS) || 12,
  adminName: process.env.ADMIN_NAME || 'Administrador Demo',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@cardosobaterias.demo',
  adminPassword: process.env.ADMIN_PASSWORD || 'Cardoso@2026',
  chatProvider: process.env.CHAT_PROVIDER || 'rules',
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || '',
  expirySweepSeconds: Number(process.env.EXPIRY_SWEEP_SECONDS) || 60,
  trustProxy: bool(process.env.TRUST_PROXY, false),
};
