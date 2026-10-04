'use strict';
/** Restaura os dados demonstrativos no banco do servidor. Uso: npm run reset-demo -- --yes */
const config = require('../server/config');
const db = require('../core/db');
const { createBetterSqliteAdapter } = require('../core/db/adapter-better-sqlite3');
const seed = require('../core/services/seed');
if (!process.argv.includes('--yes')) {
  console.log('Isto apaga TODOS os dados de', config.dbFile, 'e recarrega a demonstração.');
  console.log('Confirme executando: npm run reset-demo -- --yes');
  process.exit(1);
}
db.use(createBetterSqliteAdapter(config.dbFile));
const r = seed.resetDemo({ name: config.adminName, email: config.adminEmail, password: config.adminPassword });
console.log('Dados demonstrativos restaurados:', r);
