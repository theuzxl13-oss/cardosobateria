'use strict';
const { get, tx, now } = require('../db');
const { AppError, notFound } = require('../lib/errors');
const { validate } = require('../lib/validation');
const inventory = require('./inventory');

const BASE_SELECT = `SELECT p.*, b.name AS brand_name, c.name AS category_name,
  (p.stock_qty - p.reserved_qty) AS available_qty,
  CASE WHEN p.promo_price_cents IS NOT NULL AND p.promo_price_cents < p.price_cents THEN p.promo_price_cents ELSE p.price_cents END AS final_price_cents
  FROM products p
  LEFT JOIN brands b ON b.id = p.brand_id
  LEFT JOIN categories c ON c.id = p.category_id`;

const productSchema = {
  sku: { type: 'string', label: 'Código/SKU', required: true, max: 40, pattern: /^[A-Za-z0-9._-]+$/, patternMessage: 'Use letras, números, ponto, hífen ou sublinhado.' },
  name: { type: 'string', label: 'Nome', required: true, min: 3, max: 120 },
  brand_id: { type: 'int', label: 'Marca', required: true, min: 1 },
  category_id: { type: 'int', label: 'Categoria', min: 1 },
  description: { type: 'text', label: 'Descrição', max: 3000 },
  image: { type: 'string', label: 'Imagem', max: 1500000 },
  capacity_ah: { type: 'int', label: 'Capacidade (Ah)', required: true, min: 1, max: 400 },
  voltage: { type: 'int', label: 'Tensão (V)', required: true, min: 6, max: 48 },
  cca: { type: 'int', label: 'CCA', min: 0, max: 3000 },
  dimensions: { type: 'string', label: 'Dimensões', max: 80 },
  polarity: { type: 'string', label: 'Polaridade', max: 40 },
  technology: { type: 'string', label: 'Tecnologia', max: 60 },
  warranty_months: { type: 'int', label: 'Garantia (meses)', required: true, min: 0, max: 120 },
  price_cents: { type: 'money', label: 'Preço de venda', required: true },
  promo_price_cents: { type: 'money', label: 'Preço promocional' },
  cost_cents: { type: 'money', label: 'Custo', required: true },
  min_stock: { type: 'int', label: 'Estoque mínimo', required: true, min: 0, max: 100000 },
  active: { type: 'bool', label: 'Ativo', default: true },
  featured: { type: 'bool', label: 'Destaque', default: false },
};

function decorate(p) {
  if (!p) return p;
  p.available_qty = Math.max(0, p.available_qty);
  p.on_promo = p.promo_price_cents !== null && p.promo_price_cents < p.price_cents;
  p.stock_status = p.available_qty <= 0 ? 'esgotado' : p.available_qty <= p.min_stock ? 'baixo' : 'ok';
  return p;
}

/** Remove campos internos (custo) para a loja pública */
function toPublic(p) {
  const { cost_cents, is_demo, ...rest } = p;
  return { ...rest, is_demo: !!is_demo };
}

function listPublic(f = {}) {
  const where = ['p.active = 1'];
  const args = [];
  if (f.q) {
    const terms = String(f.q).trim().toLowerCase().split(/\s+/).slice(0, 6);
    for (const t of terms) {
      const ah = t.match(/^(\d{2,3})\s*ah$/);
      if (ah) {
        where.push('p.capacity_ah = ?');
        args.push(Number(ah[1]));
        continue;
      }
      where.push(`(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(COALESCE(b.name,'')) LIKE ? OR LOWER(p.technology) LIKE ? OR CAST(p.capacity_ah AS TEXT) = ?)`);
      const like = `%${t}%`;
      args.push(like, like, like, like, t);
    }
  }
  if (f.brand) (where.push('p.brand_id = ?'), args.push(Number(f.brand)));
  if (f.category) (where.push('p.category_id = ?'), args.push(Number(f.category)));
  if (f.capacity) {
    const caps = String(f.capacity).split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (caps.length) (where.push(`p.capacity_ah IN (${caps.map(() => '?').join(',')})`), args.push(...caps));
  }
  const priceExpr = 'CASE WHEN p.promo_price_cents IS NOT NULL AND p.promo_price_cents < p.price_cents THEN p.promo_price_cents ELSE p.price_cents END';
  if (f.minPrice) (where.push(`${priceExpr} >= ?`), args.push(Math.round(Number(f.minPrice) * 100)));
  if (f.maxPrice) (where.push(`${priceExpr} <= ?`), args.push(Math.round(Number(f.maxPrice) * 100)));
  if (f.available === '1' || f.available === true) where.push('(p.stock_qty - p.reserved_qty) > 0');
  if (f.promo === '1') where.push('p.promo_price_cents IS NOT NULL AND p.promo_price_cents < p.price_cents');
  if (f.featured === '1') where.push('p.featured = 1');
  const order =
    {
      price_asc: `${priceExpr} ASC`,
      price_desc: `${priceExpr} DESC`,
      capacity_asc: 'p.capacity_ah ASC, p.name',
      capacity_desc: 'p.capacity_ah DESC, p.name',
      name: 'p.name ASC',
    }[f.sort] || 'p.featured DESC, ((p.stock_qty - p.reserved_qty) > 0) DESC, p.capacity_ah ASC, p.name';
  const rows = get().prepare(`${BASE_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`).all(...args);
  return rows.map(decorate).map(toPublic);
}

