'use strict';
/**
 * Camada de banco isomórfica.
 * O adaptador expõe a mesma interface em Node (better-sqlite3) e no navegador (sql.js):
 *   exec(sql), prepare(sql).get(...args) / .all(...args) / .run(...args) -> { changes, lastInsertRowid }
 */
const migrations = require('./migrations');

let adapter = null;
let depth = 0;

function use(a) {
  adapter = a;
  depth = 0;
  adapter.exec('PRAGMA foreign_keys = ON');
  migrate();
  return adapter;
}

function get() {
  if (!adapter) throw new Error('Banco de dados não inicializado');
  return adapter;
}

/** Transação com suporte a aninhamento (SAVEPOINT). */
function tx(fn) {
  const d = get();
  const sp = `sp${depth}`;
  d.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
  depth++;
  try {
    const r = fn();
    depth--;
    d.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`);
    return r;
  } catch (e) {
    depth--;
    if (depth === 0) d.exec('ROLLBACK');
    else {
      d.exec(`ROLLBACK TO ${sp}`);
      d.exec(`RELEASE ${sp}`);
    }
    throw e;
  }
}

function migrate() {
  const d = adapter;
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(d.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    tx(() => {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(m.name, new Date().toISOString());
    });
  }
}

let clock = null;
/** Relógio substituível (usado pela carga demonstrativa para gerar histórico com datas passadas). */
function setClock(fn) {
  clock = fn;
}
const now = () => (clock ? clock() : new Date()).toISOString();

module.exports = { use, get, tx, migrate, now, setClock };
