/* Cardoso Baterias — utilitários compartilhados (loja e painel) */
(function () {
  'use strict';
  const CB = (window.CB = window.CB || {});
  CB.BASE = CB.BASE || '';

  /* ---------------- Backend: servidor Node ou banco no navegador ---------------- */
  let backendPromise = null;
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.head.appendChild(s);
    });

  async function detectMode() {
    const forced = (window.CB_CONFIG && window.CB_CONFIG.backend) || 'auto';
    if (forced !== 'auto') return forced;
    if (location.protocol === 'file:' || /github\.io$/.test(location.hostname)) return 'browser';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const r = await fetch('/api/health', { signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok && (await r.json()).ok) return 'server';
    } catch (e) {}
    return 'browser';
  }

  function backend() {
    if (backendPromise) return backendPromise;
    backendPromise = (async () => {
      const mode = await detectMode();
      if (mode === 'server') {
        return {
          mode,
          async handle({ method, path, query, body, token }) {
            const qs = query && Object.keys(query).length ? '?' + new URLSearchParams(clean(query)) : '';
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers.Authorization = 'Bearer ' + token;
            const r = await fetch(path + qs, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
            let data = null;
            try {
              data = await r.json();
            } catch (e) {
              data = { error: 'Resposta inválida do servidor.' };
            }
            return { status: r.status, body: data };
          },
        };
      }
      await loadScript(CB.BASE + 'vendor/sql-wasm.js');
      await loadScript(CB.BASE + 'js/core.bundle.js');
      const b = await window.CBBackend.createBrowserBackend({ wasmBase: CB.BASE + 'vendor/' });
      return b;
    })();
    return backendPromise;
  }
  CB.backend = backend;

  const clean = (o) => {
    const out = {};
    for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') out[k] = v;
    return out;
  };

  class ApiError extends Error {
    constructor(status, body) {
      super((body && body.error) || 'Erro inesperado.');
      this.status = status;
      this.fields = (body && body.fields) || null;
      this.body = body;
    }
  }
  CB.ApiError = ApiError;

  CB.token = () => {
    try {
      return localStorage.getItem('cb_admin_token');
    } catch (e) {
      return null;
    }
  };
  CB.setToken = (t) => {
    try {
      t ? localStorage.setItem('cb_admin_token', t) : localStorage.removeItem('cb_admin_token');
    } catch (e) {}
  };

  CB.api = async function (method, path, body, query) {
    const b = await backend();
    const res = await b.handle({ method, path, body: body || {}, query: clean(query), token: CB.token() });
    if (res.status >= 400) {
      if (res.status === 401 && CB.onUnauthorized) CB.onUnauthorized();
      throw new ApiError(res.status, res.body);
    }
    return res.body;
  };
  CB.get = (path, query) => CB.api('GET', path, null, query);
  CB.post = (path, body) => CB.api('POST', path, body);
  CB.put = (path, body) => CB.api('PUT', path, body);
  CB.del = (path) => CB.api('DELETE', path);

  /* ---------------- Formatação ---------------- */
  CB.esc = (s) =>
    String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  CB.brl = (c) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  CB.money = (c) => (c === null || c === undefined ? '' : (Number(c) / 100).toFixed(2).replace('.', ','));
  CB.dt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  CB.d = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
  CB.nl2br = (s) => CB.esc(s).replace(/\n/g, '<br>');
  CB.asset = (u) => {
    if (!u) return CB.BASE + 'img/battery-placeholder.svg';
    if (/^(data:|https?:|blob:)/.test(u)) return u;
    return CB.BASE + String(u).replace(/^\.?\//, '');
  };
  CB.digits = (s) => String(s || '').replace(/\D/g, '');
  CB.maskPhone = (v) => {
    const d = CB.digits(v).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  CB.todayKey = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  CB.STATUS = {
    aguardando_pagamento: 'Aguardando pagamento',
    confirmado: 'Confirmado',
    em_preparacao: 'Em preparação',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  CB.PAY_STATUS = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado', estornado: 'Estornado' };
  CB.PAY_METHOD = {
    pix: 'Pix (demonstrativo)',
    cartao: 'Cartão (simulado)',
    retirada: 'Pagamento na retirada',
    dinheiro: 'Dinheiro (balcão)',
    cartao_balcao: 'Cartão (balcão)',
    pix_balcao: 'Pix (balcão)',
  };
  CB.MOV = { entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', reserva: 'Reserva', liberacao: 'Liberação', baixa_venda: 'Baixa por venda', devolucao: 'Devolução' };

  /* ---------------- WhatsApp ---------------- */
  CB.wa = (number, msg) => `https://wa.me/${CB.digits(number)}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`;

  /* ---------------- UI: toast, modal, formulários ---------------- */
  CB.toast = function (msg, type = 'ok', ms = 3800) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
  };

  CB.modal = function ({ title, body, actions = [], wide = false, onOpen }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-backdrop';
      wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${CB.esc(title)}">
        <div class="modal-head"><h3>${CB.esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">✕</button></div>
        <div class="modal-body"></div>
        <div class="modal-actions"></div></div>`;
      const bodyEl = wrap.querySelector('.modal-body');
      if (typeof body === 'string') bodyEl.innerHTML = body;
      else if (body) bodyEl.appendChild(body);
      const close = (v) => {
        wrap.remove();
        document.removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = (e) => e.key === 'Escape' && close(null);
      document.addEventListener('keydown', onKey);
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap || e.target.closest('[data-close]')) close(null);
      });
      const act = wrap.querySelector('.modal-actions');
      for (const a of actions) {
        const b = document.createElement('button');
        b.className = `btn ${a.cls || ''}`;
        b.textContent = a.label;
        b.type = 'button';
        b.onclick = async () => {
          if (a.handler) {
            b.disabled = true;
            try {
              const r = await a.handler(wrap);
              if (r !== false) close(r === undefined ? a.value ?? true : r);
            } finally {
              b.disabled = false;
            }
          } else close(a.value ?? null);
        };
        act.appendChild(b);
      }
      document.body.appendChild(wrap);
      if (onOpen) onOpen(wrap);
      const first = wrap.querySelector('input, select, textarea, button.btn');
      if (first) first.focus();
    });
  };

  CB.confirm = (title, message, { danger = false, ok = 'Confirmar' } = {}) =>
    CB.modal({
      title,
      body: `<p>${message}</p>`,
      actions: [
        { label: 'Cancelar', cls: 'btn-ghost', value: false },
        { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', value: true },
      ],
    });

  /** Lê um formulário como objeto (checkbox => boolean). */
  CB.formData = (form) => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else out[el.name] = el.value;
    }
    return out;
  };

  /** Mostra erros de campo vindos do servidor (ou da validação do cliente). */
  CB.showErrors = (form, err) => {
    form.querySelectorAll('.field-error').forEach((e) => e.remove());
    form.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
    const fields = (err && err.fields) || {};
    let first = null;
    for (const [k, msg] of Object.entries(fields)) {
      const name = k.replace(/^address\./, 'address_');
      const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`[name="${k}"]`);
      if (!el) continue;
      el.classList.add('invalid');
      const m = document.createElement('small');
      m.className = 'field-error';
      m.textContent = msg;
      (el.closest('label') || el.parentElement).appendChild(m);
      first = first || el;
    }
    if (first) first.focus();
    return !!first;
  };

  /** Validação no cliente usando os atributos HTML5 + regras extras. */
  CB.validateForm = (form) => {
    const fields = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.closest('[hidden]')) continue;
      if (!el.checkValidity()) fields[el.name] = el.dataset.msg || el.validationMessage;
      if (el.dataset.phone !== undefined && el.value && ![10, 11].includes(CB.digits(el.value).length)) {
        fields[el.name] = 'Informe DDD + número (10 ou 11 dígitos).';
      }
    }
    if (Object.keys(fields).length) {
      CB.showErrors(form, { fields });
      return false;
    }
    CB.showErrors(form, {});
    return true;
  };

  CB.loading = (el, text = 'Carregando…') => {
    el.innerHTML = `<div class="state state-loading"><span class="spinner" aria-hidden="true"></span><span>${CB.esc(text)}</span></div>`;
  };
  CB.empty = (text, extra = '') => `<div class="state state-empty"><div class="state-icon" aria-hidden="true">🔋</div><p>${CB.esc(text)}</p>${extra}</div>`;
  CB.errorState = (err, retry) =>
    `<div class="state state-error"><p>⚠️ ${CB.esc((err && err.message) || 'Não foi possível carregar.')}</p>${retry ? '<button class="btn btn-ghost" data-retry>Tentar novamente</button>' : ''}</div>`;

  /** Redimensiona imagem enviada pelo usuário e devolve data URL (JPEG/PNG). */
  CB.readImage = (file, max = 900) =>
    new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Nenhum arquivo.'));
      if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return reject(new Error('Use imagens PNG, JPG, WEBP ou GIF.'));
      if (file.size > 8 * 1024 * 1024) return reject(new Error('Imagem maior que 8 MB.'));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        const png = file.type === 'image/png';
        resolve(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      img.src = url;
    });
})();
