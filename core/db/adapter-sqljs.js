'use strict';
/** Adaptador sql.js (SQLite em WebAssembly) com a mesma interface usada pelo núcleo. */
function norm(args) {
  return args.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v));
}

function createSqlJsAdapter(SQL, bytes) {
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  const api = {
    raw: db,
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql) {
      return {
        get(...args) {
          const s = db.prepare(sql);
          try {
            s.bind(norm(args));
            return s.step() ? s.getAsObject() : undefined;
          } finally {
            s.free();
          }
        },
        all(...args) {
          const s = db.prepare(sql);
          const out = [];
          try {
            s.bind(norm(args));
            while (s.step()) out.push(s.getAsObject());
          } finally {
            s.free();
          }
          return out;
        },
        run(...args) {
          const s = db.prepare(sql);
          try {
            s.bind(norm(args));
            s.step();
          } finally {
            s.free();
          }
          const changes = db.getRowsModified();
          const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
          return { changes, lastInsertRowid: id };
        },
      };
    },
    export() {
      const data = db.export();
      db.exec('PRAGMA foreign_keys = ON');
      return data;
    },
    close() {
      db.close();
    },
  };
  return api;
}

module.exports = { createSqlJsAdapter };
