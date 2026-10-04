'use strict';
const bcrypt = require('bcryptjs');
const { get, now } = require('../db');
const { AppError } = require('../lib/errors');
const { randomHex } = require('../lib/random');
const { sha256 } = require('../lib/sha256');

const SESSION_HOURS = 12;
const failures = new Map(); // limitação simples de tentativas por e-mail

function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function login(email, password) {
  const key = String(email || '').trim().toLowerCase();
  if (!key || !password) throw new AppError(422, 'Informe e-mail e senha.');
  const f = failures.get(key);
  if (f && f.count >= 5 && Date.now() - f.last < 5 * 60 * 1000) {
    throw new AppError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
  const u = get().prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(key);
  if (!u || !bcrypt.compareSync(String(password), u.password_hash)) {
    failures.set(key, { count: (f && Date.now() - f.last < 5 * 60 * 1000 ? f.count : 0) + 1, last: Date.now() });
    throw new AppError(401, 'E-mail ou senha incorretos.');
  }
  failures.delete(key);
  const token = randomHex(32);
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  get().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  get().prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(sha256(token), u.id, expires, now());
  return { token, expires_at: expires, user: { id: u.id, name: u.name, email: u.email, role: u.role } };
}

function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const row = get()
    .prepare('SELECT u.id, u.name, u.email, u.role, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1')
    .get(sha256(token));
  if (!row || row.expires_at < now()) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

function logout(token) {
  if (token) get().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  return { ok: true };
}

function changePassword(userId, current, next) {
  const u = get().prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u || !bcrypt.compareSync(String(current || ''), u.password_hash)) throw new AppError(422, 'Senha atual incorreta.', { fields: { current: 'Senha atual incorreta.' } });
  if (!next || String(next).length < 8) throw new AppError(422, 'A nova senha deve ter ao menos 8 caracteres.', { fields: { next: 'Mínimo de 8 caracteres.' } });
  get().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(String(next)), u.id);
  return { ok: true };
}

module.exports = { login, logout, userFromToken, hashPassword, changePassword };
