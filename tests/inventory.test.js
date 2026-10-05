'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { freshDb, fixture, product, movements, checkout } = require('./helpers');
const db = require('../core/db');
const orders = require('../core/services/orders');
const inventory = require('../core/services/inventory');
const catalog = require('../core/services/catalog');

const rejects = (fn, status, re) => {
  try {
    fn();
  } catch (e) {
    assert.equal(e.status, status, `status esperado ${status}, recebido ${e.status}: ${e.message}`);
    if (re) assert.match(e.message, re);
    return e;
  }
  assert.fail('deveria ter lançado erro');
};

test('compra acima do disponível é recusada e nada é gravado', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 4 }])), 409, /Estoque insuficiente/);
  assert.equal(product(p.id).stock_qty, 3);
  assert.equal(product(p.id).reserved_qty, 0);
  assert.equal(db.get().prepare('SELECT COUNT(*) c FROM orders').get().c, 0);
  assert.equal(movements("type = 'reserva'").length, 0);
});

test('reserva desconta o disponível e impede a venda do mesmo item duas vezes', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o1 = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  assert.equal(o1.status, 'aguardando_pagamento');
  assert.equal(product(p.id).reserved_qty, 2);
  assert.equal(catalog.getPublic(p.id).available_qty, 1, 'catálogo mostra disponível descontando reservas');
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 2 }])), 409);
  orders.createOrder(checkout([{ productId: p.id, quantity: 1 }]));
  assert.equal(catalog.getPublic(p.id).available_qty, 0);
  assert.equal(product(p.id).stock_qty, 3, 'reserva não altera o estoque físico');
});

test('pedido com vários itens é atômico: falha em um item desfaz todas as reservas', async () => {
  await freshDb();
  const { p, p2 } = fixture({ stock: 3 });
  rejects(() => orders.createOrder(checkout([{ productId: p2.id, quantity: 2 }, { productId: p.id, quantity: 10 }])), 409);
  assert.equal(product(p2.id).reserved_qty, 0);
  assert.equal(db.get().prepare('SELECT COUNT(*) c FROM orders').get().c, 0);
  assert.equal(db.get().prepare('SELECT COUNT(*) c FROM order_items').get().c, 0);
});

test('itens duplicados no carrinho são somados antes de validar o estoque', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 2 }])), 409);
});

test('conclusão converte a reserva em saída uma única vez', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  orders.changeStatus(o.id, 'concluido', { user: 'Teste' });
  let pr = product(p.id);
  assert.equal(pr.stock_qty, 1);
  assert.equal(pr.reserved_qty, 0);
  rejects(() => orders.changeStatus(o.id, 'concluido', { user: 'Teste' }), 409);
  // tentativa direta de baixa duplicada (bloqueada pelo índice único)
  rejects(() => db.tx(() => inventory.applyMovement({ productId: p.id, type: 'baixa_venda', quantity: 1, reason: 'x', user: 'x', orderId: o.id })), 409);
  pr = product(p.id);
  assert.equal(pr.stock_qty, 1);
  assert.equal(movements("type = 'baixa_venda' AND order_id = ?", o.id).length, 1);
  assert.equal(orders.getById(o.id).stock_state, 'baixado');
});

test('cancelamento libera a reserva e não pode ser repetido', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 3 }]));
  assert.equal(catalog.getPublic(p.id).available_qty, 0);
  orders.changeStatus(o.id, 'cancelado', { user: 'Teste', reason: 'teste' });
  assert.equal(product(p.id).reserved_qty, 0);
  assert.equal(product(p.id).stock_qty, 3);
  assert.equal(catalog.getPublic(p.id).available_qty, 3);
  rejects(() => orders.changeStatus(o.id, 'cancelado', { user: 'Teste' }), 409);
  rejects(() => orders.changeStatus(o.id, 'concluido', { user: 'Teste' }), 409);
  rejects(() => db.tx(() => inventory.applyMovement({ productId: p.id, type: 'liberacao', quantity: 1, reason: 'x', user: 'x', orderId: o.id })), 409);
  assert.equal(movements("type = 'liberacao' AND order_id = ?", o.id).length, 1);
});

