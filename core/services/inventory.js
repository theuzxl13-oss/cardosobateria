'use strict';
/**
 * Regras de estoque — POR LOJA.
 *
 * store_stock (produto × loja): stock_qty (físico) e reserved_qty (reservado por pedidos em aberto)
 * products.stock_qty / reserved_qty = soma de todas as lojas (mantida junto, para o catálogo)
 * disponível = físico − reservado
 *
 * Toda alteração passa por applyMovement(), que:
 *  - valida a operação na loja informada (sem estoque negativo, sem reservar acima do disponível);
 *  - atualiza a loja e o total do produto;
 *  - grava a movimentação com data, loja, quantidade, motivo e responsável.
 * O índice único (order_id, product_id, type) impede baixa/liberação/devolução duplicada.
 * As funções públicas rodam dentro de transações.
 */
const { get, tx, now } = require('../db');
const { AppError, notFound } = require('../lib/errors');

const MANUAL_TYPES = ['entrada', 'saida', 'ajuste', 'transferencia'];

function loadProduct(id) {
  const p = get().prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw notFound('Produto');
  return p;
}

function loadStore(id) {
  const s = get().prepare('SELECT * FROM stores WHERE id = ?').get(Number(id));
  if (!s) throw new AppError(422, 'Loja inválida.', { fields: { storeId: 'Selecione uma loja cadastrada.' } });
  return s;
}

/** Loja padrão (a primeira ativa). Cria "Loja principal" se não existir nenhuma. */
function defaultStoreId() {
  const s = get().prepare('SELECT id FROM stores WHERE active = 1 ORDER BY sort, id LIMIT 1').get();
  if (s) return s.id;
  const any = get().prepare('SELECT id FROM stores ORDER BY sort, id LIMIT 1').get();
  if (any) return any.id;
  return get().prepare("INSERT INTO stores (name, active, sort, created_at) VALUES ('Loja principal', 1, 0, ?)").run(now()).lastInsertRowid;
}

function storeRow(productId, storeId) {
  return get().prepare('SELECT stock_qty, reserved_qty FROM store_stock WHERE product_id = ? AND store_id = ?').get(productId, storeId) || { stock_qty: 0, reserved_qty: 0 };
}

const available = (p) => p.stock_qty - p.reserved_qty;

/** Disponível de um produto em cada loja ativa. */
function availabilityByStore(productId) {
  return get()
    .prepare(`SELECT s.id AS store_id, s.name, s.neighborhood, s.pickup_enabled,
        COALESCE(ss.stock_qty, 0) AS stock_qty, COALESCE(ss.reserved_qty, 0) AS reserved_qty,
        COALESCE(ss.stock_qty, 0) - COALESCE(ss.reserved_qty, 0) AS available_qty
      FROM stores s LEFT JOIN store_stock ss ON ss.store_id = s.id AND ss.product_id = ?
      WHERE s.active = 1 ORDER BY s.sort, s.id`)
    .all(productId);
}

