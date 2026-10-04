'use strict';
/**
 * Pré-visualização igual ao GitHub Pages: serve somente os arquivos estáticos de docs/,
 * sem API. O site usa o banco SQLite no navegador. Uso: npm run preview  (porta 8080)
 */
const path = require('path');
const express = require('express');
const port = Number(process.env.PORT) || 8080;
const app = express();
app.use('/cardosobateria', express.static(path.join(__dirname, '..', 'docs')));
app.get('/', (req, res) => res.redirect('/cardosobateria/'));
app.listen(port, () => console.log(`Pré-visualização estática (como GitHub Pages): http://localhost:${port}/cardosobateria/`));
