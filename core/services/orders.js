'use strict';
const { randomBytes, randomHex, safeEqual } = require('../lib/random');
const { get, tx, now } = require('../db');
const { AppError, notFound } = require('../lib/errors');
const { validate } = require('../lib/validation');
const { digits, STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } = require('../lib/format');
const inventory = require('./inventory');
const settings = require('./settings');
const customers = require('./customers');

const STATUSES = Object.keys(STATUS_LABELS);
const PAYMENT_STATUSES = Object.keys(PAYMENT_STATUS_LABELS);
const SITE_PAYMENT_METHODS = ['pix', 'cartao', 'retirada'];
const ALL_PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABELS);
const OPEN_STATUSES = ['aguardando_pagamento', 'confirmado', 'em_preparacao'];

/** Transições permitidas de status do pedido */
const TRANSITIONS = {
  aguardando_pagamento: ['confirmado', 'em_preparacao', 'concluido', 'cancelado'],
  confirmado: ['em_preparacao', 'concluido', 'cancelado'],
  em_preparacao: ['concluido', 'cancelado'],
  concluido: ['cancelado'],
  cancelado: [],
};

const effectivePrice = (p) =>
  p.promo_price_cents !== null && p.promo_price_cents !== undefined && p.promo_price_cents < p.price_cents ? p.promo_price_cents : p.price_cents;