test('cancelar venda concluída devolve ao estoque uma única vez', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  orders.changeStatus(o.id, 'concluido', { user: 'Teste' });
  orders.changeStatus(o.id, 'cancelado', { user: 'Teste', reason: 'devolução' });
  assert.equal(product(p.id).stock_qty, 3);
  assert.equal(orders.getById(o.id).stock_state, 'devolvido');
  rejects(() => db.tx(() => inventory.applyMovement({ productId: p.id, type: 'devolucao', quantity: 2, reason: 'x', user: 'x', orderId: o.id })), 409, /duplicada/);
  assert.equal(product(p.id).stock_qty, 3);
});

test('estoque nunca fica negativo (regras e restrições do banco)', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  rejects(() => inventory.registerManual({ productId: p.id, type: 'saida', quantity: 2, reason: 'perda', user: 'T' }), 409, /disponível/);
  rejects(() => inventory.registerManual({ productId: p.id, type: 'ajuste', newQty: 1, reason: 'contagem', user: 'T' }), 409, /reservas/);
  inventory.registerManual({ productId: p.id, type: 'saida', quantity: 1, reason: 'perda', user: 'T' });
  assert.equal(product(p.id).stock_qty, 2);
  assert.throws(() => db.get().prepare('UPDATE products SET stock_qty = -1 WHERE id = ?').run(p.id), /constraint/i);
  assert.throws(() => db.get().prepare('UPDATE products SET reserved_qty = 99 WHERE id = ?').run(p.id), /constraint/i);
  assert.throws(() => db.get().prepare('UPDATE store_stock SET stock_qty = -1 WHERE product_id = ?').run(p.id), /constraint/i);
});

test('movimentações registram data, quantidade, motivo e responsável', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  inventory.registerManual({ productId: p.id, type: 'entrada', quantity: 5, reason: 'NF 123', user: 'Maria', unitCostCents: 26000, updateCost: true });
  const m = movements("type = 'entrada' AND reason = 'NF 123'")[0];
  assert.equal(m.quantity, 5);
  assert.equal(m.user_name, 'Maria');
  assert.equal(m.stock_after, 8);
  assert.ok(m.created_at);
  assert.equal(product(p.id).cost_cents, 26000);
  rejects(() => inventory.registerManual({ productId: p.id, type: 'entrada', quantity: 1, reason: '', user: 'Maria' }), 422);
  rejects(() => inventory.registerManual({ productId: p.id, type: 'entrada', quantity: 0, reason: 'x', user: 'Maria' }), 422);
});

test('pedido preserva preço e dados do produto no momento da compra', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3, price: '400,00' });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 1 }]));
  catalog.update(p.id, { price_cents: '999,00', name: 'Nome Alterado' });
  const it = orders.getById(o.id).items[0];
  assert.equal(it.unit_price_cents, 40000);
  assert.equal(it.name, 'Bateria Teste 60Ah');
  assert.equal(orders.getById(o.id).total_cents, 40000);
});

test('preço promocional é aplicado pelo servidor', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3, price: '400,00' });
  catalog.update(p.id, { promo_price_cents: '350,00' });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  assert.equal(o.subtotal_cents, 70000);
});

test('reserva expirada é cancelada e liberada automaticamente', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }]));
  assert.equal(orders.expireOrders(new Date()), 0);
  const later = new Date(Date.parse(o.expires_at) + 1000);
  assert.equal(orders.expireOrders(later), 1);
  const x = orders.getById(o.id);
  assert.equal(x.status, 'cancelado');
  assert.equal(x.stock_state, 'liberado');
  assert.equal(product(p.id).reserved_qty, 0);
  assert.equal(orders.expireOrders(later), 0, 'não expira duas vezes');
});

