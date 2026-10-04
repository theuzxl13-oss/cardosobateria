'use strict';
/** Gera docs/js/core.bundle.js (núcleo para o navegador) e copia as bibliotecas de terceiros para docs/vendor. */
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'docs', 'vendor');
fs.mkdirSync(vendor, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'core', 'browser-entry.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  external: ['crypto', 'fs', 'path', 'better-sqlite3'],
  outfile: path.join(root, 'docs', 'js', 'core.bundle.js'),
  legalComments: 'none',
  banner: { js: '/* Cardoso Baterias — núcleo do sistema (gerado por scripts/build.js; não editar à mão) */' },
});

const copy = (from, to) => fs.copyFileSync(path.join(root, 'node_modules', from), path.join(vendor, to));
copy('sql.js/dist/sql-wasm.js', 'sql-wasm.js');
copy('sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm');
copy('jspdf/dist/jspdf.umd.min.js', 'jspdf.umd.min.js');
copy('jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'jspdf.plugin.autotable.min.js');
fs.writeFileSync(path.join(root, 'docs', '.nojekyll'), '');
console.log('Build concluído: docs/js/core.bundle.js e docs/vendor/*');