function genCode() {
  const d = new Date(now());
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (const b of randomBytes(5)) s += alphabet[b % alphabet.length];
  return `CB${ymd}-${s}`;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw new AppError(422, 'O carrinho está vazio.');
  if (items.length > 50) throw new AppError(422, 'Itens demais no pedido.');
  const merged = new Map();
  for (const it of items) {
    const id = Number(it && it.productId);
    const qty = Number(it && it.quantity);
    if (!Number.isInteger(id) || id <= 0) throw new AppError(422, 'Produto inválido no carrinho.');
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw new AppError(422, 'Quantidade inválida no carrinho (1 a 99).');
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  return [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Confere preços/disponibilidade atuais do carrinho sem reservar (usado pelo carrinho e checkout). */
function quote(items, fulfillment = 'retirada') {
  const list = normalizeItems(items);
  const s = settings.getAll();
  const lines = [];
  const problems = [];
  for (const { productId, quantity } of list) {
    const p = get()
      .prepare('SELECT p.*, b.name AS brand_name FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = ?')
      .get(productId);
    if (!p || !p.active) {
      problems.push({ productId, message: 'Produto indisponível ou removido do catálogo.' });
      continue;
    }
    const avail = Math.max(inventory.available(p), 0);
    if (quantity > avail) problems.push({ productId, message: `Apenas ${avail} unidade(s) disponível(is) de "${p.name}".`, available: avail });
    const unit = effectivePrice(p);
    lines.push({ productId, sku: p.sku, name: p.name, brand: p.brand_name || '', image: p.image, quantity, available: avail, unit_price_cents: unit, total_cents: unit * quantity });
  }
  const subtotal = lines.reduce((a, l) => a + l.total_cents, 0);
  const shipping = settings.shippingFor(fulfillment, subtotal, s);
  const stores = storesThatCanFulfill(lines.map((l) => ({ productId: l.productId, quantity: l.quantity })));
  return {
    stores,
    lines,
    problems,
    subtotal_cents: subtotal,
    shipping_cents: shipping,
    total_cents: subtotal + shipping,
    delivery_enabled: !!s.delivery_enabled,
    pickup_enabled: !!s.pickup_enabled,
    delivery_fee_cents: s.delivery_fee_cents,
    delivery_free_above_cents: s.delivery_free_above_cents,
  };
}

/** Para cada loja ativa, informa se ela tem todos os itens disponíveis. */
function storesThatCanFulfill(items) {
  const stores = get().prepare('SELECT id, name, neighborhood, pickup_enabled FROM stores WHERE active = 1 ORDER BY sort, id').all();
  return stores.map((st) => {
    const missing = [];
    for (const it of items) {
      const r = inventory.storeRow(it.productId, st.id);
      if (it.quantity > r.stock_qty - r.reserved_qty) missing.push(it.productId);
    }
    return { id: st.id, name: st.name, neighborhood: st.neighborhood, pickup_enabled: !!st.pickup_enabled, ok: missing.length === 0, missing };
  });
}

const checkoutSchema = {
  name: { type: 'string', label: 'Nome', required: true, min: 3, max: 120 },
  phone: { type: 'phone', label: 'Telefone', required: true },
  email: { type: 'email', label: 'E-mail' },
  vehicle: { type: 'string', label: 'Veículo', max: 120 },
  fulfillment: { type: 'enum', label: 'Forma de recebimento', required: true, values: ['retirada', 'entrega'] },
  paymentMethod: { type: 'enum', label: 'Forma de pagamento', required: true, values: ALL_PAYMENT_METHODS },
  notes: { type: 'text', label: 'Observações', max: 500 },
  pickupStoreId: { type: 'int', label: 'Loja de retirada', min: 1 },
  storeId: { type: 'int', label: 'Loja', min: 1 },
};
const addressSchema = {
  street: { type: 'string', label: 'Rua', required: true, max: 150 },
  number: { type: 'string', label: 'Número', required: true, max: 20 },
  complement: { type: 'string', label: 'Complemento', max: 80 },
  district: { type: 'string', label: 'Bairro', required: true, max: 80 },
  city: { type: 'string', label: 'Cidade', required: true, max: 80 },
  zip: { type: 'string', label: 'CEP', pattern: /^\d{5}-?\d{3}$/, patternMessage: 'CEP deve ter 8 dígitos.' },
  reference: { type: 'string', label: 'Ponto de referência', max: 150 },
};

function addEvent(orderId, type, description, user, at) {
  get()
    .prepare('INSERT INTO order_events (order_id, type, description, user_name, created_at) VALUES (?,?,?,?,?)')
    .run(orderId, type, description, user, at || now());
}

/**
 * Cria um pedido e reserva o estoque na mesma transação.
 * source: 'site' (loja virtual) ou 'balcao' (venda registrada no painel)
 */
function createOrder(input, { source = 'site', user = 'Site', customerId = null } = {}) {
  const data = validate(checkoutSchema, input);
  const s = settings.getAll();
  if (source === 'site' && !SITE_PAYMENT_METHODS.includes(data.paymentMethod)) {
    throw new AppError(422, 'Forma de pagamento inválida.', { fields: { paymentMethod: 'Escolha Pix, cartão ou pagamento na retirada.' } });
  }
  if (data.fulfillment === 'entrega' && !s.delivery_enabled) throw new AppError(422, 'A entrega está desativada no momento. Escolha retirada na loja.');
  if (data.fulfillment === 'retirada' && !s.pickup_enabled && source === 'site') throw new AppError(422, 'A retirada está desativada no momento.');
  if (data.paymentMethod === 'retirada' && data.fulfillment !== 'retirada') {
    throw new AppError(422, 'Pagamento na retirada só vale para retirada na loja.', { fields: { paymentMethod: 'Escolha Pix ou cartão para entrega.' } });
  }
  let address = { street: '', number: '', complement: '', district: '', city: '', zip: '', reference: '' };
  if (data.fulfillment === 'entrega') {
    try {
      address = validate(addressSchema, input.address || {});
    } catch (e) {
      if (e.details && e.details.fields) {
        const fields = {};
        for (const [k, v] of Object.entries(e.details.fields)) fields[`address.${k}`] = v;
        e.details.fields = fields;
      }
      throw e;
    }
  }
  let pickupStore = null;
  if (data.fulfillment === 'retirada') {
    const stores = get().prepare('SELECT id, name FROM stores WHERE active = 1 AND pickup_enabled = 1 ORDER BY sort, id').all();
    if (data.pickupStoreId) {
      pickupStore = stores.find((st) => st.id === data.pickupStoreId) || null;
      if (!pickupStore) throw new AppError(422, 'Loja de retirada indisponível.', { fields: { pickupStoreId: 'Escolha uma das lojas disponíveis.' } });
    } else if (source === 'site' && stores.length) {
      throw new AppError(422, 'Escolha a loja para retirada.', { fields: { pickupStoreId: 'Escolha a loja onde vai retirar.' } });
    }
  }
  const items = normalizeItems(input.items);
  const discount = source === 'balcao' ? Math.max(0, Number(input.discountCents) || 0) : 0;

  return tx(() => {
    const ts = now();
    // carrega produtos e calcula preços no servidor (nunca confia no preço vindo do cliente)
    const lines = items.map(({ productId, quantity }) => {
      const p = get()
        .prepare('SELECT p.*, b.name AS brand_name FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE p.id = ?')
        .get(productId);
      if (!p) throw new AppError(404, 'Produto não encontrado.');
      if (!p.active) throw new AppError(409, `"${p.name}" não está mais disponível.`);
      const unit = effectivePrice(p);
      return { p, quantity, unit, total: unit * quantity };
    });
    // loja que vai reservar/baixar o estoque deste pedido
    let stockStore;
    if (pickupStore) stockStore = pickupStore;
    else if (data.storeId) {
      stockStore = inventory.loadStore(data.storeId);
      if (!stockStore.active) throw new AppError(422, 'Loja inativa.', { fields: { storeId: 'Escolha uma loja ativa.' } });
    } else {
      const options = storesThatCanFulfill(items);
      const ok = options.find((o) => o.ok);
      if (ok) stockStore = { id: ok.id, name: ok.name };
      else if (!options.length) stockStore = inventory.loadStore(inventory.defaultStoreId());
      else {
        for (const l of lines) {
          const avail = Math.max(l.p.stock_qty - l.p.reserved_qty, 0);
          if (l.quantity > avail) throw new AppError(409, `Estoque insuficiente para "${l.p.name}". Disponível: ${avail}.`, { productId: l.p.id, available: avail });
        }
        throw new AppError(409, 'Nenhuma loja tem todos os itens ao mesmo tempo. Divida a compra, escolha retirada em outra loja ou fale conosco pelo WhatsApp.');
      }
    }
    const subtotal = lines.reduce((a, l) => a + l.total, 0);
    const shipping = settings.shippingFor(data.fulfillment, subtotal, s);
    if (discount > subtotal + shipping) throw new AppError(422, 'Desconto maior que o valor do pedido.');
    const total = subtotal + shipping - discount;
    const cust = customerId
      ? customerId
      : customers.upsertByPhone({ name: data.name, phone: data.phone, email: data.email, address: data.fulfillment === 'entrega' ? formatAddress(address) : '' });
    const expires = new Date(Date.parse(ts) + (Number(s.reservation_hours) || 48) * 3600 * 1000).toISOString();

    let code;
    for (let i = 0; i < 5; i++) {
      code = genCode();
      if (!get().prepare('SELECT 1 FROM orders WHERE code = ?').get(code)) break;
    }
    const token = randomHex(16);
    const r = get()
      .prepare(
        `INSERT INTO orders (code, access_token, source, customer_id, customer_name, customer_phone, customer_phone_digits, customer_email,
          vehicle_info, fulfillment, address_street, address_number, address_complement, address_district, address_city, address_zip,
          address_reference, subtotal_cents, shipping_cents, discount_cents, total_cents, payment_method, payment_status, status,
          stock_state, notes, expires_at, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pendente','aguardando_pagamento','reservado',?,?,?,?,?)`
      )
      .run(
        code, token, source, cust, data.name, data.phone, digits(data.phone), data.email, data.vehicle || '', data.fulfillment,
        address.street, address.number, address.complement, address.district, address.city, address.zip, address.reference,
        subtotal, shipping, discount, total, data.paymentMethod, data.notes || '', expires, user, ts, ts
      );
    const orderId = r.lastInsertRowid;
    get()
      .prepare('UPDATE orders SET pickup_store_id = ?, pickup_store_name = ?, stock_store_id = ? WHERE id = ?')
      .run(pickupStore ? pickupStore.id : null, pickupStore ? pickupStore.name : '', stockStore.id, orderId);
    const insItem = get().prepare(
      `INSERT INTO order_items (order_id, product_id, sku, name, brand, capacity_ah, warranty_months, unit_price_cents, unit_cost_cents, quantity, total_cents)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const l of lines) {
      insItem.run(orderId, l.p.id, l.p.sku, l.p.name, l.p.brand_name || '', l.p.capacity_ah, l.p.warranty_months, l.unit, l.p.cost_cents, l.quantity, l.total);
      inventory.applyMovement({ productId: l.p.id, storeId: stockStore.id, type: 'reserva', quantity: l.quantity, reason: `Reserva do pedido ${code}`, user, orderId });
    }
    addEvent(orderId, 'criado', source === 'site' ? 'Pedido criado pelo site. Estoque reservado.' : 'Venda registrada no painel. Estoque reservado.', user, ts);
    return getById(orderId);
  });
}

function formatAddress(a) {
  return [a.street && `${a.street}, ${a.number}`, a.complement, a.district, a.city, a.zip].filter(Boolean).join(' — ');
}

function getById(id, { withDetails = true } = {}) {
  const o = get().prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) throw notFound('Pedido');
  if (!withDetails) return o;
  o.items = get().prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  o.events = get().prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at, id').all(id);
  o.payments = get().prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at, id').all(id);
  return o;
}

function getByCode(code) {
  const o = get().prepare('SELECT id FROM orders WHERE code = ?').get(String(code || '').trim().toUpperCase());
  if (!o) throw notFound('Pedido');
  return getById(o.id);
}

/** Visão pública do pedido (sem custo, sem dados internos) */
function publicView(o) {
  return {
    code: o.code,
    access_token: o.access_token,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone,
    vehicle_info: o.vehicle_info,
    fulfillment: o.fulfillment,
    pickup_store_name: o.pickup_store_name || '',
    address: o.fulfillment === 'entrega' ? formatAddress({ street: o.address_street, number: o.address_number, complement: o.address_complement, district: o.address_district, city: o.address_city, zip: o.address_zip }) : '',
    subtotal_cents: o.subtotal_cents,
    shipping_cents: o.shipping_cents,
    discount_cents: o.discount_cents,
    total_cents: o.total_cents,
    payment_method: o.payment_method,
    payment_status: o.payment_status,
    status: o.status,
    expires_at: o.expires_at,
    created_at: o.created_at,
    items: (o.items || []).map((i) => ({ product_id: i.product_id, sku: i.sku, name: i.name, brand: i.brand, capacity_ah: i.capacity_ah, warranty_months: i.warranty_months, unit_price_cents: i.unit_price_cents, quantity: i.quantity, total_cents: i.total_cents })),
    events: (o.events || []).map((e) => ({ description: e.description, created_at: e.created_at })),
    payments: (o.payments || []).map((p) => ({ method: p.method, status: p.status, amount_cents: p.amount_cents, simulated: !!p.simulated, created_at: p.created_at })),
  };
}

function lookup(code, phone) {
  let o;
  try {
    o = getByCode(code);
  } catch {
    throw new AppError(404, 'Pedido não encontrado. Confira o código e o telefone.');
  }
  const d = digits(phone);
  if (d.length < 10 || o.customer_phone_digits.slice(-10) !== d.slice(-10)) {
    throw new AppError(404, 'Pedido não encontrado. Confira o código e o telefone.');
  }
  return o;
}

function getByCodeAndToken(code, token) {
  let o;
  try {
    o = getByCode(code);
  } catch {
    throw notFound('Pedido');
  }
  if (!token || typeof token !== 'string' || !safeEqual(o.access_token, token)) {
    throw notFound('Pedido');
  }
  return o;
}

/** Altera o status do pedido aplicando as regras de estoque correspondentes. */
function changeStatus(orderId, newStatus, { user, reason = '' } = {}) {
  if (!STATUSES.includes(newStatus)) throw new AppError(422, 'Status inválido.');
  return tx(() => {
    const o = getById(orderId);
    if (o.status === newStatus) throw new AppError(409, `O pedido já está "${STATUS_LABELS[newStatus]}".`);
    if (!TRANSITIONS[o.status].includes(newStatus)) {
      throw new AppError(409, `Não é possível mudar de "${STATUS_LABELS[o.status]}" para "${STATUS_LABELS[newStatus]}".`);
    }
    const ts = now();
    const sets = { status: newStatus, updated_at: ts };
    let desc = `Status alterado para "${STATUS_LABELS[newStatus]}".`;
    if (newStatus === 'concluido') {
      if (o.stock_state !== 'reservado') throw new AppError(409, 'Estoque deste pedido não está reservado; baixa não permitida.');
      for (const i of o.items) {
        inventory.applyMovement({ productId: i.product_id, storeId: o.stock_store_id, type: 'baixa_venda', quantity: i.quantity, reason: `Venda concluída — pedido ${o.code}`, user, orderId: o.id });
      }
      sets.stock_state = 'baixado';
      sets.completed_at = ts;
      desc += ' Reserva convertida em saída de estoque.';
    } else if (newStatus === 'cancelado') {
      if (o.stock_state === 'reservado') {
        for (const i of o.items) {
          inventory.applyMovement({ productId: i.product_id, storeId: o.stock_store_id, type: 'liberacao', quantity: i.quantity, reason: `Cancelamento do pedido ${o.code}${reason ? ` — ${reason}` : ''}`, user, orderId: o.id });
        }
        sets.stock_state = 'liberado';
        desc += ' Reserva de estoque liberada.';
      } else if (o.stock_state === 'baixado') {
        for (const i of o.items) {
          inventory.applyMovement({ productId: i.product_id, storeId: o.stock_store_id, type: 'devolucao', quantity: i.quantity, reason: `Devolução — cancelamento do pedido ${o.code}${reason ? ` — ${reason}` : ''}`, user, orderId: o.id });
        }
        sets.stock_state = 'devolvido';
        desc += ' Itens devolvidos ao estoque.';
      }
      sets.canceled_at = ts;
      sets.cancel_reason = reason || '';
      if (reason) desc += ` Motivo: ${reason}`;
    }
    const cols = Object.keys(sets);
    const r = get()
      .prepare(`UPDATE orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND status = ?`)
      .run(...cols.map((c) => sets[c]), o.id, o.status);
    if (r.changes !== 1) throw new AppError(409, 'O pedido foi alterado por outra operação. Atualize a página.');
    addEvent(o.id, 'status', desc, user, ts);
    return getById(o.id);
  });
}

/**
 * Registra a situação do pagamento (separada do status do pedido).
 * Aprovação move "aguardando pagamento" para "confirmado".
 */
function setPaymentStatus(orderId, status, { user, note = '', simulated = false, method = null } = {}) {
  if (!PAYMENT_STATUSES.includes(status)) throw new AppError(422, 'Situação de pagamento inválida.');
  return tx(() => {
    const o = getById(orderId);
    if (o.payment_status === status) throw new AppError(409, `O pagamento já está "${PAYMENT_STATUS_LABELS[status]}".`);
    if (status === 'aprovado' && o.status === 'cancelado') throw new AppError(409, 'Pedido cancelado não pode ter pagamento aprovado.');
    if (status === 'estornado' && o.payment_status !== 'aprovado') throw new AppError(409, 'Só é possível estornar um pagamento aprovado.');
    if (o.payment_status === 'aprovado' && ['pendente', 'recusado'].includes(status)) {
      throw new AppError(409, 'Pagamento já aprovado. Para desfazer, registre um estorno.');
    }
    const ts = now();
    const m = method && ALL_PAYMENT_METHODS.includes(method) ? method : o.payment_method;
    get()
      .prepare('INSERT INTO payments (order_id, method, amount_cents, status, simulated, note, user_name, created_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(o.id, m, o.total_cents, status, simulated ? 1 : 0, note, user, ts);
    const sets = { payment_status: status, payment_method: m, updated_at: ts };
    if (status === 'aprovado') sets.paid_at = ts;
    if (status === 'estornado') sets.paid_at = null;
    const cols = Object.keys(sets);
    get().prepare(`UPDATE orders SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => sets[c]), o.id);
    addEvent(o.id, 'pagamento', `Pagamento ${PAYMENT_STATUS_LABELS[status].toLowerCase()}${simulated ? ' (simulação — nenhum valor cobrado)' : ''}${note ? `: ${note}` : ''}.`, user, ts);
    if (status === 'aprovado' && o.status === 'aguardando_pagamento') {
      changeStatus(o.id, 'confirmado', { user });
    }
    return getById(o.id);
  });
}

/** Simulação de pagamento feita pelo cliente na página do pedido (modo demonstração). */
function simulatePayment(code, token, outcome) {
  const o = getByCodeAndToken(code, token);
  if (!['pix', 'cartao'].includes(o.payment_method)) throw new AppError(409, 'Este pedido será pago na retirada; não há pagamento online a simular.');
  if (o.status === 'cancelado') throw new AppError(409, 'Pedido cancelado.');
  if (o.payment_status === 'aprovado') throw new AppError(409, 'Pagamento já aprovado.');
  if (!['aprovado', 'recusado'].includes(outcome)) throw new AppError(422, 'Resultado inválido.');
  if (outcome === 'recusado' && o.payment_status === 'recusado') {
    // permite registrar nova tentativa recusada
    return tx(() => {
      get()
        .prepare('INSERT INTO payments (order_id, method, amount_cents, status, simulated, note, user_name, created_at) VALUES (?,?,?,?,1,?,?,?)')
        .run(o.id, o.payment_method, o.total_cents, 'recusado', 'Nova tentativa recusada (simulação)', 'Cliente (simulação)', now());
      addEvent(o.id, 'pagamento', 'Nova tentativa de pagamento recusada (simulação — nenhum valor cobrado).', 'Cliente (simulação)');
      return getById(o.id);
    });
  }
  return setPaymentStatus(o.id, outcome, { user: 'Cliente (simulação)', simulated: true, note: o.payment_method === 'pix' ? 'Pix demonstrativo' : 'Cartão simulado' });
}

/** Cancela pedidos aguardando pagamento cuja reserva expirou. */
function expireOrders(at = new Date(now())) {
  const rows = get()
    .prepare(`SELECT id FROM orders WHERE status = 'aguardando_pagamento' AND payment_status <> 'aprovado' AND expires_at IS NOT NULL AND expires_at < ?`)
    .all(at.toISOString());
  let n = 0;
  for (const r of rows) {
    try {
      changeStatus(r.id, 'cancelado', { user: 'Sistema', reason: 'Reserva expirada sem pagamento' });
      n++;
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  return n;
}

function list({ status, paymentStatus, source, q, from, to, limit = 50, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (status === 'abertos') where.push(`status IN ('aguardando_pagamento','confirmado','em_preparacao')`);
  else if (status) (where.push('status = ?'), args.push(status));
  if (paymentStatus) (where.push('payment_status = ?'), args.push(paymentStatus));
  if (source) (where.push('source = ?'), args.push(source));
  if (from) (where.push('created_at >= ?'), args.push(from));
  if (to) (where.push('created_at < ?'), args.push(to));
  if (q) {
    where.push('(code LIKE ? OR customer_name LIKE ? OR customer_phone_digits LIKE ?)');
    const like = `%${q}%`;
    args.push(like.toUpperCase(), like, `%${digits(q) || '#'}%`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get().prepare(`SELECT COUNT(*) c FROM orders ${w}`).get(...args).c;
  const items = get()
    .prepare(`SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o ${w} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  return { items, total };
}

/** Venda de balcão registrada pelo painel; pode ser concluída e paga imediatamente. */
function createCounterSale(input, { user }) {
  return tx(() => {
    let customerId = null;
    let name = input.name;
    let phone = input.phone;
    if (input.customerId) {
      const c = get().prepare('SELECT * FROM customers WHERE id = ?').get(Number(input.customerId));
      if (!c) throw notFound('Cliente');
      customerId = c.id;
      name = c.name;
      phone = c.phone || phone;
    }
    const pm = input.paymentMethod || 'dinheiro';
    const order = createOrder(
      { ...input, name, phone, fulfillment: input.fulfillment || 'retirada', paymentMethod: pm },
      { source: 'balcao', user, customerId }
    );
    let o = order;
    if (input.paid) o = setPaymentStatus(o.id, 'aprovado', { user, note: 'Pagamento recebido no balcão' });
    if (input.complete) o = changeStatus(o.id, 'concluido', { user });
    return o;
  });
}

module.exports = {
  storesThatCanFulfill,
  STATUSES, PAYMENT_STATUSES, TRANSITIONS, OPEN_STATUSES, SITE_PAYMENT_METHODS, ALL_PAYMENT_METHODS,
  effectivePrice, quote, createOrder, createCounterSale, getById, getByCode, getByCodeAndToken, publicView, lookup,
  changeStatus, setPaymentStatus, simulatePayment, expireOrders, list, formatAddress, addEvent,
};