function getPublic(id) {
  const p = decorate(get().prepare(`${BASE_SELECT} WHERE p.id = ? AND p.active = 1`).get(Number(id)));
  if (!p) throw notFound('Produto');
  p.applications = applicationsOf(p.id);
  p.images = imagesOf(p.id);
  p.stores_stock = inventory.availabilityByStore(p.id).map((r) => ({ store_id: r.store_id, name: r.name, neighborhood: r.neighborhood, available_qty: Math.max(r.available_qty, 0) }));
  return toPublic(p);
}

function filters() {
  const d = get();
  return {
    brands: d.prepare(`SELECT b.id, b.name, COUNT(p.id) AS count FROM brands b JOIN products p ON p.brand_id = b.id AND p.active = 1 GROUP BY b.id ORDER BY b.name`).all(),
    categories: d.prepare(`SELECT c.id, c.name, COUNT(p.id) AS count FROM categories c JOIN products p ON p.category_id = c.id AND p.active = 1 GROUP BY c.id ORDER BY c.sort, c.name`).all(),
    capacities: d.prepare('SELECT DISTINCT capacity_ah FROM products WHERE active = 1 ORDER BY capacity_ah').all().map((r) => r.capacity_ah),
    price: d.prepare(`SELECT MIN(price_cents) AS min, MAX(price_cents) AS max FROM products WHERE active = 1`).get(),
  };
}

const applicationsOf = (productId) =>
  get().prepare('SELECT * FROM product_applications WHERE product_id = ? ORDER BY make, model, year_start').all(productId);
const imagesOf = (productId) => get().prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort, id').all(productId);

/* ---------- Consulta por veículo (somente aplicações cadastradas) ---------- */
function vehicleMakes() {
  return get()
    .prepare('SELECT DISTINCT a.make FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1 ORDER BY a.make')
    .all()
    .map((r) => r.make);
}
function vehicleModels(make) {
  return get()
    .prepare('SELECT DISTINCT a.model FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1 WHERE LOWER(a.make) = LOWER(?) ORDER BY a.model')
    .all(String(make || ''))
    .map((r) => r.model);
}
function vehicleYears(make, model) {
  const rows = get()
    .prepare(`SELECT a.year_start, a.year_end FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1
      WHERE LOWER(a.make) = LOWER(?) AND LOWER(a.model) = LOWER(?)`)
    .all(String(make || ''), String(model || ''));
  const years = new Set();
  for (const r of rows) for (let y = r.year_start; y <= r.year_end && years.size < 80; y++) years.add(y);
  return [...years].sort((a, b) => b - a);
}
function vehicleSearch({ make, model, year }) {
  const y = Number(year);
  if (!make || !model || !Number.isInteger(y)) throw new AppError(422, 'Informe marca, modelo e ano do veículo.');
  const rows = get()
    .prepare(`SELECT a.id AS application_id, a.engine, a.notes, a.is_demo AS application_is_demo, a.year_start, a.year_end, a.product_id
      FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1
      WHERE LOWER(a.make) = LOWER(?) AND LOWER(a.model) = LOWER(?) AND ? BETWEEN a.year_start AND a.year_end`)
    .all(String(make).trim(), String(model).trim(), y);
  const results = rows.map((r) => {
    const p = toPublic(decorate(get().prepare(`${BASE_SELECT} WHERE p.id = ?`).get(r.product_id)));
    return { product: p, application: { engine: r.engine, notes: r.notes, is_demo: !!r.application_is_demo, year_start: r.year_start, year_end: r.year_end } };
  });
  return { vehicle: { make, model, year: y }, results };
}

