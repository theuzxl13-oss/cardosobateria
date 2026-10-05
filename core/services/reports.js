'use strict';
/** Indicadores e relatórios calculados a partir dos dados do banco. */
const { get } = require('../db');
const { dayRange, localDayKey, STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, MOVEMENT_LABELS } = require('../lib/format');

function rangeOf({ from, to }) {
  const r = dayRange(from, to);
  return { start: r.start || '0000', end: r.end || '9999' };
}

function localToday() {
  const d = new Date();
  const key = localDayKey(d.toISOString());
  return { day: key, monthStart: `${key.slice(0, 8)}01` };
}

function salesIn(start, end) {
  return get()
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total_cents FROM orders WHERE status = 'concluido' AND completed_at >= ? AND completed_at < ?`)
    .get(start, end);
}
function createdIn(start, end) {
  return get()
    .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total_cents,
      SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) AS canceled FROM orders WHERE created_at >= ? AND created_at < ?`)
    .get(start, end);
}
function paymentsIn(start, end) {
  const r = get()
    .prepare(`SELECT
        COALESCE(SUM(CASE WHEN status = 'aprovado' THEN amount_cents ELSE 0 END),0) AS approved_cents,
        COALESCE(SUM(CASE WHEN status = 'estornado' THEN amount_cents ELSE 0 END),0) AS refunded_cents,
        SUM(CASE WHEN status = 'aprovado' THEN 1 ELSE 0 END) AS count
      FROM payments WHERE created_at >= ? AND created_at < ?`)
    .get(start, end);
  return { count: r.count || 0, approved_cents: r.approved_cents, refunded_cents: r.refunded_cents, net_cents: r.approved_cents - r.refunded_cents };
}

function stockSummary() {
  const d = get();
  const value = d
    .prepare('SELECT COALESCE(SUM(stock_qty * cost_cents),0) AS cost_cents, COALESCE(SUM(stock_qty * price_cents),0) AS price_cents, COALESCE(SUM(stock_qty),0) AS units, COALESCE(SUM(reserved_qty),0) AS reserved FROM products')
    .get();
  const low = d
    .prepare(`SELECT id, sku, name, stock_qty, reserved_qty, (stock_qty - reserved_qty) AS available_qty, min_stock FROM products
      WHERE active = 1 AND (stock_qty - reserved_qty) > 0 AND (stock_qty - reserved_qty) <= min_stock ORDER BY (stock_qty - reserved_qty)`)
    .all();
  const out = d
    .prepare(`SELECT id, sku, name, stock_qty, reserved_qty, (stock_qty - reserved_qty) AS available_qty, min_stock FROM products
      WHERE active = 1 AND (stock_qty - reserved_qty) <= 0 ORDER BY name`)
    .all();
  return { value, low, out };
}