test('pagamento aprovado confirma o pedido sem baixar o estoque; pagamento é separado do status', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 1 }]));
  const r1 = orders.simulatePayment(o.code, o.access_token, 'recusado');
  assert.equal(r1.payment_status, 'recusado');
  assert.equal(r1.status, 'aguardando_pagamento');
  const r2 = orders.simulatePayment(o.code, o.access_token, 'aprovado');
  assert.equal(r2.payment_status, 'aprovado');
  assert.equal(r2.status, 'confirmado');
  assert.equal(r2.stock_state, 'reservado');
  assert.equal(product(p.id).stock_qty, 3);
  rejects(() => orders.simulatePayment(o.code, o.access_token, 'aprovado'), 409);
  rejects(() => orders.simulatePayment(o.code, 'token-errado', 'aprovado'), 404);
  // pedido pago não expira
  assert.equal(orders.expireOrders(new Date(Date.parse(o.expires_at) + 1000)), 0);
});

test('pagamento na retirada não pode ser simulado online', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { paymentMethod: 'retirada' }));
  rejects(() => orders.simulatePayment(o.code, o.access_token, 'aprovado'), 409);
});

test('checkout: endereço obrigatório somente para entrega', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const e = rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { fulfillment: 'entrega' })), 422);
  assert.ok(e.details.fields['address.street']);
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { fulfillment: 'entrega', paymentMethod: 'retirada', address: { street: 'R', number: '1', district: 'B', city: 'C' } })), 422);
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { fulfillment: 'entrega', address: { street: 'Rua A', number: '10', district: 'Centro', city: 'São Paulo', zip: '01000-000' } }));
  assert.equal(o.shipping_cents, 2500, 'frete demonstrativo padrão');
  const v = rejects(() => orders.createOrder({ items: [{ productId: p.id, quantity: 1 }] }), 422);
  assert.ok(v.details.fields.name && v.details.fields.phone);
});

test('consulta de pedido exige código e telefone corretos', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 1 }]));
  assert.equal(orders.lookup(o.code, '11900001234').id, o.id);
  rejects(() => orders.lookup(o.code, '11999999999'), 404);
  rejects(() => orders.lookup('CB000000-XXXXX', '11900001234'), 404);
});

test('produto com histórico de venda não pode ser excluído, apenas desativado', async () => {
  await freshDb();
  const { p, p2 } = fixture({ stock: 3 });
  orders.createOrder(checkout([{ productId: p.id, quantity: 1 }]));
  rejects(() => catalog.remove(p.id), 409, /histórico/);
  catalog.setActive(p.id, false);
  rejects(() => catalog.getPublic(p.id), 404);
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 1 }])), 409);
  // sem histórico: exclui e preserva as movimentações
  catalog.remove(p2.id);
  const m = movements("product_sku = 'TST-45'");
  assert.equal(m.length, 1);
  assert.equal(m[0].product_id, null);
});

test('venda de balcão pode ser registrada, paga e concluída numa só operação', async () => {
  await freshDb();
  const { p } = fixture({ stock: 3 });
  const o = orders.createCounterSale({ name: 'Balcão', phone: '11900000000', paymentMethod: 'dinheiro', paid: true, complete: true, items: [{ productId: p.id, quantity: 2 }] }, { user: 'Admin' });
  assert.equal(o.status, 'concluido');
  assert.equal(o.payment_status, 'aprovado');
  assert.equal(product(p.id).stock_qty, 1);
  rejects(() => orders.createCounterSale({ name: 'Balcão', phone: '11900000000', items: [{ productId: p.id, quantity: 2 }], complete: true }, { user: 'Admin' }), 409);
  assert.equal(product(p.id).stock_qty, 1);
});

/* ---------------- Estoque por loja ---------------- */
const { assertTotals } = require('./helpers');

test('retirada reserva na loja escolhida; outra loja sem estoque é recusada', async () => {
  await freshDb();
  const { p, storeA, storeB } = fixture({ stock: 3 }); // estoque inicial na Loja A
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { pickupStoreId: storeB.id })), 409, /Loja B/);
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 2 }], { pickupStoreId: storeA.id }));
  assert.equal(o.stock_store_id, storeA.id);
  assert.equal(o.pickup_store_name, 'Loja A');
  assert.equal(inventory.storeRow(p.id, storeA.id).reserved_qty, 2);
  assert.equal(inventory.storeRow(p.id, storeB.id).reserved_qty, 0);
  orders.changeStatus(o.id, 'concluido', { user: 'T' });
  assert.equal(inventory.storeRow(p.id, storeA.id).stock_qty, 1);
  assertTotals(p.id);
});

