'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const initSqlJs = require('sql.js');
const db = require('../core/db');
const { createSqlJsAdapter } = require('../core/db/adapter-sqljs');
const seed = require('../core/services/seed');
const catalog = require('../core/services/catalog');
const chat = require('../core/chat');

test('chatbot por regras responde somente com dados cadastrados', async () => {
  db.use(createSqlJsAdapter(await initSqlJs()));
  seed.seedIfEmpty({ name: 'Admin', email: 'a@a.demo', password: 'Senha@123' });

  const r60 = await chat.reply('Quanto custa a bateria 60Ah?');
  assert.equal(r60.provider, 'regras');
  assert.ok(r60.products.length > 0);
  for (const p of r60.products) {
    assert.equal(p.capacity_ah, 60);
    const real = catalog.getPublic(p.id);
    assert.equal(p.price_cents, real.final_price_cents, 'preço igual ao cadastro');
    assert.equal(p.available_qty, real.available_qty, 'disponibilidade igual ao cadastro');
  }

  const unknown = await chat.reply('qual a capital da mongólia?');
  assert.equal(unknown.understood, false);
  assert.match(unknown.whatsapp.url, /^https:\/\/wa\.me\/5511962986718\?text=/);

  const noApp = await chat.reply('qual bateria serve no civic 2021?');
  assert.equal(noApp.understood, false, 'não adivinha bateria sem aplicação cadastrada');
  assert.equal(noApp.products, undefined);

  const gol = await chat.reply('bateria para gol 2015');
  assert.ok(gol.products.length > 0);
  assert.match(gol.text, /Confirme a compatibilidade/);

  const garantia = await chat.reply('qual a garantia?');
  assert.match(garantia.text, /meses/);

  const entrega = await chat.reply('vocês entregam?');
  assert.match(entrega.text, /Frete/);

  const human = await chat.reply('quero falar com um atendente');
  assert.match(human.text, /WhatsApp/);

  const svc = await chat.reply('vocês fazem instalação?');
  assert.ok(/Instala/i.test(svc.text));
});