function dashboard(params = {}) {
  const t = localToday();
  const today = dayRange(t.day, t.day);
  const month = dayRange(t.monthStart, t.day);
  const { start, end } = rangeOf(params);
  const d = get();
  const pendingByStatus = d.prepare(`SELECT status, COUNT(*) AS count, COALESCE(SUM(total_cents),0) AS total_cents FROM orders WHERE status IN ('aguardando_pagamento','confirmado','em_preparacao') GROUP BY status`).all();
  const top = d
    .prepare(`SELECT i.product_id, i.sku, i.name, SUM(i.quantity) AS quantity, SUM(i.total_cents) AS total_cents
      FROM order_items i JOIN orders o ON o.id = i.order_id
      WHERE o.status = 'concluido' AND o.completed_at >= ? AND o.completed_at < ?
      GROUP BY i.product_id, i.sku, i.name ORDER BY quantity DESC, total_cents DESC LIMIT 8`)
    .all(start, end);
  const profit = d
    .prepare(`SELECT COALESCE(SUM(i.total_cents),0) AS revenue, COALESCE(SUM(i.unit_cost_cents * i.quantity),0) AS cost
      FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'concluido' AND o.completed_at >= ? AND o.completed_at < ?`)
    .get(start, end);

  // série diária do período
  const seriesMap = new Map();
  const keyRange = (() => {
    const s = params.from && params.to ? new Date(`${params.from}T00:00:00`) : null;
    const e = params.from && params.to ? new Date(`${params.to}T00:00:00`) : null;
    if (!s || !e || e < s) return [];
    const keys = [];
    for (const dt = new Date(s); dt <= e && keys.length < 400; dt.setDate(dt.getDate() + 1)) keys.push(localDayKey(dt.toISOString()));
    return keys;
  })();
  for (const k of keyRange) seriesMap.set(k, { day: k, sales_cents: 0, sales_count: 0, created_count: 0, payments_cents: 0 });
  const bump = (iso, f, v) => {
    const k = localDayKey(iso);
    if (!seriesMap.has(k)) return;
    seriesMap.get(k)[f] += v;
  };
  for (const r of d.prepare(`SELECT completed_at, total_cents FROM orders WHERE status='concluido' AND completed_at >= ? AND completed_at < ?`).all(start, end)) {
    bump(r.completed_at, 'sales_cents', r.total_cents);
    bump(r.completed_at, 'sales_count', 1);
  }
  for (const r of d.prepare('SELECT created_at FROM orders WHERE created_at >= ? AND created_at < ?').all(start, end)) bump(r.created_at, 'created_count', 1);
  for (const r of d.prepare(`SELECT created_at, status, amount_cents FROM payments WHERE status IN ('aprovado','estornado') AND created_at >= ? AND created_at < ?`).all(start, end)) {
    bump(r.created_at, 'payments_cents', r.status === 'aprovado' ? r.amount_cents : -r.amount_cents);
  }

  const stock = stockSummary();
  return {
    generated_at: new Date().toISOString(),
    period: { from: params.from || null, to: params.to || null },
    today: { sales: salesIn(today.start, today.end), created: createdIn(today.start, today.end), payments: paymentsIn(today.start, today.end) },
    month: { sales: salesIn(month.start, month.end), created: createdIn(month.start, month.end), payments: paymentsIn(month.start, month.end) },
    range: {
      sales: salesIn(start, end),
      created: createdIn(start, end),
      payments: paymentsIn(start, end),
      gross_profit_cents: profit.revenue - profit.cost,
      canceled: d.prepare(`SELECT COUNT(*) c FROM orders WHERE status='cancelado' AND canceled_at >= ? AND canceled_at < ?`).get(start, end).c,
    },
    pending: {
      total: pendingByStatus.reduce((a, r) => a + r.count, 0),
      by_status: pendingByStatus,
      awaiting_payment_cents: (pendingByStatus.find((r) => r.status === 'aguardando_pagamento') || {}).total_cents || 0,
    },
    stock: {
      value_cost_cents: stock.value.cost_cents,
      value_price_cents: stock.value.price_cents,
      units: stock.value.units,
      reserved_units: stock.value.reserved,
      low: stock.low,
      out: stock.out,
    },
    stock_by_store: d
      .prepare(`SELECT s.id, s.name, s.neighborhood, COALESCE(SUM(ss.stock_qty),0) AS units, COALESCE(SUM(ss.reserved_qty),0) AS reserved,
          COALESCE(SUM(ss.stock_qty * p.cost_cents),0) AS value_cost_cents,
          SUM(CASE WHEN p.active = 1 AND ss.stock_qty - ss.reserved_qty <= 0 THEN 1 ELSE 0 END) AS zero_items
        FROM stores s LEFT JOIN store_stock ss ON ss.store_id = s.id LEFT JOIN products p ON p.id = ss.product_id
        WHERE s.active = 1 GROUP BY s.id ORDER BY s.sort, s.id`)
      .all(),
    top_products: top,
    series: [...seriesMap.values()],
    recent_movements: d
      .prepare(`SELECT m.*, o.code AS order_code FROM stock_movements m LEFT JOIN orders o ON o.id = m.order_id ORDER BY m.created_at DESC, m.id DESC LIMIT 12`)
      .all(),
  };
}

/* ---------- Relatórios exportáveis (CSV/PDF gerados no cliente a partir destes dados) ---------- */
function periodLabel(p) {
  if (!p.from && !p.to) return 'Todo o período';
  const f = (s) => (s ? s.split('-').reverse().join('/') : '…');
  return `${f(p.from)} a ${f(p.to)}`;
}

