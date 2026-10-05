'use strict';
const { get, tx } = require('../db');

const WHATSAPP_NUMBER = '5511962986718';

/** Valores padrão. Tudo aqui é editável pelo painel (Configurações / Conteúdo). */
const DEFAULTS = {
  store_name: 'Cardoso Baterias',
  logo_url: 'img/logo-transparent.png', // para fundos claros
  logo_on_dark_url: 'img/logo-on-dark.png', // para fundos escuros (cabeçalho/rodapé)
  whatsapp_number: WHATSAPP_NUMBER,
  whatsapp_display: '(11) 96298-6718',
  phone: '(11) 96298-6718',
  email: '',
  address: 'Unidades em Embu-Guaçu, Cipó e Jardim Ângela. Veja endereços e horários em "Nossas lojas".',
  address_map_url: '',
  business_hours: 'Horários por unidade em "Nossas lojas".\nReferência: abertura 8h30 (Cipó) e fechamento 18h (Embu-Guaçu e Jardim Ângela).\n(demais horários a confirmar)',
  service_area: 'Embu-Guaçu, Cipó, Jardim Ângela e região (a confirmar)',
  instagram_url: '',
  facebook_url: '',
  tiktok_url: '',
  hero_title: 'Encontre a bateria ideal para seu carro',
  hero_subtitle: 'Baterias automotivas, teste gratuito e instalação. Consulte pelo veículo, compre pelo site ou fale com a gente no WhatsApp.',
  about_title: 'Sobre a Cardoso Baterias',
  about_text:
    'A Cardoso Baterias é especializada em baterias automotivas: venda, teste, troca e instalação.\n\n' +
    'Nosso foco é indicar a bateria certa para cada veículo, com atendimento claro e rápido — na loja ou pelo WhatsApp.\n\n' +
    '(Texto demonstrativo — edite este conteúdo no painel administrativo.)',
  about_highlights: 'Teste de bateria e sistema de carga\nInstalação na hora\nAtendimento pelo WhatsApp\nRetirada na loja ou entrega',
  pickup_enabled: true,
  pickup_instructions: 'Escolha a unidade e retire após a confirmação do pedido. Leve o código do pedido.',
  delivery_enabled: true,
  delivery_fee_cents: 2500,
  delivery_free_above_cents: 60000,
  delivery_info: 'Frete demonstrativo: valor fixo configurável no painel. Prazo combinado pelo WhatsApp.',
  reservation_hours: 48,
  warranty_policy: 'A garantia de cada bateria é a informada no cadastro do produto. Guarde o comprovante do pedido.',
  footer_note: 'Conteúdo e dados demonstrativos para apresentação comercial.',
  cnpj: '',
};

const PUBLIC_KEYS = Object.keys(DEFAULTS).filter((k) => !['reservation_hours'].includes(k));

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getAll() {
  const rows = get().prepare('SELECT key, value FROM settings').all();
  const s = { ...DEFAULTS };
  for (const r of rows) s[r.key] = parse(r.value);
  return s;
}

function getPublic() {
  const s = getAll();
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = s[k];
  out.reservation_hours = s.reservation_hours;
  return out;
}

function setMany(values) {
  const stmt = get().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  tx(() => {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in DEFAULTS)) continue;
      stmt.run(k, JSON.stringify(v));
    }
  });
  return getAll();
}

function shippingFor(fulfillment, subtotalCents, s = getAll()) {
  if (fulfillment !== 'entrega') return 0;
  if (s.delivery_free_above_cents && subtotalCents >= s.delivery_free_above_cents) return 0;
  return Number(s.delivery_fee_cents) || 0;
}

module.exports = { DEFAULTS, getAll, getPublic, setMany, shippingFor, WHATSAPP_NUMBER };
