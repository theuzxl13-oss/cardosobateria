/* Cardoso Baterias — loja virtual e site institucional (SPA com rotas por hash) */
(function () {
  'use strict';
  const { esc, brl, asset } = CB;
  const app = document.getElementById('app');
  let S = null; // configurações públicas da loja

  /* ---------------- Carrinho (conveniência no navegador; o pedido é validado no banco) ---------------- */
  const CART_KEY = 'cb_cart_v1';
  const cart = {
    read() {
      try {
        const v = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        return Array.isArray(v) ? v.filter((i) => Number.isInteger(i.productId) && Number.isInteger(i.quantity) && i.quantity > 0) : [];
      } catch (e) {
        return [];
      }
    },
    write(items) {
      try {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
      } catch (e) {}
      updateCartCount();
    },
    add(productId, quantity, max) {
      const items = cart.read();
      const it = items.find((i) => i.productId === productId);
      const current = it ? it.quantity : 0;
      const next = Math.min(current + quantity, max);
      if (next <= current) return false;
      if (it) it.quantity = next;
      else items.push({ productId, quantity: next });
      cart.write(items);
      return true;
    },
    set(productId, quantity) {
      const items = cart.read().map((i) => (i.productId === productId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0);
      cart.write(items);
    },
    remove(productId) {
      cart.write(cart.read().filter((i) => i.productId !== productId));
    },
    clear() {
      cart.write([]);
    },
    count() {
      return cart.read().reduce((a, i) => a + i.quantity, 0);
    },
  };
  function updateCartCount() {
    const el = document.getElementById('cartCount');
    if (el) el.textContent = cart.count();
  }

  /* ---------------- WhatsApp ---------------- */
  const waNumber = () => (S && S.whatsapp_number) || '5511962986718';
  const waLink = (msg) => CB.wa(waNumber(), msg);
  const waProductMsg = (p, vehicle) =>
    `Olá! Vim pelo site da Cardoso Baterias e gostaria de saber mais sobre a bateria ${p.name}${p.sku ? ` (${p.sku})` : ''}. Meu veículo é ${vehicle && vehicle.trim() ? vehicle.trim() : '[marca/modelo/ano]'}.`;

  /* ---------------- Componentes ---------------- */
  const stockLine = (p) =>
    p.available_qty <= 0
      ? '<span class="stock-line stock-out">Esgotado</span>'
      : p.available_qty <= p.min_stock
        ? `<span class="stock-line stock-low">Últimas ${p.available_qty} unidade(s)</span>`
        : `<span class="stock-line stock-ok">Em estoque (${p.available_qty})</span>`;

  const priceBlock = (p) =>
    `<div>${p.on_promo ? `<span class="price-old">${brl(p.price_cents)}</span>` : ''}<span class="price">${brl(p.final_price_cents)}</span></div>`;

  function productCard(p) {
    return `<article class="product-card">
      <a class="pc-img" href="#/produto/${p.id}" aria-label="${esc(p.name)}">
        <img src="${esc(asset(p.image))}" alt="${esc(p.name)}" loading="lazy" />
        <div class="pc-tags">${p.on_promo ? '<span class="badge badge-yellow">Oferta</span>' : ''}${p.available_qty <= 0 ? '<span class="badge badge-danger">Esgotado</span>' : ''}</div>
      </a>
      <div class="pc-body">
        <span class="pc-brand">${esc(p.brand_name || '')} · ${esc(p.sku)}</span>
        <a class="pc-name" href="#/produto/${p.id}">${esc(p.name)}</a>
        <div class="pc-specs"><span class="spec-chip">${p.capacity_ah}Ah</span><span class="spec-chip">${p.voltage}V</span>${p.technology ? `<span class="spec-chip">${esc(p.technology.split(' ')[0])}</span>` : ''}<span class="spec-chip">Garantia ${p.warranty_months}m</span></div>
        ${priceBlock(p)}
        ${stockLine(p)}
        <div class="pc-foot">
          <button class="btn btn-primary btn-sm" data-add="${p.id}" data-max="${p.available_qty}" ${p.available_qty <= 0 ? 'disabled' : ''}>Comprar</button>
          <a class="btn btn-ghost btn-sm" href="${esc(waLink(waProductMsg(p)))}" target="_blank" rel="noopener" title="Pedir orçamento no WhatsApp">Orçamento</a>
        </div>
      </div>
    </article>`;
  }

  function bindAddButtons(root) {
    root.querySelectorAll('[data-add]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = Number(b.dataset.add);
        const max = Number(b.dataset.max);
        if (cart.add(id, 1, max)) CB.toast('Produto adicionado ao carrinho.');
        else CB.toast(`Quantidade máxima disponível (${max}) já está no carrinho.`, 'error');
      })
    );
  }

  const pageTitle = (title, sub = '', crumbs = '') =>
    `<section class="page-title"><div class="container">${crumbs ? `<div class="breadcrumb">${crumbs}</div>` : ''}<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div></section>`;

  const demoNotice = () =>
    `<div class="notice">⚠️ <strong>Confirme a compatibilidade com a loja.</strong> As aplicações por veículo desta demonstração são ilustrativas e não foram verificadas. Antes de comprar, fale com a Cardoso Baterias pelo WhatsApp.</div>`;

  /* ---------------- Seletor de veículo (somente aplicações cadastradas) ---------------- */
  async function vehicleSelector(root, initial = {}) {
    const mk = root.querySelector('[name=make]');
    const md = root.querySelector('[name=model]');
    const yr = root.querySelector('[name=year]');
    const fill = (sel, list, placeholder, value) => {
      sel.innerHTML = `<option value="">${placeholder}</option>` + list.map((v) => `<option ${String(v) === String(value) ? 'selected' : ''}>${esc(v)}</option>`).join('');
      sel.disabled = !list.length;
    };
    fill(mk, await CB.get('/api/public/vehicles/makes'), 'Marca', initial.make);
    const loadModels = async () => {
      fill(md, mk.value ? await CB.get('/api/public/vehicles/models', { make: mk.value }) : [], 'Modelo', initial.model);
      await loadYears();
    };
    const loadYears = async () => fill(yr, md.value ? await CB.get('/api/public/vehicles/years', { make: mk.value, model: md.value }) : [], 'Ano', initial.year);
    mk.onchange = () => {
      initial = {};
      loadModels();
    };
    md.onchange = () => {
      initial.year = null;
      loadYears();
    };
    if (initial.make) await loadModels();
    else fill(md, [], 'Modelo'), fill(yr, [], 'Ano');
  }
  const vehicleFields = () =>
    `<select name="make" aria-label="Marca do veículo"></select><select name="model" aria-label="Modelo"></select><select name="year" aria-label="Ano"></select>`;

  /* ---------------- Páginas ---------------- */
  async function pageHome() {
    const h = await CB.get('/api/public/home');
    app.innerHTML = `
    <section class="hero">
      <div class="container hero-inner">
        <div>
          <span class="badge badge-dark">⚡ ${esc(S.store_name)}</span>
          <h1 style="margin-top:14px">${esc(S.hero_title).replace(/(ideal)/i, '<em>$1</em>')}</h1>
          <p class="lead">${esc(S.hero_subtitle)}</p>
          <div class="hero-ctas">
            <a class="btn btn-primary" href="#/catalogo">Ver baterias</a>
            <a class="btn btn-wa" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias e gostaria de um orçamento de bateria. Meu veículo é [marca/modelo/ano].'))}" target="_blank" rel="noopener">Orçamento no WhatsApp</a>
            <a class="btn btn-outline-light" href="#/servicos">Serviços</a>
          </div>
          <div class="hero-badges"><span>Teste de bateria</span><span>Instalação</span><span>Retirada ou entrega</span></div>
        </div>
        <form class="finder" id="finder">
          <h2>Encontre sua bateria</h2>
          <p class="muted small">Consulte pelas aplicações cadastradas pela loja.</p>
          <div class="grid3">${vehicleFields()}</div>
          <button class="btn btn-dark btn-block" type="submit">Buscar pelo veículo</button>
          <div class="or">ou busque por capacidade, marca ou código</div>
          <div class="searchbox"><input name="q" placeholder="Ex.: 60Ah, Voltrix, VTX-60D" aria-label="Buscar bateria" /><button class="btn btn-primary" type="button" id="qbtn">Buscar</button></div>
        </form>
      </div>
    </section>

    ${h.banners.length ? `<section class="section"><div class="container"><div class="banners">${h.banners
      .map(
        (b) => `<a class="banner-card" href="${esc(b.cta_link || '#/catalogo')}">${b.image ? `<img src="${esc(asset(b.image))}" alt="" loading="lazy">` : ''}<div class="bc-text"><h3>${esc(b.title)}</h3>${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.cta_label ? `<span class="btn btn-primary btn-sm">${esc(b.cta_label)}</span>` : ''}</div></a>`
      )
      .join('')}</div></div></section>` : ''}

    <section class="section section-alt"><div class="container">
      <div class="section-head"><h2>Baterias em destaque</h2><a class="btn btn-ghost" href="#/catalogo">Ver todas</a></div>
      ${h.featured.length ? `<div class="products-grid">${h.featured.map(productCard).join('')}</div>` : CB.empty('Nenhum produto em destaque.')}
      <p class="small muted" style="margin-top:14px">Preços e produtos demonstrativos (marcas fictícias).</p>
    </div></section>

    ${h.promos.length ? `<section class="section"><div class="container"><div class="section-head"><h2>Ofertas</h2><a class="btn btn-ghost" href="#/catalogo?promo=1">Ver ofertas</a></div><div class="products-grid">${h.promos.map(productCard).join('')}</div></div></section>` : ''}

    <section class="section section-dark"><div class="container">
      <div class="section-head"><h2>Serviços</h2><a class="btn btn-outline-light" href="#/servicos">Todos os serviços</a></div>
      <div class="cards-4">${h.services.map(serviceCard).join('')}</div>
    </div></section>

    <section class="section section-alt"><div class="container about-grid">
      <div><div class="section-head"><h2>${esc(S.about_title)}</h2></div><p>${CB.nl2br(S.about_text.split('\n\n')[0])}</p><a class="btn btn-dark" href="#/sobre">Conheça a loja</a></div>
      <ul class="highlights">${S.about_highlights.split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div></section>

    <section class="section"><div class="container">
      <div class="section-head"><h2>Dúvidas frequentes</h2><a class="btn btn-ghost" href="#/duvidas">Ver todas</a></div>
      <div class="faq-list">${h.faqs.map(faqItem).join('')}</div>
    </div></section>`;
    bindAddButtons(app);
    const f = document.getElementById('finder');
    vehicleSelector(f);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = CB.formData(f);
      if (!d.make || !d.model || !d.year) return CB.toast('Selecione marca, modelo e ano do veículo.', 'error');
      location.hash = `#/catalogo?${new URLSearchParams({ make: d.make, model: d.model, year: d.year })}`;
    });
    const goQ = () => (location.hash = `#/catalogo?${new URLSearchParams({ q: f.q.value.trim() })}`);
    document.getElementById('qbtn').onclick = goQ;
    f.q.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), goQ()));
  }

  const serviceCard = (s) => `<article class="service-card"><img src="${esc(asset(s.image))}" alt="" loading="lazy" />
    <div class="sc-body" style="color:var(--text)"><h3>${esc(s.title)}</h3><p class="muted" style="margin:0">${esc(s.summary)}</p>${s.price_info ? `<span class="badge">${esc(s.price_info)}</span>` : ''}
    <a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${esc(waLink(`Olá! Vim pelo site da Cardoso Baterias e gostaria de saber sobre o serviço: ${s.title}.`))}">Agendar pelo WhatsApp</a></div></article>`;
  const faqItem = (f) => `<details><summary>${esc(f.question)}</summary><p>${CB.nl2br(f.answer)}</p></details>`;

  async function pageCatalog(q) {
    const [filters] = await Promise.all([CB.get('/api/public/filters')]);
    const vehicleMode = q.make && q.model && q.year;
    app.innerHTML = `${pageTitle('Baterias', 'Busque por veículo, capacidade, marca, preço ou disponibilidade.', '<a href="#/">Início</a> › Baterias')}
    <section class="section" style="padding-top:28px"><div class="container">
      <form class="vehicle-box" id="vehForm"><h3>Consulta por veículo</h3>
        <div class="grid4">${vehicleFields()}<button class="btn btn-primary" type="submit">Consultar</button></div>
        <p class="small" style="margin:8px 0 0;color:#bbb">Mostramos somente baterias com aplicação cadastrada pela loja. ${vehicleMode ? '<a href="#/catalogo" style="color:var(--yellow)">Limpar consulta</a>' : ''}</p>
      </form>
      <div class="catalog">
        <aside class="filters" id="filters" aria-label="Filtros">
          <h3>Filtros</h3>
          <label><span class="lbl">Buscar</span><input name="q" value="${esc(q.q || '')}" placeholder="Nome, marca, código, 60Ah…" /></label>
          <label><span class="lbl">Marca</span><select name="brand"><option value="">Todas</option>${filters.brands.map((b) => `<option value="${b.id}" ${String(q.brand) === String(b.id) ? 'selected' : ''}>${esc(b.name)} (${b.count})</option>`).join('')}</select></label>
          <div><span class="lbl" style="font-weight:600;font-size:.9rem">Capacidade</span><div class="chips" id="capChips">${filters.capacities
            .map((c) => `<button type="button" class="chip ${String(q.capacity || '').split(',').includes(String(c)) ? 'on' : ''}" data-cap="${c}">${c}Ah</button>`)
            .join('')}</div></div>
          <div class="form-grid" style="grid-template-columns:1fr 1fr"><label><span class="lbl">Preço mín. (R$)</span><input name="minPrice" type="number" min="0" step="1" value="${esc(q.minPrice || '')}" /></label>
          <label><span class="lbl">Preço máx. (R$)</span><input name="maxPrice" type="number" min="0" step="1" value="${esc(q.maxPrice || '')}" /></label></div>
          <label class="check"><input type="checkbox" name="available" ${q.available === '1' ? 'checked' : ''}/> Somente disponíveis</label>
          <label class="check"><input type="checkbox" name="promo" ${q.promo === '1' ? 'checked' : ''}/> Somente ofertas</label>
          <button class="btn btn-ghost" type="button" id="clearF">Limpar filtros</button>
        </aside>
        <div>
          <div class="catalog-top">
            <button class="btn btn-ghost btn-sm filters-toggle" id="ftoggle" type="button">⚙️ Filtros</button>
            <span id="resultCount" class="muted"></span>
            <select name="sort" id="sort" aria-label="Ordenar">
              ${[['', 'Relevância'], ['price_asc', 'Menor preço'], ['price_desc', 'Maior preço'], ['capacity_asc', 'Menor capacidade'], ['capacity_desc', 'Maior capacidade'], ['name', 'Nome']]
                .map(([v, l]) => `<option value="${v}" ${q.sort === v ? 'selected' : ''}>${l}</option>`)
                .join('')}
            </select>
          </div>
          <div id="results"></div>
        </div>
      </div>
    </div></section>`;

    const vf = document.getElementById('vehForm');
    vehicleSelector(vf, vehicleMode ? q : {});
    vf.addEventListener('submit', (e) => {
      e.preventDefault();
      const d = CB.formData(vf);
      if (!d.make || !d.model || !d.year) return CB.toast('Selecione marca, modelo e ano.', 'error');
      location.hash = `#/catalogo?${new URLSearchParams({ make: d.make, model: d.model, year: d.year })}`;
    });
    document.getElementById('ftoggle').onclick = () => document.getElementById('filters').classList.toggle('open');

    const fEl = document.getElementById('filters');
    const apply = () => {
      const caps = [...fEl.querySelectorAll('.chip.on')].map((c) => c.dataset.cap).join(',');
      const p = {
        q: fEl.q.value.trim(),
        brand: fEl.brand.value,
        capacity: caps,
        minPrice: fEl.minPrice.value,
        maxPrice: fEl.maxPrice.value,
        available: fEl.available.checked ? '1' : '',
        promo: fEl.promo.checked ? '1' : '',
        sort: document.getElementById('sort').value,
      };
      const clean = Object.fromEntries(Object.entries(p).filter(([, v]) => v));
      history.replaceState(null, '', `#/catalogo${Object.keys(clean).length ? '?' + new URLSearchParams(clean) : ''}`);
      loadResults(clean);
    };
    let t;
    fEl.addEventListener('input', () => (clearTimeout(t), (t = setTimeout(apply, 300))));
    fEl.addEventListener('change', apply);
    document.getElementById('sort').addEventListener('change', apply);
    fEl.querySelectorAll('[data-cap]').forEach((c) => (c.onclick = () => (c.classList.toggle('on'), apply())));
    document.getElementById('clearF').onclick = () => (location.hash = '#/catalogo');

    const results = document.getElementById('results');
    async function loadResults(params) {
      CB.loading(results, 'Buscando baterias…');
      try {
        const list = await CB.get('/api/public/products', params);
        document.getElementById('resultCount').textContent = `${list.length} resultado(s)`;
        results.innerHTML = list.length
          ? `<div class="products-grid">${list.map(productCard).join('')}</div>`
          : CB.empty('Nenhuma bateria encontrada com esses filtros.', `<a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias e não encontrei a bateria que procuro. Pode me ajudar?'))}">Pedir ajuda no WhatsApp</a>`);
        bindAddButtons(results);
      } catch (e) {
        results.innerHTML = CB.errorState(e);
      }
    }

    if (vehicleMode) {
      CB.loading(results, 'Consultando aplicações…');
      try {
        const r = await CB.get('/api/public/vehicles/search', { make: q.make, model: q.model, year: q.year });
        const v = `${q.make} ${q.model} ${q.year}`;
        document.getElementById('resultCount').textContent = `${r.results.length} bateria(s) para ${v}`;
        if (!r.results.length) {
          results.innerHTML = `<div class="panel" style="text-align:center"><h3>Não temos aplicação cadastrada para ${esc(v)}</h3>
            <p class="muted">Para não indicar uma bateria errada, nossa equipe confirma a opção correta pelo WhatsApp.</p>
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink(`Olá! Vim pelo site da Cardoso Baterias e gostaria de saber qual bateria serve no meu veículo: ${v}.`))}">Consultar pelo WhatsApp</a></div>`;
        } else {
          results.innerHTML = demoNotice() + `<div class="products-grid">${r.results.map((x) => productCard(x.product)).join('')}</div>`;
          bindAddButtons(results);
        }
      } catch (e) {
        results.innerHTML = CB.errorState(e);
      }
    } else {
      const initial = Object.fromEntries(Object.entries(q).filter(([k, v]) => v && ['q', 'brand', 'capacity', 'minPrice', 'maxPrice', 'available', 'promo', 'sort'].includes(k)));
      loadResults(initial);
    }
  }

  async function pageProduct(id) {
    const p = await CB.get(`/api/public/products/${encodeURIComponent(id)}`);
    const images = [p.image, ...p.images.map((i) => i.url)].filter(Boolean);
    document.title = `${p.name} — Cardoso Baterias`;
    app.innerHTML = `${pageTitle(p.name, `${p.brand_name || ''} · Código ${p.sku}`, '<a href="#/">Início</a> › <a href="#/catalogo">Baterias</a> › Produto')}
    <section class="section" style="padding-top:28px"><div class="container product-page">
      <div class="pp-gallery">
        <div class="main"><img id="mainImg" src="${esc(asset(images[0]))}" alt="${esc(p.name)}" /></div>
        ${images.length > 1 ? `<div class="thumbs">${images.map((u, i) => `<button class="${i ? '' : 'on'}" data-img="${esc(asset(u))}" aria-label="Imagem ${i + 1}"><img src="${esc(asset(u))}" alt=""></button>`).join('')}</div>` : ''}
        <p class="small muted" style="margin-top:8px">Imagem ilustrativa.</p>
      </div>
      <div class="pp-info">
        <div class="pc-specs" style="margin-bottom:8px"><span class="spec-chip">${p.capacity_ah}Ah</span><span class="spec-chip">${p.voltage}V</span>${p.on_promo ? '<span class="badge badge-yellow">Oferta</span>' : ''}${p.is_demo ? '<span class="demo-flag">Produto e preço demonstrativos</span>' : ''}</div>
        <div class="pp-buy">
          ${priceBlock(p)}
          ${stockLine(p)}
          <div class="buy-row">
            <div class="qty"><button type="button" data-q="-1" aria-label="Diminuir">−</button><input id="qty" type="number" min="1" max="${Math.max(p.available_qty, 1)}" value="1" aria-label="Quantidade"/><button type="button" data-q="1" aria-label="Aumentar">+</button></div>
            <button class="btn btn-primary" id="addCart" ${p.available_qty <= 0 ? 'disabled' : ''}>Adicionar ao carrinho</button>
            <button class="btn btn-dark" id="buyNow" ${p.available_qty <= 0 ? 'disabled' : ''}>Comprar agora</button>
          </div>
          <label><span class="lbl">Seu veículo (para o orçamento)</span><input id="myVehicle" placeholder="Ex.: Volkswagen Gol 2015 1.0" maxlength="100"/></label>
          <a class="btn btn-wa" id="waQuote" target="_blank" rel="noopener" href="#">Pedir orçamento no WhatsApp</a>
        </div>
        <h3>Descrição</h3>
        <p>${CB.nl2br(p.description)}</p>
        <table class="specs-table"><tbody>
          <tr><th>Marca</th><td>${esc(p.brand_name || '—')}</td></tr>
          <tr><th>Código/SKU</th><td>${esc(p.sku)}</td></tr>
          <tr><th>Capacidade</th><td>${p.capacity_ah} Ah</td></tr>
          <tr><th>Tensão</th><td>${p.voltage} V</td></tr>
          ${p.cca ? `<tr><th>Corrente de partida (CCA)</th><td>${p.cca} A</td></tr>` : ''}
          ${p.dimensions ? `<tr><th>Dimensões</th><td>${esc(p.dimensions)}</td></tr>` : ''}
          ${p.polarity ? `<tr><th>Polaridade</th><td>${esc(p.polarity)}</td></tr>` : ''}
          ${p.technology ? `<tr><th>Tecnologia</th><td>${esc(p.technology)}</td></tr>` : ''}
          <tr><th>Garantia</th><td>${p.warranty_months} meses (conforme cadastro)</td></tr>
          ${p.category_name ? `<tr><th>Categoria</th><td>${esc(p.category_name)}</td></tr>` : ''}
        </tbody></table>
        <h3 style="margin-top:24px">Aplicações cadastradas</h3>
        ${demoNotice()}
        ${p.applications.length
          ? `<div class="table-wrap"><table class="table"><thead><tr><th>Veículo</th><th>Anos</th><th>Motor</th></tr></thead><tbody>${p.applications
              .map((a) => `<tr><td>${esc(a.make)} ${esc(a.model)}</td><td>${a.year_start}–${a.year_end}</td><td>${esc(a.engine || '—')}</td></tr>`)
              .join('')}</tbody></table></div>`
          : '<p class="muted">Nenhuma aplicação cadastrada para este produto. Consulte a loja.</p>'}
      </div>
    </div></section>`;
    const qty = document.getElementById('qty');
    app.querySelectorAll('[data-q]').forEach(
      (b) => (b.onclick = () => (qty.value = Math.min(Math.max(1, Number(qty.value || 1) + Number(b.dataset.q)), Math.max(p.available_qty, 1))))
    );
    app.querySelectorAll('[data-img]').forEach(
      (b) =>
        (b.onclick = () => {
          document.getElementById('mainImg').src = b.dataset.img;
          app.querySelectorAll('[data-img]').forEach((x) => x.classList.toggle('on', x === b));
        })
    );
    const add = () => {
      const n = Math.floor(Number(qty.value));
      if (!(n >= 1)) return CB.toast('Quantidade inválida.', 'error'), false;
      if (n > p.available_qty) return CB.toast(`Disponível: ${p.available_qty} unidade(s).`, 'error'), false;
      const inCart = (cart.read().find((i) => i.productId === p.id) || {}).quantity || 0;
      if (inCart + n > p.available_qty) {
        CB.toast(`Você já tem ${inCart} no carrinho; disponível: ${p.available_qty}.`, 'error');
        return false;
      }
      cart.add(p.id, n, p.available_qty);
      return true;
    };
    document.getElementById('addCart').onclick = () => add() && CB.toast('Adicionado ao carrinho.');
    document.getElementById('buyNow').onclick = () => add() && (location.hash = '#/carrinho');
    const veh = document.getElementById('myVehicle');
    const waBtn = document.getElementById('waQuote');
    const upd = () => (waBtn.href = waLink(waProductMsg(p, veh.value)));
    veh.addEventListener('input', upd);
    upd();
  }

  async function pageServices() {
    const list = await CB.get('/api/public/services');
    app.innerHTML = `${pageTitle('Serviços', 'Troca, instalação, teste e atendimento.')}
    <section class="section"><div class="container">
      ${list.length
        ? `<div class="cards-4">${list
            .map(
              (s) => `<article class="service-card"><img src="${esc(asset(s.image))}" alt="" loading="lazy"/><div class="sc-body"><h3>${esc(s.title)}</h3><p>${CB.nl2br(s.description || s.summary)}</p>${s.price_info ? `<span class="badge">${esc(s.price_info)}</span>` : ''}<a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink(`Olá! Vim pelo site da Cardoso Baterias e gostaria de agendar/saber mais sobre: ${s.title}.`))}">Falar sobre este serviço</a></div></article>`
            )
            .join('')}</div>`
        : CB.empty('Nenhum serviço cadastrado.')}
    </div></section>`;
  }

  async function pageAbout() {
    app.innerHTML = `${pageTitle(S.about_title, '')}
    <section class="section"><div class="container about-grid">
      <div class="panel"><p>${CB.nl2br(S.about_text)}</p>
        <div class="buy-row"><a class="btn btn-primary" href="#/catalogo">Ver baterias</a><a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias.'))}">Falar no WhatsApp</a></div></div>
      <ul class="highlights">${S.about_highlights.split('\n').filter(Boolean).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    </div></section>`;
  }

  async function pageGallery(q) {
    const list = await CB.get('/api/public/gallery');
    const cat = q.cat || '';
    const shown = list.filter((g) => !cat || g.category === cat);
    app.innerHTML = `${pageTitle('Galeria', 'A loja e serviços realizados (imagens demonstrativas).')}
    <section class="section"><div class="container">
      <div class="chips" style="margin-bottom:16px">${[['', 'Tudo'], ['loja', 'A loja'], ['servicos', 'Serviços realizados']].map(([v, l]) => `<a class="chip ${cat === v ? 'on' : ''}" style="text-decoration:none" href="#/galeria${v ? '?cat=' + v : ''}">${l}</a>`).join('')}</div>
      ${shown.length ? `<div class="gallery-grid">${shown.map((g, i) => `<button class="gallery-item" data-i="${i}"><img src="${esc(asset(g.image))}" alt="${esc(g.title)}" loading="lazy"/><span>${esc(g.title)}</span></button>`).join('')}</div>` : CB.empty('Nenhuma imagem na galeria.')}
      <p class="small muted" style="margin-top:12px">Imagens ilustrativas para demonstração. Substitua por fotos reais no painel (Conteúdo › Galeria).</p>
    </div></section>`;
    app.querySelectorAll('[data-i]').forEach(
      (b) =>
        (b.onclick = () => {
          const g = shown[Number(b.dataset.i)];
          CB.modal({ title: g.title, wide: true, body: `<div class="lightbox"><img src="${esc(asset(g.image))}" alt="${esc(g.title)}"/>${g.description ? `<p class="muted" style="margin-top:10px">${esc(g.description)}</p>` : ''}</div>` });
        })
    );
  }

  async function pageFaq() {
    const list = await CB.get('/api/public/faqs');
    app.innerHTML = `${pageTitle('Perguntas frequentes', 'Não encontrou sua dúvida? Fale com a gente.')}
    <section class="section"><div class="container">
      ${list.length ? `<div class="faq-list">${list.map(faqItem).join('')}</div>` : CB.empty('Nenhuma pergunta cadastrada.')}
      <div style="margin-top:24px"><a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias e tenho uma dúvida.'))}">Perguntar no WhatsApp</a></div>
    </div></section>`;
  }

  function pageContact() {
    const social = [
      ['Instagram', S.instagram_url],
      ['Facebook', S.facebook_url],
      ['TikTok', S.tiktok_url],
    ].filter(([, u]) => u);
    app.innerHTML = `${pageTitle('Contato', 'Atendimento pelo WhatsApp, telefone ou na loja.')}
    <section class="section"><div class="container two-col">
      <div class="panel">
        <h2>Fale com a Cardoso Baterias</h2>
        <p><strong>WhatsApp:</strong> ${esc(S.whatsapp_display)}</p>
        ${S.phone ? `<p><strong>Telefone:</strong> ${esc(S.phone)}</p>` : ''}
        ${S.email ? `<p><strong>E-mail:</strong> ${esc(S.email)}</p>` : ''}
        <p><strong>Endereço:</strong> ${CB.nl2br(S.address)} ${S.address_map_url ? `<br><a href="${esc(S.address_map_url)}" target="_blank" rel="noopener">Ver no mapa</a>` : ''}</p>
        <p><strong>Área de atendimento:</strong> ${CB.nl2br(S.service_area)}</p>
        ${social.length ? `<p><strong>Redes sociais:</strong> ${social.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join(' · ')}</p>` : ''}
        <a class="btn btn-wa" target="_blank" rel="noopener" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias e gostaria de atendimento.'))}">Abrir WhatsApp</a>
      </div>
      <div class="panel"><h3>Horários</h3><p>${CB.nl2br(S.business_hours)}</p><span class="demo-flag">Endereço e horários editáveis no painel</span></div>
    </div></section>`;
  }

  /* ---------------- Carrinho ---------------- */
  async function pageCart() {
    app.innerHTML = `${pageTitle('Carrinho', '')}<section class="section"><div class="container" id="cartBox"></div></section>`;
    const box = document.getElementById('cartBox');
    const render = async () => {
      const items = cart.read();
      if (!items.length) {
        box.innerHTML = CB.empty('Seu carrinho está vazio.', '<a class="btn btn-primary" href="#/catalogo">Ver baterias</a>');
        return;
      }
      CB.loading(box, 'Conferindo preços e estoque…');
      let qt;
      try {
        qt = await CB.post('/api/public/cart/quote', { items, fulfillment: 'retirada' });
      } catch (e) {
        box.innerHTML = CB.errorState(e);
        return;
      }
      // remove itens que deixaram de existir
      const valid = new Set(qt.lines.map((l) => l.productId));
      if (items.some((i) => !valid.has(i.productId))) {
        cart.write(items.filter((i) => valid.has(i.productId)));
        CB.toast('Um item indisponível foi removido do carrinho.', 'error');
        return render();
      }
      const msg = [
        'Olá! Vim pelo site da Cardoso Baterias e gostaria de um orçamento destes itens:',
        ...qt.lines.map((l) => `• ${l.quantity}x ${l.name} (${l.sku}) — ${brl(l.total_cents)}`),
        `Subtotal: ${brl(qt.subtotal_cents)}`,
        'Meu veículo é [marca/modelo/ano].',
      ].join('\n');
      box.innerHTML = `<div class="two-col">
        <div class="panel">
          ${qt.problems.length ? `<div class="notice notice-danger">${qt.problems.map((p) => esc(p.message)).join('<br>')}</div>` : ''}
          ${qt.lines
            .map(
              (l) => `<div class="cart-line"><img src="${esc(asset(l.image))}" alt=""/>
              <div><a href="#/produto/${l.productId}"><strong>${esc(l.name)}</strong></a><div class="small muted">${esc(l.brand)} · ${esc(l.sku)} · ${brl(l.unit_price_cents)} un.</div>
                <div class="cl-actions"><div class="qty"><button data-dec="${l.productId}" aria-label="Diminuir">−</button><input value="${l.quantity}" data-set="${l.productId}" type="number" min="1" max="${l.available}" aria-label="Quantidade"/><button data-inc="${l.productId}" data-max="${l.available}" aria-label="Aumentar">+</button></div>
                <button class="btn btn-ghost btn-sm" data-rm="${l.productId}">Remover</button><span class="small muted">${l.available} disponível(is)</span></div></div>
              <strong class="nowrap">${brl(l.total_cents)}</strong></div>`
            )
            .join('')}
        </div>
        <aside class="panel sticky">
          <h3>Resumo</h3>
          <div class="summary-row"><span>Subtotal</span><strong>${brl(qt.subtotal_cents)}</strong></div>
          <div class="summary-row small muted"><span>Frete</span><span>${qt.delivery_enabled ? `${brl(qt.delivery_fee_cents)}${qt.delivery_free_above_cents ? ` (grátis acima de ${brl(qt.delivery_free_above_cents)})` : ''} — calculado no checkout` : 'Somente retirada'}</span></div>
          <div class="summary-row summary-total"><span>Total</span><span>${brl(qt.subtotal_cents)}</span></div>
          <div style="display:grid;gap:8px;margin-top:14px">
            <a class="btn btn-primary btn-block ${qt.problems.length ? '' : ''}" href="#/checkout" ${qt.problems.length ? 'aria-disabled="true" onclick="return false"' : ''}>Finalizar pedido</a>
            <a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(waLink(msg))}">Enviar carrinho pelo WhatsApp</a>
            <a class="btn btn-ghost btn-block" href="#/catalogo">Continuar comprando</a>
          </div>
          ${qt.problems.length ? '<p class="small" style="color:var(--danger)">Ajuste as quantidades para continuar.</p>' : ''}
        </aside></div>`;
      box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (cart.remove(Number(b.dataset.rm)), render())));
      box.querySelectorAll('[data-dec]').forEach(
        (b) =>
          (b.onclick = () => {
            const it = cart.read().find((i) => i.productId === Number(b.dataset.dec));
            if (it && it.quantity > 1) cart.set(it.productId, it.quantity - 1), render();
          })
      );
      box.querySelectorAll('[data-inc]').forEach(
        (b) =>
          (b.onclick = () => {
            const it = cart.read().find((i) => i.productId === Number(b.dataset.inc));
            if (it.quantity >= Number(b.dataset.max)) return CB.toast(`Disponível: ${b.dataset.max} unidade(s).`, 'error');
            cart.set(it.productId, it.quantity + 1), render();
          })
      );
      box.querySelectorAll('[data-set]').forEach(
        (i) =>
          (i.onchange = () => {
            const n = Math.floor(Number(i.value));
            if (!(n >= 1)) return CB.toast('Quantidade inválida.', 'error'), render();
            cart.set(Number(i.dataset.set), n), render();
          })
      );
    };
    render();
  }

  /* ---------------- Checkout ---------------- */
  async function pageCheckout() {
    const items = cart.read();
    if (!items.length) return (location.hash = '#/carrinho');
    app.innerHTML = `${pageTitle('Finalizar pedido', 'Modo de teste: nenhum valor será cobrado.')}
    <section class="section"><div class="container"><form id="co" novalidate class="two-col">
      <div class="panel">
        <div class="notice notice-info">🧪 <strong>Checkout de demonstração.</strong> Os pagamentos são simulados e nenhum valor será cobrado. Não informe dados reais de cartão.</div>
        <fieldset><legend>Seus dados</legend><div class="form-grid">
          <label class="full"><span class="lbl">Nome completo *</span><input name="name" required minlength="3" maxlength="120" autocomplete="name" data-msg="Informe seu nome (mínimo 3 letras)."/></label>
          <label><span class="lbl">Telefone/WhatsApp *</span><input name="phone" required data-phone inputmode="tel" autocomplete="tel" placeholder="(11) 90000-0000" data-msg="Informe o telefone com DDD."/></label>
          <label><span class="lbl">E-mail (opcional)</span><input name="email" type="email" autocomplete="email" data-msg="E-mail inválido."/></label>
          <label class="full"><span class="lbl">Veículo (opcional)</span><input name="vehicle" maxlength="120" placeholder="Ex.: Fiat Uno 2015 1.0"/></label>
        </div></fieldset>
        <fieldset><legend>Recebimento</legend><div class="option-cards" id="fulfill"></div></fieldset>
        <fieldset id="addr" hidden><legend>Endereço de entrega</legend><div class="form-grid">
          <label class="full"><span class="lbl">Rua *</span><input name="address_street" required maxlength="150" data-msg="Informe a rua."/></label>
          <label><span class="lbl">Número *</span><input name="address_number" required maxlength="20" data-msg="Informe o número."/></label>
          <label><span class="lbl">Complemento</span><input name="address_complement" maxlength="80"/></label>
          <label><span class="lbl">Bairro *</span><input name="address_district" required maxlength="80" data-msg="Informe o bairro."/></label>
          <label><span class="lbl">Cidade *</span><input name="address_city" required maxlength="80" data-msg="Informe a cidade."/></label>
          <label><span class="lbl">CEP</span><input name="address_zip" inputmode="numeric" pattern="\\d{5}-?\\d{3}" placeholder="00000-000" data-msg="CEP com 8 dígitos."/></label>
          <label><span class="lbl">Referência</span><input name="address_reference" maxlength="150"/></label>
        </div></fieldset>
        <fieldset><legend>Pagamento (simulado)</legend><div class="option-cards" id="paym"></div></fieldset>
        <label><span class="lbl">Observações</span><textarea name="notes" maxlength="500" placeholder="Algo que devemos saber?"></textarea></label>
      </div>
      <aside class="panel sticky" id="coSummary"></aside>
    </form></div></section>`;
    const form = document.getElementById('co');
    form.phone.addEventListener('input', (e) => (e.target.value = CB.maskPhone(e.target.value)));
    const fulfill = document.getElementById('fulfill');
    fulfill.innerHTML = `
      <label class="option-card ${S.pickup_enabled ? '' : 'disabled'}"><input type="radio" name="fulfillment" value="retirada" ${S.pickup_enabled ? 'checked' : 'disabled'}/><span>Retirada na loja<small>${esc(S.pickup_instructions)}</small></span></label>
      <label class="option-card ${S.delivery_enabled ? '' : 'disabled'}"><input type="radio" name="fulfillment" value="entrega" ${S.delivery_enabled ? (S.pickup_enabled ? '' : 'checked') : 'disabled'}/><span>Entrega<small>${S.delivery_enabled ? `Frete demonstrativo: ${brl(S.delivery_fee_cents)}${S.delivery_free_above_cents ? ` · grátis acima de ${brl(S.delivery_free_above_cents)}` : ''}` : 'Indisponível no momento'}</small></span></label>`;
    const paym = document.getElementById('paym');
    paym.innerHTML = `
      <label class="option-card"><input type="radio" name="paymentMethod" value="pix" checked/><span>Pix demonstrativo<small>QR Code ilustrativo, sem cobrança</small></span></label>
      <label class="option-card"><input type="radio" name="paymentMethod" value="cartao"/><span>Cartão simulado<small>Sem dados de cartão</small></span></label>
      <label class="option-card" id="payPickup"><input type="radio" name="paymentMethod" value="retirada"/><span>Pagar na retirada<small>Pague no balcão</small></span></label>`;

    let busy = false;
    const summary = document.getElementById('coSummary');
    async function refresh() {
      const f = CB.formData(form);
      const isDelivery = f.fulfillment === 'entrega';
      document.getElementById('addr').hidden = !isDelivery;
      document.querySelectorAll('#addr input').forEach((i) => (i.disabled = !isDelivery));
      const pp = document.getElementById('payPickup');
      pp.classList.toggle('disabled', isDelivery);
      pp.querySelector('input').disabled = isDelivery;
      if (isDelivery && f.paymentMethod === 'retirada') form.querySelector('[value=pix]').checked = true;
      try {
        const qt = await CB.post('/api/public/cart/quote', { items: cart.read(), fulfillment: f.fulfillment });
        summary.innerHTML = `<h3>Resumo do pedido</h3>
          ${qt.lines.map((l) => `<div class="summary-row small"><span>${l.quantity}x ${esc(l.name)}</span><span class="nowrap">${brl(l.total_cents)}</span></div>`).join('')}
          <div class="summary-row" style="border-top:1px solid var(--gray-100);margin-top:6px"><span>Subtotal</span><strong>${brl(qt.subtotal_cents)}</strong></div>
          <div class="summary-row"><span>Frete ${isDelivery ? '(demonstrativo)' : ''}</span><strong>${isDelivery ? (qt.shipping_cents ? brl(qt.shipping_cents) : 'Grátis') : 'Retirada'}</strong></div>
          <div class="summary-row summary-total"><span>Total</span><span>${brl(qt.total_cents)}</span></div>
          ${qt.problems.length ? `<div class="notice notice-danger">${qt.problems.map((p) => esc(p.message)).join('<br>')}<br><a href="#/carrinho">Ajustar carrinho</a></div>` : ''}
          <button class="btn btn-primary btn-block" type="submit" ${qt.problems.length ? 'disabled' : ''} style="margin-top:12px">Confirmar pedido de teste</button>
          <p class="small muted" style="margin-top:8px">Ao confirmar, o estoque fica reservado por ${S.reservation_hours}h aguardando o pagamento.</p>`;
      } catch (e) {
        summary.innerHTML = CB.errorState(e);
      }
    }
    form.addEventListener('change', (e) => ['fulfillment', 'paymentMethod'].includes(e.target.name) && refresh());
    refresh();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      if (!CB.validateForm(form)) return CB.toast('Verifique os campos destacados.', 'error');
      const f = CB.formData(form);
      const body = {
        name: f.name,
        phone: f.phone,
        email: f.email,
        vehicle: f.vehicle,
        fulfillment: f.fulfillment,
        paymentMethod: f.paymentMethod,
        notes: f.notes,
        items: cart.read(),
      };
      if (f.fulfillment === 'entrega') {
        body.address = { street: f.address_street, number: f.address_number, complement: f.address_complement, district: f.address_district, city: f.address_city, zip: f.address_zip, reference: f.address_reference };
      }
      busy = true;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Enviando…';
      try {
        const o = await CB.post('/api/public/orders', body);
        cart.clear();
        rememberOrder(o);
        CB.toast(`Pedido ${o.code} criado!`);
        location.hash = `#/pedido/${o.code}?t=${o.access_token}&novo=1`;
      } catch (err) {
        CB.showErrors(form, err);
        CB.toast(err.message, 'error', 6000);
        btn.disabled = false;
        btn.textContent = 'Confirmar pedido de teste';
        if (err.status === 409) refresh();
      } finally {
        busy = false;
      }
    });
  }

  function rememberOrder(o) {
    try {
      const list = JSON.parse(localStorage.getItem('cb_my_orders') || '[]').filter((x) => x.code !== o.code);
      list.unshift({ code: o.code, token: o.access_token, at: o.created_at });
      localStorage.setItem('cb_my_orders', JSON.stringify(list.slice(0, 10)));
    } catch (e) {}
  }

  /* ---------------- Pedido / pagamento demonstrativo ---------------- */
  const statusBadge = (s) =>
    `<span class="badge ${{ aguardando_pagamento: 'badge-warn', confirmado: 'badge-info', em_preparacao: 'badge-info', concluido: 'badge-ok', cancelado: 'badge-danger' }[s] || ''}">${esc(CB.STATUS[s] || s)}</span>`;
  const payBadge = (s) => `<span class="badge ${{ pendente: 'badge-warn', aprovado: 'badge-ok', recusado: 'badge-danger', estornado: '' }[s] || ''}">Pagamento: ${esc(CB.PAY_STATUS[s] || s)}</span>`;

  function renderOrder(o, { isNew = false } = {}) {
    const canPay = ['pix', 'cartao'].includes(o.payment_method) && ['pendente', 'recusado'].includes(o.payment_status) && o.status !== 'cancelado';
    return `
      ${isNew ? `<div class="notice notice-ok"><strong>Pedido recebido!</strong> Guarde o código <strong>${esc(o.code)}</strong>. O estoque foi reservado para você.</div>` : ''}
      <div class="two-col">
        <div class="panel">
          <div class="order-status" style="margin-bottom:10px">${statusBadge(o.status)} ${payBadge(o.payment_status)}</div>
          <h2 style="margin-bottom:4px">Pedido ${esc(o.code)}</h2>
          <p class="muted small">Criado em ${CB.dt(o.created_at)} · ${o.fulfillment === 'entrega' ? 'Entrega' : 'Retirada na loja'} · ${esc(CB.PAY_METHOD[o.payment_method] || o.payment_method)}</p>
          ${o.status === 'aguardando_pagamento' && o.expires_at ? `<p class="small">Reserva válida até <strong>${CB.dt(o.expires_at)}</strong>.</p>` : ''}
          ${canPay ? payDemo(o) : ''}
          ${o.payment_method === 'retirada' && o.payment_status === 'pendente' && o.status !== 'cancelado' ? '<div class="notice notice-info">Pagamento na retirada: pague no balcão ao buscar o produto. A loja registra o pagamento no sistema.</div>' : ''}
          <h3 style="margin-top:18px">Itens</h3>
          ${o.items.map((i) => `<div class="summary-row"><span>${i.quantity}x ${esc(i.name)} <span class="small muted">(${esc(i.sku)} · garantia ${i.warranty_months}m)</span></span><strong class="nowrap">${brl(i.total_cents)}</strong></div>`).join('')}
          <div class="summary-row" style="border-top:1px solid var(--gray-100);margin-top:6px"><span>Subtotal</span><span>${brl(o.subtotal_cents)}</span></div>
          ${o.shipping_cents ? `<div class="summary-row"><span>Frete</span><span>${brl(o.shipping_cents)}</span></div>` : ''}
          ${o.discount_cents ? `<div class="summary-row"><span>Desconto</span><span>− ${brl(o.discount_cents)}</span></div>` : ''}
          <div class="summary-row summary-total"><span>Total</span><span>${brl(o.total_cents)}</span></div>
          ${o.address ? `<p class="small" style="margin-top:12px"><strong>Entrega:</strong> ${esc(o.address)}</p>` : ''}
        </div>
        <aside class="panel">
          <h3>Atendimento</h3>
          <p class="small">Envie o resumo do pedido para a loja. <strong>O envio pelo WhatsApp não confirma o pagamento.</strong></p>
          <a class="btn btn-wa btn-block" target="_blank" rel="noopener" href="${esc(o.whatsapp_url)}">Enviar resumo pelo WhatsApp</a>
          <h3 style="margin-top:22px">Histórico</h3>
          <ul class="timeline">${o.events.map((e) => `<li><strong>${CB.dt(e.created_at)}</strong><br>${esc(e.description)}</li>`).join('')}</ul>
        </aside>
      </div>`;
  }

  function payDemo(o) {
    const head = '<div class="demo-flag" style="margin-bottom:8px">SIMULAÇÃO — nenhum valor será cobrado</div>';
    const refused = o.payment_status === 'recusado' ? '<div class="notice notice-danger">A última tentativa foi recusada (simulação). Você pode tentar novamente.</div>' : '';
    if (o.payment_method === 'pix') {
      return `<div class="pay-demo">${head}${refused}<h3>Pix demonstrativo</h3>
        <div class="fake-qr" aria-label="QR Code ilustrativo, não é um Pix real"><span>ILUSTRATIVO<br>NÃO É PIX REAL</span></div>
        <p class="small muted" style="text-align:center">Este QR Code é apenas ilustrativo e não pode ser pago.<br>Valor: <strong>${brl(o.total_cents)}</strong></p>
        <div class="buy-row" style="justify-content:center"><button class="btn btn-primary" data-sim="aprovado">Simular pagamento aprovado</button><button class="btn btn-ghost" data-sim="recusado">Simular recusa</button></div></div>`;
    }
    return `<div class="pay-demo">${head}${refused}<h3>Cartão simulado</h3>
      <div class="fake-card" aria-hidden="true"><div class="chip-gold"></div><div>•••• •••• •••• 0000</div><div style="display:flex;justify-content:space-between;font-size:.8rem"><span>CARTÃO DE TESTE</span><span>--/--</span></div></div>
      <p class="small muted" style="text-align:center">Nenhum dado de cartão é solicitado ou armazenado. Escolha o resultado da simulação:</p>
      <div class="buy-row" style="justify-content:center"><button class="btn btn-primary" data-sim="aprovado">Simular aprovação</button><button class="btn btn-ghost" data-sim="recusado">Simular recusa</button></div></div>`;
  }

  async function pageOrder(code, q) {
    const token = q.t;
    const box = () => document.getElementById('orderBox');
    app.innerHTML = `${pageTitle('Seu pedido', '')}<section class="section"><div class="container" id="orderBox"></div></section>`;
    const load = async (isNew) => {
      CB.loading(box());
      try {
        const o = await CB.get(`/api/public/orders/${encodeURIComponent(code)}`, { token });
        box().innerHTML = renderOrder(o, { isNew });
        box().querySelectorAll('[data-sim]').forEach(
          (b) =>
            (b.onclick = async () => {
              b.disabled = true;
              try {
                const r = await CB.post(`/api/public/orders/${encodeURIComponent(code)}/simulate-payment`, { token, outcome: b.dataset.sim });
                CB.toast(r.payment_status === 'aprovado' ? 'Pagamento aprovado (simulação). Pedido confirmado!' : 'Pagamento recusado (simulação).', r.payment_status === 'aprovado' ? 'ok' : 'error');
                load(false);
              } catch (e) {
                CB.toast(e.message, 'error');
                b.disabled = false;
              }
            })
        );
      } catch (e) {
        box().innerHTML = CB.errorState(e) + '<p style="text-align:center"><a class="btn btn-ghost" href="#/consultar-pedido">Consultar pedido</a></p>';
      }
    };
    load(q.novo === '1');
  }

  function pageLookup() {
    let mine = [];
    try {
      mine = JSON.parse(localStorage.getItem('cb_my_orders') || '[]');
    } catch (e) {}
    app.innerHTML = `${pageTitle('Consultar pedido', 'Informe o código do pedido e o telefone usado na compra.')}
    <section class="section"><div class="container">
      <form class="panel" id="lk" novalidate style="max-width:560px">
        <div class="form-grid">
          <label class="full"><span class="lbl">Código do pedido *</span><input name="code" required placeholder="CB000000-XXXXX" style="text-transform:uppercase" data-msg="Informe o código."/></label>
          <label class="full"><span class="lbl">Telefone *</span><input name="phone" required data-phone inputmode="tel" placeholder="(11) 90000-0000" data-msg="Informe o telefone com DDD."/></label>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" type="submit">Consultar</button>
      </form>
      ${mine.length ? `<div class="panel" style="max-width:560px;margin-top:16px"><h3>Pedidos feitos neste navegador</h3>${mine.map((m) => `<div class="summary-row"><a href="#/pedido/${esc(m.code)}?t=${esc(m.token)}">${esc(m.code)}</a><span class="small muted">${CB.dt(m.at)}</span></div>`).join('')}</div>` : ''}
      <div id="lkResult" style="margin-top:20px"></div>
    </div></section>`;
    const f = document.getElementById('lk');
    f.phone.addEventListener('input', (e) => (e.target.value = CB.maskPhone(e.target.value)));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!CB.validateForm(f)) return;
      const res = document.getElementById('lkResult');
      CB.loading(res, 'Consultando…');
      try {
        const o = await CB.post('/api/public/orders/lookup', { code: f.code.value.trim().toUpperCase(), phone: f.phone.value });
        location.hash = `#/pedido/${o.code}?t=${o.access_token}`;
      } catch (err) {
        res.innerHTML = `<div class="notice notice-danger">${esc(err.message)}</div>`;
      }
    });
  }

  /* ---------------- Roteador ---------------- */
  const routes = [
    [/^\/?$/, pageHome],
    [/^\/catalogo$/, (m, q) => pageCatalog(q)],
    [/^\/produto\/(\d+)$/, (m) => pageProduct(m[1])],
    [/^\/servicos$/, pageServices],
    [/^\/sobre$/, pageAbout],
    [/^\/galeria$/, (m, q) => pageGallery(q)],
    [/^\/duvidas$/, pageFaq],
    [/^\/contato$/, pageContact],
    [/^\/carrinho$/, pageCart],
    [/^\/checkout$/, pageCheckout],
    [/^\/pedido\/([A-Z0-9-]+)$/i, (m, q) => pageOrder(m[1], q)],
    [/^\/consultar-pedido$/, pageLookup],
  ];

  async function router() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    document.getElementById('mainNav').classList.remove('open');
    document.querySelectorAll('.main-nav a').forEach((a) => {
      const href = a.getAttribute('href').slice(1);
      a.classList.toggle('active', href === path || (href !== '/' && path.startsWith(href)));
    });
    document.title = 'Cardoso Baterias — Baterias automotivas';
    const r = routes.find(([re]) => re.test(path));
    window.scrollTo(0, 0);
    if (!r) {
      app.innerHTML = `${pageTitle('Página não encontrada')}<section class="section"><div class="container">${CB.empty('A página que você procura não existe.', '<a class="btn btn-primary" href="#/">Voltar ao início</a>')}</div></section>`;
      return;
    }
    if (!app.firstElementChild || !app.querySelector('.page-title, .hero')) CB.loading(app);
    try {
      await r[1](path.match(r[0]), q);
    } catch (e) {
      console.error(e);
      app.innerHTML = `<section class="section"><div class="container">${CB.errorState(e, true)}</div></section>`;
      const b = app.querySelector('[data-retry]');
      if (b) b.onclick = router;
    }
  }

  function applySettings() {
    document.getElementById('logo').src = asset(S.logo_on_dark_url);
    document.getElementById('footerLogo').src = asset(S.logo_on_dark_url);
    const wa = waLink('Olá! Vim pelo site da Cardoso Baterias e gostaria de atendimento.');
    document.getElementById('waFab').href = wa;
    document.getElementById('headerWa').href = waLink('Olá! Vim pelo site da Cardoso Baterias e gostaria de um orçamento. Meu veículo é [marca/modelo/ano].');
    document.getElementById('footerContact').innerHTML = `
      <li><a href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp ${esc(S.whatsapp_display)}</a></li>
      ${S.email ? `<li>${esc(S.email)}</li>` : ''}
      <li>${esc(S.address)}</li>
      <li class="small">Área: ${esc(S.service_area)}</li>`;
    document.getElementById('footerHours').innerHTML = CB.nl2br(S.business_hours);
    document.getElementById('footerSocial').innerHTML = [
      ['Instagram', S.instagram_url],
      ['Facebook', S.facebook_url],
      ['TikTok', S.tiktok_url],
    ]
      .filter(([, u]) => u)
      .map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`)
      .join(' · ');
    document.getElementById('footerNote').textContent = `© ${new Date().getFullYear()} ${S.store_name}${S.cnpj ? ` · CNPJ ${S.cnpj}` : ''} · ${S.footer_note}`;
  }

  async function start() {
    updateCartCount();
    document.getElementById('menuToggle').onclick = (e) => {
      const nav = document.getElementById('mainNav');
      nav.classList.toggle('open');
      e.currentTarget.setAttribute('aria-expanded', nav.classList.contains('open'));
    };
    try {
      S = await CB.get('/api/public/settings');
      CB.settings = S;
      applySettings();
    } catch (e) {
      app.innerHTML = `<section class="section"><div class="container">${CB.errorState(e)}<p class="muted" style="text-align:center">Não foi possível iniciar o banco de dados local. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari).</p></div></section>`;
      return;
    }
    window.addEventListener('hashchange', router);
    window.addEventListener('storage', (e) => e.key === CART_KEY && updateCartCount());
    router();
    if (CB.initChat) CB.initChat({ settings: S, waLink });
  }
  CB.cart = cart;
  start();
})();
