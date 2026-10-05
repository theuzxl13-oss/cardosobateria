'use strict';
const initSqlJs = require('sql.js');
const db = require('../core/db');
const { createSqlJsAdapter } = require('../core/db/adapter-sqljs');
const catalog = require('../core/services/catalog');
const resources = require('../core/services/resources');
const inventory = require('../core/services/inventory');

let SQL = null;

/** Banco novo em memória usando o mesmo motor da demonstração no navegador (sql.js). */
async function freshDb() {
  SQL = SQL || (await initSqlJs());
  db.use(createSqlJsAdapter(SQL));
  return db;
}

let current = {};

function fixture({ stock = 3, price = '400,00', cost = '250,00' } = {}) {
  const storeA = resources.create('stores', { name: 'Loja A', neighborhood: 'Centro' });
  const storeB = resources.create('stores', { name: 'Loja B', neighborhood: 'Bairro' });
  current = { storeA, storeB };
  const brand = resources.create('brands', { name: 'Marca Teste' });
  const p = catalog.create(
    { sku: 'TST-60', name: 'Bateria Teste 60Ah', brand_id: brand.id, capacity_ah: 60, voltage: 12, warranty_months: 12, price_cents: price, cost_cents: cost, min_stock: 1, initial_stock: stock, active: true },
    { user: 'Teste' }
  );
  const p2 = catalog.create(
    { sku: 'TST-45', name: 'Bateria Teste 45Ah', brand_id: brand.id, capacity_ah: 45, voltage: 12, warranty_months: 12, price_cents: '300,00', cost_cents: '200,00', min_stock: 1, initial_stock: 5, active: true },
    { user: 'Teste' }
  );
  return { brand, p, p2, storeA, storeB };
}

const product = (id) => inventory.loadProduct(id);
/** Soma das lojas = total do produto (invariante do estoque por loja). */
function assertTotals(productId) {
  const p = inventory.loadProduct(productId);
  const r = db.get().prepare('SELECT COALESCE(SUM(stock_qty),0) s, COALESCE(SUM(reserved_qty),0) r FROM store_stock WHERE product_id = ?').get(productId);
  if (r.s !== p.stock_qty || r.r !== p.reserved_qty) throw new Error(`Totais divergentes: produto ${p.stock_qty}/${p.reserved_qty}, lojas ${r.s}/${r.r}`);
}

const movements = (where = '1=1', ...args) => db.get().prepare(`SELECT * FROM stock_movements WHERE ${where} ORDER BY id`).all(...args);

const checkout = (items, extra = {}) => ({
  name: 'Cliente Teste',
  phone: '(11) 90000-1234',
  fulfillment: 'retirada',
  paymentMethod: 'pix',
  pickupStoreId: current.storeA && current.storeA.id,
  items,
  ...extra,
});

module.exports = { freshDb, fixture, product, movements, checkout, assertTotals };
