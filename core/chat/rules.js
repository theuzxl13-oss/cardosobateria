'use strict';
/**
 * Assistente virtual baseado em REGRAS (sem IA externa).
 * Responde apenas com dados cadastrados: catálogo, aplicações por veículo, FAQ, serviços e configurações.
 * Quando não encontra a informação, diz isso e encaminha para o WhatsApp.
 */
const { get } = require('../db');
const settings = require('../services/settings');
const catalog = require('../services/catalog');
const { brl } = require('../lib/format');
const { waLink } = require('../lib/whatsapp');

const QUICK = ['Ver baterias 60Ah', 'Qual a garantia?', 'Vocês entregam?', 'Horário de atendimento', 'Serviços', 'Como comprar pelo site?', 'Falar com atendente'];

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set('a o as os de da do das dos e em no na nos nas um uma uns umas para pra por com que qual quais como voces voce eu meu minha tem ter sobre se ao aos e é ou mais muito'.split(' '));
const tokens = (s) => norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
const has = (text, words) => words.some((w) => new RegExp(`(^|\\s)${w}`).test(text));

function productCard(p) {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand_name,
    capacity_ah: p.capacity_ah,
    price_cents: p.final_price_cents,
    available_qty: p.available_qty,
    warranty_months: p.warranty_months,
    image: p.image,
  };
}

function describeProducts(list, max = 4) {
  return list
    .slice(0, max)
    .map(
      (p) =>
        `• ${p.name} — ${brl(p.final_price_cents)} — ${p.available_qty > 0 ? `${p.available_qty} disponível(is)` : 'esgotado no momento'} — garantia ${p.warranty_months} meses`
    )
    .join('\n');
}

function vehicleIndex() {
  const rows = get()
    .prepare('SELECT DISTINCT a.make, a.model FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1')
    .all();
  return rows.map((r) => ({ make: r.make, model: r.model, nmake: norm(r.make), nmodel: norm(r.model) }));
}