function salesReport(params = {}) {
  const { start, end } = rangeOf(params);
  const rows = get()
    .prepare(`SELECT o.*, (SELECT COALESCE(SUM(unit_cost_cents * quantity),0) FROM order_items WHERE order_id = o.id) AS cost_cents,
      (SELECT GROUP_CONCAT(quantity || 'x ' || sku, ', ') FROM order_items WHERE order_id = o.id) AS items_desc
      FROM orders o WHERE o.status = 'concluido' AND o.completed_at >= ? AND o.completed_at < ? ORDER BY o.completed_at`)
    .all(start, end)
    .map((o) => ({
      code: o.code,
      completed_at: o.completed_at,
      customer: o.customer_name,
      source: o.source === 'site' ? 'Site' : 'Balcão',
      items: o.items_desc,
      payment_method: PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method,
      payment_status: PAYMENT_STATUS_LABELS[o.payment_status],
      total_cents: o.total_cents,
      cost_cents: o.cost_cents,
      margin_cents: o.total_cents - o.shipping_cents - o.cost_cents,
    }));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  return {
    title: 'Relatório de vendas concluídas',
    period: periodLabel(params),
    columns: [
      { key: 'code', label: 'Pedido' },
      { key: 'completed_at', label: 'Concluído em', type: 'datetime' },
      { key: 'customer', label: 'Cliente' },
      { key: 'source', label: 'Origem' },
      { key: 'items', label: 'Itens' },
      { key: 'payment_method', label: 'Pagamento' },
      { key: 'payment_status', label: 'Situação pgto.' },
      { key: 'total_cents', label: 'Total', type: 'money' },
      { key: 'cost_cents', label: 'Custo', type: 'money' },
      { key: 'margin_cents', label: 'Margem', type: 'money' },
    ],
    rows,
    summary: [
      { label: 'Vendas concluídas', value: rows.length },
      { label: 'Faturamento', value: sum('total_cents'), type: 'money' },
      { label: 'Custo dos produtos', value: sum('cost_cents'), type: 'money' },
      { label: 'Margem bruta (sem frete)', value: sum('margin_cents'), type: 'money' },
    ],
  };
}

function ordersReport(params = {}) {
  const { start, end } = rangeOf(params);
  const args = [start, end];
  let extra = '';
  if (params.status && STATUS_LABELS[params.status]) (extra = ' AND status = ?'), args.push(params.status);
  const rows = get()
    .prepare(`SELECT * FROM orders WHERE created_at >= ? AND created_at < ?${extra} ORDER BY created_at`)
    .all(...args)
    .map((o) => ({
      code: o.code,
      created_at: o.created_at,
      customer: o.customer_name,
      phone: o.customer_phone,
      source: o.source === 'site' ? 'Site' : 'Balcão',
      fulfillment: o.fulfillment === 'entrega' ? 'Entrega' : 'Retirada',
      status: STATUS_LABELS[o.status],
      payment_method: PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method,
      payment_status: PAYMENT_STATUS_LABELS[o.payment_status],
      total_cents: o.total_cents,
    }));
  const by = (k, v) => rows.filter((r) => r[k] === v).length;
  return {
    title: 'Relatório de pedidos',
    period: periodLabel(params),
    columns: [
      { key: 'code', label: 'Pedido' },
      { key: 'created_at', label: 'Criado em', type: 'datetime' },
      { key: 'customer', label: 'Cliente' },
      { key: 'phone', label: 'Telefone' },
      { key: 'source', label: 'Origem' },
      { key: 'fulfillment', label: 'Recebimento' },
      { key: 'status', label: 'Status' },
      { key: 'payment_method', label: 'Pagamento' },
      { key: 'payment_status', label: 'Situação pgto.' },
      { key: 'total_cents', label: 'Total', type: 'money' },
    ],
    rows,
    summary: [
      { label: 'Pedidos criados', value: rows.length },
      { label: 'Concluídos', value: by('status', STATUS_LABELS.concluido) },
      { label: 'Cancelados', value: by('status', STATUS_LABELS.cancelado) },
      { label: 'Pagamentos aprovados', value: by('payment_status', PAYMENT_STATUS_LABELS.aprovado) },
      { label: 'Valor total dos pedidos', value: rows.reduce((a, r) => a + r.total_cents, 0), type: 'money' },
    ],
  };
}

