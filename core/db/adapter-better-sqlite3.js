'use strict';
/** Adaptador para Node (servidor) usando better-sqlite3 com arquivo local. */
function createBetterSqliteAdapter(file) {
  const fs = require('fs');
  const path = require('path');
  const Database = require('better-sqlite3');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  const norm = (args) => args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  return {
    raw: db,
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const s = db.prepare(sql);
      const reader = s.reader;
      return {
        get: (...a) => (reader ? s.get(...norm(a)) : (s.run(...norm(a)), undefined)),
        all: (...a) => s.all(...norm(a)),
        run: (...a) => {
          const r = s.run(...norm(a));
          return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
        },
      };
    },
    close: () => db.close(),
  };
}
module.exports = { createBetterSqliteAdapter };
