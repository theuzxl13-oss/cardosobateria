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

// Versão dos arquivos: muda quando JS/CSS mudam, forçando o navegador a baixar a versão nova
const crypto = require('crypto');
const hash = crypto.createHash('sha256');
for (const dir of ['docs/js', 'docs/css', 'docs/vendor']) {
  for (const f of fs.readdirSync(path.join(root, dir)).sort()) hash.update(fs.readFileSync(path.join(root, dir, f)));
}
const version = hash.digest('hex').slice(0, 10);
for (const html of ['docs/index.html', 'docs/admin/index.html']) {
  const file = path.join(root, html);
  const src = fs.readFileSync(file, 'utf8');
  const out = src.replace(/((?:src|href)="(?!https?:)[^"]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1?v=${version}"`);
  fs.writeFileSync(file, out);
}
console.log(`Build concluído: docs/js/core.bundle.js e docs/vendor/* (versão dos arquivos ${version})`);
