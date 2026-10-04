/* Cardoso Baterias — chatbot flutuante (assistente por regras; sem IA externa) */
(function () {
  'use strict';
  const { esc, brl, asset } = CB;

  CB.initChat = function ({ settings, waLink }) {
    const panel = document.getElementById('chatPanel');
    const fab = document.getElementById('chatFab');
    const history = [];
    let started = false;
    let sending = false;

    panel.innerHTML = `
      <div class="chat-head">
        <div class="avatar" aria-hidden="true">🔋</div>
        <div><strong>Assistente Cardoso</strong><small>Respostas automáticas com base no cadastro da loja · não é IA</small></div>
        <a class="btn btn-wa btn-sm" id="chatWa" target="_blank" rel="noopener" href="${esc(waLink('Olá! Vim pelo site da Cardoso Baterias e gostaria de falar com um atendente.'))}" title="Falar com atendente no WhatsApp">Atendente</a>
        <button class="icon-btn" id="chatClose" aria-label="Fechar assistente">✕</button>
      </div>
      <div class="chat-body" id="chatBody" aria-live="polite"></div>
      <div class="chat-quick" id="chatQuick"></div>
      <form class="chat-form" id="chatForm"><input id="chatInput" maxlength="500" autocomplete="off" placeholder="Digite sua dúvida…" aria-label="Mensagem"/><button class="btn btn-primary" type="submit">Enviar</button></form>
      <div class="chat-note">Não informa compatibilidade sem cadastro. Em caso de dúvida, fale com um atendente.</div>`;

    const body = panel.querySelector('#chatBody');
    const quick = panel.querySelector('#chatQuick');
    const input = panel.querySelector('#chatInput');

    const scroll = () => (body.scrollTop = body.scrollHeight);
    function addUser(text) {
      const d = document.createElement('div');
      d.className = 'msg msg-user';
      d.textContent = text;
      body.appendChild(d);
      scroll();
    }
    function addBot(r) {
      const d = document.createElement('div');
      d.className = 'msg msg-bot';
      let html = esc(r.text);
      if (r.products && r.products.length) {
        html += `<div class="msg-products">${r.products
          .map(
            (p) => `<a class="msg-product" href="#/produto/${p.id}"><img src="${esc(asset(p.image))}" alt=""/><span><strong>${esc(p.name)}</strong><br><span class="small">${brl(p.price_cents)} · ${p.available_qty > 0 ? `${p.available_qty} disp.` : 'esgotado'}</span></span></a>`
          )
          .join('')}</div>`;
      }
      const actions = [];
      (r.links || []).forEach((l) => actions.push(`<a class="btn btn-ghost btn-sm" href="${esc(l.href)}">${esc(l.label)}</a>`));
      if (r.whatsapp && (r.understood === false || /atendente|whats/i.test(r.text) || (r.products && r.products.length)))
        actions.push(`<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="${esc(r.whatsapp.url)}">${esc(r.whatsapp.label)}</a>`);
      if (actions.length) html += `<div class="msg-actions">${actions.join('')}</div>`;
      d.innerHTML = html;
      body.appendChild(d);
      d.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', () => window.innerWidth < 560 && toggle(false)));
      setQuick(r.quick || []);
      scroll();
    }
    function setQuick(list) {
      quick.innerHTML = list.map((q) => `<button type="button">${esc(q)}</button>`).join('');
      quick.querySelectorAll('button').forEach((b) => (b.onclick = () => send(b.textContent)));
    }
    async function send(text) {
      text = String(text || '').trim();
      if (!text || sending) return;
      sending = true;
      addUser(text);
      history.push({ role: 'user', text });
      const typing = document.createElement('div');
      typing.className = 'msg msg-bot';
      typing.innerHTML = '<span class="typing" aria-label="Digitando"><i></i><i></i><i></i></span>';
      body.appendChild(typing);
      scroll();
      try {
        const [r] = await Promise.all([CB.post('/api/public/chat', { message: text, history: history.slice(-8) }), new Promise((ok) => setTimeout(ok, 350))]);
        typing.remove();
        addBot(r);
        history.push({ role: 'bot', text: r.text });
      } catch (e) {
        typing.remove();
        addBot({
          text: 'Não consegui responder agora. Fale com um atendente pelo WhatsApp.',
          understood: false,
          whatsapp: { label: 'Falar no WhatsApp', url: waLink('Olá! Vim pelo site da Cardoso Baterias e preciso de ajuda.') },
        });
      } finally {
        sending = false;
      }
    }
    function toggle(open) {
      const isOpen = open === undefined ? !panel.classList.contains('open') : open;
      panel.classList.toggle('open', isOpen);
      document.body.classList.toggle('chat-open', isOpen);
      fab.setAttribute('aria-expanded', isOpen);
      if (isOpen && !started) {
        started = true;
        addBot({
          text: `Olá! Sou o assistente virtual da ${settings.store_name}. Respondo com base no catálogo e nas informações cadastradas pela loja. Como posso ajudar?`,
          quick: ['Ver baterias 60Ah', 'Qual bateria serve no meu carro?', 'Qual a garantia?', 'Vocês entregam?', 'Horário de atendimento', 'Serviços', 'Como comprar pelo site?', 'Falar com atendente'],
        });
      }
      if (isOpen) setTimeout(() => input.focus(), 50);
    }
    fab.onclick = () => toggle();
    panel.querySelector('#chatClose').onclick = () => toggle(false);
    panel.querySelector('#chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = input.value;
      input.value = '';
      send(t);
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && panel.classList.contains('open') && toggle(false));
    CB.chat = { open: () => toggle(true), send };
  };
})();
