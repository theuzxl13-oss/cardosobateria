'use strict';
const { get, now } = require('../db');
const { digits } = require('../lib/format');

/** Localiza cliente pelo telefone ou cria um novo. Retorna o id. */
function upsertByPhone({ name, phone, email = '', address = '' }) {
  const d = digits(phone);
  const ts = now();
  const existing = d ? get().prepare('SELECT * FROM customers WHERE phone_digits = ? ORDER BY id LIMIT 1').get(d) : null;
  if (existing) {
    get()
      .prepare(`UPDATE customers SET name = ?, email = CASE WHEN ? <> '' THEN ? ELSE email END,
        address = CASE WHEN ? <> '' THEN ? ELSE address END, updated_at = ? WHERE id = ?`)
      .run(name, email, email, address, address, ts, existing.id);
    return existing.id;
  }
  return get()
    .prepare('INSERT INTO customers (name, phone, phone_digits, email, address, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(name, phone, d, email, address, ts, ts).lastInsertRowid;
}

module.exports = { upsertByPhone };