/* ---------- Administração ---------- */
function listAdmin(f = {}) {
  const where = [];
  const args = [];
  if (f.q) {
    where.push('(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ? OR LOWER(b.name) LIKE ?)');
    const like = `%${String(f.q).toLowerCase()}%`;
    args.push(like, like, like);
  }
  if (f.status === 'ativos') where.push('p.active = 1');
  if (f.status === 'inativos') where.push('p.active = 0');
  if (f.stock === 'baixo') where.push('(p.stock_qty - p.reserved_qty) > 0 AND (p.stock_qty - p.reserved_qty) <= p.min_stock');
  if (f.stock === 'esgotado') where.push('(p.stock_qty - p.reserved_qty) <= 0');
  if (f.brand) (where.push('p.brand_id = ?'), args.push(Number(f.brand)));
  const rows = get()
    .prepare(`${BASE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.active DESC, p.name`)
    .all(...args)
    .map(decorate);
  const sold = new Set(get().prepare('SELECT DISTINCT product_id FROM order_items').all().map((r) => r.product_id));
  for (const r of rows) {
    r.has_history = sold.has(r.id);
    if (r.image && r.image.startsWith('data:')) r.image_is_upload = true;
  }
  return rows;
}

function getAdmin(id) {
  const p = decorate(get().prepare(`${BASE_SELECT} WHERE p.id = ?`).get(Number(id)));
  if (!p) throw notFound('Produto');
  p.applications = applicationsOf(p.id);
  p.images = imagesOf(p.id);
  p.has_history = !!get().prepare('SELECT 1 FROM order_items WHERE product_id = ? LIMIT 1').get(p.id);
  p.by_store = inventory.availabilityByStore(p.id);
  return p;
}

function checkRefs(data) {
  if (data.brand_id && !get().prepare('SELECT 1 FROM brands WHERE id = ?').get(data.brand_id)) {
    throw new AppError(422, 'Marca inválida.', { fields: { brand_id: 'Selecione uma marca cadastrada.' } });
  }
  if (data.category_id && !get().prepare('SELECT 1 FROM categories WHERE id = ?').get(data.category_id)) {
    throw new AppError(422, 'Categoria inválida.', { fields: { category_id: 'Selecione uma categoria cadastrada.' } });
  }
  if (data.promo_price_cents !== null && data.promo_price_cents !== undefined && data.price_cents !== undefined && data.promo_price_cents >= data.price_cents) {
    throw new AppError(422, 'O preço promocional deve ser menor que o preço de venda.', { fields: { promo_price_cents: 'Deve ser menor que o preço de venda (ou deixe vazio).' } });
  }
}

function skuTaken(sku, exceptId = 0) {
  return !!get().prepare('SELECT 1 FROM products WHERE LOWER(sku) = LOWER(?) AND id <> ?').get(sku, exceptId);
}

function create(input, { user }) {
  const data = validate(productSchema, input);
  checkRefs(data);
  const initialStock = input.initial_stock === undefined || input.initial_stock === '' ? 0 : Number(input.initial_stock);
  if (!Number.isInteger(initialStock) || initialStock < 0) throw new AppError(422, 'Estoque inicial inválido.', { fields: { initial_stock: 'Informe um inteiro, zero ou mais.' } });
  if (skuTaken(data.sku)) throw new AppError(409, 'Já existe um produto com este código/SKU.', { fields: { sku: 'SKU já cadastrado.' } });
  return tx(() => {
    const ts = now();
    const cols = Object.keys(productSchema);
    const r = get()
      .prepare(`INSERT INTO products (${cols.join(', ')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(', ')}, ?, ?)`)
      .run(...cols.map((c) => data[c]), ts, ts);
    const id = r.lastInsertRowid;
    if (initialStock > 0) {
      inventory.applyMovement({ productId: id, storeId: input.initial_store_id ? Number(input.initial_store_id) : null, type: 'entrada', quantity: initialStock, reason: 'Estoque inicial no cadastro do produto', user, unitCostCents: data.cost_cents });
    }
    return getAdmin(id);
  });
}

function update(id, input) {
  const current = getAdmin(id);
  const data = validate(productSchema, input, { partial: true });
  const merged = { ...current, ...data };
  checkRefs(merged);
  if (data.sku && skuTaken(data.sku, current.id)) throw new AppError(409, 'Já existe um produto com este código/SKU.', { fields: { sku: 'SKU já cadastrado.' } });
  const cols = Object.keys(data);
  if (!cols.length) return current;
  get()
    .prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...cols.map((c) => data[c]), now(), current.id);
  return getAdmin(current.id);
}

function setActive(id, active) {
  const p = getAdmin(id);
  get().prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?').run(active ? 1 : 0, now(), p.id);
  return getAdmin(p.id);
}

