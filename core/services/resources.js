'use strict';
/** CRUD genérico para cadastros simples (marcas, categorias, fornecedores, clientes e conteúdo do site). */
const { get, now } = require('../db');
const { AppError, notFound } = require('../lib/errors');
const { validate } = require('../lib/validation');
const { digits } = require('../lib/format');

const img = { type: 'string', label: 'Imagem', max: 1500000 };

const RESOURCES = {
  brands: {
    table: 'brands',
    label: 'Marca',
    order: 'name',
    search: ['name'],
    schema: { name: { type: 'string', label: 'Nome', required: true, max: 60 }, description: { type: 'text', label: 'Descrição', max: 500 } },
    beforeDelete: (id) => {
      const n = get().prepare('SELECT COUNT(*) c FROM products WHERE brand_id = ?').get(id).c;
      if (n) throw new AppError(409, `Marca usada por ${n} produto(s). Altere os produtos antes de excluir.`);
    },
    extra: (r) => ({ ...r, product_count: get().prepare('SELECT COUNT(*) c FROM products WHERE brand_id = ?').get(r.id).c }),
  },
  categories: {
    table: 'categories',
    label: 'Categoria',
    order: 'sort, name',
    search: ['name'],
    schema: {
      name: { type: 'string', label: 'Nome', required: true, max: 60 },
      description: { type: 'text', label: 'Descrição', max: 500 },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
    beforeDelete: (id) => {
      const n = get().prepare('SELECT COUNT(*) c FROM products WHERE category_id = ?').get(id).c;
      if (n) throw new AppError(409, `Categoria usada por ${n} produto(s). Altere os produtos antes de excluir.`);
    },
    extra: (r) => ({ ...r, product_count: get().prepare('SELECT COUNT(*) c FROM products WHERE category_id = ?').get(r.id).c }),
  },
  suppliers: {
    table: 'suppliers',
    label: 'Fornecedor',
    order: 'name',
    search: ['name', 'contact_name', 'email', 'document'],
    timestamps: true,
    schema: {
      name: { type: 'string', label: 'Razão social / nome', required: true, max: 120 },
      document: { type: 'string', label: 'CNPJ/CPF', max: 20 },
      contact_name: { type: 'string', label: 'Contato', max: 80 },
      phone: { type: 'string', label: 'Telefone', max: 20 },
      email: { type: 'email', label: 'E-mail' },
      notes: { type: 'text', label: 'Observações', max: 1000 },
    },
    beforeDelete: (id) => {
      const n = get().prepare('SELECT COUNT(*) c FROM stock_movements WHERE supplier_id = ?').get(id).c;
      if (n) throw new AppError(409, `Fornecedor possui ${n} entrada(s) de estoque registradas e não pode ser excluído.`);
    },
  },
  customers: {
    table: 'customers',
    label: 'Cliente',
    order: 'name',
    search: ['name', 'email', 'phone_digits', 'document'],
    timestamps: true,
    schema: {
      name: { type: 'string', label: 'Nome', required: true, min: 3, max: 120 },
      phone: { type: 'phone', label: 'Telefone', required: true },
      email: { type: 'email', label: 'E-mail' },
      document: { type: 'string', label: 'CPF/CNPJ', max: 20 },
      address: { type: 'string', label: 'Endereço', max: 250 },
      notes: { type: 'text', label: 'Observações', max: 1000 },
    },
    transform: (d) => (d.phone !== undefined ? { ...d, phone_digits: digits(d.phone) } : d),
    beforeDelete: (id) => {
      const n = get().prepare('SELECT COUNT(*) c FROM orders WHERE customer_id = ?').get(id).c;
      if (n) throw new AppError(409, `Cliente possui ${n} pedido(s) e não pode ser excluído.`);
    },
    extra: (r) => ({
      ...r,
      ...get().prepare(`SELECT COUNT(*) AS order_count, COALESCE(SUM(CASE WHEN status='concluido' THEN total_cents ELSE 0 END),0) AS total_spent_cents FROM orders WHERE customer_id = ?`).get(r.id),
    }),
  },
  stores: {
    table: 'stores',
    label: 'Loja',
    order: 'sort, id',
    search: ['name', 'neighborhood', 'city'],
    public: true,
    publicOmit: ['notes'],
    schema: {
      name: { type: 'string', label: 'Nome da unidade', required: true, max: 100 },
      neighborhood: { type: 'string', label: 'Bairro/região', max: 80 },
      city: { type: 'string', label: 'Cidade', max: 80 },
      address: { type: 'text', label: 'Endereço', max: 300 },
      phone: { type: 'string', label: 'Telefone', max: 30 },
      whatsapp: { type: 'string', label: 'WhatsApp (55 + DDD + número)', max: 13, pattern: /^(\d{12,13})?$/, patternMessage: 'Use 55 + DDD + número, só dígitos (ou deixe vazio).' },
      hours: { type: 'text', label: 'Horários', max: 500 },
      maps_url: { type: 'url', label: 'Link do Google Maps', max: 500 },
      image: img,
      rating: { type: 'string', label: 'Nota (ex.: 4,9)', max: 4, pattern: /^([0-5]([,.]\d)?)?$/, patternMessage: 'Use uma nota de 0 a 5, ex.: 4,9.' },
      rating_count: { type: 'int', label: 'Nº de avaliações', min: 0, max: 1000000 },
      rating_source: { type: 'string', label: 'Fonte da nota', max: 120 },
      review_quote: { type: 'string', label: 'Trecho de avaliação', max: 300 },
      notes: { type: 'string', label: 'Observações', max: 300 },
      pickup_enabled: { type: 'bool', label: 'Aceita retirada de pedidos', default: true },
      active: { type: 'bool', label: 'Ativa', default: true },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
    beforeDelete: (id) => {
      const n = get().prepare('SELECT COUNT(*) c FROM orders WHERE pickup_store_id = ?').get(id).c;
      if (n) throw new AppError(409, `Loja usada em ${n} pedido(s). Desative-a em vez de excluir.`);
    },
  },
  services: {
    table: 'services',
    label: 'Serviço',
    order: 'sort, id',
    search: ['title'],
    public: true,
    schema: {
      title: { type: 'string', label: 'Título', required: true, max: 80 },
      summary: { type: 'string', label: 'Resumo', max: 200 },
      description: { type: 'text', label: 'Descrição', max: 3000 },
      image: img,
      price_info: { type: 'string', label: 'Informação de preço', max: 120 },
      active: { type: 'bool', label: 'Ativo', default: true },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
  },
  faqs: {
    table: 'faqs',
    label: 'Pergunta',
    order: 'sort, id',
    search: ['question', 'answer'],
    public: true,
    schema: {
      question: { type: 'string', label: 'Pergunta', required: true, max: 200 },
      answer: { type: 'text', label: 'Resposta', required: true, max: 3000 },
      keywords: { type: 'string', label: 'Palavras-chave (chatbot)', max: 300 },
      active: { type: 'bool', label: 'Ativa', default: true },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
  },
  gallery: {
    table: 'gallery_items',
    label: 'Item da galeria',
    order: 'sort, id',
    search: ['title'],
    public: true,
    schema: {
      title: { type: 'string', label: 'Título', required: true, max: 100 },
      description: { type: 'string', label: 'Descrição', max: 300 },
      image: { ...img, required: true },
      category: { type: 'enum', label: 'Categoria', values: ['loja', 'servicos'], default: 'loja' },
      active: { type: 'bool', label: 'Ativo', default: true },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
  },
  banners: {
    table: 'banners',
    label: 'Banner',
    order: 'sort, id',
    search: ['title'],
    public: true,
    schema: {
      title: { type: 'string', label: 'Título', required: true, max: 100 },
      subtitle: { type: 'string', label: 'Subtítulo', max: 250 },
      cta_label: { type: 'string', label: 'Texto do botão', max: 40 },
      cta_link: { type: 'url', label: 'Link do botão', max: 300 },
      image: img,
      active: { type: 'bool', label: 'Ativo', default: true },
      sort: { type: 'int', label: 'Ordem', min: 0, max: 999, default: 0 },
    },
  },
};

function def(name) {
  const r = RESOURCES[name];
  if (!r) throw notFound('Recurso');
  return r;
}

function list(name, { q, publicOnly = false } = {}) {
  const r = def(name);
  const where = [];
  const args = [];
  if (publicOnly && r.schema.active) where.push('active = 1');
  if (q && r.search) {
    where.push(`(${r.search.map((c) => `LOWER(${c}) LIKE ?`).join(' OR ')})`);
    for (let i = 0; i < r.search.length; i++) args.push(`%${String(q).toLowerCase()}%`);
  }
  const rows = get().prepare(`SELECT * FROM ${r.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${r.order}`).all(...args);
  if (publicOnly && r.publicOmit) for (const row of rows) for (const k of r.publicOmit) delete row[k];
  return r.extra && !publicOnly ? rows.map(r.extra) : rows;
}

function getOne(name, id) {
  const r = def(name);
  const row = get().prepare(`SELECT * FROM ${r.table} WHERE id = ?`).get(Number(id));
  if (!row) throw notFound(r.label);
  return r.extra ? r.extra(row) : row;
}

function uniqueCheck(r, data, id = 0) {
  if (['brands', 'categories'].includes(r.table) && data.name) {
    if (get().prepare(`SELECT 1 FROM ${r.table} WHERE LOWER(name) = LOWER(?) AND id <> ?`).get(data.name, id)) {
      throw new AppError(409, `${r.label} já cadastrada.`, { fields: { name: 'Nome já existe.' } });
    }
  }
}

function create(name, input) {
  const r = def(name);
  let data = validate(r.schema, input);
  if (r.transform) data = r.transform(data);
  uniqueCheck(r, data);
  const ts = now();
  const cols = Object.keys(data);
  const allCols = [...cols, 'created_at', ...(r.timestamps ? ['updated_at'] : [])];
  const vals = [...cols.map((c) => data[c]), ts, ...(r.timestamps ? [ts] : [])];
  const res = get().prepare(`INSERT INTO ${r.table} (${allCols.join(', ')}) VALUES (${allCols.map(() => '?').join(', ')})`).run(...vals);
  return getOne(name, res.lastInsertRowid);
}

function update(name, id, input) {
  const r = def(name);
  const current = getOne(name, id);
  let data = validate(r.schema, input, { partial: true });
  if (r.transform) data = r.transform(data);
  uniqueCheck(r, data, current.id);
  const cols = Object.keys(data);
  if (!cols.length) return current;
  const sets = cols.map((c) => `${c} = ?`);
  const vals = cols.map((c) => data[c]);
  if (r.timestamps) (sets.push('updated_at = ?'), vals.push(now()));
  get().prepare(`UPDATE ${r.table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, current.id);
  return getOne(name, current.id);
}

function remove(name, id) {
  const r = def(name);
  const current = getOne(name, id);
  if (r.beforeDelete) r.beforeDelete(current.id);
  get().prepare(`DELETE FROM ${r.table} WHERE id = ?`).run(current.id);
  return { deleted: true };
}

module.exports = { RESOURCES, list, getOne, create, update, remove };
