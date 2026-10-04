'use strict';
/**
 * Backend executado NO NAVEGADOR (modo GitHub Pages / demonstração sem servidor).
 * - Banco: SQLite real (sql.js / WebAssembly), salvo no IndexedDB do navegador.
 * - Mesma API e mesmas regras de negócio do servidor Node (pasta core/).
 * - Várias abas: Web Locks serializam as operações e um número de versão
 *   faz cada aba recarregar o banco quando outra aba gravou algo.
 */
const db = require('./db');
const { createSqlJsAdapter } = require('./db/adapter-sqljs');
const { createRouter } = require('./api/router');
const seed = require('./services/seed');
const defaults = require('./defaults');

const IDB_NAME = 'cardoso-baterias';
const STORE = 'kv';
const KEY_DB = 'database';
const KEY_VER = 'version';

let idbPromise = null;
function idb() {
  if (idbPromise) return idbPromise;
  return (idbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}
async function idbGet(key) {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    t.onsuccess = () => resolve(t.result);
    t.onerror = () => reject(t.error);
  });
}
async function idbPutMany(entries) {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const tr = d.transaction(STORE, 'readwrite');
    const st = tr.objectStore(STORE);
    for (const [k, v] of entries) st.put(v, k);
    tr.oncomplete = () => resolve();
    tr.onerror = () => reject(tr.error);
  });
}

async function createBrowserBackend({ wasmBase }) {
  // eslint-disable-next-line no-undef
  const SQL = await initSqlJs({ locateFile: (f) => wasmBase + f });
  let version = -1;
  let adapter = null;
  let dirty = false;

  async function load() {
    const [bytes, ver] = await Promise.all([idbGet(KEY_DB), idbGet(KEY_VER)]);
    if (adapter && ver === version) return;
    if (adapter) adapter.close();
    try {
      adapter = createSqlJsAdapter(SQL, bytes ? new Uint8Array(bytes) : undefined);
      db.use(adapter);
    } catch (e) {
      console.warn('Banco local inválido; recriando.', e);
      adapter = createSqlJsAdapter(SQL);
      db.use(adapter);
    }
    version = ver || 0;
    if (seed.seedIfEmpty(defaults.admin) || !bytes) await save();
    else if (seed.storedSeedVersion() !== seed.SEED_VERSION) {
      // dados demonstrativos foram atualizados no site: recarrega a demonstração neste navegador
      seed.resetDemo(defaults.admin);
      await save();
    }
  }

  async function save() {
    version += 1;
    await idbPutMany([
      [KEY_DB, adapter.export()],
      [KEY_VER, version],
    ]);
    dirty = false;
    try {
      channel && channel.postMessage({ version });
    } catch {}
  }

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cardoso-db') : null;
  const listeners = new Set();
  if (channel) channel.onmessage = () => listeners.forEach((fn) => fn());

  const router = createRouter({
    admin: defaults.admin,
    onWrite: () => {
      dirty = true;
    },
  });

  const withLock = (fn) => (navigator.locks ? navigator.locks.request('cardoso-db', fn) : fn());

  await withLock(load);

  async function handle(req) {
    return withLock(async () => {
      await load();
      const res = await router.handle(req);
      if (dirty) await save();
      return res;
    });
  }

  // expiração automática de reservas enquanto a página estiver aberta
  setInterval(() => handle({ method: 'GET', path: '/api/health' }), 60000);

  return { handle, mode: 'browser', onExternalChange: (fn) => listeners.add(fn) };
}

window.CBBackend = { createBrowserBackend };
