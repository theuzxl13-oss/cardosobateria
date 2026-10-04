'use strict';
/**
 * Carga inicial de dados DEMONSTRATIVOS.
 * Marcas, preços, aplicações por veículo, clientes, fornecedores e pedidos são fictícios.
 * O histórico de pedidos é criado pelas mesmas regras de negócio usadas pelo sistema
 * (reserva, baixa, liberação), com o relógio deslocado para datas passadas.
 */
const { get, tx, setClock } = require('../db');
const auth = require('./auth');
const orders = require('./orders');
const inventory = require('./inventory');

const DEMO_NOTE = 'Aplicação demonstrativa — confirme a compatibilidade com a loja.';

const BRANDS = [
  { name: 'Voltrix', description: 'Marca fictícia usada na demonstração.' },
  { name: 'Amperion', description: 'Marca fictícia usada na demonstração.' },
  { name: 'Cargavolt', description: 'Marca fictícia usada na demonstração.' },
];
const CATEGORIES = [
  { name: 'Automotiva leve', description: 'Carros de passeio.', sort: 1 },
  { name: 'Start-Stop (EFB/AGM)', description: 'Veículos com sistema start-stop.', sort: 2 },
  { name: 'Pickups e utilitários', description: 'Maior capacidade para utilitários e diesel.', sort: 3 },
];

