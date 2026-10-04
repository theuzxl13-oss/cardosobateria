'use strict';
// Migrações versionadas. Cada item roda uma única vez (tabela schema_migrations).
module.exports = [
  {
    name: '001_init',
    sql: `
-- Cardoso Baterias — esquema inicial
-- SQL mantido próximo do padrão ANSI para facilitar migração futura a PostgreSQL:
--   * valores monetários em centavos (INTEGER)
--   * datas em texto ISO-8601 (UTC)
--   * INTEGER PRIMARY KEY AUTOINCREMENT  ->  BIGSERIAL / GENERATED ALWAYS AS IDENTITY no PostgreSQL

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin',
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE brands (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE products (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sku               TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  brand_id          INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  description       TEXT NOT NULL DEFAULT '',
  image             TEXT,
  capacity_ah       INTEGER NOT NULL CHECK (capacity_ah > 0),
  voltage           INTEGER NOT NULL DEFAULT 12,
  cca               INTEGER,
  dimensions        TEXT,
  polarity          TEXT,
  technology        TEXT,
  warranty_months   INTEGER NOT NULL CHECK (warranty_months >= 0),
  price_cents       INTEGER NOT NULL CHECK (price_cents >= 0),
  promo_price_cents INTEGER CHECK (promo_price_cents IS NULL OR promo_price_cents >= 0),
  cost_cents        INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock_qty         INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  reserved_qty      INTEGER NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
  min_stock         INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  active            INTEGER NOT NULL DEFAULT 1,
  featured          INTEGER NOT NULL DEFAULT 0,
  is_demo           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  CHECK (reserved_qty <= stock_qty)
);
CREATE INDEX ix_products_brand ON products(brand_id);
CREATE INDEX ix_products_capacity ON products(capacity_ah);

CREATE TABLE product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE product_applications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  make       TEXT NOT NULL,
  model      TEXT NOT NULL,
  year_start INTEGER NOT NULL,
  year_end   INTEGER NOT NULL,
  engine     TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  is_demo    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  CHECK (year_end >= year_start)
);
CREATE INDEX ix_app_vehicle ON product_applications(make, model);

CREATE TABLE suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  document     TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  phone_digits TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  document     TEXT NOT NULL DEFAULT '',
  address      TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX ix_customers_phone ON customers(phone_digits);

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT NOT NULL UNIQUE,
  access_token       TEXT NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('site','balcao')),
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name      TEXT NOT NULL,
  customer_phone     TEXT NOT NULL,
  customer_phone_digits TEXT NOT NULL,
  customer_email     TEXT NOT NULL DEFAULT '',
  vehicle_info       TEXT NOT NULL DEFAULT '',
  fulfillment        TEXT NOT NULL CHECK (fulfillment IN ('retirada','entrega')),
  address_street     TEXT NOT NULL DEFAULT '',
  address_number     TEXT NOT NULL DEFAULT '',
  address_complement TEXT NOT NULL DEFAULT '',
  address_district   TEXT NOT NULL DEFAULT '',
  address_city       TEXT NOT NULL DEFAULT '',
  address_zip        TEXT NOT NULL DEFAULT '',
  address_reference  TEXT NOT NULL DEFAULT '',
  subtotal_cents     INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents     INTEGER NOT NULL DEFAULT 0 CHECK (shipping_cents >= 0),
  discount_cents     INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents        INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_method     TEXT NOT NULL CHECK (payment_method IN ('pix','cartao','retirada','dinheiro','cartao_balcao','pix_balcao')),
  payment_status     TEXT NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pendente','aprovado','recusado','estornado')),
  status             TEXT NOT NULL DEFAULT 'aguardando_pagamento'
                     CHECK (status IN ('aguardando_pagamento','confirmado','em_preparacao','concluido','cancelado')),
  stock_state        TEXT NOT NULL DEFAULT 'reservado' CHECK (stock_state IN ('reservado','baixado','liberado','devolvido')),
  notes              TEXT NOT NULL DEFAULT '',
  cancel_reason      TEXT NOT NULL DEFAULT '',
  expires_at         TEXT,
  paid_at            TEXT,
  completed_at       TEXT,
  canceled_at        TEXT,
  created_by         TEXT NOT NULL,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX ix_orders_status ON orders(status);
CREATE INDEX ix_orders_created ON orders(created_at);
CREATE INDEX ix_orders_completed ON orders(completed_at);

-- Itens guardam um "retrato" do produto no momento da compra
CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku              TEXT NOT NULL,
  name             TEXT NOT NULL,
  brand            TEXT NOT NULL DEFAULT '',
  capacity_ah      INTEGER,
  warranty_months  INTEGER,
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  unit_cost_cents  INTEGER NOT NULL DEFAULT 0,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  total_cents      INTEGER NOT NULL CHECK (total_cents >= 0)
);
CREATE INDEX ix_items_order ON order_items(order_id);
CREATE INDEX ix_items_product ON order_items(product_id);

CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  user_name   TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX ix_events_order ON order_events(order_id);

CREATE TABLE payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method       TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('pendente','aprovado','recusado','estornado')),
  simulated    INTEGER NOT NULL DEFAULT 1,
  note         TEXT NOT NULL DEFAULT '',
  user_name    TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX ix_payments_order ON payments(order_id);
CREATE INDEX ix_payments_created ON payments(created_at);

-- Toda alteração de estoque gera uma linha aqui.
-- stock_delta altera o estoque físico; reserved_delta altera a quantidade reservada.
CREATE TABLE stock_movements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_sku     TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('entrada','saida','ajuste','reserva','liberacao','baixa_venda','devolucao')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  stock_delta     INTEGER NOT NULL,
  reserved_delta  INTEGER NOT NULL,
  stock_after     INTEGER NOT NULL CHECK (stock_after >= 0),
  reserved_after  INTEGER NOT NULL CHECK (reserved_after >= 0),
  unit_cost_cents INTEGER,
  reason          TEXT NOT NULL,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  user_name       TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX ix_mov_product ON stock_movements(product_id);
CREATE INDEX ix_mov_created ON stock_movements(created_at);
-- Impede reserva/baixa/liberação/devolução duplicada para o mesmo item de pedido
CREATE UNIQUE INDEX ux_mov_order_product_type ON stock_movements(order_id, product_id, type) WHERE order_id IS NOT NULL;

CREATE TABLE services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  image       TEXT,
  price_info  TEXT NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  keywords   TEXT NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE gallery_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'loja',
  active      INTEGER NOT NULL DEFAULT 1,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  subtitle   TEXT NOT NULL DEFAULT '',
  cta_label  TEXT NOT NULL DEFAULT '',
  cta_link   TEXT NOT NULL DEFAULT '',
  image      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`,
  },
];
