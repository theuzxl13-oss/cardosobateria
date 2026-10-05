'use strict';
/**
 * API REST independente de framework.
 * Usada pelo servidor Express (server/index.js) e, no modo GitHub Pages, diretamente no navegador.
 *   handle({ method, path, query, body, token }) -> Promise<{ status, body }>
 */
const { AppError } = require('../lib/errors');
const { validate } = require('../lib/validation');
const { dayRange } = require('../lib/format');
const settings = require('../services/settings');
const catalog = require('../services/catalog');
const orders = require('../services/orders');
const inventory = require('../services/inventory');
const resources = require('../services/resources');
const reports = require('../services/reports');
const auth = require('../services/auth');
const seed = require('../services/seed');
const chat = require('../chat');
const { waLink, orderMessage } = require('../lib/whatsapp');

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}/?$`);
  routes.push({ method, re, keys, handler, auth: !!opts.auth });
};
const pub = (m, p, h) => route(m, `/api/public${p}`, h);
const adm = (m, p, h) => route(m, `/api/admin${p}`, h, { auth: true });

const settingsSchema = {
  store_name: { type: 'string', label: 'Nome da loja', required: true, max: 80 },
  logo_url: { type: 'string', label: 'Logo (fundo claro)', max: 1500000 },
  logo_on_dark_url: { type: 'string', label: 'Logo (fundo escuro)', max: 1500000 },
  whatsapp_number: { type: 'string', label: 'WhatsApp (somente números, com 55)', required: true, pattern: /^\d{12,13}$/, patternMessage: 'Use o formato 55 + DDD + número, só dígitos.' },
  whatsapp_display: { type: 'string', label: 'WhatsApp (exibição)', max: 30 },
  phone: { type: 'string', label: 'Telefone', max: 30 },
  email: { type: 'email', label: 'E-mail' },
  cnpj: { type: 'string', label: 'CNPJ', max: 20 },
  address: { type: 'text', label: 'Endereço', max: 300 },
  address_map_url: { type: 'url', label: 'Link do mapa', max: 500 },
  business_hours: { type: 'text', label: 'Horários', max: 500 },
  service_area: { type: 'text', label: 'Área de atendimento', max: 500 },
  instagram_url: { type: 'url', label: 'Instagram', max: 300 },
  facebook_url: { type: 'url', label: 'Facebook', max: 300 },
  tiktok_url: { type: 'url', label: 'TikTok', max: 300 },
  hero_title: { type: 'string', label: 'Título principal', max: 120 },
  hero_subtitle: { type: 'text', label: 'Subtítulo principal', max: 300 },
  about_title: { type: 'string', label: 'Título "Sobre"', max: 120 },
  about_text: { type: 'text', label: 'Texto "Sobre"', max: 5000 },
  about_highlights: { type: 'text', label: 'Destaques', max: 1000 },
  pickup_enabled: { type: 'bool', label: 'Retirada ativa' },
  pickup_instructions: { type: 'text', label: 'Instruções de retirada', max: 500 },
  delivery_enabled: { type: 'bool', label: 'Entrega ativa' },
  delivery_fee_cents: { type: 'money', label: 'Valor do frete' },
  delivery_free_above_cents: { type: 'money', label: 'Frete grátis acima de' },
  delivery_info: { type: 'text', label: 'Informações de entrega', max: 500 },
  reservation_hours: { type: 'int', label: 'Validade da reserva (horas)', min: 1, max: 720 },
  warranty_policy: { type: 'text', label: 'Política de garantia', max: 1000 },
  footer_note: { type: 'string', label: 'Nota do rodapé', max: 200 },
};

let lastSweep = 0;
function sweep() {
  if (Date.now() - lastSweep < 30000) return 0;
  lastSweep = Date.now();
  return orders.expireOrders();
}

function rangeQuery(q) {
  return dayRange(q.from, q.to);
}

/* ------------------------------ Público ------------------------------ */
route('GET', '/api/health', () => ({ ok: true, chat_provider: chat.activeProvider() }));
pub('GET', '/settings', () => settings.getPublic());
pub('GET', '/home', () => ({
  banners: resources.list('banners', { publicOnly: true }),
  featured: catalog.listPublic({ featured: '1' }).slice(0, 8),
  promos: catalog.listPublic({ promo: '1' }).slice(0, 4),
  services: resources.list('services', { publicOnly: true }),
  stores: resources.list('stores', { publicOnly: true }),
  faqs: resources.list('faqs', { publicOnly: true }).slice(0, 4),
}));
pub('GET', '/products', ({ query }) => catalog.listPublic(query));
pub('GET', '/products/:id', ({ params }) => catalog.getPublic(params.id));
pub('GET', '/filters', () => catalog.filters());
pub('GET', '/vehicles/makes', () => catalog.vehicleMakes());
pub('GET', '/vehicles/models', ({ query }) => catalog.vehicleModels(query.make));
pub('GET', '/vehicles/years', ({ query }) => catalog.vehicleYears(query.make, query.model));
pub('GET', '/vehicles/search', ({ query }) => catalog.vehicleSearch(query));
for (const r of ['services', 'faqs', 'gallery', 'banners', 'stores']) pub('GET', `/${r}`, () => resources.list(r, { publicOnly: true }));
pub('POST', '/cart/quote', ({ body }) => orders.quote(body.items, body.fulfillment));
pub('POST', '/orders', ({ body }) => {
  const o = orders.createOrder(body, { source: 'site', user: 'Site' });
  return withWhatsapp(orders.publicView(o));
});
pub('POST', '/orders/lookup', ({ body }) => withWhatsapp(orders.publicView(orders.lookup(body.code, body.phone))));
pub('GET', '/orders/:code', ({ params, query }) => withWhatsapp(orders.publicView(orders.getByCodeAndToken(params.code, query.token))));
pub('POST', '/orders/:code/simulate-payment', ({ params, body }) => withWhatsapp(orders.publicView(orders.simulatePayment(params.code, body.token, body.outcome))));
pub('POST', '/chat', async ({ body }) => chat.reply(body.message, { history: Array.isArray(body.history) ? body.history.slice(-10) : [] }));

function withWhatsapp(view) {
  const s = settings.getAll();
  view.whatsapp_url = waLink(s.whatsapp_number, orderMessage(view, view.items));
  return view;
}

/* ------------------------------ Autenticação ------------------------------ */
route('POST', '/api/auth/login', ({ body }) => auth.login(body.email, body.password));
route('POST', '/api/auth/logout', ({ token }) => auth.logout(token));
route('GET', '/api/auth/me', ({ user }) => ({ user }), { auth: true });
route('POST', '/api/auth/password', ({ user, body }) => auth.changePassword(user.id, body.current, body.next), { auth: true });

/* ------------------------------ Administração ------------------------------ */
adm('GET', '/dashboard', ({ query }) => reports.dashboard({ from: query.from, to: query.to }));

adm('GET', '/products', ({ query }) => catalog.listAdmin(query));
adm('POST', '/products', ({ body, user }) => catalog.create(body, { user: user.name }));
adm('GET', '/products/:id', ({ params }) => catalog.getAdmin(params.id));
adm('PUT', '/products/:id', ({ params, body }) => catalog.update(params.id, body));
adm('POST', '/products/:id/active', ({ params, body }) => catalog.setActive(params.id, !!body.active));
adm('DELETE', '/products/:id', ({ params }) => catalog.remove(params.id));
adm('POST', '/products/:id/applications', ({ params, body }) => catalog.addApplication(params.id, body));
adm('PUT', '/products/:id/applications/:appId', ({ params, body }) => catalog.updateApplication(params.id, params.appId, body));
adm('DELETE', '/products/:id/applications/:appId', ({ params }) => catalog.removeApplication(params.id, params.appId));
adm('POST', '/products/:id/images', ({ params, body }) => catalog.addImage(params.id, body));
adm('DELETE', '/products/:id/images/:imageId', ({ params }) => catalog.removeImage(params.id, params.imageId));
adm('POST', '/products/:id/images/:imageId/main', ({ params }) => catalog.setMainImage(params.id, params.imageId));

adm('GET', '/r/:resource', ({ params, query }) => resources.list(params.resource, { q: query.q }));
adm('POST', '/r/:resource', ({ params, body }) => resources.create(params.resource, body));
adm('GET', '/r/:resource/:id', ({ params }) => resources.getOne(params.resource, params.id));
adm('PUT', '/r/:resource/:id', ({ params, body }) => resources.update(params.resource, params.id, body));
adm('DELETE', '/r/:resource/:id', ({ params }) => resources.remove(params.resource, params.id));
adm('GET', '/customers/:id/orders', ({ params }) => orders.list({ limit: 200 }).items.filter((o) => o.customer_id === Number(params.id)));

adm('GET', '/stock/movements', ({ query }) => {
  const r = rangeQuery(query);
  return inventory.listMovements({
    productId: query.productId ? Number(query.productId) : null,
    storeId: query.storeId ? Number(query.storeId) : null,
    type: query.type || null,
    from: r.start,
    to: r.end,
    limit: Math.min(Number(query.limit) || 100, 500),
    offset: Number(query.offset) || 0,
  });
});
adm('POST', '/stock/movements', ({ body, user }) => {
  const data = validate(
    {
      productId: { type: 'int', label: 'Produto', required: true, min: 1 },
      storeId: { type: 'int', label: 'Loja', required: true, min: 1 },
      toStoreId: { type: 'int', label: 'Loja de destino', min: 1 },
      type: { type: 'enum', label: 'Tipo', required: true, values: ['entrada', 'saida', 'ajuste', 'transferencia'] },
      quantity: { type: 'int', label: 'Quantidade', min: 1, max: 100000 },
      newQty: { type: 'int', label: 'Nova quantidade', min: 0, max: 100000 },
      reason: { type: 'string', label: 'Motivo', required: true, min: 3, max: 300 },
      supplierId: { type: 'int', label: 'Fornecedor', min: 1 },
      unitCostCents: { type: 'money', label: 'Custo unitário' },
      updateCost: { type: 'bool', label: 'Atualizar custo' },
    },
    body
  );
  if (data.type !== 'ajuste' && !data.quantity) throw new AppError(422, 'Informe a quantidade.', { fields: { quantity: 'Quantidade é obrigatória.' } });
  if (data.type === 'ajuste' && (data.newQty === null || data.newQty === undefined)) throw new AppError(422, 'Informe a nova quantidade.', { fields: { newQty: 'Nova quantidade é obrigatória.' } });
  inventory.registerManual({ ...data, user: user.name });
  return catalog.getAdmin(data.productId);
});

adm('GET', '/stock/matrix', () => inventory.stockMatrix());
adm('GET', '/orders', ({ query }) => {
  const r = rangeQuery(query);
  return orders.list({ status: query.status, paymentStatus: query.paymentStatus, source: query.source, q: query.q, from: r.start, to: r.end, limit: Math.min(Number(query.limit) || 50, 200), offset: Number(query.offset) || 0 });
});
adm('GET', '/orders/:id', ({ params }) => {
  const o = orders.getById(Number(params.id));
  const s = settings.getAll();
  o.whatsapp_url = waLink(o.customer_phone_digits.length <= 11 ? `55${o.customer_phone_digits}` : o.customer_phone_digits, `Olá, ${o.customer_name}! Aqui é da ${s.store_name} sobre o pedido ${o.code}.`);
  o.movements = inventory.listMovements({ orderId: o.id, limit: 100 }).items;
  o.allowed_status = orders.TRANSITIONS[o.status];
  const st = o.stock_store_id ? require('../db').get().prepare('SELECT name FROM stores WHERE id = ?').get(o.stock_store_id) : null;
  o.stock_store_name = st ? st.name : '';
  return o;
});
adm('POST', '/orders/:id/status', ({ params, body, user }) => orders.changeStatus(Number(params.id), body.status, { user: user.name, reason: String(body.reason || '').slice(0, 200) }));
adm('POST', '/orders/:id/payment', ({ params, body, user }) => orders.setPaymentStatus(Number(params.id), body.status, { user: user.name, note: String(body.note || '').slice(0, 200), method: body.method }));
adm('POST', '/sales', ({ body, user }) => orders.createCounterSale(body, { user: user.name }));

adm('GET', '/settings', () => settings.getAll());
adm('PUT', '/settings', ({ body }) => settings.setMany(validate(settingsSchema, body, { partial: true })));

adm('GET', '/reports/:type', ({ params, query }) => {
  const fn = reports.REPORTS[params.type];
  if (!fn) throw new AppError(404, 'Relatório não encontrado.');
  return fn({ from: query.from, to: query.to, status: query.status });
});

/* ------------------------------ Dispatcher ------------------------------ */
let adminDefaults = null;
adm('POST', '/demo/reset', ({ body }) => {
  if (body.confirm !== 'RESTAURAR') throw new AppError(422, 'Digite RESTAURAR para confirmar.');
  const r = seed.resetDemo(adminDefaults);
  return { ok: true, ...r };
});

function createRouter({ admin, onWrite } = {}) {
  adminDefaults = admin;

  async function handle({ method, path, query = {}, body = {}, token = null }) {
    try {
      const m = method.toUpperCase();
      const clean = path.split('?')[0];
      let found = null;
      for (const r of routes) {
        if (r.method !== m) continue;
        const match = clean.match(r.re);
        if (match) {
          found = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])])) };
          break;
        }
      }
      if (!found) return { status: 404, body: { error: 'Rota não encontrada.' } };
      const expired = sweep();
      let user = null;
      if (found.r.auth) {
        user = auth.userFromToken(token);
        if (!user) return { status: 401, body: { error: 'Sessão expirada ou inválida. Faça login novamente.' } };
      }
      const result = await found.r.handler({ params: found.params, query: query || {}, body: body || {}, user, token });
      if ((m !== 'GET' || expired) && onWrite) await onWrite();
      return { status: m === 'POST' && /\/(orders|sales|products|r\/\w+)$/.test(clean) ? 201 : 200, body: result };
    } catch (e) {
      if (e instanceof AppError) return { status: e.status, body: { error: e.message, ...(e.details || {}) } };
      const msg = String(e && e.message);
      if (/constraint failed/i.test(msg)) {
        return { status: 409, body: { error: 'Operação recusada pelas regras de integridade do banco (ex.: estoque negativo ou registro em uso).' } };
      }
      console.error(e);
      return { status: 500, body: { error: 'Erro interno. Tente novamente.' } };
    }
  }
  return { handle };
}

module.exports = { createRouter, settingsSchema };