// [sku, nome, marca, categoria, Ah, CCA, dimensões, polaridade, tecnologia, garantia, preço, promo, custo, estoque inicial, mínimo, destaque, ativo]
const PRODUCTS = [
  ['VTX-40D', 'Bateria Voltrix 40Ah Compacta', 'Voltrix', 'Automotiva leve', 40, 300, '187 x 127 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 15, 34990, null, 23000, 6, 2, 0, 1],
  ['VTX-45D', 'Bateria Voltrix 45Ah', 'Voltrix', 'Automotiva leve', 45, 350, '207 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 18, 38990, 36990, 26000, 14, 4, 1, 1],
  ['AMP-45D', 'Bateria Amperion 45Ah Selada', 'Amperion', 'Automotiva leve', 45, 360, '207 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 41990, null, 28500, 8, 3, 0, 1],
  ['AMP-50D', 'Bateria Amperion 50Ah', 'Amperion', 'Automotiva leve', 50, 400, '212 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 44990, null, 30500, 12, 4, 1, 1],
  ['CGV-50E', 'Bateria Cargavolt 50Ah (polo invertido)', 'Cargavolt', 'Automotiva leve', 50, 380, '212 x 175 x 175 mm', 'Positivo à esquerda', 'Chumbo-cálcio selada', 18, 42990, null, 29000, 5, 2, 0, 1],
  ['VTX-60D', 'Bateria Voltrix 60Ah', 'Voltrix', 'Automotiva leve', 60, 450, '242 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 47990, null, 32000, 18, 5, 1, 1],
  ['AMP-60EFB', 'Bateria Amperion 60Ah EFB Start-Stop', 'Amperion', 'Start-Stop (EFB/AGM)', 60, 560, '242 x 175 x 190 mm', 'Positivo à direita', 'EFB (Start-Stop)', 24, 64990, 59990, 44000, 14, 3, 1, 1],
  ['CGV-60D', 'Bateria Cargavolt 60Ah', 'Cargavolt', 'Automotiva leve', 60, 430, '242 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 18, 45990, null, 31000, 8, 4, 0, 1],
  ['VTX-70D', 'Bateria Voltrix 70Ah', 'Voltrix', 'Automotiva leve', 70, 550, '278 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 55990, null, 38000, 10, 3, 1, 1],
  ['AMP-70AGM', 'Bateria Amperion 70Ah AGM Start-Stop', 'Amperion', 'Start-Stop (EFB/AGM)', 70, 720, '278 x 175 x 190 mm', 'Positivo à direita', 'AGM (Start-Stop)', 36, 114990, null, 82000, 7, 2, 1, 1],
  ['CGV-70D', 'Bateria Cargavolt 70Ah', 'Cargavolt', 'Automotiva leve', 70, 520, '278 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 18, 52990, null, 36000, 2, 2, 0, 1],
  ['VTX-90D', 'Bateria Voltrix 90Ah', 'Voltrix', 'Pickups e utilitários', 90, 700, '353 x 175 x 175 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 78990, null, 54000, 12, 3, 1, 1],
  ['AMP-90D', 'Bateria Amperion 90Ah Heavy', 'Amperion', 'Pickups e utilitários', 90, 760, '353 x 175 x 190 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 24, 82990, null, 57000, 6, 2, 0, 1],
  ['CGV-95D', 'Bateria Cargavolt 95Ah Utilitário', 'Cargavolt', 'Pickups e utilitários', 95, 780, '353 x 175 x 190 mm', 'Positivo à direita', 'Chumbo-cálcio selada', 18, 86990, null, 60000, 10, 2, 0, 1],
  ['VTX-38D', 'Bateria Voltrix 38Ah (linha descontinuada)', 'Voltrix', 'Automotiva leve', 38, 280, '187 x 127 x 175 mm', 'Positivo à direita', 'Chumbo-ácido convencional', 12, 31990, null, 21000, 0, 0, 0, 0],
];

// Aplicações DEMONSTRATIVAS (não verificadas) — [sku, marca, modelo, ano inicial, ano final, motor]
const APPLICATIONS = [
  ['VTX-40D', 'Fiat', 'Mobi', 2017, 2024, '1.0'],
  ['VTX-45D', 'Fiat', 'Uno', 2011, 2021, '1.0'],
  ['VTX-45D', 'Renault', 'Kwid', 2018, 2024, '1.0'],
  ['AMP-45D', 'Fiat', 'Uno', 2011, 2021, '1.0'],
  ['AMP-45D', 'Volkswagen', 'up!', 2015, 2021, '1.0'],
  ['AMP-50D', 'Chevrolet', 'Onix', 2013, 2019, '1.0 / 1.4'],
  ['AMP-50D', 'Hyundai', 'HB20', 2013, 2019, '1.0 / 1.6'],
  ['AMP-50D', 'Ford', 'Ka', 2015, 2021, '1.0 / 1.5'],
  ['CGV-50E', 'Chevrolet', 'Prisma', 2013, 2019, '1.0 / 1.4'],
  ['VTX-60D', 'Volkswagen', 'Gol', 2009, 2022, '1.0 / 1.6'],
  ['VTX-60D', 'Volkswagen', 'Voyage', 2009, 2022, '1.0 / 1.6'],
  ['VTX-60D', 'Renault', 'Sandero', 2012, 2022, '1.0 / 1.6'],
  ['VTX-60D', 'Honda', 'Fit', 2009, 2021, '1.4 / 1.5'],
  ['CGV-60D', 'Volkswagen', 'Gol', 2009, 2022, '1.0 / 1.6'],
  ['CGV-60D', 'Toyota', 'Etios', 2013, 2021, '1.3 / 1.5'],
  ['AMP-60EFB', 'Chevrolet', 'Onix', 2020, 2024, '1.0 Turbo'],
  ['AMP-60EFB', 'Fiat', 'Argo', 2018, 2024, '1.0 / 1.3'],
  ['VTX-70D', 'Toyota', 'Corolla', 2010, 2019, '1.8 / 2.0'],
  ['VTX-70D', 'Honda', 'Civic', 2012, 2016, '1.8 / 2.0'],
  ['VTX-70D', 'Hyundai', 'Creta', 2017, 2024, '1.6 / 2.0'],
  ['CGV-70D', 'Toyota', 'Corolla', 2010, 2019, '1.8 / 2.0'],
  ['AMP-70AGM', 'Jeep', 'Renegade', 2016, 2024, '1.3 Turbo / 1.8'],
  ['AMP-70AGM', 'Jeep', 'Compass', 2017, 2024, '1.3 Turbo / 2.0'],
  ['VTX-90D', 'Toyota', 'Hilux', 2006, 2015, '2.5 / 3.0 Diesel'],
  ['VTX-90D', 'Chevrolet', 'S10', 2012, 2024, '2.8 Diesel'],
  ['AMP-90D', 'Ford', 'Ranger', 2013, 2022, '2.2 / 3.2 Diesel'],
  ['AMP-90D', 'Mitsubishi', 'L200', 2008, 2019, '3.2 Diesel'],
  ['CGV-95D', 'Volkswagen', 'Amarok', 2011, 2022, '2.0 Diesel'],
];

const SUPPLIERS = [
  { name: 'Distribuidora Alfa de Baterias (fictícia)', contact_name: 'Comercial', phone: '(11) 90000-1001', email: 'comercial@alfa.exemplo', notes: 'Fornecedor fictício para demonstração.' },
  { name: 'Beta Autopeças Atacado (fictícia)', contact_name: 'Vendas', phone: '(11) 90000-1002', email: 'vendas@beta.exemplo', notes: 'Fornecedor fictício para demonstração.' },
  { name: 'Gama Energia Automotiva (fictícia)', contact_name: 'Pedidos', phone: '(11) 90000-1003', email: 'pedidos@gama.exemplo', notes: 'Fornecedor fictício para demonstração.' },
];

const CUSTOMERS = [
  ['Ana Souza', '(11) 90000-0001'],
  ['Bruno Lima', '(11) 90000-0002'],
  ['Carla Ribeiro', '(11) 90000-0003'],
  ['Diego Martins', '(11) 90000-0004'],
  ['Elaine Costa', '(11) 90000-0005'],
  ['Fábio Nunes', '(11) 90000-0006'],
  ['Gabriela Alves', '(11) 90000-0007'],
  ['Henrique Prado', '(11) 90000-0008'],
  ['Isabela Rocha', '(11) 90000-0009'],
  ['João Pereira', '(11) 90000-0010'],
];

const SERVICES = [
  ['Troca de bateria', 'Retiramos a bateria antiga e instalamos a nova com segurança.', 'Fazemos a substituição da bateria com conferência dos terminais, limpeza dos polos e teste do sistema após a instalação. A bateria usada é recolhida para descarte adequado.', 'img/services/troca.svg', 'Consulte condições'],
  ['Instalação', 'Instalação na loja na compra da bateria.', 'Instalação feita por profissional, com verificação de fixação, aperto dos terminais e preservação das memórias do veículo quando aplicável.', 'img/services/instalacao.svg', 'Consulte condições'],
  ['Teste de bateria e alternador', 'Diagnóstico do sistema de carga e partida.', 'Testamos a bateria, o alternador e a partida para identificar se o problema é mesmo a bateria — evitando trocas desnecessárias.', 'img/services/teste.svg', 'Consulte condições'],
  ['Atendimento e orientação', 'Ajuda para escolher a bateria certa para o seu veículo.', 'Informe marca, modelo e ano do veículo pelo WhatsApp ou na loja e indicamos as opções disponíveis, com preço e garantia.', 'img/services/atendimento.svg', 'Sem custo'],
];

const FAQS = [
  ['Como sei qual bateria serve no meu carro?', 'Use a consulta por veículo no catálogo (marca, modelo e ano). As aplicações cadastradas são uma referência; confirme sempre a compatibilidade com a loja pelo WhatsApp antes da compra.', 'compatibilidade, serve, meu carro, veículo, qual bateria'],
  ['Qual a garantia das baterias?', 'A garantia varia por produto e está informada na página de cada bateria. Guarde o comprovante do pedido.', 'garantia, prazo, defeito'],
  ['Vocês fazem a instalação?', 'Sim. A instalação pode ser feita na loja. Consulte as condições pelo WhatsApp.', 'instalar, instalação, colocar, trocar'],
  ['Posso retirar na loja?', 'Sim. No checkout escolha "Retirada na loja". Você recebe um código do pedido para apresentar no balcão.', 'retirar, retirada, buscar'],
  ['Vocês entregam?', 'Sim, dentro da área de atendimento. O frete é calculado no carrinho conforme a configuração da loja.', 'entrega, frete, entregar, delivery'],
  ['Quais formas de pagamento são aceitas no site?', 'Nesta demonstração: Pix demonstrativo, cartão simulado e pagamento na retirada. Nenhum valor é cobrado.', 'pagamento, pix, cartão, pagar'],
  ['O que fazer com a bateria usada?', 'A bateria usada deve ser entregue para descarte adequado. Na troca feita na loja, nós recolhemos a bateria antiga.', 'bateria velha, usada, descarte, sucata'],
  ['Como acompanho meu pedido?', 'Acesse "Consultar pedido" e informe o código do pedido e o telefone usado na compra.', 'acompanhar, status, consultar pedido, rastrear'],
  ['Meu carro não liga. É a bateria?', 'Pode ser bateria, alternador ou partida. Recomendamos o teste de bateria e sistema de carga antes da troca.', 'não liga, nao pega, fraca, descarregada, arranque'],
  ['O que significa Ah?', 'Ah (ampère-hora) indica a capacidade da bateria. Use a capacidade indicada para o seu veículo; uma bateria diferente da especificada pode não ser adequada.', 'ah, amperagem, capacidade, amper'],
];

const GALLERY = [
  ['Fachada da loja', 'Imagem ilustrativa da loja.', 'img/gallery/fachada.svg', 'loja'],
  ['Balcão de atendimento', 'Imagem ilustrativa do atendimento.', 'img/gallery/balcao.svg', 'loja'],
  ['Estoque organizado', 'Imagem ilustrativa do estoque.', 'img/gallery/estoque.svg', 'loja'],
  ['Teste de bateria', 'Imagem ilustrativa de serviço realizado.', 'img/gallery/teste.svg', 'servicos'],
  ['Troca de bateria', 'Imagem ilustrativa de serviço realizado.', 'img/gallery/troca.svg', 'servicos'],
  ['Instalação em pickup', 'Imagem ilustrativa de serviço realizado.', 'img/gallery/pickup.svg', 'servicos'],
];

const BANNERS = [
  ['Encontre a bateria ideal para seu carro', 'Consulte pelo veículo e compre online com retirada na loja ou entrega.', 'Ver catálogo', '#/catalogo', 'img/banners/banner1.svg'],
  ['Teste de bateria e alternador', 'Antes de trocar, faça o diagnóstico do sistema de carga.', 'Ver serviços', '#/servicos', 'img/banners/banner2.svg'],
  ['Ofertas da semana (demonstrativo)', 'Preços promocionais configuráveis no painel.', 'Ver ofertas', '#/catalogo?promo=1', 'img/banners/banner3.svg'],
];

const TABLES_IN_DELETE_ORDER = [
  'stock_movements', 'payments', 'order_events', 'order_items', 'orders', 'product_applications', 'product_images',
  'products', 'brands', 'categories', 'suppliers', 'customers', 'services', 'faqs', 'gallery_items', 'banners', 'settings',
];

/** Gerador pseudoaleatório determinístico (mesmos dados a cada restauração). */
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function ensureAdmin({ name, email, password }) {
  const d = get();
  if (!d.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase())) {
    d.prepare('INSERT INTO users (name, email, password_hash, role, active, created_at) VALUES (?,?,?,?,1,?)').run(
      name, email.toLowerCase(), auth.hashPassword(password), 'admin', new Date().toISOString()
    );
  }
}

function isEmpty() {
  return get().prepare('SELECT COUNT(*) c FROM products').get().c === 0 && get().prepare('SELECT COUNT(*) c FROM orders').get().c === 0;
}

function seedData() {
  const d = get();
  const base = Date.now();
  const at = (daysAgo, hour = 10, minute = 0) => {
    const dt = new Date(base - daysAgo * 86400000);
    dt.setHours(hour, minute, 0, 0);
    return dt;
  };
  const rnd = prng(20261004);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ADMIN = 'Administrador Demo';

  try {
    // ---------- cadastros básicos (há 45 dias) ----------
    setClock(() => at(45, 9));
    const ts = at(45, 9).toISOString();
    const brandId = {};
    for (const b of BRANDS) brandId[b.name] = d.prepare('INSERT INTO brands (name, description, created_at) VALUES (?,?,?)').run(b.name, b.description, ts).lastInsertRowid;
    const catId = {};
    for (const c of CATEGORIES) catId[c.name] = d.prepare('INSERT INTO categories (name, description, sort, created_at) VALUES (?,?,?,?)').run(c.name, c.description, c.sort, ts).lastInsertRowid;
    const supplierIds = SUPPLIERS.map((s) =>
      d.prepare('INSERT INTO suppliers (name, contact_name, phone, email, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').run(s.name, s.contact_name, s.phone, s.email, s.notes, ts, ts).lastInsertRowid
    );
    for (const [name, phone] of CUSTOMERS) {
      d.prepare('INSERT INTO customers (name, phone, phone_digits, notes, created_at, updated_at) VALUES (?,?,?,?,?,?)').run(name, phone, phone.replace(/\D/g, ''), 'Cliente fictício (demonstração).', ts, ts);
    }

    const productId = {};
    for (const p of PRODUCTS) {
      const [sku, name, brand, cat, ah, cca, dim, pol, tech, warranty, price, promo, cost, , min, featured, active] = p;
      const desc =
        `${name} — ${tech}, ${ah}Ah, 12V. Produto e preço DEMONSTRATIVOS (marca fictícia) para apresentação do sistema.\n\n` +
        'Antes de comprar, confirme com a loja se esta bateria é adequada ao seu veículo.';
      productId[sku] = d
        .prepare(`INSERT INTO products (sku, name, brand_id, category_id, description, image, capacity_ah, voltage, cca, dimensions, polarity, technology,
          warranty_months, price_cents, promo_price_cents, cost_cents, stock_qty, reserved_qty, min_stock, active, featured, is_demo, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,12,?,?,?,?,?,?,?,?,0,0,?,?,?,1,?,?)`)
        .run(sku, name, brandId[brand], catId[cat], desc, `img/products/${sku.toLowerCase()}.svg`, ah, cca, `${dim} (aprox., demonstrativo)`, pol, tech, warranty, price, promo, cost, min, active, featured, ts, ts).lastInsertRowid;
    }
    for (const [sku, make, model, y1, y2, engine] of APPLICATIONS) {
      d.prepare('INSERT INTO product_applications (product_id, make, model, year_start, year_end, engine, notes, is_demo, created_at) VALUES (?,?,?,?,?,?,?,1,?)').run(productId[sku], make, model, y1, y2, engine, DEMO_NOTE, ts);
    }
    SERVICES.forEach(([title, summary, description, image, price], i) =>
      d.prepare('INSERT INTO services (title, summary, description, image, price_info, active, sort, created_at) VALUES (?,?,?,?,?,1,?,?)').run(title, summary, description, image, price, i + 1, ts)
    );
    FAQS.forEach(([q, a, k], i) => d.prepare('INSERT INTO faqs (question, answer, keywords, active, sort, created_at) VALUES (?,?,?,1,?,?)').run(q, a, k, i + 1, ts));
    GALLERY.forEach(([t, desc, img, cat], i) =>
      d.prepare('INSERT INTO gallery_items (title, description, image, category, active, sort, created_at) VALUES (?,?,?,?,1,?,?)').run(t, desc, img, cat, i + 1, ts)
    );
    BANNERS.forEach(([t, s, l, link, img], i) =>
      d.prepare('INSERT INTO banners (title, subtitle, cta_label, cta_link, image, active, sort, created_at) VALUES (?,?,?,?,?,1,?,?)').run(t, s, l, link, img, i + 1, ts)
    );

    // ---------- estoque inicial (entradas de fornecedores) ----------
    setClock(() => at(40, 9, 30));
    PRODUCTS.forEach((p, i) => {
      const qty = p[13];
      if (qty > 0) {
        inventory.applyMovement({ productId: productId[p[0]], type: 'entrada', quantity: qty, reason: 'Estoque inicial (demonstrativo) — NF fictícia', user: ADMIN, supplierId: supplierIds[i % 3], unitCostCents: p[12] });
      }
    });

    // ---------- histórico de pedidos (últimos 30 dias) ----------
    const commonSkus = ['VTX-45D', 'AMP-45D', 'AMP-50D', 'VTX-60D', 'VTX-60D', 'AMP-60EFB', 'VTX-70D', 'VTX-90D', 'AMP-90D', 'CGV-95D', 'CGV-50E', 'AMP-70AGM'];
    const customersList = d.prepare('SELECT id, name, phone FROM customers').all();
    let created = 0;
    const makeOrder = (daysAgo, hour, { skus, source = rnd() < 0.6 ? 'site' : 'balcao', outcome }) => {
      const t0 = at(daysAgo, hour, Math.floor(rnd() * 59));
      setClock(() => t0);
      const c = pick(customersList);
      const fulfillment = source === 'site' && rnd() < 0.35 ? 'entrega' : 'retirada';
      const paymentMethod = source === 'site' ? (fulfillment === 'entrega' ? pick(['pix', 'cartao']) : pick(['pix', 'cartao', 'retirada'])) : pick(['dinheiro', 'pix_balcao', 'cartao_balcao']);
      const input = {
        name: c.name,
        phone: c.phone,
        fulfillment,
        paymentMethod,
        items: skus.map((s) => ({ productId: productId[s], quantity: 1 })),
        address: fulfillment === 'entrega' ? { street: 'Rua Exemplo (fictícia)', number: String(100 + Math.floor(rnd() * 800)), district: 'Bairro Demonstração', city: 'São Paulo', zip: '00000-000' } : undefined,
      };
      let o;
      try {
        o = orders.createOrder(input, { source, user: source === 'site' ? 'Site' : ADMIN, customerId: c.id });
      } catch (e) {
        if (e.status === 409) return null; // sem estoque para este item: ignora na carga demonstrativa
        throw e;
      }
      created++;
      const later = (h) => setClock(() => new Date(Math.min(Date.parse(o.created_at) + h * 3600000, base - 60000)));
      if (outcome === 'concluido') {
        later(0.3);
        orders.setPaymentStatus(o.id, 'aprovado', { user: source === 'site' && paymentMethod !== 'retirada' ? 'Cliente (simulação)' : ADMIN, simulated: source === 'site' && paymentMethod !== 'retirada', note: 'Pagamento demonstrativo' });
        later(2);
        if (rnd() < 0.5) orders.changeStatus(o.id, 'em_preparacao', { user: ADMIN });
        later(4);
        orders.changeStatus(o.id, 'concluido', { user: ADMIN });
      } else if (outcome === 'cancelado') {
        later(3);
        orders.changeStatus(o.id, 'cancelado', { user: ADMIN, reason: 'Cliente desistiu (demonstrativo)' });
      } else if (outcome === 'recusado') {
        later(0.2);
        orders.setPaymentStatus(o.id, 'recusado', { user: 'Cliente (simulação)', simulated: true, note: 'Cartão simulado' });
        later(1);
        orders.changeStatus(o.id, 'cancelado', { user: ADMIN, reason: 'Pagamento recusado (demonstrativo)' });
      } else if (outcome === 'confirmado') {
        later(0.2);
        orders.setPaymentStatus(o.id, 'aprovado', { user: 'Cliente (simulação)', simulated: true, note: 'Pix demonstrativo' });
      } else if (outcome === 'em_preparacao') {
        later(0.2);
        orders.setPaymentStatus(o.id, 'aprovado', { user: 'Cliente (simulação)', simulated: true, note: 'Pix demonstrativo' });
        later(1);
        orders.changeStatus(o.id, 'em_preparacao', { user: ADMIN });
      }
      return o;
    };

    for (let day = 30; day >= 1; day--) {
      const n = day % 3 === 0 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const r = rnd();
        const outcome = r < 0.78 ? 'concluido' : r < 0.9 ? 'cancelado' : 'recusado';
        const skus = [pick(commonSkus)];
        if (rnd() < 0.15) skus.push(pick(commonSkus.filter((s) => s !== skus[0])));
        makeOrder(day, 9 + Math.floor(rnd() * 8), { skus, outcome });
      }
      if (day === 20) {
        setClock(() => at(20, 8, 40));
        inventory.applyMovement({ productId: productId['VTX-60D'], type: 'entrada', quantity: 8, reason: 'Reposição — NF fictícia 1023', user: ADMIN, supplierId: supplierIds[0], unitCostCents: 32000 });
        inventory.applyMovement({ productId: productId['AMP-50D'], type: 'entrada', quantity: 6, reason: 'Reposição — NF fictícia 1024', user: ADMIN, supplierId: supplierIds[1], unitCostCents: 30500 });
      }
      if (day === 12) {
        setClock(() => at(12, 18, 10));
        const p = inventory.loadProduct(productId['CGV-60D']);
        inventory.registerManual({ productId: p.id, type: 'ajuste', newQty: p.stock_qty - 1, reason: 'Ajuste de inventário — avaria constatada na contagem (demonstrativo)', user: ADMIN });
      }
      if (day === 8) {
        setClock(() => at(8, 11, 0));
        inventory.applyMovement({ productId: productId['VTX-45D'], type: 'saida', quantity: 1, reason: 'Saída para garantia/troca com fornecedor (demonstrativo)', user: ADMIN });
      }
    }
    // a 70Ah Cargavolt esgota com duas vendas
    makeOrder(6, 15, { skus: ['CGV-70D'], source: 'balcao', outcome: 'concluido' });
    makeOrder(3, 10, { skus: ['CGV-70D'], source: 'site', outcome: 'concluido' });
    // estoque baixo na Cargavolt 60Ah
    makeOrder(4, 14, { skus: ['CGV-60D', 'CGV-60D'], source: 'balcao', outcome: 'concluido' });
    makeOrder(2, 16, { skus: ['CGV-60D'], source: 'balcao', outcome: 'concluido' });
    // pedido antigo sem pagamento -> expira e libera a reserva automaticamente
    makeOrder(5, 10, { skus: ['AMP-45D'], source: 'site', outcome: 'pendente' });
    setClock(() => at(2, 10, 30));
    orders.expireOrders(at(2, 10, 30));

    // pedidos em aberto (hoje e ontem) — mantêm reservas visíveis no estoque
    makeOrder(1, 17, { skus: ['VTX-70D'], source: 'site', outcome: 'em_preparacao' });
    makeOrder(0, Math.max(new Date().getHours() - 3, 0), { skus: ['AMP-60EFB'], source: 'site', outcome: 'confirmado' });
    makeOrder(0, Math.max(new Date().getHours() - 2, 0), { skus: ['VTX-60D', 'VTX-90D'], source: 'site', outcome: 'pendente' });
    makeOrder(0, Math.max(new Date().getHours() - 1, 0), { skus: ['AMP-50D'], source: 'balcao', outcome: 'concluido' });
    return { orders: created };
  } finally {
    setClock(null);
  }
}

function seedIfEmpty(admin) {
  ensureAdmin(admin);
  if (!isEmpty()) return false;
  tx(() => seedData());
  return true;
}

/** Restaura os dados iniciais. Usuários e sessões são preservados. */
function resetDemo(admin) {
  return tx(() => {
    const d = get();
    for (const t of TABLES_IN_DELETE_ORDER) d.exec(`DELETE FROM ${t}`);
    d.exec(`DELETE FROM sqlite_sequence WHERE name IN (${TABLES_IN_DELETE_ORDER.map((t) => `'${t}'`).join(',')})`);
    ensureAdmin(admin);
    return seedData();
  });
}

module.exports = { seedIfEmpty, resetDemo, ensureAdmin, PRODUCTS, APPLICATIONS, SERVICES, GALLERY, BANNERS };
