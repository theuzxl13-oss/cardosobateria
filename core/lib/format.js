'use strict';
const brl = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const digits = (s) => String(s || '').replace(/\D/g, '');

function formatPhone(s) {
  const d = digits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s;
}

const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const dateOnly = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

/** Converte 'YYYY-MM-DD' (dia local da loja) em intervalo ISO UTC [início, fim). */
function dayRange(from, to) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const start = from && re.test(from) ? new Date(`${from}T00:00:00`) : null;
  let end = null;
  if (to && re.test(to)) {
    end = new Date(`${to}T00:00:00`);
    end.setDate(end.getDate() + 1);
  }
  return { start: start ? start.toISOString() : null, end: end ? end.toISOString() : null };
}

const localDayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STATUS_LABELS = {
  aguardando_pagamento: 'Aguardando pagamento',
  confirmado: 'Confirmado',
  em_preparacao: 'Em preparação',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};
const PAYMENT_STATUS_LABELS = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', estornado: 'Estornado' };
const PAYMENT_METHOD_LABELS = {
  pix: 'Pix (demonstrativo)',
  cartao: 'Cartão (simulado)',
  retirada: 'Pagamento na retirada',
  dinheiro: 'Dinheiro (balcão)',
  cartao_balcao: 'Cartão (balcão)',
  pix_balcao: 'Pix (balcão)',
};
const MOVEMENT_LABELS = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
  reserva: 'Reserva',
  liberacao: 'Liberação de reserva',
  baixa_venda: 'Baixa por venda',
  devolucao: 'Devolução',
};

module.exports = {
  brl, digits, formatPhone, dateTime, dateOnly, dayRange, localDayKey,
  STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, MOVEMENT_LABELS,
};
