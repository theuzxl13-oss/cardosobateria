'use strict';
const { AppError } = require('./errors');

/**
 * Validador simples baseado em esquema.
 * Tipos: string, text, int, money (centavos), bool, enum, email, phone, url, date
 */
function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
  let s = String(v).trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s) * 100);
}

function validate(schema, input, { partial = false } = {}) {
  const data = input && typeof input === 'object' ? input : {};
  const out = {};
  const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    let v = data[key];
    const label = rule.label || key;
    const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    if (empty) {
      if (partial && v === undefined) continue;
      if (rule.required) {
        errors[key] = `${label} é obrigatório.`;
        continue;
      }
      if (rule.type === 'bool') out[key] = rule.default ?? false;
      else if (rule.default !== undefined) out[key] = rule.default;
      else out[key] = ['string', 'text', 'email', 'phone', 'url', 'enum'].includes(rule.type) ? '' : null;
      if (rule.type === 'enum' && out[key] === '' && rule.default === undefined) out[key] = null;
      continue;
    }
    switch (rule.type) {
      case 'string':
      case 'text':
      case 'url': {
        v = String(v).trim();
        const max = rule.max ?? (rule.type === 'text' ? 5000 : 200);
        if (rule.min && v.length < rule.min) errors[key] = `${label} deve ter ao menos ${rule.min} caracteres.`;
        else if (v.length > max) errors[key] = `${label} deve ter no máximo ${max} caracteres.`;
        else if (rule.pattern && !rule.pattern.test(v)) errors[key] = rule.patternMessage || `${label} inválido.`;
        else if (rule.type === 'url' && !/^(https?:\/\/|\/|#)/i.test(v)) errors[key] = `${label} deve começar com http(s)://, / ou #.`;
        out[key] = v;
        break;
      }
      case 'email':
        v = String(v).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 160) errors[key] = `${label} inválido.`;
        out[key] = v;
        break;
      case 'phone': {
        const d = String(v).replace(/\D/g, '');
        if (d.length < 10 || d.length > 13) errors[key] = `${label} deve ter DDD e número (10 ou 11 dígitos).`;
        out[key] = String(v).trim();
        break;
      }
      case 'int': {
        const n = typeof v === 'number' ? v : Number(String(v).trim());
        if (!Number.isInteger(n)) errors[key] = `${label} deve ser um número inteiro.`;
        else if (rule.min !== undefined && n < rule.min) errors[key] = `${label} deve ser no mínimo ${rule.min}.`;
        else if (rule.max !== undefined && n > rule.max) errors[key] = `${label} deve ser no máximo ${rule.max}.`;
        out[key] = n;
        break;
      }
      case 'money': {
        const c = parseMoney(v);
        if (c === null || Number.isNaN(c)) errors[key] = `${label} deve ser um valor em reais (ex.: 389,90).`;
        else if (c < 0) errors[key] = `${label} não pode ser negativo.`;
        else if (rule.max !== undefined && c > rule.max) errors[key] = `${label} acima do limite.`;
        out[key] = c;
        break;
      }
      case 'bool':
        out[key] = v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
        break;
      case 'enum':
        if (!rule.values.includes(v)) errors[key] = `${label} inválido.`;
        out[key] = v;
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) errors[key] = `${label} deve estar no formato AAAA-MM-DD.`;
        out[key] = String(v);
        break;
      default:
        out[key] = v;
    }
  }
  if (Object.keys(errors).length) {
    throw new AppError(422, 'Verifique os campos destacados.', { fields: errors });
  }
  return out;
}

module.exports = { validate, parseMoney };
