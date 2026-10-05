/* Cardoso Baterias — painel administrativo */
(function () {
  'use strict';
  const { esc, brl, asset } = CB;
  const root = document.getElementById('root');
  let USER = null;
  let content = null;

  const DEMO_EMAIL = 'admin@cardosobaterias.demo';
  const DEMO_PASS = 'Cardoso@2026';

  CB.onUnauthorized = () => {
    if (USER) {
      USER = null;
      CB.setToken(null);
      CB.toast('Sessão expirada. Entre novamente.', 'error');
      renderLogin();
    }
  };

  /* ================= Login ================= */
  function renderLogin() {
    root.innerHTML = `<div class="login-wrap"><form class="login-card" id="login" novalidate>
      <img src="${asset('img/logo-transparent.png')}" alt="Cardoso Baterias"/>
      <h1>Painel administrativo</h1>
      <div class="form-grid" style="grid-template-columns:1fr">
        <label><span class="lbl">E-mail</span><input name="email" type="email" required autocomplete="username" data-msg="Informe um e-mail válido."/></label>
        <label><span class="lbl">Senha</span><input name="password" type="password" required autocomplete="current-password" data-msg="Informe a senha."/></label>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:16px" type="submit">Entrar</button>
      <div class="demo-creds"><strong>Credenciais de demonstração</strong><br>E-mail: <code>${DEMO_EMAIL}</code><br>Senha: <code>${DEMO_PASS}</code><br><button type="button" class="btn btn-ghost btn-sm" id="fillDemo" style="margin-top:8px">Preencher automaticamente</button></div>
      <p class="small muted" style="text-align:center;margin-top:14px"><a href="../">← Voltar para a loja</a></p>
    </form></div>`;
    const f = document.getElementById('login');
    document.getElementById('fillDemo').onclick = () => ((f.email.value = DEMO_EMAIL), (f.password.value = DEMO_PASS));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!CB.validateForm(f)) return;
      const b = f.querySelector('[type=submit]');
      b.disabled = true;
      b.innerHTML = '<span class="spinner"></span> Entrando…';
      try {
        const r = await CB.post('/api/auth/login', { email: f.email.value, password: f.password.value });
        CB.setToken(r.token);
        USER = r.user;
        renderShell();
      } catch (err) {
        CB.toast(err.message, 'error');
        b.disabled = false;
        b.textContent = 'Entrar';
      }
    });
  }

  /* ================= Estrutura ================= */
  const NAV = [
    ['Visão geral', [['#/', '📊', 'Dashboard']]],
    ['Vendas', [['#/pedidos', '🧾', 'Pedidos'], ['#/venda', '➕', 'Nova venda (balcão)'], ['#/clientes', '👥', 'Clientes']]],
    ['Catálogo e estoque', [['#/produtos', '🔋', 'Produtos'], ['#/estoque', '📦', 'Estoque'], ['#/marcas', '🏷️', 'Marcas'], ['#/categorias', '🗂️', 'Categorias'], ['#/fornecedores', '🚚', 'Fornecedores']]],
    ['Site', [['#/lojas', '🏪', 'Lojas / unidades'], ['#/conteudo', '📝', 'Textos institucionais'], ['#/banners', '🖼️', 'Banners'], ['#/servicos', '🔧', 'Serviços'], ['#/galeria', '📷', 'Galeria'], ['#/faq', '❓', 'Perguntas frequentes']]],
    ['Gestão', [['#/relatorios', '📈', 'Relatórios'], ['#/configuracoes', '⚙️', 'Configurações'], ['#/demo', '🧪', 'Demonstração']]],
  ];

  async function renderShell() {
    const b = await CB.backend();
    root.innerHTML = `<div class="layout">
      <aside class="sidebar" id="sidebar">
        <a class="logo" href="#/"><img src="${asset('img/logo-on-dark.png')}" alt="Cardoso Baterias"/><small>Painel administrativo</small></a>
        ${NAV.map(([g, items]) => `<div class="side-group">${g}</div>${items.map(([h, i, l]) => `<a href="${h}" data-nav="${h}"><span aria-hidden="true">${i}</span>${l}</a>`).join('')}`).join('')}
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn side-toggle" id="sideToggle" aria-label="Menu">☰</button>
          <h1 id="pageTitle">Dashboard</h1>
          <span class="spacer"></span>
          <span class="mode-pill hide-sm" title="${b.mode === 'browser' ? 'Banco SQLite salvo neste navegador (IndexedDB)' : 'Banco SQLite no servidor'}">${b.mode === 'browser' ? 'DEMO · banco no navegador' : 'DEMO · servidor'}</span>
          <a class="btn btn-ghost btn-sm hide-sm" href="../" target="_blank">Ver loja ↗</a>
          <span class="small hide-sm">${esc(USER.name)}</span>
          <button class="btn btn-dark btn-sm" id="logout">Sair</button>
        </header>
        <div class="content" id="content"></div>
      </div></div>`;
    content = document.getElementById('content');
    document.getElementById('logout').onclick = async () => {
      try {
        await CB.post('/api/auth/logout', {});
      } catch (e) {}
      CB.setToken(null);
      USER = null;
      location.hash = '#/';
      renderLogin();
    };
    document.getElementById('sideToggle').onclick = () => document.getElementById('sidebar').classList.toggle('open');
    route();
  }

  const setTitle = (t) => {
    document.getElementById('pageTitle').textContent = t;
    document.title = `${t} — Painel Cardoso Baterias`;
  };

  /* ================= Helpers ================= */
  const statusBadge = (s) =>
    `<span class="badge ${{ aguardando_pagamento: 'badge-warn', confirmado: 'badge-info', em_preparacao: 'badge-info', concluido: 'badge-ok', cancelado: 'badge-danger' }[s] || ''}">${esc(CB.STATUS[s] || s)}</span>`;
  const payBadge = (s) => `<span class="badge ${{ pendente: 'badge-warn', aprovado: 'badge-ok', recusado: 'badge-danger', estornado: '' }[s] || ''}">${esc(CB.PAY_STATUS[s] || s)}</span>`;
  const stockBadge = (p) =>
    p.available_qty <= 0 ? '<span class="badge badge-danger">Esgotado</span>' : p.available_qty <= p.min_stock ? '<span class="badge badge-warn">Baixo</span>' : '<span class="badge badge-ok">OK</span>';
  const signed = (n) => (n > 0 ? `<span class="mov-pos">+${n}</span>` : n < 0 ? `<span class="mov-neg">${n}</span>` : '0');

  async function guard(fn) {
    try {
      return await fn();
    } catch (e) {
      if (e.status !== 401) CB.toast(e.message, 'error', 6000);
      throw e;
    }
  }

  function periodToolbar(q, { status = false } = {}) {
    return `<form class="toolbar" id="period">
      <label><span class="lbl">Período</span><select name="preset">
        ${[['hoje', 'Hoje'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['mes', 'Este mês'], ['tudo', 'Todo o período'], ['custom', 'Personalizado']].map(([v, l]) => `<option value="${v}" ${q.preset === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <label><span class="lbl">De</span><input type="date" name="from" value="${esc(q.from || '')}"/></label>
      <label><span class="lbl">Até</span><input type="date" name="to" value="${esc(q.to || '')}"/></label>
      ${status ? `<label><span class="lbl">Status</span><select name="status"><option value="">Todos</option>${Object.entries(CB.STATUS).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
      <button class="btn btn-dark btn-sm" type="submit">Aplicar</button>
    </form>`;
  }
  function presetRange(p) {
    const today = CB.todayKey();
    if (p === 'hoje') return { from: today, to: today };
    if (p === '7') return { from: CB.todayKey(-6), to: today };
    if (p === '30') return { from: CB.todayKey(-29), to: today };
    if (p === 'mes') return { from: today.slice(0, 8) + '01', to: today };
    if (p === 'tudo') return { from: '', to: '' };
    return null;
  }
  function bindPeriod(q, onApply) {
    const f = document.getElementById('period');
    f.preset.onchange = () => {
      const r = presetRange(f.preset.value);
      if (r) (f.from.value = r.from), (f.to.value = r.to);
    };
    f.from.oninput = f.to.oninput = () => (f.preset.value = 'custom');
    f.onsubmit = (e) => {
      e.preventDefault();
      onApply(CB.formData(f));
    };
  }
  const withPeriodDefaults = (q, preset = '30') => {
    if (q.from || q.to || q.preset) return { preset: q.preset || 'custom', ...q };
    return { preset, ...presetRange(preset), ...q };
  };
  const setQuery = (path, q) => {
    const clean = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v !== undefined && v !== null));
    const h = `#${path}${Object.keys(clean).length ? '?' + new URLSearchParams(clean) : ''}`;
    if (location.hash === h) route();
    else location.hash = h;
  };

  /* ================= Dashboard ================= */
  async function pageDashboard(q) {
    setTitle('Dashboard');
    q = withPeriodDefaults(q, '30');
    content.innerHTML = periodToolbar(q) + '<div id="dash"></div>';
    bindPeriod(q, (v) => setQuery('/', v));
    const box = document.getElementById('dash');
    CB.loading(box);
    const d = await CB.get('/api/admin/dashboard', { from: q.from, to: q.to });
    const k = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><div class="k-label">${label}</div><div class="k-value">${value}</div><div class="k-sub">${sub}</div></div>`;
    const pend = Object.fromEntries(d.pending.by_status.map((r) => [r.status, r.count]));
    box.innerHTML = `
      <div class="kpis">
        ${k('Vendas de hoje', brl(d.today.sales.total_cents), `${d.today.sales.count} venda(s) concluída(s)`, 'k-ok')}
        ${k('Vendas do mês', brl(d.month.sales.total_cents), `${d.month.sales.count} venda(s) concluída(s)`, 'k-ok')}
        ${k('Pedidos pendentes', d.pending.total, `${pend.aguardando_pagamento || 0} aguardando pgto · ${pend.confirmado || 0} confirmados · ${pend.em_preparacao || 0} em preparação`, 'k-warn')}
        ${k('Estoque baixo', d.stock.low.length, 'produtos no mínimo ou abaixo', d.stock.low.length ? 'k-warn' : '')}
        ${k('Esgotados', d.stock.out.length, 'produtos ativos sem disponível', d.stock.out.length ? 'k-danger' : '')}
        ${k('Valor do estoque (custo)', brl(d.stock.value_cost_cents), `${d.stock.units} un. físicas · ${d.stock.reserved_units} reservadas`, 'k-dark')}
      </div>
      <div class="card"><div class="card-head"><h2>No período selecionado</h2><span class="small muted">${q.from ? CB.d(q.from + 'T12:00') : 'início'} a ${q.to ? CB.d(q.to + 'T12:00') : 'hoje'}</span></div>
        <div class="kpis" style="margin:0">
          ${k('Pedidos criados', d.range.created.count, `${brl(d.range.created.total_cents)} em pedidos · ${d.range.created.canceled} cancelado(s)`, 'k-dark')}
          ${k('Vendas concluídas', brl(d.range.sales.total_cents), `${d.range.sales.count} venda(s) · lucro bruto ${brl(d.range.gross_profit_cents)}`, 'k-ok')}
          ${k('Pagamentos recebidos', brl(d.range.payments.net_cents), `${d.range.payments.count} aprovado(s)${d.range.payments.refunded_cents ? ` · estornos ${brl(d.range.payments.refunded_cents)}` : ''}`, '')}
          ${k('Cancelamentos', d.range.canceled, 'pedidos cancelados no período', d.range.canceled ? 'k-danger' : '')}
        </div>
        <p class="small muted" style="margin:10px 0 0">Pedidos criados = entrada de pedidos (site e balcão). Vendas concluídas = pedidos com baixa de estoque. Pagamentos recebidos = aprovações registradas, menos estornos.</p>
      </div>
      <div class="grid-2">
        <div class="card"><h2>Vendas concluídas por dia</h2>${chart(d.series)}</div>
        <div class="card"><h2>Mais vendidos no período</h2>${d.top_products.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Total</th></tr></thead><tbody>${d.top_products.map((t) => `<tr><td>${esc(t.name)}<br><span class="small muted">${esc(t.sku)}</span></td><td class="num">${t.quantity}</td><td class="num">${brl(t.total_cents)}</td></tr>`).join('')}</tbody></table></div>` : CB.empty('Nenhuma venda concluída no período.')}</div>
      </div>
      <div class="grid-2">
        <div class="card"><div class="card-head"><h2>Estoque por loja</h2><a class="btn btn-ghost btn-sm" href="#/estoque">Ver posição</a></div>
          ${(d.stock_by_store || []).length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Loja</th><th class="num">Físico</th><th class="num">Reservado</th><th class="num">Valor (custo)</th><th class="num">Itens zerados</th></tr></thead><tbody>${d.stock_by_store.map((st) => `<tr><td>${esc(st.name)}</td><td class="num">${st.units}</td><td class="num">${st.reserved}</td><td class="num">${brl(st.value_cost_cents)}</td><td class="num">${st.zero_items || 0}</td></tr>`).join('')}</tbody></table></div>` : CB.empty('Nenhuma loja cadastrada.')}
        </div>
        <div class="card"><div class="card-head"><h2>Estoque baixo e esgotados</h2><a class="btn btn-ghost btn-sm" href="#/estoque">Registrar entrada</a></div>
          ${d.stock.low.length + d.stock.out.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th class="num">Físico</th><th class="num">Reservado</th><th class="num">Disponível</th><th class="num">Mínimo</th></tr></thead><tbody>${[...d.stock.out, ...d.stock.low]
            .map((p) => `<tr><td><a href="#/produtos/${p.id}">${esc(p.name)}</a> ${p.available_qty <= 0 ? '<span class="badge badge-danger">Esgotado</span>' : '<span class="badge badge-warn">Baixo</span>'}</td><td class="num">${p.stock_qty}</td><td class="num">${p.reserved_qty}</td><td class="num"><strong>${p.available_qty}</strong></td><td class="num">${p.min_stock}</td></tr>`)
            .join('')}</tbody></table></div>` : CB.empty('Nenhum produto com estoque baixo.')}
        </div>
        <div class="card"><div class="card-head"><h2>Últimas movimentações</h2><a class="btn btn-ghost btn-sm" href="#/estoque">Histórico completo</a></div>${movTable(d.recent_movements, true)}</div>
      </div>`;
  }

  function chart(series) {
    if (!series.length) return CB.empty('Selecione um período com data inicial e final para ver o gráfico.');
    const W = 640;
    const H = 220;
    const pad = { l: 56, r: 8, t: 10, b: 28 };
    const max = Math.max(...series.map((s) => s.sales_cents), 1);
    const bw = (W - pad.l - pad.r) / series.length;
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
    const every = Math.ceil(series.length / 10);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vendas concluídas por dia">
      ${ticks.map((t) => `<line class="axis" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 3}" text-anchor="end">${t ? 'R$ ' + Math.round(t / 100).toLocaleString('pt-BR') : '0'}</text>`).join('')}
      ${series
        .map((s, i) => {
          const h = H - pad.b - y(s.sales_cents);
          return `<rect class="bar" x="${pad.l + i * bw + bw * 0.15}" y="${y(s.sales_cents)}" width="${Math.max(bw * 0.7, 1)}" height="${Math.max(h, s.sales_cents ? 2 : 0)}" rx="2"><title>${s.day.split('-').reverse().join('/')}: ${brl(s.sales_cents)} (${s.sales_count} venda(s), ${s.created_count} pedido(s) criado(s))</title></rect>${i % every === 0 ? `<text x="${pad.l + i * bw + bw / 2}" y="${H - 10}" text-anchor="middle">${s.day.slice(8)}/${s.day.slice(5, 7)}</text>` : ''}`;
        })
        .join('')}
    </svg><div class="legend"><span><i style="background:var(--yellow)"></i>Vendas concluídas (R$) — passe o mouse para detalhes</span></div>`;
  }

  function movTable(list, compact = false) {
    if (!list.length) return CB.empty('Nenhuma movimentação.');
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Produto</th><th>Loja</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Δ Físico</th><th class="num">Δ Reserva</th>${compact ? '' : '<th class="num">Físico após (loja)</th><th>Motivo</th>'}<th>Responsável</th></tr></thead><tbody>${list
      .map(
        (m) => `<tr><td class="nowrap">${CB.dt(m.created_at)}</td><td>${esc(m.product_name)}<br><span class="small muted">${esc(m.product_sku)}</span></td><td class="small">${esc((m.store_name || '').replace(/^Cardoso Baterias\s*/, ''))}</td><td><span class="badge">${esc(CB.MOV[m.type] || m.type)}</span>${m.order_code ? `<br><span class="small">${esc(m.order_code)}</span>` : ''}</td><td class="num">${m.quantity}</td><td class="num">${signed(m.stock_delta)}</td><td class="num">${signed(m.reserved_delta)}</td>${compact ? '' : `<td class="num">${m.stock_after}</td><td class="small">${esc(m.reason)}${m.supplier_name ? `<br><span class="muted">Fornecedor: ${esc(m.supplier_name)}</span>` : ''}</td>`}<td class="small">${esc(m.user_name)}</td></tr>`
      )
      .join('')}</tbody></table></div>`;
  }

  /* ================= Pedidos ================= */
  async function pageOrders(q) {
    setTitle('Pedidos');
    const limit = 25;
    const page = Math.max(1, Number(q.page) || 1);
    content.innerHTML = `<div class="card">
      <form class="toolbar" id="of">
        <label style="flex:1;min-width:200px"><span class="lbl">Buscar</span><input name="q" value="${esc(q.q || '')}" placeholder="Código, cliente ou telefone"/></label>
        <label><span class="lbl">Status</span><select name="status"><option value="">Todos</option><option value="abertos" ${q.status === 'abertos' ? 'selected' : ''}>Em aberto</option>${Object.entries(CB.STATUS).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span class="lbl">Pagamento</span><select name="paymentStatus"><option value="">Todos</option>${Object.entries(CB.PAY_STATUS).map(([k, v]) => `<option value="${k}" ${q.paymentStatus === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span class="lbl">Origem</span><select name="source"><option value="">Todas</option><option value="site" ${q.source === 'site' ? 'selected' : ''}>Site</option><option value="balcao" ${q.source === 'balcao' ? 'selected' : ''}>Balcão</option></select></label>
        <label><span class="lbl">De</span><input type="date" name="from" value="${esc(q.from || '')}"/></label>
        <label><span class="lbl">Até</span><input type="date" name="to" value="${esc(q.to || '')}"/></label>
        <button class="btn btn-dark btn-sm">Filtrar</button>
        <a class="btn btn-primary btn-sm" href="#/venda">+ Nova venda</a>
      </form><div id="olist"></div></div>`;
    document.getElementById('of').onsubmit = (e) => (e.preventDefault(), setQuery('/pedidos', CB.formData(e.target)));
    const box = document.getElementById('olist');
    CB.loading(box);
    const r = await CB.get('/api/admin/orders', { ...q, limit, offset: (page - 1) * limit });
    if (!r.items.length) return (box.innerHTML = CB.empty('Nenhum pedido encontrado.'));
    box.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Origem</th><th>Status</th><th>Pagamento</th><th class="num">Total</th><th></th></tr></thead><tbody>${r.items
      .map(
        (o) => `<tr><td><a href="#/pedidos/${o.id}"><strong>${esc(o.code)}</strong></a></td><td class="nowrap">${CB.dt(o.created_at)}</td><td>${esc(o.customer_name)}<br><span class="small muted">${esc(o.customer_phone)}</span></td><td>${o.source === 'site' ? 'Site' : 'Balcão'}<br><span class="small muted">${o.fulfillment === 'entrega' ? 'Entrega' : 'Retirada'}</span></td><td>${statusBadge(o.status)}</td><td>${payBadge(o.payment_status)}<br><span class="small muted">${esc(CB.PAY_METHOD[o.payment_method] || '')}</span></td><td class="num">${brl(o.total_cents)}</td><td><a class="btn btn-ghost btn-sm" href="#/pedidos/${o.id}">Abrir</a></td></tr>`
      )
      .join('')}</tbody></table></div>
      <div class="pager"><span>${r.total} pedido(s)</span>${page > 1 ? `<button class="btn btn-ghost btn-sm" data-p="${page - 1}">← Anterior</button>` : ''}${page * limit < r.total ? `<button class="btn btn-ghost btn-sm" data-p="${page + 1}">Próxima →</button>` : ''}</div>`;
    box.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => setQuery('/pedidos', { ...q, page: b.dataset.p })));
  }

  async function pageOrder(id) {
    setTitle('Pedido');
    CB.loading(content);
    const o = await CB.get(`/api/admin/orders/${id}`);
    setTitle(`Pedido ${o.code}`);
    const addr = o.fulfillment === 'entrega' ? [o.address_street && `${o.address_street}, ${o.address_number}`, o.address_complement, o.address_district, o.address_city, o.address_zip, o.address_reference && `Ref.: ${o.address_reference}`].filter(Boolean).join(' — ') : '';
    const nextLabels = { confirmado: 'Confirmar', em_preparacao: 'Em preparação', concluido: 'Concluir venda (baixa no estoque)', cancelado: o.status === 'concluido' ? 'Cancelar e devolver ao estoque' : 'Cancelar pedido' };
    content.innerHTML = `
      <p><a href="#/pedidos">← Pedidos</a></p>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><h2>${esc(o.code)}</h2><div>${statusBadge(o.status)} ${payBadge(o.payment_status)}</div></div>
          <dl class="dl">
            <dt>Origem</dt><dd>${o.source === 'site' ? 'Site (loja virtual)' : 'Balcão (painel)'} · criado por ${esc(o.created_by)}</dd>
            <dt>Criado em</dt><dd>${CB.dt(o.created_at)}</dd>
            ${o.status === 'aguardando_pagamento' ? `<dt>Reserva expira</dt><dd>${CB.dt(o.expires_at)}</dd>` : ''}
            ${o.paid_at ? `<dt>Pago em</dt><dd>${CB.dt(o.paid_at)}</dd>` : ''}
            ${o.completed_at ? `<dt>Concluído em</dt><dd>${CB.dt(o.completed_at)}</dd>` : ''}
            ${o.canceled_at ? `<dt>Cancelado em</dt><dd>${CB.dt(o.canceled_at)} ${o.cancel_reason ? `— ${esc(o.cancel_reason)}` : ''}</dd>` : ''}
            <dt>Estoque</dt><dd>${{ reservado: '<span class="badge badge-warn">Reservado</span>', baixado: '<span class="badge badge-ok">Baixado</span>', liberado: '<span class="badge">Reserva liberada</span>', devolvido: '<span class="badge">Devolvido</span>' }[o.stock_state]}</dd>
            <dt>Cliente</dt><dd>${esc(o.customer_name)}<br>${esc(o.customer_phone)} ${o.customer_email ? `· ${esc(o.customer_email)}` : ''}</dd>
            ${o.vehicle_info ? `<dt>Veículo</dt><dd>${esc(o.vehicle_info)}</dd>` : ''}
            <dt>Recebimento</dt><dd>${o.fulfillment === 'entrega' ? `Entrega<br>${esc(addr)}` : `Retirada${o.pickup_store_name ? ` — ${esc(o.pickup_store_name)}` : ' na loja'}`}</dd>
            <dt>Estoque da loja</dt><dd>${esc(o.stock_store_name || '—')}</dd>
            <dt>Pagamento</dt><dd>${esc(CB.PAY_METHOD[o.payment_method] || o.payment_method)}</dd>
            ${o.notes ? `<dt>Observações</dt><dd>${CB.nl2br(o.notes)}</dd>` : ''}
          </dl>
          <div style="margin-top:14px"><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${esc(o.whatsapp_url)}">WhatsApp do cliente</a></div>
        </div>
        <div class="card">
          <h2>Status do pedido</h2>
          ${o.allowed_status.length ? `<div class="status-actions">${o.allowed_status.map((s) => `<button class="btn ${s === 'cancelado' ? 'btn-ghost' : s === 'concluido' ? 'btn-primary' : 'btn-dark'} btn-sm" data-status="${s}">${esc(nextLabels[s])}</button>`).join('')}</div>` : '<p class="muted">Pedido cancelado — nenhuma ação disponível.</p>'}
          <p class="small muted" style="margin-top:8px">Concluir converte a reserva em saída. Cancelar libera a reserva (ou devolve ao estoque, se já concluído). Cada operação é registrada uma única vez.</p>
          <h2 style="margin-top:18px">Situação do pagamento</h2>
          <form class="toolbar" id="payForm">
            <label><span class="lbl">Situação</span><select name="status">${Object.entries(CB.PAY_STATUS).map(([k, v]) => `<option value="${k}" ${o.payment_status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label><span class="lbl">Forma</span><select name="method">${Object.entries(CB.PAY_METHOD).map(([k, v]) => `<option value="${k}" ${o.payment_method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label style="flex:1"><span class="lbl">Observação</span><input name="note" maxlength="200" placeholder="Ex.: recebido no balcão"/></label>
            <button class="btn btn-dark btn-sm">Registrar</button>
          </form>
          <p class="small muted">A situação do pagamento é independente do status do pedido. Enviar o resumo pelo WhatsApp não marca o pedido como pago.</p>
        </div>
      </div>
      <div class="card"><h2>Itens (preços no momento da compra)</h2><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>SKU</th><th class="num">Qtd.</th><th class="num">Preço un.</th><th class="num">Custo un.</th><th class="num">Total</th></tr></thead><tbody>
        ${o.items.map((i) => `<tr><td><a href="#/produtos/${i.product_id}">${esc(i.name)}</a><br><span class="small muted">${esc(i.brand)} · ${i.capacity_ah}Ah · garantia ${i.warranty_months}m</span></td><td>${esc(i.sku)}</td><td class="num">${i.quantity}</td><td class="num">${brl(i.unit_price_cents)}</td><td class="num">${brl(i.unit_cost_cents)}</td><td class="num">${brl(i.total_cents)}</td></tr>`).join('')}
        <tr><td colspan="5" class="num">Subtotal</td><td class="num">${brl(o.subtotal_cents)}</td></tr>
        ${o.shipping_cents ? `<tr><td colspan="5" class="num">Frete</td><td class="num">${brl(o.shipping_cents)}</td></tr>` : ''}
        ${o.discount_cents ? `<tr><td colspan="5" class="num">Desconto</td><td class="num">− ${brl(o.discount_cents)}</td></tr>` : ''}
        <tr><td colspan="5" class="num"><strong>Total</strong></td><td class="num"><strong>${brl(o.total_cents)}</strong></td></tr>
      </tbody></table></div></div>
      <div class="grid-2">
        <div class="card"><h2>Histórico do pedido</h2>${o.events.map((e) => `<div class="summary-row" style="display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--gray-100);padding:8px 0"><span>${esc(e.description)}<br><span class="small muted">${esc(e.user_name)}</span></span><span class="small nowrap">${CB.dt(e.created_at)}</span></div>`).join('')}
          ${o.payments.length ? `<h3 style="margin-top:14px">Registros de pagamento</h3>${o.payments.map((p) => `<div class="small">${CB.dt(p.created_at)} — ${payBadge(p.status)} ${esc(CB.PAY_METHOD[p.method] || p.method)} ${brl(p.amount_cents)} ${p.simulated ? '<span class="demo-flag">simulado</span>' : ''} · ${esc(p.user_name)}</div>`).join('')}` : ''}
        </div>
        <div class="card"><h2>Movimentações de estoque do pedido</h2>${movTable(o.movements, true)}</div>
      </div>`;
    content.querySelectorAll('[data-status]').forEach(
      (b) =>
        (b.onclick = async () => {
          const s = b.dataset.status;
          let reason = '';
          if (s === 'cancelado') {
            const r = await CB.modal({
              title: 'Cancelar pedido',
              body: `<p>${o.stock_state === 'baixado' ? 'Os itens serão <strong>devolvidos ao estoque</strong>.' : 'A <strong>reserva de estoque será liberada</strong>.'} Esta ação não pode ser desfeita.</p><label><span class="lbl">Motivo</span><input id="cReason" maxlength="200" placeholder="Ex.: cliente desistiu"/></label>`,
              actions: [
                { label: 'Voltar', cls: 'btn-ghost', value: null },
                { label: 'Cancelar pedido', cls: 'btn-danger', handler: (w) => w.querySelector('#cReason').value || 'Sem motivo informado' },
              ],
            });
            if (r === null) return;
            reason = r;
          } else if (s === 'concluido' && !(await CB.confirm('Concluir venda', `Confirmar a conclusão do pedido ${esc(o.code)}? A reserva será convertida em saída de estoque.${o.payment_status !== 'aprovado' ? '<br><br><strong>Atenção:</strong> o pagamento ainda não está aprovado.' : ''}`, { ok: 'Concluir' }))) return;
          b.disabled = true;
          try {
            await guard(() => CB.post(`/api/admin/orders/${o.id}/status`, { status: s, reason }));
            CB.toast(`Pedido: ${CB.STATUS[s]}.`);
            pageOrder(id);
          } catch (e) {
            b.disabled = false;
          }
        })
    );
    document.getElementById('payForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = CB.formData(e.target);
      try {
        await guard(() => CB.post(`/api/admin/orders/${o.id}/payment`, f));
        CB.toast(`Pagamento registrado: ${CB.PAY_STATUS[f.status]}.`);
        pageOrder(id);
      } catch (err) {}
    };
  }

  /* ================= Nova venda (balcão) ================= */
  async function pageSale() {
    setTitle('Nova venda (balcão)');
    CB.loading(content);
    const [products, customers, matrix] = await Promise.all([CB.get('/api/admin/products', { status: 'ativos' }), CB.get('/api/admin/r/customers'), CB.get('/api/admin/stock/matrix')]);
    const stores = matrix.stores.filter((st) => st.active);
    const availAt = (pid, sid) => {
      const p = matrix.products.find((x) => x.id === pid);
      const b = p && p.by_store.find((x) => x.store_id === Number(sid));
      return b ? b.available_qty : 0;
    };
    const lines = [];
    content.innerHTML = `<form id="sale" novalidate><div class="grid-2">
      <div class="card"><h2>Loja</h2>
        <label><span class="lbl">Loja da venda (estoque) *</span><select name="storeId" id="saleStore">${stores.map((st) => `<option value="${st.id}">${esc(st.name)}</option>`).join('')}</select></label>
        <h2 style="margin-top:18px">Cliente</h2>
        <div class="form-grid">
          <label class="full"><span class="lbl">Cliente cadastrado</span><select name="customerId"><option value="">— Novo cliente / avulso —</option>${customers.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.phone)}</option>`).join('')}</select></label>
          <label><span class="lbl">Nome *</span><input name="name" maxlength="120" data-msg="Informe o nome."/></label>
          <label><span class="lbl">Telefone *</span><input name="phone" data-phone inputmode="tel" data-msg="Telefone com DDD."/></label>
        </div>
        <h2 style="margin-top:18px">Pagamento</h2>
        <div class="form-grid">
          <label><span class="lbl">Forma</span><select name="paymentMethod">${['dinheiro', 'pix_balcao', 'cartao_balcao'].map((k) => `<option value="${k}">${CB.PAY_METHOD[k]}</option>`).join('')}</select></label>
          <label><span class="lbl">Desconto (R$)</span><input name="discount" inputmode="decimal" placeholder="0,00"/></label>
          <label class="check"><input type="checkbox" name="paid" checked/> Pagamento recebido</label>
          <label class="check"><input type="checkbox" name="complete" checked/> Concluir venda agora (baixa no estoque)</label>
          <label class="full"><span class="lbl">Observações</span><input name="notes" maxlength="500"/></label>
        </div>
      </div>
      <div class="card"><h2>Itens</h2>
        <div class="toolbar"><label style="flex:1"><span class="lbl">Produto</span><select id="pSel"><option value="">Selecione…</option>${products.map((p) => `<option value="${p.id}">${esc(p.name)} — ${brl(p.final_price_cents)}</option>`).join('')}</select></label>
          <label style="width:90px;min-width:0"><span class="lbl">Qtd.</span><input id="pQty" type="number" min="1" value="1"/></label><button type="button" class="btn btn-dark btn-sm" id="pAdd">Adicionar</button></div>
        <div id="lines"></div>
        <button class="btn btn-primary btn-block" style="margin-top:14px" type="submit">Registrar venda</button>
      </div></div></form>`;
    const f = document.getElementById('sale');
    f.phone.addEventListener('input', (e) => (e.target.value = CB.maskPhone(e.target.value)));
    f.customerId.onchange = () => {
      const c = customers.find((x) => String(x.id) === f.customerId.value);
      f.name.value = c ? c.name : '';
      f.phone.value = c ? c.phone : '';
      f.name.disabled = f.phone.disabled = !!c;
    };
    const renderLines = () => {
      const box = document.getElementById('lines');
      if (!lines.length) return (box.innerHTML = CB.empty('Adicione produtos à venda.'));
      const total = lines.reduce((a, l) => a + l.p.final_price_cents * l.qty, 0);
      box.innerHTML = `<div class="table-wrap"><table class="table sale-lines"><thead><tr><th>Produto</th><th class="num">Qtd.</th><th class="num">Total</th><th></th></tr></thead><tbody>${lines
        .map((l, i) => `<tr><td>${esc(l.p.name)}<br><span class="small muted">${brl(l.p.final_price_cents)} un. · disp. na loja ${availAt(l.p.id, document.getElementById('saleStore').value)}</span></td><td class="num">${l.qty}</td><td class="num">${brl(l.p.final_price_cents * l.qty)}</td><td><button type="button" class="btn btn-ghost btn-sm" data-rm="${i}">Remover</button></td></tr>`)
        .join('')}<tr><td colspan="2" class="num"><strong>Subtotal</strong></td><td class="num"><strong>${brl(total)}</strong></td><td></td></tr></tbody></table></div>`;
      box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => (lines.splice(Number(b.dataset.rm), 1), renderLines())));
    };
    renderLines();
    document.getElementById('saleStore').onchange = renderLines;
    document.getElementById('pAdd').onclick = () => {
      const p = products.find((x) => String(x.id) === document.getElementById('pSel').value);
      const qty = Math.floor(Number(document.getElementById('pQty').value));
      if (!p) return CB.toast('Selecione um produto.', 'error');
      if (!(qty >= 1)) return CB.toast('Quantidade inválida.', 'error');
      const ex = lines.find((l) => l.p.id === p.id);
      const nq = (ex ? ex.qty : 0) + qty;
      const av = availAt(p.id, document.getElementById('saleStore').value);
      if (nq > av) return CB.toast(`Disponível nesta loja: ${av} unidade(s).`, 'error');
      if (ex) ex.qty = nq;
      else lines.push({ p, qty });
      renderLines();
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = CB.formData(f);
      const errs = {};
      if (!d.customerId) {
        if (!d.name || d.name.trim().length < 3) errs.name = 'Informe o nome (mín. 3 letras).';
        if (![10, 11].includes(CB.digits(d.phone).length)) errs.phone = 'Telefone com DDD.';
      }
      if (Object.keys(errs).length) return CB.showErrors(f, { fields: errs });
      if (!lines.length) return CB.toast('Adicione ao menos um produto.', 'error');
      const c = customers.find((x) => String(x.id) === d.customerId);
      const discount = d.discount ? Math.round(Number(String(d.discount).replace(/\./g, '').replace(',', '.')) * 100) : 0;
      if (!(discount >= 0)) return CB.showErrors(f, { fields: { discount: 'Valor inválido.' } });
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const o = await guard(() =>
          CB.post('/api/admin/sales', {
            storeId: Number(d.storeId),
            customerId: d.customerId || null,
            name: c ? c.name : d.name,
            phone: c ? c.phone : d.phone,
            paymentMethod: d.paymentMethod,
            discountCents: discount,
            paid: d.paid,
            complete: d.complete,
            notes: d.notes,
            fulfillment: 'retirada',
            items: lines.map((l) => ({ productId: l.p.id, quantity: l.qty })),
          })
        );
        CB.toast(`Venda ${o.code} registrada.`);
        location.hash = `#/pedidos/${o.id}`;
      } catch (err) {
        CB.showErrors(f, err);
        btn.disabled = false;
      }
    };
  }

  /* ================= Produtos ================= */
  async function pageProducts(q) {
    setTitle('Produtos');
    const brands = await CB.get('/api/admin/r/brands');
    content.innerHTML = `<div class="card">
      <form class="toolbar" id="pf">
        <label style="flex:1;min-width:200px"><span class="lbl">Buscar</span><input name="q" value="${esc(q.q || '')}" placeholder="Nome, SKU ou marca"/></label>
        <label><span class="lbl">Marca</span><select name="brand"><option value="">Todas</option>${brands.map((b) => `<option value="${b.id}" ${String(q.brand) === String(b.id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
        <label><span class="lbl">Status</span><select name="status"><option value="">Todos</option><option value="ativos" ${q.status === 'ativos' ? 'selected' : ''}>Ativos</option><option value="inativos" ${q.status === 'inativos' ? 'selected' : ''}>Inativos</option></select></label>
        <label><span class="lbl">Estoque</span><select name="stock"><option value="">Todos</option><option value="baixo" ${q.stock === 'baixo' ? 'selected' : ''}>Baixo</option><option value="esgotado" ${q.stock === 'esgotado' ? 'selected' : ''}>Esgotado</option></select></label>
        <button class="btn btn-dark btn-sm">Filtrar</button>
        <a class="btn btn-primary btn-sm" href="#/produtos/novo">+ Novo produto</a>
      </form><div id="plist"></div></div>`;
    document.getElementById('pf').onsubmit = (e) => (e.preventDefault(), setQuery('/produtos', CB.formData(e.target)));
    const box = document.getElementById('plist');
    CB.loading(box);
    const list = await CB.get('/api/admin/products', q);
    if (!list.length) return (box.innerHTML = CB.empty('Nenhum produto encontrado.', '<a class="btn btn-primary" href="#/produtos/novo">Cadastrar produto</a>'));
    box.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th></th><th>Produto</th><th class="num">Preço</th><th class="num">Custo</th><th class="num">Físico</th><th class="num">Reserv.</th><th class="num">Disp.</th><th>Estoque</th><th>Status</th><th></th></tr></thead><tbody>${list
      .map(
        (p) => `<tr><td><img class="thumb" src="${esc(asset(p.image))}" alt=""/></td><td><a href="#/produtos/${p.id}"><strong>${esc(p.name)}</strong></a><br><span class="small muted">${esc(p.sku)} · ${esc(p.brand_name || '')} · ${p.capacity_ah}Ah</span></td>
        <td class="num">${p.on_promo ? `<s class="small muted">${brl(p.price_cents)}</s><br>` : ''}${brl(p.final_price_cents)}</td><td class="num">${brl(p.cost_cents)}</td><td class="num">${p.stock_qty}</td><td class="num">${p.reserved_qty}</td><td class="num"><strong>${p.available_qty}</strong></td><td>${stockBadge(p)}</td>
        <td>${p.active ? '<span class="badge badge-ok">Ativo</span>' : '<span class="badge">Inativo</span>'}${p.has_history ? '<br><span class="small muted">com vendas</span>' : ''}</td>
        <td><div class="row-actions"><a class="btn btn-ghost btn-sm" href="#/produtos/${p.id}">Editar</a><button class="btn btn-ghost btn-sm" data-toggle="${p.id}" data-active="${p.active}">${p.active ? 'Desativar' : 'Ativar'}</button>${p.has_history ? '' : `<button class="btn btn-ghost btn-sm" data-del="${p.id}" data-name="${esc(p.name)}">Excluir</button>`}</div></td></tr>`
      )
      .join('')}</tbody></table></div><p class="small muted">Produtos com histórico de vendas não podem ser excluídos — desative-os para preservar os registros.</p>`;
    box.querySelectorAll('[data-toggle]').forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await guard(() => CB.post(`/api/admin/products/${b.dataset.toggle}/active`, { active: b.dataset.active !== '1' }));
            CB.toast(b.dataset.active === '1' ? 'Produto desativado (não aparece mais na loja).' : 'Produto ativado.');
            route();
          } catch (e) {}
        })
    );
    box.querySelectorAll('[data-del]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await CB.confirm('Excluir produto', `Excluir definitivamente "${esc(b.dataset.name)}"? As movimentações de estoque ficam preservadas no histórico.`, { danger: true, ok: 'Excluir' }))) return;
          try {
            await guard(() => CB.del(`/api/admin/products/${b.dataset.del}`));
            CB.toast('Produto excluído.');
            route();
          } catch (e) {}
        })
    );
  }

  async function pageProductForm(id) {
    const isNew = id === 'novo';
    setTitle(isNew ? 'Novo produto' : 'Editar produto');
    CB.loading(content);
    const [brands, cats, p, stores] = await Promise.all([CB.get('/api/admin/r/brands'), CB.get('/api/admin/r/categories'), isNew ? null : CB.get(`/api/admin/products/${id}`), CB.get('/api/admin/r/stores')]);
    const v = p || { voltage: 12, warranty_months: 12, min_stock: 2, active: 1, featured: 0 };
    let image = v.image || '';
    content.innerHTML = `<p><a href="#/produtos">← Produtos</a></p>
      ${p ? `<div class="kpis"><div class="kpi"><div class="k-label">Físico</div><div class="k-value">${p.stock_qty}</div></div><div class="kpi k-warn"><div class="k-label">Reservado</div><div class="k-value">${p.reserved_qty}</div></div><div class="kpi k-ok"><div class="k-label">Disponível</div><div class="k-value">${p.available_qty}</div><div class="k-sub">${stockBadge(p)} mínimo ${p.min_stock}</div></div><div class="kpi k-dark"><div class="k-label">Ações de estoque</div><a class="btn btn-dark btn-sm" style="margin-top:8px" href="#/estoque?productId=${p.id}">Entrada / saída / ajuste / transferência</a></div></div>
        <div class="card"><h2>Estoque por loja</h2><div class="table-wrap"><table class="table"><thead><tr><th>Loja</th><th class="num">Físico</th><th class="num">Reservado</th><th class="num">Disponível</th><th></th></tr></thead><tbody>${p.by_store
          .map((b) => `<tr><td>${esc(b.name)}</td><td class="num">${b.stock_qty}</td><td class="num">${b.reserved_qty}</td><td class="num"><strong>${b.available_qty}</strong></td><td><a class="btn btn-ghost btn-sm" href="#/estoque?productId=${p.id}&storeId=${b.store_id}">Movimentar</a></td></tr>`)
          .join('')}</tbody></table></div></div>` : ''}
      <form class="card" id="prodForm" novalidate>
        <div class="card-head"><h2>Dados do produto</h2>${p && p.is_demo ? '<span class="demo-flag">Produto demonstrativo</span>' : ''}</div>
        <div class="form-grid">
          <label><span class="lbl">Nome *</span><input name="name" required minlength="3" maxlength="120" value="${esc(v.name || '')}"/></label>
          <label><span class="lbl">Código/SKU *</span><input name="sku" required maxlength="40" pattern="[A-Za-z0-9._-]+" data-msg="Use letras, números, ponto, hífen ou sublinhado." value="${esc(v.sku || '')}"/></label>
          <label><span class="lbl">Marca *</span><select name="brand_id" required data-msg="Selecione a marca."><option value="">Selecione…</option>${brands.map((b) => `<option value="${b.id}" ${v.brand_id === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>
          <label><span class="lbl">Categoria</span><select name="category_id"><option value="">—</option>${cats.map((c) => `<option value="${c.id}" ${v.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label><span class="lbl">Capacidade (Ah) *</span><input name="capacity_ah" type="number" min="1" max="400" required value="${esc(v.capacity_ah || '')}"/></label>
          <label><span class="lbl">Tensão (V) *</span><input name="voltage" type="number" min="6" max="48" required value="${esc(v.voltage)}"/></label>
          <label><span class="lbl">CCA (A)</span><input name="cca" type="number" min="0" max="3000" value="${esc(v.cca ?? '')}"/></label>
          <label><span class="lbl">Dimensões</span><input name="dimensions" maxlength="80" placeholder="C x L x A mm" value="${esc(v.dimensions || '')}"/></label>
          <label><span class="lbl">Polaridade</span><input name="polarity" maxlength="40" placeholder="Positivo à direita" value="${esc(v.polarity || '')}"/></label>
          <label><span class="lbl">Tecnologia</span><input name="technology" maxlength="60" placeholder="Selada, EFB, AGM…" value="${esc(v.technology || '')}"/></label>
          <label><span class="lbl">Garantia (meses) *</span><input name="warranty_months" type="number" min="0" max="120" required value="${esc(v.warranty_months)}"/></label>
          <label><span class="lbl">Estoque mínimo *</span><input name="min_stock" type="number" min="0" required value="${esc(v.min_stock)}"/></label>
          <label><span class="lbl">Preço de venda (R$) *</span><input name="price_cents" required inputmode="decimal" placeholder="0,00" value="${esc(CB.money(v.price_cents))}"/></label>
          <label><span class="lbl">Preço promocional (R$)</span><input name="promo_price_cents" inputmode="decimal" placeholder="vazio = sem promoção" value="${esc(CB.money(v.promo_price_cents))}"/></label>
          <label><span class="lbl">Custo (R$) *</span><input name="cost_cents" required inputmode="decimal" placeholder="0,00" value="${esc(CB.money(v.cost_cents))}"/></label>
          ${isNew ? `<label><span class="lbl">Estoque inicial</span><input name="initial_stock" type="number" min="0" value="0"/><span class="hint">Gera uma movimentação de entrada.</span></label><label><span class="lbl">Loja do estoque inicial</span><select name="initial_store_id">${stores.filter((st) => st.active).map((st) => `<option value="${st.id}">${esc(st.name)}</option>`).join('')}</select></label>` : '<div></div>'}
          <label class="full"><span class="lbl">Descrição</span><textarea name="description" maxlength="3000">${esc(v.description || '')}</textarea></label>
          <div class="full"><span class="lbl" style="font-weight:600;font-size:.9rem">Imagem principal</span><div class="img-field"><img id="imgPrev" src="${esc(asset(image))}" alt=""/><input type="file" id="imgFile" accept="image/png,image/jpeg,image/webp,image/gif" style="max-width:280px"/>${image ? '<button type="button" class="btn btn-ghost btn-sm" id="imgClear">Remover imagem</button>' : ''}</div></div>
          <label class="check"><input type="checkbox" name="active" ${v.active ? 'checked' : ''}/> Ativo (visível na loja)</label>
          <label class="check"><input type="checkbox" name="featured" ${v.featured ? 'checked' : ''}/> Destaque na página inicial</label>
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary" type="submit">${isNew ? 'Cadastrar produto' : 'Salvar alterações'}</button>${p ? `<a class="btn btn-ghost" href="../#/produto/${p.id}" target="_blank">Ver na loja ↗</a>` : ''}</div>
      </form>
      ${p ? `<div class="card"><div class="card-head"><h2>Imagens adicionais</h2><label class="btn btn-ghost btn-sm" style="cursor:pointer">+ Adicionar imagem<input type="file" id="extraImg" accept="image/png,image/jpeg,image/webp,image/gif" hidden/></label></div>
        <div class="images-list">${p.images.length ? p.images.map((i) => `<figure><img src="${esc(asset(i.url))}" alt=""/><div class="row-actions" style="justify-content:center;margin-top:4px"><button class="btn btn-ghost btn-sm" data-main="${i.id}">Principal</button><button class="btn btn-ghost btn-sm" data-delimg="${i.id}">✕</button></div></figure>`).join('') : '<p class="muted small">Nenhuma imagem adicional.</p>'}</div></div>
      <div class="card"><div class="card-head"><h2>Aplicações por veículo</h2><button class="btn btn-dark btn-sm" id="addApp">+ Adicionar aplicação</button></div>
        <p class="small muted">Cadastre somente aplicações verificadas. A loja exibe aviso para o cliente confirmar a compatibilidade.</p>
        ${p.applications.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Veículo</th><th>Anos</th><th>Motor</th><th>Obs.</th><th></th></tr></thead><tbody>${p.applications.map((a) => `<tr><td>${esc(a.make)} ${esc(a.model)} ${a.is_demo ? '<span class="demo-flag">demo</span>' : ''}</td><td>${a.year_start}–${a.year_end}</td><td>${esc(a.engine)}</td><td class="small">${esc(a.notes)}</td><td><div class="row-actions"><button class="btn btn-ghost btn-sm" data-editapp="${a.id}">Editar</button><button class="btn btn-ghost btn-sm" data-delapp="${a.id}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>` : CB.empty('Nenhuma aplicação cadastrada.')}
      </div>` : ''}`;
    const f = document.getElementById('prodForm');
    document.getElementById('imgFile').onchange = async (e) => {
      try {
        image = await CB.readImage(e.target.files[0]);
        document.getElementById('imgPrev').src = image;
      } catch (err) {
        CB.toast(err.message, 'error');
      }
    };
    const clr = document.getElementById('imgClear');
    if (clr) clr.onclick = () => ((image = ''), (document.getElementById('imgPrev').src = asset('')));
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!CB.validateForm(f)) return CB.toast('Verifique os campos destacados.', 'error');
      const d = CB.formData(f);
      d.image = image || null;
      for (const k of ['brand_id', 'category_id', 'capacity_ah', 'voltage', 'cca', 'warranty_months', 'min_stock', 'initial_stock', 'initial_store_id']) if (d[k] !== undefined) d[k] = d[k] === '' ? null : Number(d[k]);
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await guard(() => (isNew ? CB.post('/api/admin/products', d) : CB.put(`/api/admin/products/${id}`, d)));
        CB.toast(isNew ? 'Produto cadastrado.' : 'Alterações salvas.');
        if (isNew) location.hash = `#/produtos/${r.id}`;
        else pageProductForm(id);
      } catch (err) {
        CB.showErrors(f, err);
        btn.disabled = false;
      }
    };
    if (!p) return;
    const extra = document.getElementById('extraImg');
    extra.onchange = async () => {
      try {
        const url = await CB.readImage(extra.files[0]);
        await guard(() => CB.post(`/api/admin/products/${p.id}/images`, { url, alt: p.name }));
        CB.toast('Imagem adicionada.');
        pageProductForm(id);
      } catch (err) {
        if (!(err instanceof CB.ApiError)) CB.toast(err.message, 'error');
      }
    };
    content.querySelectorAll('[data-main]').forEach((b) => (b.onclick = async () => (await guard(() => CB.post(`/api/admin/products/${p.id}/images/${b.dataset.main}/main`, {})), CB.toast('Imagem principal alterada.'), pageProductForm(id))));
    content.querySelectorAll('[data-delimg]').forEach((b) => (b.onclick = async () => (await guard(() => CB.del(`/api/admin/products/${p.id}/images/${b.dataset.delimg}`)), pageProductForm(id))));
    const appForm = (a = {}) =>
      `<form id="appF" novalidate class="form-grid">
        <label><span class="lbl">Marca do veículo *</span><input name="make" required maxlength="60" value="${esc(a.make || '')}" placeholder="Ex.: Volkswagen"/></label>
        <label><span class="lbl">Modelo *</span><input name="model" required maxlength="80" value="${esc(a.model || '')}" placeholder="Ex.: Gol"/></label>
        <label><span class="lbl">Ano inicial *</span><input name="year_start" type="number" min="1950" max="2100" required value="${esc(a.year_start || '')}"/></label>
        <label><span class="lbl">Ano final *</span><input name="year_end" type="number" min="1950" max="2100" required value="${esc(a.year_end || '')}"/></label>
        <label><span class="lbl">Motor/versão</span><input name="engine" maxlength="80" value="${esc(a.engine || '')}"/></label>
        <label><span class="lbl">Observações</span><input name="notes" maxlength="300" value="${esc(a.notes || '')}"/></label></form>`;
    const saveApp = (a) => async (w) => {
      const af = w.querySelector('#appF');
      if (!CB.validateForm(af)) return false;
      const d = CB.formData(af);
      d.year_start = Number(d.year_start);
      d.year_end = Number(d.year_end);
      try {
        await guard(() => (a ? CB.put(`/api/admin/products/${p.id}/applications/${a.id}`, d) : CB.post(`/api/admin/products/${p.id}/applications`, d)));
        CB.toast('Aplicação salva.');
        pageProductForm(id);
      } catch (err) {
        CB.showErrors(af, err);
        return false;
      }
    };
    document.getElementById('addApp').onclick = () => CB.modal({ title: 'Nova aplicação', body: appForm(), actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, { label: 'Salvar', cls: 'btn-primary', handler: saveApp(null) }] });
    content.querySelectorAll('[data-editapp]').forEach((b) => {
      const a = p.applications.find((x) => String(x.id) === b.dataset.editapp);
      b.onclick = () => CB.modal({ title: 'Editar aplicação', body: appForm(a), actions: [{ label: 'Cancelar', cls: 'btn-ghost' }, { label: 'Salvar', cls: 'btn-primary', handler: saveApp(a) }] });
    });
    content.querySelectorAll('[data-delapp]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await CB.confirm('Excluir aplicação', 'Remover esta aplicação do produto?', { danger: true, ok: 'Excluir' }))) return;
          await guard(() => CB.del(`/api/admin/products/${p.id}/applications/${b.dataset.delapp}`));
          pageProductForm(id);
        })
    );
  }

  /* ================= Estoque (por loja) ================= */
  async function pageStock(q) {
    setTitle('Estoque por loja');
    const [products, suppliers, matrix] = await Promise.all([CB.get('/api/admin/products'), CB.get('/api/admin/r/suppliers'), CB.get('/api/admin/stock/matrix')]);
    const stores = matrix.stores.filter((st) => st.active);
    const short = (st) => st.neighborhood || st.name.replace(/^Cardoso Baterias\s*/, '');
    const storeOpts = (sel, placeholder = 'Selecione…') => `<option value="">${placeholder}</option>${stores.map((st) => `<option value="${st.id}" ${String(sel) === String(st.id) ? 'selected' : ''}>${esc(st.name)}</option>`).join('')}`;
    const cell = (b) => `<td class="num" title="Físico ${b.stock_qty} · reservado ${b.reserved_qty}"><strong class="${b.available_qty <= 0 ? 'mov-neg' : ''}">${b.available_qty}</strong>${b.reserved_qty ? `<br><span class="small muted">${b.stock_qty} fís. · ${b.reserved_qty} res.</span>` : ''}</td>`;
    content.innerHTML = `
    <div class="card"><div class="card-head"><h2>Posição por loja</h2><span class="small muted">Disponível = físico − reservado. Passe o mouse para ver os detalhes.</span></div>
      <div class="table-wrap" style="max-height:460px;overflow:auto"><table class="table"><thead><tr><th>Produto</th>${stores.map((st) => `<th class="num">${esc(short(st))}</th>`).join('')}<th class="num">Total disp.</th><th class="num">Mín.</th><th></th></tr></thead><tbody>${matrix.products
        .filter((p) => p.active)
        .map((p) => `<tr><td><a href="#/produtos/${p.id}">${esc(p.name)}</a><br><span class="small muted">${esc(p.sku)}</span></td>${stores.map((st) => cell(p.by_store.find((b) => b.store_id === st.id))).join('')}<td class="num"><strong>${p.available_qty}</strong></td><td class="num">${p.min_stock}</td><td>${stockBadge(p)}</td></tr>`)
        .join('')}
        <tr><td><strong>Total de unidades</strong></td>${stores.map((st) => `<td class="num"><strong>${matrix.products.reduce((a, p) => a + Math.max(p.by_store.find((b) => b.store_id === st.id).available_qty, 0), 0)}</strong></td>`).join('')}<td class="num"><strong>${matrix.products.reduce((a, p) => a + Math.max(p.available_qty, 0), 0)}</strong></td><td></td><td></td></tr>
      </tbody></table></div></div>
    <div class="grid-2">
      <form class="card" id="movForm" novalidate><h2>Registrar movimentação</h2>
        <div class="form-grid">
          <label class="full"><span class="lbl">Produto *</span><select name="productId" required data-msg="Selecione o produto."><option value="">Selecione…</option>${products.map((p) => `<option value="${p.id}" ${String(q.productId) === String(p.id) ? 'selected' : ''}>${esc(p.name)} (${esc(p.sku)})</option>`).join('')}</select></label>
          <label><span class="lbl">Tipo *</span><select name="type"><option value="entrada">Entrada (compra/reposição)</option><option value="saida">Saída (perda, garantia, uso)</option><option value="ajuste">Ajuste (contagem de inventário)</option><option value="transferencia">Transferência entre lojas</option></select></label>
          <label><span class="lbl" data-store-label>Loja *</span><select name="storeId" required data-msg="Selecione a loja.">${storeOpts(q.storeId)}</select></label>
          <label data-for="transf" hidden><span class="lbl">Loja de destino *</span><select name="toStoreId" required data-msg="Selecione a loja de destino.">${storeOpts('')}</select></label>
          <div class="full small muted" id="storePos"></div>
          <label data-for="qty"><span class="lbl">Quantidade *</span><input name="quantity" type="number" min="1" max="100000" required data-msg="Informe a quantidade (1 ou mais)."/></label>
          <label data-for="adj" hidden><span class="lbl">Nova quantidade física na loja *</span><input name="newQty" type="number" min="0" max="100000" required data-msg="Informe a quantidade contada."/></label>
          <label class="full"><span class="lbl">Motivo *</span><input name="reason" required minlength="3" maxlength="300" placeholder="Ex.: NF 1234 do fornecedor" data-msg="Informe o motivo (mín. 3 caracteres)."/></label>
          <label data-for="in"><span class="lbl">Fornecedor</span><select name="supplierId"><option value="">—</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
          <label data-for="in"><span class="lbl">Custo unitário (R$)</span><input name="unitCostCents" inputmode="decimal" placeholder="0,00"/></label>
          <label class="check full" data-for="in"><input type="checkbox" name="updateCost"/> Atualizar o custo do produto com este valor</label>
        </div>
        <button class="btn btn-primary" style="margin-top:14px" type="submit">Registrar</button>
        <p class="small muted" style="margin-top:8px">Cada loja tem seu estoque. Saídas e transferências não podem ultrapassar o disponível da loja (físico − reservado). Ajustes não podem ficar abaixo das reservas da loja. O estoque nunca fica negativo.</p>
      </form>
      <div class="card"><h2>Resumo por loja</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th>Loja</th><th class="num">Físico</th><th class="num">Reservado</th><th class="num">Disponível</th><th class="num">Zerados</th></tr></thead><tbody>${stores
          .map((st) => {
            const t = matrix.products.filter((p) => p.active).map((p) => p.by_store.find((b) => b.store_id === st.id));
            return `<tr><td>${esc(short(st))}</td><td class="num">${t.reduce((a, b) => a + b.stock_qty, 0)}</td><td class="num">${t.reduce((a, b) => a + b.reserved_qty, 0)}</td><td class="num"><strong>${t.reduce((a, b) => a + b.available_qty, 0)}</strong></td><td class="num">${t.filter((b) => b.available_qty <= 0).length}</td></tr>`;
          })
          .join('')}</tbody></table></div>
        <p class="small muted">Para equilibrar as lojas, use “Transferência entre lojas”. Ela gera uma saída na origem e uma entrada no destino, com o mesmo motivo e responsável.</p>
      </div>
    </div>
    <div class="card"><div class="card-head"><h2>Histórico de movimentações</h2></div>
      <form class="toolbar" id="mf">
        <label><span class="lbl">Produto</span><select name="productId"><option value="">Todos</option>${products.map((p) => `<option value="${p.id}" ${String(q.productId) === String(p.id) ? 'selected' : ''}>${esc(p.sku)}</option>`).join('')}</select></label>
        <label><span class="lbl">Loja</span><select name="storeId">${storeOpts(q.storeId, 'Todas')}</select></label>
        <label><span class="lbl">Tipo</span><select name="type"><option value="">Todos</option>${Object.entries(CB.MOV).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label><span class="lbl">De</span><input type="date" name="from" value="${esc(q.from || '')}"/></label>
        <label><span class="lbl">Até</span><input type="date" name="to" value="${esc(q.to || '')}"/></label>
        <button class="btn btn-dark btn-sm">Filtrar</button>
      </form><div id="movs"></div></div>`;
    const f = document.getElementById('movForm');
    const showPos = () => {
      const p = matrix.products.find((x) => String(x.id) === f.productId.value);
      document.getElementById('storePos').innerHTML = p
        ? 'Neste produto: ' + stores.map((st) => { const b = p.by_store.find((x) => x.store_id === st.id); return `<strong>${esc(short(st))}</strong> ${b.available_qty} disp. (${b.stock_qty} fís., ${b.reserved_qty} res.)`; }).join(' · ')
        : '';
    };
    const sync = () => {
      const t = f.type.value;
      f.querySelector('[data-store-label]').textContent = t === 'transferencia' ? 'Loja de origem *' : 'Loja *';
      f.querySelectorAll('[data-for]').forEach((el) => {
        const show = (el.dataset.for === 'qty' && t !== 'ajuste') || (el.dataset.for === 'adj' && t === 'ajuste') || (el.dataset.for === 'in' && t === 'entrada') || (el.dataset.for === 'transf' && t === 'transferencia');
        el.hidden = !show;
        el.querySelectorAll('input,select').forEach((i) => (i.disabled = !show));
      });
    };
    f.type.onchange = sync;
    f.productId.onchange = showPos;
    sync();
    showPos();
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (!CB.validateForm(f)) return;
      const d = CB.formData(f);
      const body = { productId: Number(d.productId), storeId: Number(d.storeId), type: d.type, reason: d.reason };
      if (d.type === 'ajuste') body.newQty = Number(d.newQty);
      else body.quantity = Number(d.quantity);
      if (d.type === 'transferencia') body.toStoreId = Number(d.toStoreId);
      if (d.type === 'entrada') {
        if (d.supplierId) body.supplierId = Number(d.supplierId);
        if (d.unitCostCents) body.unitCostCents = d.unitCostCents;
        body.updateCost = d.updateCost;
      }
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const p = await guard(() => CB.post('/api/admin/stock/movements', body));
        CB.toast(`Movimentação registrada. ${p.name}: ${p.by_store.map((b) => `${b.neighborhood || b.name} ${b.available_qty}`).join(' · ')} (total disp. ${p.available_qty}).`, 'ok', 6000);
        setQuery('/estoque', { productId: p.id, storeId: d.storeId });
      } catch (err) {
        CB.showErrors(f, err);
        btn.disabled = false;
      }
    };
    document.getElementById('mf').onsubmit = (e) => (e.preventDefault(), setQuery('/estoque', CB.formData(e.target)));
    const box = document.getElementById('movs');
    CB.loading(box);
    const r = await CB.get('/api/admin/stock/movements', { productId: q.productId, storeId: q.storeId, type: q.type, from: q.from, to: q.to, limit: 60 });
    box.innerHTML = movTable(r.items) + `<p class="small muted">${r.total} movimentação(ões)${r.total > r.items.length ? ` — exibindo as ${r.items.length} mais recentes. Use Relatórios para exportar tudo.` : ''}</p>`;
  }

  /* ================= CRUD genérico ================= */
  const RES = {
    marcas: { api: 'brands', title: 'Marcas', one: 'marca', cols: [['name', 'Nome'], ['product_count', 'Produtos']], fields: [['name', 'Nome', 'text', { required: true, max: 60 }], ['description', 'Descrição', 'textarea']] },
    categorias: { api: 'categories', title: 'Categorias', one: 'categoria', cols: [['name', 'Nome'], ['sort', 'Ordem'], ['product_count', 'Produtos']], fields: [['name', 'Nome', 'text', { required: true, max: 60 }], ['sort', 'Ordem', 'number'], ['description', 'Descrição', 'textarea']] },
    fornecedores: {
      api: 'suppliers',
      title: 'Fornecedores',
      one: 'fornecedor',
      search: true,
      cols: [['name', 'Nome'], ['contact_name', 'Contato'], ['phone', 'Telefone'], ['email', 'E-mail']],
      fields: [['name', 'Razão social / nome', 'text', { required: true, max: 120 }], ['document', 'CNPJ/CPF', 'text'], ['contact_name', 'Contato', 'text'], ['phone', 'Telefone', 'text'], ['email', 'E-mail', 'email'], ['notes', 'Observações', 'textarea']],
    },
    clientes: {
      api: 'customers',
      title: 'Clientes',
      one: 'cliente',
      search: true,
      cols: [['name', 'Nome'], ['phone', 'Telefone'], ['email', 'E-mail'], ['order_count', 'Pedidos'], ['total_spent_cents', 'Total comprado', 'money']],
      fields: [['name', 'Nome', 'text', { required: true, min: 3, max: 120 }], ['phone', 'Telefone', 'phone', { required: true }], ['email', 'E-mail', 'email'], ['document', 'CPF/CNPJ', 'text'], ['address', 'Endereço', 'text'], ['notes', 'Observações', 'textarea']],
    },
    banners: {
      api: 'banners',
      title: 'Banners',
      one: 'banner',
      cols: [['image', '', 'image'], ['title', 'Título'], ['cta_label', 'Botão'], ['active', 'Ativo', 'bool'], ['sort', 'Ordem']],
      fields: [['title', 'Título', 'text', { required: true, max: 100 }], ['subtitle', 'Subtítulo', 'text'], ['cta_label', 'Texto do botão', 'text'], ['cta_link', 'Link do botão (ex.: #/catalogo)', 'text'], ['image', 'Imagem', 'image'], ['sort', 'Ordem', 'number'], ['active', 'Ativo', 'bool']],
    },
    lojas: {
      api: 'stores',
      title: 'Lojas / unidades',
      one: 'loja',
      cols: [['image', '', 'image'], ['name', 'Unidade'], ['phone', 'Telefone'], ['rating', 'Nota'], ['rating_count', 'Avaliações'], ['pickup_enabled', 'Retirada', 'bool'], ['active', 'Ativa', 'bool'], ['sort', 'Ordem']],
      fields: [
        ['name', 'Nome da unidade', 'text', { required: true, max: 100 }],
        ['neighborhood', 'Bairro/região (nome curto)', 'text', { max: 80 }],
        ['city', 'Cidade', 'text', { max: 80 }],
        ['address', 'Endereço completo', 'textarea', { max: 300 }],
        ['phone', 'Telefone', 'text', { max: 30 }],
        ['whatsapp', 'WhatsApp da unidade (55 + DDD + número, só dígitos; vazio = WhatsApp principal)', 'text', { max: 13 }],
        ['hours', 'Horários', 'textarea', { max: 500 }],
        ['maps_url', 'Link do Google Maps (botão "Como chegar")', 'text', { max: 500 }],
        ['rating', 'Nota no Google (ex.: 4,9)', 'text', { max: 4 }],
        ['rating_count', 'Nº de avaliações', 'number', { max: 1000000 }],
        ['rating_source', 'Fonte da nota (ex.: Google, consultado em 05/10/2026)', 'text', { max: 120 }],
        ['review_quote', 'Trecho de avaliação de cliente', 'text', { max: 300 }],
        ['notes', 'Observações internas (não aparecem no site)', 'text', { max: 300 }],
        ['image', 'Foto da fachada', 'image'],
        ['sort', 'Ordem', 'number'],
        ['pickup_enabled', 'Aceita retirada de pedidos do site', 'bool'],
        ['active', 'Ativa', 'bool'],
      ],
    },
    servicos: {
      api: 'services',
      title: 'Serviços',
      one: 'serviço',
      cols: [['image', '', 'image'], ['title', 'Serviço'], ['price_info', 'Preço'], ['active', 'Ativo', 'bool'], ['sort', 'Ordem']],
      fields: [['title', 'Título', 'text', { required: true, max: 80 }], ['summary', 'Resumo', 'text'], ['description', 'Descrição', 'textarea'], ['price_info', 'Informação de preço', 'text'], ['image', 'Imagem', 'image'], ['sort', 'Ordem', 'number'], ['active', 'Ativo', 'bool']],
    },
    galeria: {
      api: 'gallery',
      title: 'Galeria',
      one: 'imagem',
      cols: [['image', '', 'image'], ['title', 'Título'], ['category', 'Categoria'], ['active', 'Ativo', 'bool'], ['sort', 'Ordem']],
      fields: [['title', 'Título', 'text', { required: true, max: 100 }], ['description', 'Descrição', 'text'], ['category', 'Categoria', 'select', { options: [['loja', 'A loja'], ['servicos', 'Serviços realizados']] }], ['image', 'Imagem *', 'image', { required: true }], ['sort', 'Ordem', 'number'], ['active', 'Ativo', 'bool']],
    },
    faq: {
      api: 'faqs',
      title: 'Perguntas frequentes',
      one: 'pergunta',
      cols: [['question', 'Pergunta'], ['active', 'Ativa', 'bool'], ['sort', 'Ordem']],
      fields: [['question', 'Pergunta', 'text', { required: true, max: 200 }], ['answer', 'Resposta', 'textarea', { required: true }], ['keywords', 'Palavras-chave para o chatbot (separadas por vírgula)', 'text'], ['sort', 'Ordem', 'number'], ['active', 'Ativa', 'bool']],
    },
  };

  function fieldHtml([name, label, type, opt = {}], v) {
    const val = v[name];
    const req = opt.required ? 'required' : '';
    if (type === 'textarea') return `<label class="full"><span class="lbl">${esc(label)}</span><textarea name="${name}" ${req} maxlength="${opt.max || 3000}">${esc(val || '')}</textarea></label>`;
    if (type === 'bool') return `<label class="check"><input type="checkbox" name="${name}" ${val === undefined || val ? 'checked' : ''}/> ${esc(label)}</label>`;
    if (type === 'number') return `<label><span class="lbl">${esc(label)}</span><input type="number" name="${name}" min="0" max="${opt.max || 999}" value="${esc(val ?? 0)}"/></label>`;
    if (type === 'select') return `<label><span class="lbl">${esc(label)}</span><select name="${name}">${opt.options.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    if (type === 'image') return `<div class="full"><span class="lbl" style="font-weight:600;font-size:.9rem">${esc(label)}</span><div class="img-field"><img data-prev="${name}" src="${esc(asset(val))}" alt=""/><input type="file" data-file="${name}" accept="image/png,image/jpeg,image/webp,image/gif" style="max-width:260px"/></div><input type="hidden" name="${name}" value="${esc(val || '')}"/></div>`;
    const t = type === 'email' ? 'email' : 'text';
    return `<label><span class="lbl">${esc(label)}${opt.required ? ' *' : ''}</span><input type="${t}" name="${name}" ${req} ${opt.min ? `minlength="${opt.min}"` : ''} maxlength="${opt.max || 250}" ${type === 'phone' ? 'data-phone inputmode="tel"' : ''} value="${esc(val || '')}"/></label>`;
  }

  async function pageResource(key, q) {
    const R = RES[key];
    setTitle(R.title);
    content.innerHTML = `<div class="card">
      <div class="toolbar">${R.search ? `<form id="rs" style="display:flex;gap:8px;flex:1"><input name="q" value="${esc(q.q || '')}" placeholder="Buscar ${R.one}…" style="max-width:320px"/><button class="btn btn-dark btn-sm">Buscar</button></form>` : '<span style="flex:1"></span>'}<button class="btn btn-primary btn-sm" id="rNew">+ Novo(a) ${R.one}</button></div>
      <div id="rlist"></div></div>
      ${['banners', 'servicos', 'galeria', 'faq'].includes(key) ? '<p class="small muted">As alterações aparecem imediatamente no site público.</p>' : ''}`;
    if (R.search) document.getElementById('rs').onsubmit = (e) => (e.preventDefault(), setQuery(`/${key}`, CB.formData(e.target)));
    const box = document.getElementById('rlist');
    CB.loading(box);
    const list = await CB.get(`/api/admin/r/${R.api}`, { q: q.q });
    const cell = (row, [k, , t]) => (t === 'money' ? brl(row[k]) : t === 'bool' ? (row[k] ? '<span class="badge badge-ok">Sim</span>' : '<span class="badge">Não</span>') : t === 'image' ? `<img class="thumb" src="${esc(asset(row[k]))}" alt=""/>` : esc(row[k] ?? ''));
    box.innerHTML = list.length
      ? `<div class="table-wrap"><table class="table"><thead><tr>${R.cols.map(([, l, t]) => `<th class="${t === 'money' ? 'num' : ''}">${esc(l)}</th>`).join('')}<th></th></tr></thead><tbody>${list
          .map((row) => `<tr>${R.cols.map((c) => `<td class="${c[2] === 'money' ? 'num' : ''}">${cell(row, c)}</td>`).join('')}<td><div class="row-actions">${key === 'clientes' ? `<button class="btn btn-ghost btn-sm" data-hist="${row.id}">Pedidos</button>` : ''}<button class="btn btn-ghost btn-sm" data-edit="${row.id}">Editar</button><button class="btn btn-ghost btn-sm" data-del="${row.id}">Excluir</button></div></td></tr>`)
          .join('')}</tbody></table></div>`
      : CB.empty(`Nenhum(a) ${R.one} cadastrado(a).`);
    const openForm = (row) => {
      const v = row || {};
      const imgs = {};
      return CB.modal({
        title: `${row ? 'Editar' : 'Novo(a)'} ${R.one}`,
        wide: R.fields.length > 5,
        body: `<form id="rf" novalidate class="form-grid">${R.fields.map((f) => fieldHtml(f, v)).join('')}</form>`,
        onOpen: (w) => {
          w.querySelectorAll('[data-phone]').forEach((i) => i.addEventListener('input', () => (i.value = CB.maskPhone(i.value))));
          w.querySelectorAll('[data-file]').forEach(
            (inp) =>
              (inp.onchange = async () => {
                try {
                  const url = await CB.readImage(inp.files[0], 1200);
                  imgs[inp.dataset.file] = url;
                  w.querySelector(`[name="${inp.dataset.file}"]`).value = url;
                  w.querySelector(`[data-prev="${inp.dataset.file}"]`).src = url;
                } catch (e) {
                  CB.toast(e.message, 'error');
                }
              })
          );
        },
        actions: [
          { label: 'Cancelar', cls: 'btn-ghost' },
          {
            label: 'Salvar',
            cls: 'btn-primary',
            handler: async (w) => {
              const f = w.querySelector('#rf');
              if (!CB.validateForm(f)) return false;
              const imgReq = R.fields.find((x) => x[2] === 'image' && x[3] && x[3].required);
              const d = CB.formData(f);
              if (imgReq && !d[imgReq[0]]) return CB.toast('Envie uma imagem.', 'error'), false;
              R.fields.filter((x) => x[2] === 'number').forEach((x) => (d[x[0]] = Number(d[x[0]] || 0)));
              try {
                await guard(() => (row ? CB.put(`/api/admin/r/${R.api}/${row.id}`, d) : CB.post(`/api/admin/r/${R.api}`, d)));
                CB.toast('Salvo com sucesso.');
                route();
              } catch (err) {
                CB.showErrors(f, err);
                return false;
              }
            },
          },
        ],
      });
    };
    document.getElementById('rNew').onclick = () => openForm(null);
    box.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => openForm(list.find((r) => String(r.id) === b.dataset.edit))));
    box.querySelectorAll('[data-del]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await CB.confirm('Excluir', `Excluir este(a) ${R.one}?`, { danger: true, ok: 'Excluir' }))) return;
          try {
            await guard(() => CB.del(`/api/admin/r/${R.api}/${b.dataset.del}`));
            CB.toast('Excluído.');
            route();
          } catch (e) {}
        })
    );
    box.querySelectorAll('[data-hist]').forEach(
      (b) =>
        (b.onclick = async () => {
          const orders = await CB.get(`/api/admin/customers/${b.dataset.hist}/orders`);
          CB.modal({
            title: 'Pedidos do cliente',
            wide: true,
            body: orders.length
              ? `<div class="table-wrap"><table class="table"><tbody>${orders.map((o) => `<tr><td><a href="#/pedidos/${o.id}" data-close>${esc(o.code)}</a></td><td>${CB.dt(o.created_at)}</td><td>${statusBadge(o.status)}</td><td>${payBadge(o.payment_status)}</td><td class="num">${brl(o.total_cents)}</td></tr>`).join('')}</tbody></table></div>`
              : CB.empty('Nenhum pedido.'),
          });
        })
    );
  }

  /* ================= Conteúdo institucional e configurações ================= */
  const SETTINGS_GROUPS = {
    conteudo: {
      title: 'Textos institucionais',
      groups: [
        ['Página inicial', [['hero_title', 'Título principal (banner)', 'text'], ['hero_subtitle', 'Subtítulo', 'textarea']]],
        ['Sobre a Cardoso Baterias', [['about_title', 'Título', 'text'], ['about_text', 'Texto', 'textarea'], ['about_highlights', 'Destaques (um por linha)', 'textarea']]],
        ['Outros textos', [['warranty_policy', 'Política de garantia', 'textarea'], ['footer_note', 'Nota do rodapé', 'text']]],
      ],
    },
    configuracoes: {
      title: 'Configurações',
      groups: [
        ['Identidade', [['store_name', 'Nome da loja', 'text'], ['logo_on_dark_url', 'Logo para fundo escuro (cabeçalho/rodapé)', 'image'], ['logo_url', 'Logo para fundo claro', 'image'], ['cnpj', 'CNPJ (deixe vazio até ter o dado real)', 'text']]],
        ['Contato', [['whatsapp_number', 'WhatsApp (55 + DDD + número, só dígitos)', 'text'], ['whatsapp_display', 'WhatsApp (como exibir)', 'text'], ['phone', 'Telefone', 'text'], ['email', 'E-mail', 'email']]],
        ['Endereço e atendimento', [['address', 'Endereço', 'textarea'], ['address_map_url', 'Link do mapa', 'text'], ['business_hours', 'Horários', 'textarea'], ['service_area', 'Área de atendimento', 'textarea']]],
        ['Redes sociais', [['instagram_url', 'Instagram (URL)', 'text'], ['facebook_url', 'Facebook (URL)', 'text'], ['tiktok_url', 'TikTok (URL)', 'text']]],
        [
          'Retirada, entrega e frete (demonstrativo)',
          [['pickup_enabled', 'Retirada na loja ativa', 'bool'], ['pickup_instructions', 'Instruções de retirada', 'textarea'], ['delivery_enabled', 'Entrega ativa', 'bool'], ['delivery_fee_cents', 'Valor do frete (R$)', 'money'], ['delivery_free_above_cents', 'Frete grátis a partir de (R$, 0 = nunca)', 'money'], ['delivery_info', 'Informações de entrega', 'textarea'], ['reservation_hours', 'Validade da reserva de estoque (horas)', 'int']],
        ],
      ],
    },
  };

  async function pageSettings(key) {
    const G = SETTINGS_GROUPS[key];
    setTitle(G.title);
    CB.loading(content);
    const s = await CB.get('/api/admin/settings');
    const imgs = {};
    const fh = ([k, l, t]) => {
      const v = s[k];
      if (t === 'textarea') return `<label class="full"><span class="lbl">${esc(l)}</span><textarea name="${k}">${esc(v ?? '')}</textarea></label>`;
      if (t === 'bool') return `<label class="check"><input type="checkbox" name="${k}" ${v ? 'checked' : ''}/> ${esc(l)}</label>`;
      if (t === 'money') return `<label><span class="lbl">${esc(l)}</span><input name="${k}" inputmode="decimal" value="${esc(CB.money(v))}"/></label>`;
      if (t === 'int') return `<label><span class="lbl">${esc(l)}</span><input name="${k}" type="number" min="1" max="720" value="${esc(v)}"/></label>`;
      if (t === 'image') return `<div><span class="lbl" style="font-weight:600;font-size:.9rem">${esc(l)}</span><div class="img-field"><img data-prev="${k}" src="${esc(asset(v))}" alt="" style="width:160px;height:70px;object-fit:contain;background:${k.includes('dark') ? '#111' : '#fff'}"/><input type="file" data-file="${k}" accept="image/png,image/jpeg,image/webp" style="max-width:240px"/></div></div>`;
      return `<label><span class="lbl">${esc(l)}</span><input type="${t === 'email' ? 'email' : 'text'}" name="${k}" value="${esc(v ?? '')}"/></label>`;
    };
    content.innerHTML = `<form id="sf" novalidate>${G.groups.map(([g, fields]) => `<div class="card"><h2>${esc(g)}</h2><div class="form-grid">${fields.map(fh).join('')}</div></div>`).join('')}
      <div style="position:sticky;bottom:0;background:#f2f2ef;padding:12px 0"><button class="btn btn-primary" type="submit">Salvar ${key === 'conteudo' ? 'textos' : 'configurações'}</button> <a class="btn btn-ghost" href="../" target="_blank">Ver no site ↗</a></div></form>`;
    const f = document.getElementById('sf');
    f.querySelectorAll('[data-file]').forEach(
      (inp) =>
        (inp.onchange = async () => {
          try {
            const url = await CB.readImage(inp.files[0], 600);
            imgs[inp.dataset.file] = url;
            f.querySelector(`[data-prev="${inp.dataset.file}"]`).src = url;
          } catch (e) {
            CB.toast(e.message, 'error');
          }
        })
    );
    f.onsubmit = async (e) => {
      e.preventDefault();
      const d = { ...CB.formData(f), ...imgs };
      for (const [, fields] of G.groups) for (const [k, , t] of fields) if (t === 'int') d[k] = Number(d[k]);
      try {
        await guard(() => CB.put('/api/admin/settings', d));
        CB.toast('Salvo. As alterações já aparecem no site.');
      } catch (err) {
        CB.showErrors(f, err);
      }
    };
  }

  /* ================= Relatórios ================= */
  async function pageReports(q) {
    setTitle('Relatórios');
    q = withPeriodDefaults(q, '30');
    const type = q.type || 'vendas';
    const types = [['vendas', 'Vendas concluídas'], ['pedidos', 'Pedidos'], ['estoque', 'Estoque (posição atual)'], ['movimentacoes', 'Movimentações de estoque']];
    content.innerHTML = `<div class="card"><div class="chips" style="margin-bottom:12px">${types.map(([k, l]) => `<a class="btn btn-sm ${k === type ? 'btn-dark' : 'btn-ghost'}" href="#/relatorios?${new URLSearchParams({ ...q, type: k })}">${l}</a>`).join(' ')}</div>
      ${type === 'estoque' ? '' : periodToolbar(q, { status: type === 'pedidos' })}
      <div class="toolbar"><button class="btn btn-primary btn-sm" id="csv">⬇ Exportar CSV</button><button class="btn btn-dark btn-sm" id="pdf">⬇ Exportar PDF</button></div>
      <div id="rep"></div></div>`;
    if (type !== 'estoque') bindPeriod(q, (v) => setQuery('/relatorios', { ...v, type }));
    const box = document.getElementById('rep');
    CB.loading(box);
    const r = await CB.get(`/api/admin/reports/${type}`, { from: q.from, to: q.to, status: q.status });
    box.innerHTML = `<h2>${esc(r.title)}</h2><p class="muted small">${esc(r.period)}</p>
      <div class="kpis">${r.summary.map((s) => `<div class="kpi"><div class="k-label">${esc(s.label)}</div><div class="k-value" style="font-size:1.5rem">${esc(CB.fmtReport(s.value, s.type))}</div></div>`).join('')}</div>
      ${r.rows.length ? `<div class="table-wrap" style="max-height:520px;overflow:auto"><table class="table"><thead><tr>${r.columns.map((c) => `<th class="${['money', 'int'].includes(c.type) ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${r.rows
        .slice(0, 300)
        .map((row) => `<tr>${r.columns.map((c) => `<td class="${['money', 'int'].includes(c.type) ? 'num' : ''}">${esc(CB.fmtReport(row[c.key], c.type))}</td>`).join('')}</tr>`)
        .join('')}</tbody></table></div>${r.rows.length > 300 ? `<p class="small muted">Exibindo 300 de ${r.rows.length}. A exportação inclui todas as linhas.</p>` : ''}` : CB.empty('Nenhum registro no período.')}`;
    document.getElementById('csv').onclick = () => CB.toast(`Arquivo ${CB.exportCSV(r)} gerado.`);
    document.getElementById('pdf').onclick = async (e) => {
      e.target.disabled = true;
      try {
        CB.toast(`Arquivo ${await CB.exportPDF(r)} gerado.`);
      } catch (err) {
        CB.toast(err.message, 'error');
      } finally {
        e.target.disabled = false;
      }
    };
  }

  /* ================= Demonstração ================= */
  async function pageDemo() {
    setTitle('Demonstração');
    const b = await CB.backend();
    content.innerHTML = `<div class="grid-2">
      <div class="card"><h2>Sobre esta demonstração</h2>
        <p>As marcas são reais, mas preços, estoque, garantias, aplicações por veículo, clientes, fornecedores e pedidos são <strong>fictícios</strong>. As imagens dos produtos são ilustrativas. Os pagamentos são <strong>simulados</strong> e nenhum valor é cobrado.</p>
        <p><strong>Banco de dados:</strong> ${b.mode === 'browser' ? 'SQLite executando no navegador (WebAssembly), salvo no IndexedDB deste navegador. Os dados persistem ao atualizar ou fechar o navegador. Outro navegador/dispositivo terá sua própria cópia da demonstração.' : 'SQLite no servidor (arquivo em disco).'}</p>
        <p><strong>Chatbot:</strong> assistente baseado em regras (FAQ + catálogo), sem IA externa.</p>
      </div>
      <div class="card danger-zone"><h2>Restaurar dados iniciais</h2>
        <p>Apaga produtos, pedidos, clientes, fornecedores, movimentações e conteúdo, e recarrega os dados demonstrativos. Usuários e senha são mantidos.</p>
        <button class="btn btn-danger" id="reset">Restaurar dados iniciais…</button>
      </div>
      <form class="card" id="pw" novalidate><h2>Alterar senha</h2>
        <div class="form-grid" style="grid-template-columns:1fr"><label><span class="lbl">Senha atual</span><input type="password" name="current" required autocomplete="current-password"/></label><label><span class="lbl">Nova senha (mín. 8)</span><input type="password" name="next" required minlength="8" autocomplete="new-password"/></label></div>
        <button class="btn btn-dark" style="margin-top:12px">Alterar senha</button>
        <p class="small muted">As senhas são armazenadas com hash (bcrypt).</p>
      </form></div>`;
    document.getElementById('reset').onclick = async () => {
      const ok = await CB.modal({
        title: 'Restaurar dados iniciais',
        body: '<p>Esta ação <strong>apaga todos os dados atuais</strong> da demonstração e recarrega os dados iniciais. Não pode ser desfeita.</p><label><span class="lbl">Digite RESTAURAR para confirmar</span><input id="rc" autocomplete="off"/></label>',
        actions: [
          { label: 'Cancelar', cls: 'btn-ghost', value: false },
          {
            label: 'Restaurar',
            cls: 'btn-danger',
            handler: async (w) => {
              const v = w.querySelector('#rc').value.trim();
              if (v !== 'RESTAURAR') return CB.toast('Digite RESTAURAR para confirmar.', 'error'), false;
              try {
                await guard(() => CB.post('/api/admin/demo/reset', { confirm: v }));
                return true;
              } catch (e) {
                return false;
              }
            },
          },
        ],
      });
      if (ok) {
        try {
          localStorage.removeItem('cb_cart_v1');
          localStorage.removeItem('cb_my_orders');
        } catch (e) {}
        CB.toast('Dados demonstrativos restaurados.');
        location.hash = '#/';
      }
    };
    document.getElementById('pw').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!CB.validateForm(f)) return;
      try {
        await guard(() => CB.post('/api/auth/password', CB.formData(f)));
        CB.toast('Senha alterada.');
        f.reset();
      } catch (err) {
        CB.showErrors(f, err);
      }
    };
  }

  /* ================= Roteador ================= */
  const ROUTES = [
    [/^\/?$/, (m, q) => pageDashboard(q)],
    [/^\/pedidos$/, (m, q) => pageOrders(q)],
    [/^\/pedidos\/(\d+)$/, (m) => pageOrder(m[1])],
    [/^\/venda$/, pageSale],
    [/^\/produtos$/, (m, q) => pageProducts(q)],
    [/^\/produtos\/(novo|\d+)$/, (m) => pageProductForm(m[1])],
    [/^\/estoque$/, (m, q) => pageStock(q)],
    [/^\/(marcas|categorias|fornecedores|clientes|lojas|banners|servicos|galeria|faq)$/, (m, q) => pageResource(m[1], q)],
    [/^\/(conteudo|configuracoes)$/, (m) => pageSettings(m[1])],
    [/^\/relatorios$/, (m, q) => pageReports(q)],
    [/^\/demo$/, pageDemo],
  ];

  async function route() {
    if (!USER || !content) return;
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, qs] = raw.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const base = '#/' + (path.split('/')[1] || '');
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === base));
    document.getElementById('sidebar').classList.remove('open');
    const r = ROUTES.find(([re]) => re.test(path));
    window.scrollTo(0, 0);
    if (!r) return (content.innerHTML = CB.empty('Página não encontrada.'));
    try {
      await r[1](path.match(r[0]), q);
    } catch (e) {
      if (e.status === 401) return;
      console.error(e);
      content.innerHTML = CB.errorState(e, true);
      const b = content.querySelector('[data-retry]');
      if (b) b.onclick = route;
    }
  }
  window.addEventListener('hashchange', route);

  (async function start() {
    try {
      await CB.backend();
    } catch (e) {
      root.innerHTML = `<div class="login-wrap"><div class="login-card">${CB.errorState(e)}</div></div>`;
      return;
    }
    if (CB.token()) {
      try {
        USER = (await CB.get('/api/auth/me')).user;
        return renderShell();
      } catch (e) {
        CB.setToken(null);
      }
    }
    renderLogin();
  })();
})();
