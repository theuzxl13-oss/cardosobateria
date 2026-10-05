'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cardoso-'));
const dbFile = path.join(dir, 'test.db');
const { createApp } = require('../server/index');
const config = require('../server/config');

async function start() {
  const app = createApp({ dbFile });
  const server = await new Promise((ok) => {
    const s = app.listen(0, () => ok(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, p, body, token) => {
    const r = await fetch(base + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
  };
  return { server, base, call };
}

test('API do servidor: autenticação, pedido, relatórios e persistência após reiniciar', async () => {
  let { server, call, base } = await start();
  try {
    // rotas administrativas protegidas
    assert.equal((await call('GET', '/api/admin/dashboard')).status, 401);
    assert.equal((await call('POST', '/api/auth/login', { email: config.adminEmail, password: 'errada' })).status, 401);
    const login = await call('POST', '/api/auth/login', { email: config.adminEmail, password: config.adminPassword });
    assert.equal(login.status, 200);
    const token = login.body.token;
    assert.equal((await call('GET', '/api/admin/dashboard', null, 'token-invalido')).status, 401);

    // senha armazenada com hash
    const db = require('../core/db');
    const u = db.get().prepare('SELECT password_hash FROM users').get();
    assert.match(u.password_hash, /^\$2[aby]\$/);
    assert.notEqual(u.password_hash, config.adminPassword);

    // catálogo demonstrativo carregado
    const products = await call('GET', '/api/public/products');
    assert.ok(products.body.length >= 12);
    assert.equal(products.body[0].cost_cents, undefined, 'custo não é exposto na loja');
    const caps = new Set(products.body.map((p) => p.capacity_ah));
    for (const c of [45, 50, 60, 70, 90]) assert.ok(caps.has(c), `capacidade ${c}Ah`);

    // pedido pelo site
    const stores = (await call('GET', '/api/public/stores')).body;
    assert.equal(stores.length, 3, 'três unidades cadastradas');
    assert.equal(stores[0].notes, undefined, 'observações internas não são públicas');
    const p0 = products.body.find((x) => x.available_qty >= 2);
    const detail = (await call('GET', `/api/public/products/${p0.id}`)).body;
    const st = detail.stores_stock.find((x) => x.available_qty >= 2);
    const p = { ...p0, available_qty: st.available_qty };
    const pickupStoreId = st.store_id;
    const tooMany = await call('POST', '/api/public/orders', { name: 'Teste API', phone: '11988887777', fulfillment: 'retirada', pickupStoreId, paymentMethod: 'pix', items: [{ productId: p.id, quantity: p.available_qty + 1 }] });
    assert.equal(tooMany.status, 409);
    const order = await call('POST', '/api/public/orders', { name: 'Teste API', phone: '11988887777', fulfillment: 'retirada', pickupStoreId, paymentMethod: 'pix', items: [{ productId: p.id, quantity: 1 }] });
    assert.equal(order.status, 201);
    assert.match(order.body.whatsapp_url, /^https:\/\/wa\.me\/5511962986718\?text=/);
    assert.ok(decodeURIComponent(order.body.whatsapp_url.split('text=')[1]).includes(order.body.code));
    const after = await call('GET', `/api/public/products/${p.id}`);
    assert.equal(after.body.available_qty, p0.available_qty - 1);
    assert.equal(after.body.stores_stock.find((x) => x.store_id === pickupStoreId).available_qty, st.available_qty - 1);
    assert.match(decodeURIComponent(order.body.whatsapp_url), /retirada na loja — Cardoso Baterias/);

    // relatórios
    const matrix = await call('GET', '/api/admin/stock/matrix', null, token);
    assert.equal(matrix.body.stores.length, 3);
    for (const t of ['vendas', 'pedidos', 'estoque', 'movimentacoes']) {
      const r = await call('GET', `/api/admin/reports/${t}`, null, token);
      assert.equal(r.status, 200, t);
      assert.ok(Array.isArray(r.body.rows) && r.body.columns.length);
    }
    // restaurar dados exige confirmação
    assert.equal((await call('POST', '/api/admin/demo/reset', { confirm: 'sim' }, token)).status, 422);

    // estático
    const html = await fetch(base + '/').then((r) => r.text());
    assert.match(html, /Cardoso Baterias/);

    // reinicia o servidor com o mesmo arquivo de banco
    server.close();
    require('../core/db').get().close();
    ({ server, call } = await start());
    const again = await call('POST', '/api/public/orders/lookup', { code: order.body.code, phone: '(11) 98888-7777' });
    assert.equal(again.status, 200, 'pedido persiste após reiniciar');
    const me = await call('GET', '/api/auth/me', null, token);
    assert.equal(me.status, 200, 'sessão persiste após reiniciar');
  } finally {
    server.close();
  }
});