function reply(message, { history = [] } = {}) {
  const s = settings.getAll();
  const text = norm(message);
  const wa = (msg) => ({ label: 'Falar no WhatsApp', url: waLink(s.whatsapp_number, msg || 'Olá! Vim pelo site da Cardoso Baterias e gostaria de atendimento.') });
  const out = (o) => ({ provider: 'regras', understood: true, quick: QUICK, whatsapp: wa(o.waMsg), ...o, waMsg: undefined });
  const notFound = (extra = '') =>
    out({
      understood: false,
      text: `Desculpe, não encontrei essa informação no meu cadastro${extra}. Para não te passar nada errado, fale com um atendente pelo WhatsApp: ${s.whatsapp_display}.`,
      waMsg: `Olá! Vim pelo site da Cardoso Baterias. Tenho uma dúvida: ${String(message).slice(0, 300)}`,
    });

  if (!text) return out({ text: 'Escreva sua dúvida ou escolha uma das opções abaixo.' });

  // saudação
  if (/^(oi|ola|ola tudo bem|bom dia|boa tarde|boa noite|e ai|opa|hello|hi)( .*)?$/.test(text) && tokens(text).length <= 3) {
    return out({
      text: `Olá! Sou o assistente virtual da ${s.store_name} (respostas automáticas com base no nosso cadastro). Posso ajudar com baterias, preços, disponibilidade, garantia, entrega, horários e serviços. Como posso ajudar?`,
    });
  }

  // atendente humano
  if (has(text, ['atendente', 'humano', 'pessoa', 'whats', 'zap', 'falar com', 'vendedor', 'telefone', 'ligar', 'contato'])) {
    return out({ text: `Claro! Fale com nossa equipe pelo WhatsApp ${s.whatsapp_display}. O botão abaixo já abre a conversa com uma mensagem pronta.` });
  }

  // consulta de pedido
  const code = String(message).toUpperCase().match(/CB\d{6}-[A-Z0-9]{5}/);
  if (code || has(text, ['meu pedido', 'status do pedido', 'acompanhar', 'rastrear', 'consultar pedido'])) {
    return out({
      text: 'Para consultar um pedido, acesse "Consultar pedido" e informe o código do pedido e o telefone usado na compra. Por segurança, não exibo dados de pedidos aqui no chat.',
      links: [{ label: 'Consultar pedido', href: '#/consultar-pedido' }],
      waMsg: code ? `Olá! Gostaria de saber sobre o pedido ${code[0]}.` : undefined,
    });
  }

  // veículo (marca/modelo/ano) — somente aplicações cadastradas
  const year = (text.match(/\b(19[5-9]\d|20\d{2})\b/) || [])[1];
  const vidx = vehicleIndex();
  const modelHit = vidx.find((v) => v.nmodel.length >= 2 && new RegExp(`(^|\\s)${v.nmodel}(\\s|$)`).test(text));
  const wantsVehicle = has(text, ['carro', 'veiculo', 'serve', 'compativel', 'compatibilidade', 'meu ', 'modelo', 'ano']);
  if (modelHit) {
    if (!year) {
      const apps = get()
        .prepare(`SELECT MIN(year_start) a, MAX(year_end) b FROM product_applications a JOIN products p ON p.id = a.product_id AND p.active = 1 WHERE LOWER(make)=LOWER(?) AND LOWER(model)=LOWER(?)`)
        .get(modelHit.make, modelHit.model);
      return out({
        text: `Tenho aplicações cadastradas para ${modelHit.make} ${modelHit.model} (anos ${apps.a} a ${apps.b}). Qual é o ano do seu veículo? Ex.: "${modelHit.model} ${apps.b}".`,
        quick: [`${modelHit.model} ${apps.b}`, `${modelHit.model} ${apps.a}`, 'Falar com atendente'],
      });
    }
    const r = catalog.vehicleSearch({ make: modelHit.make, model: modelHit.model, year: Number(year) });
    const vehicle = `${modelHit.make} ${modelHit.model} ${year}`;
    if (!r.results.length) {
      return out({
        understood: false,
        text: `Não tenho aplicação cadastrada para ${vehicle}. Não vou arriscar indicar uma bateria sem essa informação — fale com um atendente pelo WhatsApp para confirmar a opção correta.`,
        waMsg: `Olá! Vim pelo site da Cardoso Baterias e gostaria de saber qual bateria serve no meu veículo: ${vehicle}.`,
      });
    }
    const list = r.results.map((x) => x.product);
    return out({
      text: `Baterias com aplicação cadastrada para ${vehicle}:\n${describeProducts(list)}\n\n⚠️ As aplicações desta demonstração são ilustrativas. Confirme a compatibilidade com a loja antes da compra.`,
      products: list.slice(0, 4).map(productCard),
      waMsg: `Olá! Vim pelo site da Cardoso Baterias e gostaria de confirmar a bateria para meu veículo: ${vehicle}.`,
    });
  }
  if (wantsVehicle && year) {
    return out({
      understood: false,
      text: 'Não encontrei esse veículo nas aplicações cadastradas. Não vou adivinhar a bateria — fale com um atendente pelo WhatsApp informando marca, modelo e ano.',
      waMsg: `Olá! Vim pelo site da Cardoso Baterias e gostaria de saber qual bateria serve no meu veículo: ${String(message).slice(0, 120)}.`,
    });
  }

  if (wantsVehicle && !year && has(text, ['serve', 'meu carro', 'meu veiculo', 'compativel', 'compatibilidade'])) {
    return out({
      text: 'Me diga o modelo e o ano do veículo (ex.: "Gol 2015" ou "Onix 2018") que eu procuro nas aplicações cadastradas pela loja.',
      quick: vidx.slice(0, 4).map((v) => `${v.model} ${new Date().getFullYear() - 8}`).concat('Falar com atendente'),
    });
  }

  // garantia
  if (has(text, ['garantia'])) {
    const ah = (text.match(/\b(\d{2,3})\s?ah\b/) || [])[1];
    const list = ah ? catalog.listPublic({ capacity: ah }) : [];
    if (list.length) {
      return out({
        text: `Garantia conforme o cadastro de cada produto ${ah}Ah:\n${list.slice(0, 5).map((p) => `• ${p.name}: ${p.warranty_months} meses`).join('\n')}\n\n${s.warranty_policy}`,
        products: list.slice(0, 4).map(productCard),
      });
    }
    const r = get().prepare('SELECT MIN(warranty_months) a, MAX(warranty_months) b FROM products WHERE active = 1').get();
    return out({
      text: `A garantia varia conforme o produto${r.a !== null ? ` (no catálogo atual, de ${r.a} a ${r.b} meses)` : ''} e aparece na página de cada bateria. ${s.warranty_policy}`,
      links: [{ label: 'Ver catálogo', href: '#/catalogo' }],
    });
  }

  // catálogo: capacidade, marca, preço, disponibilidade
  const ahMatch = text.match(/\b(\d{2,3})\s?(ah|amperes?|amp)\b/);
  const brands = get().prepare('SELECT id, name FROM brands').all();
  const brandHit = brands.find((b) => text.includes(norm(b.name)));
  const productWords = has(text, ['bateria', 'preco', 'valor', 'quanto', 'custa', 'estoque', 'disponivel', 'disponibilidade', 'tem ', 'promoc', 'oferta', 'efb', 'agm', 'start stop']);
  if (ahMatch || brandHit || (productWords && !has(text, ['entrega', 'frete', 'horario', 'servico', 'pagamento', 'pix', 'cartao', 'instala', 'troca', 'teste', 'descarte', 'usada', 'velha', 'nao liga', 'nao pega', 'loja', 'unidade', 'endereco', 'embu', 'cipo', 'angela']))) {
    const f = {};
    if (ahMatch) f.capacity = ahMatch[1];
    if (brandHit) f.brand = brandHit.id;
    if (has(text, ['promoc', 'oferta', 'desconto'])) f.promo = '1';
    if (has(text, ['efb', 'agm', 'start stop'])) f.q = has(text, ['agm']) ? 'agm' : 'efb';
    if (!ahMatch && !brandHit && !f.promo && !f.q) {
      return out({
        text: 'Temos baterias de várias capacidades (Ah). Me diga a capacidade (ex.: "60Ah"), a marca ou o seu veículo (modelo e ano) que eu procuro no catálogo.',
        quick: ['Ver baterias 45Ah', 'Ver baterias 60Ah', 'Ver baterias 90Ah', 'Promoções'],
        links: [{ label: 'Abrir catálogo', href: '#/catalogo' }],
      });
    }
    const list = catalog.listPublic(f);
    if (!list.length) return notFound(ahMatch ? ` para ${ahMatch[1]}Ah` : '');
    const qs = new URLSearchParams();
    if (f.capacity) qs.set('capacity', f.capacity);
    if (f.brand) qs.set('brand', f.brand);
    if (f.promo) qs.set('promo', '1');
    return out({
      text: `Encontrei ${list.length} opção(ões) no catálogo:\n${describeProducts(list)}${list.length > 4 ? '\n…e outras no catálogo.' : ''}\n\nPreços e estoque conforme o cadastro atual (valores demonstrativos). Confirme a compatibilidade com seu veículo.`,
      products: list.slice(0, 4).map(productCard),
      links: [{ label: 'Ver no catálogo', href: `#/catalogo?${qs}` }],
    });
  }

  // o que é Ah / tecnologias
  if (has(text, ['o que e ah', 'significa ah', 'amperagem', 'capacidade', 'cca'])) {
    return out({
      text: 'Ah (ampère-hora) indica a capacidade de armazenamento da bateria; CCA indica a corrente de partida a frio. O ideal é usar a especificação indicada pelo fabricante do veículo — por isso confirme com a loja antes de trocar por uma capacidade diferente.',
    });
  }
  if (has(text, ['efb', 'agm', 'start stop', 'tecnologia'])) {
    return out({
      text: 'EFB e AGM são tecnologias usadas em veículos com sistema start-stop, que exigem mais ciclos de carga/descarga. Veículos com start-stop normalmente precisam de bateria da mesma tecnologia original. Confirme com a loja.',
      links: [{ label: 'Ver baterias Start-Stop', href: '#/catalogo?q=efb' }],
    });
  }

  // entrega / frete
  if (has(text, ['entrega', 'entregam', 'frete', 'delivery', 'enviar', 'envio', 'levar'])) {
    if (!s.delivery_enabled) return out({ text: `No momento a entrega está desativada. Você pode retirar na loja. ${s.pickup_instructions}` });
    return out({
      text: `Fazemos entrega na área de atendimento: ${s.service_area}.\nFrete: ${brl(s.delivery_fee_cents)}${s.delivery_free_above_cents ? ` (grátis em compras a partir de ${brl(s.delivery_free_above_cents)})` : ''}.\n${s.delivery_info}`,
    });
  }
  // unidades / endereço / telefone das lojas
  if (!has(text, ['retira', 'pegar']) && has(text, ['loja', 'lojas', 'unidade', 'unidades', 'endereco', 'onde fica', 'onde voces', 'localizacao', 'embu', 'cipo', 'jardim angela', 'angela', 'filial'])) {
    const stores = get().prepare('SELECT * FROM stores WHERE active = 1 ORDER BY sort, id').all();
    if (stores.length) {
      const hit = stores.filter((st) => text.includes(norm(st.neighborhood)) && norm(st.neighborhood).length > 2);
      const list = hit.length ? hit : stores;
      return out({
        text: `${list.length > 1 ? 'Nossas lojas' : 'Unidade'}:\n${list
          .map((st) => `• ${st.name}${st.address ? ` — ${st.address}` : ''}${st.phone ? ` — Tel. ${st.phone}` : ''}${st.hours ? ` — ${st.hours.split('\n')[0]}` : ''}`)
          .join('\n')}\n\nVeja como chegar em "Nossas lojas".`,
        links: [{ label: 'Nossas lojas', href: '#/lojas' }],
      });
    }
  }

  // retirada / endereço
  if (has(text, ['retira', 'buscar', 'pegar na loja', 'endereco', 'onde fica', 'localizacao', 'local', 'loja fisica'])) {
    return out({
      text: `${s.pickup_enabled ? `Retirada na loja disponível. ${s.pickup_instructions}\n` : 'Retirada na loja indisponível no momento.\n'}Endereço: ${s.address}`,
    });
  }
  // horários
  if (has(text, ['horario', 'abre', 'fecha', 'funciona', 'aberto', 'sabado', 'domingo', 'feriado'])) {
    const stores = get().prepare("SELECT name, hours FROM stores WHERE active = 1 AND hours <> '' ORDER BY sort, id").all();
    if (stores.length) {
      return out({ text: `Horários por unidade:\n${stores.map((st) => `• ${st.name}: ${st.hours.replace(/\n/g, ' ')}`).join('\n')}\n\nPara confirmar o horário de hoje, fale com a loja pelo WhatsApp.` });
    }
    return out({ text: `Horário de atendimento:\n${s.business_hours}` });
  }
  // serviços
  if (has(text, ['servico', 'instala', 'troca', 'trocar', 'teste', 'testar', 'alternador', 'diagnostico', 'socorro'])) {
    const svc = get().prepare('SELECT title, summary, price_info FROM services WHERE active = 1 ORDER BY sort').all();
    if (!svc.length) return notFound();
    return out({
      text: `Serviços disponíveis:\n${svc.map((x) => `• ${x.title} — ${x.summary}${x.price_info ? ` (${x.price_info})` : ''}`).join('\n')}`,
      links: [{ label: 'Ver serviços', href: '#/servicos' }],
      waMsg: 'Olá! Vim pelo site da Cardoso Baterias e gostaria de agendar um serviço.',
    });
  }
  // como comprar / pagamento
  if (has(text, ['comprar', 'compra', 'pedido', 'carrinho', 'checkout', 'finalizar'])) {
    return out({
      text: '1) Encontre a bateria no catálogo ou pela consulta por veículo.\n2) Clique em "Adicionar ao carrinho".\n3) No carrinho, clique em "Finalizar pedido", informe nome e telefone e escolha retirada ou entrega.\n4) Escolha a forma de pagamento (nesta demonstração nada é cobrado).\n5) Guarde o código do pedido — você pode enviar o resumo pelo WhatsApp.',
      links: [{ label: 'Ir ao catálogo', href: '#/catalogo' }],
    });
  }
  if (has(text, ['pagamento', 'pagar', 'pix', 'cartao', 'parcel', 'dinheiro', 'boleto'])) {
    return out({
      text: 'No site: Pix (demonstrativo), cartão (simulado) e pagamento na retirada. Nesta demonstração nenhum valor é cobrado. Para parcelamento ou outras condições, fale com um atendente.',
    });
  }

  // FAQ por similaridade
  const faqs = get().prepare('SELECT question, answer, keywords FROM faqs WHERE active = 1').all();
  const qt = new Set(tokens(message));
  let best = null;
  for (const f of faqs) {
    const ft = new Set([...tokens(f.question), ...tokens(f.keywords.replace(/,/g, ' '))]);
    let score = 0;
    for (const t of qt) if (ft.has(t) || [...ft].some((x) => x.length > 4 && (x.startsWith(t) || t.startsWith(x)))) score++;
    const ratio = qt.size ? score / qt.size : 0;
    if (score >= 1 && ratio >= 0.4 && (!best || score > best.score)) best = { f, score };
  }
  if (best) return out({ text: `${best.f.answer}`, faq: best.f.question });

  if (history && history.length > 6) return notFound(' — talvez um atendente possa ajudar melhor');
  return notFound();
}

module.exports = { reply, norm, QUICK };
