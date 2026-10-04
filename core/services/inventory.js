'use strict';
/**
 * Regras de estoque.
 *
 * products.stock_qty    = quantidade física na loja
 * products.reserved_qty = quantidade reservada por pedidos em aberto
 * disponível            = stock_qty - reserved_qty
 *
 * Toda alteração passa por applyMovement(), que:
 *  - valida a operação (sem estoque negativo, sem reservar acima do disponível);
 *  - atualiza o produto;
 *  - grava a movimentação com data, quantidade, motivo e responsável.
 * O índice único (order_id, product_id, type) impede baixa/liberação/devolução duplicada.
 * As funções públicas rodam dentro de transações.
 */
const { get, tx, now } = require('../db');
const { AppError, notFound } = require('../lib/errors');

const MANUAL_TYPES = ['entrada', 'saida', 'ajuste'];

function loadProduct(id) {
  const p = get().prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!p) throw notFound('Produto');
  return p;
}

const available = (p) => p.stock_qty - p.reserved_qty;

/** Deve ser chamada dentro de uma transação. */
function applyMovement({ productId, type, quantity, reason, user, orderId = null, supplierId = null, unitCostCents = null, at = null }) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError(422, 'Quantidade deve ser um número inteiro maior que zero.');
  if (!reason || !String(reason).trim()) throw new AppError(422, 'Informe o motivo da movimentação.');
  if (!user) throw new AppError(422, 'Responsável não informado.');
  const p = loadProduct(productId);
  const avail = available(p);
  let sd = 0;
  let rd = 0;
  switch (type) {
    case 'entrada':
    case 'devolucao':
      sd = quantity;
      break;
    case 'saida':
      if (quantity > avail) {
        throw new AppError(409, `Saída maior que o disponível de "${p.name}" (disponível: ${avail}, reservado: ${p.reserved_qty}).`);
      }
      sd = -quantity;
      break;
    case 'reserva':
      if (quantity > avail) {
        throw new AppError(409, `Estoque insuficiente para "${p.name}". Disponível: ${Math.max(avail, 0)}.`, {
          productId: p.id,
          available: Math.max(avail, 0),
        });
      }
      rd = quantity;
      break;
    case 'liberacao':
      if (quantity > p.reserved_qty) throw new AppError(409, `Reserva de "${p.name}" menor que a quantidade a liberar.`);
      rd = -quantity;
      break;
    case 'baixa_venda':
      if (quantity > p.reserved_qty) throw new AppError(409, `Reserva de "${p.name}" insuficiente para a baixa.`);
      rd = -quantity;
      sd = -quantity;
      break;
    default:
      throw new AppError(422, 'Tipo de movimentação inválido.');
  }
  return write(p, { type, quantity, sd, rd, reason, user, orderId, supplierId, unitCostCents, at });
}

function write(p, { type, quantity, sd, rd, reason, user, orderId, supplierId, unitCostCents, at }) {
  const stockAfter = p.stock_qty + sd;
  const reservedAfter = p.reserved_qty + rd;
  if (stockAfter < 0 || reservedAfter < 0) throw new AppError(409, 'A operação deixaria o estoque negativo.');
  if (reservedAfter > stockAfter) throw new AppError(409, 'A operação deixaria reservas maiores que o estoque físico.');
  const ts = at || now();
  const d = get();
  d.prepare('UPDATE products SET stock_qty = ?, reserved_qty = ?, updated_at = ? WHERE id = ?').run(stockAfter, reservedAfter, ts, p.id);
  try {
    const r = d
      .prepare(
        `INSERT INTO stock_movements (product_id, product_sku, product_name, type, quantity, stock_delta, reserved_delta,
          stock_after, reserved_after, unit_cost_cents, reason, order_id, supplier_id, user_name, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(p.id, p.sku, p.name, type, quantity, sd, rd, stockAfter, reservedAfter, unitCostCents, String(reason).trim(), orderId, supplierId, user, ts);
    return { id: r.lastInsertRowid, stock_after: stockAfter, reserved_after: reservedAfter };
  } catch (e) {
    if (/UNIQUE constraint failed: stock_movements/.test(String(e.message))) {
      throw new AppError(409, `Movimentação duplicada: "${type}" já registrada para "${p.name}" neste pedido.`);
    }
    throw e;
  }
}

/** Movimentação manual pelo painel: entrada, saída ou ajuste (contagem). */
function registerManual({ productId, type, quantity, newQty, reason, user, supplierId = null, unitCostCents = null, updateCost = false }) {
  if (!MANUAL_TYPES.includes(type)) throw new AppError(422, 'Tipo deve ser entrada, saída ou ajuste.');
  return tx(() => {
    if (type === 'ajuste') {
      const p = loadProduct(productId);
      if (!Number.isInteger(newQty) || newQty < 0) throw new AppError(422, 'Informe a nova quantidade física (inteiro, zero ou mais).');
      if (newQty < p.reserved_qty) {
        throw new AppError(409, `Quantidade menor que as reservas em aberto (${p.reserved_qty}). Cancele ou conclua pedidos antes.`);
      }
      const delta = newQty - p.stock_qty;
      if (delta === 0) throw new AppError(409, 'A quantidade informada é igual ao estoque atual.');
      if (!reason || !String(reason).trim()) throw new AppError(422, 'Informe o motivo do ajuste.');
      return write(p, { type: 'ajuste', quantity: Math.abs(delta), sd: delta, rd: 0, reason, user, orderId: null, supplierId: null, unitCostCents: null });
    }
    const res = applyMovement({ productId, type, quantity, reason, user, supplierId, unitCostCents });
    if (type === 'entrada' && updateCost && Number.isInteger(unitCostCents) && unitCostCents >= 0) {
      get().prepare('UPDATE products SET cost_cents = ? WHERE id = ?').run(unitCostCents, productId);
    }
    return res;
  });
}

function listMovements({ productId, type, from, to, orderId, limit = 200, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (productId) (where.push('m.product_id = ?'), args.push(productId));
  if (type) (where.push('m.type = ?'), args.push(type));
  if (orderId) (where.push('m.order_id = ?'), args.push(orderId));
  if (from) (where.push('m.created_at >= ?'), args.push(from));
  if (to) (where.push('m.created_at < ?'), args.push(to));
  const sql = `SELECT m.*, o.code AS order_code, s.name AS supplier_name
    FROM stock_movements m
    LEFT JOIN orders o ON o.id = m.order_id
    LEFT JOIN suppliers s ON s.id = m.supplier_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`;
  const total = get().prepare(`SELECT COUNT(*) c FROM stock_movements m ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).get(...args).c;
  return { items: get().prepare(sql).all(...args, limit, offset), total };
}

module.exports = { applyMovement, registerManual, listMovements, available, loadProduct };
