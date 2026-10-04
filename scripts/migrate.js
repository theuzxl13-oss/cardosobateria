'use strict';
/** Aplica as migrações pendentes no banco do servidor (DATABASE_FILE). */
const config = require('../server/config');
const db = require('../core/db');
const { createBetterSqliteAdapter } = require('../core/db/adapter-better-sqlite3');
db.use(createBetterSqliteAdapter(config.dbFile));
console.log('Migrações aplicadas em', config.dbFile);