/** Deve ser chamada dentro de uma transação. */
function applyMovement({ productId, storeId = null, type, quantity, reason, user, orderId = null, supplierId = null, unitCostCents = null, at = null }) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(422, 'Quantidade deve ser um número inteiro maior que zero.');
  if (!reason || !String(reason).trim()) throw new AppError(422, 'Informe o motivo da movimentação.');
  if (!user) throw new AppError(422, 'Responsável não informado.');
  const p = loadProduct(productId);
  const store = loadStore(storeId || defaultStoreId());
  const ss = storeRow(p.id, store.id);
  const avail = ss.stock_qty - ss.reserved_qty;
  const where = ` na loja ${store.name}`;
  let sd = 0;
  let rd = 0;
  switch (type) {
    case 'entrada':
    case 'devolucao':
      sd = quantity;
      break;
    case 'saida':
      if (quantity > avail) {
        throw new AppError(409, `Saída maior que o disponível de "${p.name}"${where} (disponível: ${Math.max(avail, 0)}, reservado: ${ss.reserved_qty}).`);
      }
      sd = -quantity;
      break;
    case 'reserva':
      if (quantity > avail) {
        throw new AppError(409, `Estoque insuficiente para "${p.name}"${where}. Disponível: ${Math.max(avail, 0)}.`, {
          productId: p.id,
          storeId: store.id,
          available: Math.max(avail, 0),
        });
      }
      rd = quantity;
      break;
    case 'liberacao':
      if (quantity > ss.reserved_qty) throw new AppError(409, `Reserva de "${p.name}"${where} menor que a quantidade a liberar.`);
      rd = -quantity;
      break;
    case 'baixa_venda':
      if (quantity > ss.reserved_qty) throw new AppError(409, `Reserva de "${p.name}"${where} insuficiente para a baixa.`);
      rd = -quantity;
      sd = -quantity;
      break;
    default:
      throw new AppError(422, 'Tipo de movimentação inválido.');
  }
  return write(p, store, ss, { type, quantity, sd, rd, reason, user, orderId, supplierId, unitCostCents, at });
}