function stockReport() {
  const stores = get().prepare('SELECT id, name, neighborhood FROM stores ORDER BY sort, id').all();
  const perStore = new Map(get().prepare('SELECT product_id, store_id, stock_qty - reserved_qty AS avail FROM store_stock').all().map((r) => [`${r.product_id}:${r.store_id}`, r.avail]));
  const storeLabel = (st) => `Disp. ${st.neighborhood || st.name}`;
  const rows = get()
    .prepare(`SELECT p.*, b.name AS brand FROM products p LEFT JOIN brands b ON b.id = p.brand_id ORDER BY p.active DESC, p.name`)
    .all()
    .map((p) => {
      const avail = p.stock_qty - p.reserved_qty;
      return {
        sku: p.sku,
        name: p.name,
        brand: p.brand || '',
        active: p.active ? 'Ativo' : 'Inativo',
        stock_qty: p.stock_qty,
        reserved_qty: p.reserved_qty,
        available_qty: avail,
        min_stock: p.min_stock,
        situation: avail <= 0 ? 'Esgotado' : avail <= p.min_stock ? 'Baixo' : 'OK',
        ...Object.fromEntries(stores.map((st) => [`store_${st.id}`, perStore.get(`${p.id}:${st.id}`) || 0])),
        cost_cents: p.cost_cents,
        price_cents: p.price_cents,
        value_cost_cents: p.stock_qty * p.cost_cents,
      };
    });
  return {
    title: 'Relatório de estoque',
    period: `Posição em ${new Date().toLocaleString('pt-BR')}`,
    columns: [
      { key: 'sku', label: 'SKU' },
      { key: 'name', label: 'Produto' },
      { key: 'brand', label: 'Marca' },
      { key: 'active', label: 'Status' },
      { key: 'stock_qty', label: 'Físico', type: 'int' },
      { key: 'reserved_qty', label: 'Reservado', type: 'int' },
      { key: 'available_qty', label: 'Disponível', type: 'int' },
      ...stores.map((st) => ({ key: `store_${st.id}`, label: storeLabel(st), type: 'int' })),
      { key: 'min_stock', label: 'Mínimo', type: 'int' },
      { key: 'situation', label: 'Situação' },
      { key: 'cost_cents', label: 'Custo un.', type: 'money' },
      { key: 'price_cents', label: 'Preço un.', type: 'money' },
      { key: 'value_cost_cents', label: 'Valor (custo)', type: 'money' },
    ],
    rows,
    summary: [
      { label: 'Produtos', value: rows.length },
      { label: 'Unidades em estoque', value: rows.reduce((a, r) => a + r.stock_qty, 0) },
      { label: 'Unidades reservadas', value: rows.reduce((a, r) => a + r.reserved_qty, 0) },
      { label: 'Valor do estoque (custo)', value: rows.reduce((a, r) => a + r.value_cost_cents, 0), type: 'money' },
      ...stores.map((st) => ({ label: `Disponível — ${st.name}`, value: rows.reduce((a, r) => a + Math.max(r[`store_${st.id}`], 0), 0) })),
    ],
  };
}

function movementsReport(params = {}) {
  const { start, end } = rangeOf(params);
  const rows = get()
    .prepare(`SELECT m.*, o.code AS order_code, s.name AS supplier_name FROM stock_movements m
      LEFT JOIN orders o ON o.id = m.order_id LEFT JOIN suppliers s ON s.id = m.supplier_id
      WHERE m.created_at >= ? AND m.created_at < ? ORDER BY m.created_at, m.id`)
    .all(start, end)
    .map((m) => ({
      created_at: m.created_at,
      sku: m.product_sku,
      product: m.product_name,
      store: m.store_name || '',
      type: MOVEMENT_LABELS[m.type],
      quantity: m.quantity,
      stock_delta: m.stock_delta,
      reserved_delta: m.reserved_delta,
      stock_after: m.stock_after,
      reason: m.reason + (m.supplier_name ? ` (Fornecedor: ${m.supplier_name})` : ''),
      user: m.user_name,
    }));
  return {
    title: 'Histórico de movimentações de estoque',
    period: periodLabel(params),
    columns: [
      { key: 'created_at', label: 'Data', type: 'datetime' },
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Produto' },
      { key: 'store', label: 'Loja' },
      { key: 'type', label: 'Tipo' },
      { key: 'quantity', label: 'Qtd.', type: 'int' },
      { key: 'stock_delta', label: 'Var. físico', type: 'int' },
      { key: 'reserved_delta', label: 'Var. reserva', type: 'int' },
      { key: 'stock_after', label: 'Físico após (loja)', type: 'int' },
      { key: 'reason', label: 'Motivo' },
      { key: 'user', label: 'Responsável' },
    ],
    rows,
    summary: [{ label: 'Movimentações', value: rows.length }],
  };
}

const REPORTS = { vendas: salesReport, pedidos: ordersReport, estoque: stockReport, movimentacoes: movementsReport };

module.exports = { dashboard, REPORTS, salesReport, ordersReport, stockReport, movementsReport };