test('transferência entre lojas move o estoque e respeita o disponível', async () => {
  await freshDb();
  const { p, storeA, storeB } = fixture({ stock: 3 });
  orders.createOrder(checkout([{ productId: p.id, quantity: 2 }], { pickupStoreId: storeA.id }));
  rejects(() => inventory.registerManual({ productId: p.id, storeId: storeA.id, toStoreId: storeB.id, type: 'transferencia', quantity: 2, reason: 'x', user: 'T' }), 409, /disponível/);
  rejects(() => inventory.registerManual({ productId: p.id, storeId: storeA.id, toStoreId: storeA.id, type: 'transferencia', quantity: 1, reason: 'x', user: 'T' }), 422);
  inventory.registerManual({ productId: p.id, storeId: storeA.id, toStoreId: storeB.id, type: 'transferencia', quantity: 1, reason: 'reforço', user: 'T' });
  assert.deepEqual(inventory.storeRow(p.id, storeA.id), { stock_qty: 2, reserved_qty: 2 });
  assert.deepEqual(inventory.storeRow(p.id, storeB.id), { stock_qty: 1, reserved_qty: 0 });
  assert.equal(product(p.id).stock_qty, 3, 'total não muda na transferência');
  const ms = movements("reason LIKE 'Transferência%'");
  assert.equal(ms.length, 2);
  assert.deepEqual(ms.map((m) => [m.type, m.store_name]), [['saida', 'Loja A'], ['entrada', 'Loja B']]);
  // agora a Loja B atende retirada
  orders.createOrder(checkout([{ productId: p.id, quantity: 1 }], { pickupStoreId: storeB.id }));
  assertTotals(p.id);
});

test('entrega escolhe uma loja que tenha todos os itens; sem nenhuma, recusa', async () => {
  await freshDb();
  const { p, p2, storeA, storeB } = fixture({ stock: 3 });
  // p só na Loja A; p2 movido inteiro para a Loja B
  inventory.registerManual({ productId: p2.id, storeId: storeA.id, toStoreId: storeB.id, type: 'transferencia', quantity: 5, reason: 'x', user: 'T' });
  const addr = { street: 'Rua A', number: '1', district: 'Centro', city: 'SP' };
  const o = orders.createOrder(checkout([{ productId: p2.id, quantity: 1 }], { fulfillment: 'entrega', address: addr }));
  assert.equal(o.stock_store_id, storeB.id);
  rejects(() => orders.createOrder(checkout([{ productId: p.id, quantity: 1 }, { productId: p2.id, quantity: 1 }], { fulfillment: 'entrega', address: addr })), 409, /Nenhuma loja/);
  const q = orders.quote([{ productId: p.id, quantity: 1 }]);
  assert.deepEqual(q.stores.map((s) => [s.name, s.ok]), [['Loja A', true], ['Loja B', false]]);
  assertTotals(p.id);
  assertTotals(p2.id);
});

test('ajuste e cancelamento operam na loja do pedido', async () => {
  await freshDb();
  const { p, storeA, storeB } = fixture({ stock: 3 });
  inventory.registerManual({ productId: p.id, storeId: storeB.id, type: 'ajuste', newQty: 4, reason: 'contagem', user: 'T' });
  assert.equal(product(p.id).stock_qty, 7);
  const o = orders.createOrder(checkout([{ productId: p.id, quantity: 4 }], { pickupStoreId: storeB.id }));
  rejects(() => inventory.registerManual({ productId: p.id, storeId: storeB.id, type: 'ajuste', newQty: 3, reason: 'contagem', user: 'T' }), 409, /reservas/);
  orders.changeStatus(o.id, 'cancelado', { user: 'T' });
  assert.deepEqual(inventory.storeRow(p.id, storeB.id), { stock_qty: 4, reserved_qty: 0 });
  assert.deepEqual(inventory.storeRow(p.id, storeA.id), { stock_qty: 3, reserved_qty: 0 });
  assertTotals(p.id);
});