function write(p, store, ss, { type, quantity, sd, rd, reason, user, orderId, supplierId, unitCostCents, at }) {
  const stockAfter = ss.stock_qty + sd;
  const reservedAfter = ss.reserved_qty + rd;
  if (stockAfter < 0 || reservedAfter < 0) throw new AppError(409, 'A operação deixaria o estoque negativo.');
  if (reservedAfter > stockAfter) throw new AppError(409, 'A operação deixaria reservas maiores que o estoque físico.');
  const ts = at || now();
  const d = get();
  d.prepare(
    `INSERT INTO store_stock (product_id, store_id, stock_qty, reserved_qty, updated_at) VALUES (?,?,?,?,?)
     ON CONFLICT(product_id, store_id) DO UPDATE SET stock_qty = excluded.stock_qty, reserved_qty = excluded.reserved_qty, updated_at = excluded.updated_at`
  ).run(p.id, store.id, stockAfter, reservedAfter, ts);
  d.prepare('UPDATE products SET stock_qty = stock_qty + ?, reserved_qty = reserved_qty + ?, updated_at = ? WHERE id = ?').run(sd, rd, ts, p.id);
  try {
    const r = d
      .prepare(
        `INSERT INTO stock_movements (product_id, product_sku, product_name, type, quantity, stock_delta, reserved_delta,
          stock_after, reserved_after, unit_cost_cents, reason, order_id, supplier_id, user_name, created_at, store_id, store_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(p.id, p.sku, p.name, type, quantity, sd, rd, stockAfter, reservedAfter, unitCostCents, String(reason).trim(), orderId, supplierId, user, ts, store.id, store.name);
    return { id: r.lastInsertRowid, stock_after: stockAfter, reserved_after: reservedAfter };
  } catch (e) {
    if (/UNIQUE constraint failed: stock_movements/.test(String(e.message))) {
      throw new AppError(409, `Movimentação duplicada: "${type}" já registrada para "${p.name}" neste pedido.`);
    }
    throw e;
  }
}

/** Movimentação manual pelo painel: entrada, saída, ajuste (contagem) ou transferência entre lojas. */
function registerManual({ productId, storeId, toStoreId = null, type, quantity, newQty, reason, user, supplierId = null, unitCostCents = null, updateCost = false }) {
  if (!MANUAL_TYPES.includes(type)) throw new AppError(422, 'Tipo deve ser entrada, saída, ajuste ou transferência.');
  return tx(() => {
    const sid = storeId || defaultStoreId();
    if (type === 'ajuste') {
      const p = loadProduct(productId);
      const store = loadStore(sid);
      const ss = storeRow(p.id, store.id);
      if (!Number.isInteger(newQty) || newQty < 0) throw new AppError(422, 'Informe a nova quantidade física (inteiro, zero ou mais).');
      if (newQty < ss.reserved_qty) {
        throw new AppError(409, `Quantidade menor que as reservas em aberto nesta loja (${ss.reserved_qty}). Cancele ou conclua pedidos antes.`);
      }
      const delta = newQty - ss.stock_qty;
      if (delta === 0) throw new AppError(409, 'A quantidade informada é igual ao estoque atual da loja.');
      if (!reason || !String(reason).trim()) throw new AppError(422, 'Informe o motivo do ajuste.');
      return write(p, store, ss, { type: 'ajuste', quantity: Math.abs(delta), sd: delta, rd: 0, reason, user, orderId: null, supplierId: null, unitCostCents: null });
    }
    if (type === 'transferencia') {
      if (!toStoreId) throw new AppError(422, 'Informe a loja de destino.', { fields: { toStoreId: 'Selecione a loja de destino.' } });
      if (Number(toStoreId) === Number(sid)) throw new AppError(422, 'A loja de destino deve ser diferente da origem.', { fields: { toStoreId: 'Escolha outra loja.' } });
      const from = loadStore(sid);
      const to = loadStore(toStoreId);
      const why = String(reason || '').trim();
      applyMovement({ productId, storeId: from.id, type: 'saida', quantity, reason: `Transferência para ${to.name}${why ? ` — ${why}` : ''}`, user });
      return applyMovement({ productId, storeId: to.id, type: 'entrada', quantity, reason: `Transferência de ${from.name}${why ? ` — ${why}` : ''}`, user });
    }
    const res = applyMovement({ productId, storeId: sid, type, quantity, reason, user, supplierId, unitCostCents });
    if (type === 'entrada' && updateCost && Number.isInteger(unitCostCents) && unitCostCents >= 0) {
      get().prepare('UPDATE products SET cost_cents = ? WHERE id = ?').run(unitCostCents, productId);
    }
    return res;
  });
}

function listMovements({ productId, storeId, type, from, to, orderId, limit = 200, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (productId) (where.push('m.product_id = ?'), args.push(productId));
  if (storeId) (where.push('m.store_id = ?'), args.push(storeId));
  if (type) (where.push('m.type = ?'), args.push(type));
  if (orderId) (where.push('m.order_id = ?'), args.push(orderId));
  if (from) (where.push('m.created_at >= ?'), args.push(from));
  if (to) (where.push('m.created_at < ?'), args.push(to));
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `SELECT m.*, o.code AS order_code, s.name AS supplier_name
    FROM stock_movements m
    LEFT JOIN orders o ON o.id = m.order_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    ${w} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`;
  const total = get().prepare(`SELECT COUNT(*) c FROM stock_movements m ${w}`).get(...args).c;
  return { items: get().prepare(sql).all(...args, limit, offset), total };
}

/** Matriz de estoque: produtos × lojas (para o painel e relatórios). */
function stockMatrix({ activeOnly = false } = {}) {
  const stores = get().prepare('SELECT id, name, neighborhood, active FROM stores ORDER BY sort, id').all();
  const products = get()
    .prepare(`SELECT id, sku, name, active, stock_qty, reserved_qty, min_stock, cost_cents FROM products ${activeOnly ? 'WHERE active = 1' : ''} ORDER BY active DESC, name`)
    .all();
  const rows = get().prepare('SELECT product_id, store_id, stock_qty, reserved_qty FROM store_stock').all();
  const map = new Map(rows.map((r) => [`${r.product_id}:${r.store_id}`, r]));
  return {
    stores,
    products: products.map((p) => ({
      ...p,
      available_qty: p.stock_qty - p.reserved_qty,
      by_store: stores.map((s) => {
        const r = map.get(`${p.id}:${s.id}`) || { stock_qty: 0, reserved_qty: 0 };
        return { store_id: s.id, stock_qty: r.stock_qty, reserved_qty: r.reserved_qty, available_qty: r.stock_qty - r.reserved_qty };
      }),
    })),
  };
}

module.exports = { applyMovement, registerManual, listMovements, available, availabilityByStore, loadProduct, loadStore, defaultStoreId, stockMatrix, storeRow };
