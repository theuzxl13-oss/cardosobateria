'use strict';
const { brl } = require('./format');

function waLink(number, message) {
  const n = String(number || '').replace(/\D/g, '');
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

function orderMessage(order, items) {
  const lines = [
    'Olá! Vim pelo site da Cardoso Baterias.',
    `Pedido: ${order.code}`,
    `Cliente: ${order.customer_name}`,
    '',
    ...items.map((i) => `• ${i.quantity}x ${i.name} (${i.sku}) — ${brl(i.total_cents)}`),
    '',
    `Subtotal: ${brl(order.subtotal_cents)}`,
  ];
  if (order.shipping_cents) lines.push(`Frete: ${brl(order.shipping_cents)}`);
  if (order.discount_cents) lines.push(`Desconto: ${brl(order.discount_cents)}`);
  lines.push(`Total: ${brl(order.total_cents)}`);
  lines.push(order.fulfillment === 'entrega' ? 'Recebimento: entrega' : `Recebimento: retirada na loja${order.pickup_store_name ? ` — ${order.pickup_store_name}` : ''}`);
  if (order.vehicle_info) lines.push(`Veículo: ${order.vehicle_info}`);
  return lines.join('\n');
}

module.exports = { waLink, orderMessage };