/** Exclui somente produtos sem histórico de venda. As movimentações de estoque ficam preservadas (com SKU/nome). */
function remove(id) {
  const p = getAdmin(id);
  if (p.has_history) {
    throw new AppError(409, 'Este produto possui histórico de vendas e não pode ser excluído. Desative-o para preservar os registros.');
  }
  if (p.reserved_qty > 0) throw new AppError(409, 'Produto com reservas em aberto não pode ser excluído.');
  get().prepare('DELETE FROM products WHERE id = ?').run(p.id);
  return { deleted: true };
}

/* Aplicações por veículo */
const applicationSchema = {
  make: { type: 'string', label: 'Marca do veículo', required: true, max: 60 },
  model: { type: 'string', label: 'Modelo', required: true, max: 80 },
  year_start: { type: 'int', label: 'Ano inicial', required: true, min: 1950, max: 2100 },
  year_end: { type: 'int', label: 'Ano final', required: true, min: 1950, max: 2100 },
  engine: { type: 'string', label: 'Motor/versão', max: 80 },
  notes: { type: 'string', label: 'Observações', max: 300 },
};
function addApplication(productId, input) {
  const p = getAdmin(productId);
  const a = validate(applicationSchema, input);
  if (a.year_end < a.year_start) throw new AppError(422, 'Ano final deve ser maior ou igual ao inicial.', { fields: { year_end: 'Ano final menor que o inicial.' } });
  get()
    .prepare('INSERT INTO product_applications (product_id, make, model, year_start, year_end, engine, notes, is_demo, created_at) VALUES (?,?,?,?,?,?,?,0,?)')
    .run(p.id, a.make, a.model, a.year_start, a.year_end, a.engine, a.notes, now());
  return applicationsOf(p.id);
}
function updateApplication(productId, appId, input) {
  const a = validate(applicationSchema, input);
  if (a.year_end < a.year_start) throw new AppError(422, 'Ano final deve ser maior ou igual ao inicial.');
  const r = get()
    .prepare('UPDATE product_applications SET make=?, model=?, year_start=?, year_end=?, engine=?, notes=?, is_demo=0 WHERE id=? AND product_id=?')
    .run(a.make, a.model, a.year_start, a.year_end, a.engine, a.notes, Number(appId), Number(productId));
  if (!r.changes) throw notFound('Aplicação');
  return applicationsOf(Number(productId));
}
function removeApplication(productId, appId) {
  const r = get().prepare('DELETE FROM product_applications WHERE id = ? AND product_id = ?').run(Number(appId), Number(productId));
  if (!r.changes) throw notFound('Aplicação');
  return applicationsOf(Number(productId));
}

/* Imagens adicionais */
function addImage(productId, { url, alt = '' }) {
  const p = getAdmin(productId);
  if (!url || typeof url !== 'string' || !(url.startsWith('data:image/') || url.startsWith('/') || url.startsWith('img/') || url.startsWith('https://'))) {
    throw new AppError(422, 'Imagem inválida.');
  }
  if (url.length > 1500000) throw new AppError(422, 'Imagem muito grande (máx. ~1 MB).');
  const sort = (get().prepare('SELECT MAX(sort) m FROM product_images WHERE product_id = ?').get(p.id).m || 0) + 1;
  get().prepare('INSERT INTO product_images (product_id, url, alt, sort, created_at) VALUES (?,?,?,?,?)').run(p.id, url, String(alt).slice(0, 120), sort, now());
  return imagesOf(p.id);
}
function removeImage(productId, imageId) {
  const r = get().prepare('DELETE FROM product_images WHERE id = ? AND product_id = ?').run(Number(imageId), Number(productId));
  if (!r.changes) throw notFound('Imagem');
  return imagesOf(Number(productId));
}
function setMainImage(productId, imageId) {
  const img = get().prepare('SELECT * FROM product_images WHERE id = ? AND product_id = ?').get(Number(imageId), Number(productId));
  if (!img) throw notFound('Imagem');
  const p = getAdmin(productId);
  tx(() => {
    // a imagem principal atual vira imagem adicional
    if (p.image) get().prepare('INSERT INTO product_images (product_id, url, alt, sort, created_at) VALUES (?,?,?,?,?)').run(p.id, p.image, p.name, 0, now());
    get().prepare('UPDATE products SET image = ?, updated_at = ? WHERE id = ?').run(img.url, now(), p.id);
    get().prepare('DELETE FROM product_images WHERE id = ?').run(img.id);
  });
  return getAdmin(p.id);
}

module.exports = {
  productSchema, listPublic, getPublic, filters, vehicleMakes, vehicleModels, vehicleYears, vehicleSearch,
  listAdmin, getAdmin, create, update, setActive, remove, addApplication, updateApplication, removeApplication,
  addImage, removeImage, setMainImage, decorate, BASE_SELECT,
};
