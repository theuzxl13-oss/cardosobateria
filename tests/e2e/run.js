'use strict';
/**
 * Verificação ponta a ponta no navegador (modo GitHub Pages: banco SQLite no navegador).
 * Requer Chromium: defina CHROMIUM_PATH ou instale com `npx playwright-core install chromium`.
 * Uso: npm run test:e2e
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');

const OUT = path.join(__dirname, 'output');
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8800 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}/cardosobateria/`;
const results = [];
const step = async (name, fn) => {
  const t = Date.now();
  try {
    const info = await fn();
    results.push({ ok: true, name, info });
    console.log(`✅ ${name}${info ? ` — ${info}` : ''} (${Date.now() - t} ms)`);
  } catch (e) {
    results.push({ ok: false, name, info: e.message });
    console.log(`❌ ${name} — ${e.message}`);
    throw e;
  }
};
const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function exe() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  if (fs.existsSync('/opt/pw-browsers/chromium')) {
    const d = '/opt/pw-browsers/chromium';
    if (fs.statSync(d).isFile()) return d;
    const cand = path.join(d, 'chrome-linux', 'chrome');
    if (fs.existsSync(cand)) return cand;
  }
  return undefined;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'static-preview.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-e2e-'));
  const launch = (viewport) => chromium.launchPersistentContext(userDataDir, { executablePath: exe(), viewport, acceptDownloads: true });
  let ctx = await launch({ width: 1366, height: 900 });
  let page = ctx.pages()[0] || (await ctx.newPage());
  const errors = [];
  const watch = (p) => p.on('pageerror', (e) => errors.push(e.message));
  watch(page);
  const api = (p, method, url, body, query) => p.evaluate(([m, u, b, q]) => CB.api(m, u, b, q), [method, url, body || null, query || null]);
  const toast = async (p, re) => {
    await p.waitForFunction((src) => [...document.querySelectorAll('.toast')].some((t) => new RegExp(src).test(t.textContent)), re.source, { timeout: 10000 });
  };
  let productId;
  let code1;
  let code2;
  let dashBefore;

  try {
    await step('1. Entrar no painel', async () => {
      await page.goto(BASE + 'admin/');
      await page.click('#fillDemo');
      await page.click('#login button[type=submit]');
      await page.waitForSelector('.kpi', { timeout: 20000 });
      dashBefore = await api(page, 'GET', '/api/admin/dashboard', null, {});
      return `vendas de hoje antes: ${brl(dashBefore.today.sales.total_cents)}`;
    });

    await step('2. Cadastrar e editar um produto', async () => {
      await page.goto(BASE + 'admin/#/produtos/novo');
      await page.waitForSelector('#prodForm');
      await page.fill('[name=name]', 'Bateria E2E 55Ah Teste');
      await page.fill('[name=sku]', 'E2E-55D');
      await page.selectOption('[name=brand_id]', { index: 1 });
      await page.fill('[name=capacity_ah]', '55');
      await page.fill('[name=warranty_months]', '18');
      await page.fill('[name=min_stock]', '1');
      await page.fill('[name=price_cents]', '399,90');
      await page.fill('[name=cost_cents]', '250,00');
      await page.click('#prodForm [type=submit]');
      await page.waitForURL(/#\/produtos\/\d+$/);
      productId = Number(page.url().split('/').pop());
      await page.waitForSelector('#prodForm');
      await page.fill('[name=price_cents]', '389,90');
      await page.click('#prodForm [type=submit]');
      await toast(page, /Alterações salvas/);
      await page.click('#addApp');
      await page.fill('#appF [name=make]', 'MarcaE2E');
      await page.fill('#appF [name=model]', 'ModeloE2E');
      await page.fill('#appF [name=year_start]', '2010');
      await page.fill('#appF [name=year_end]', '2020');
      await page.click('.modal .btn-primary');
      await toast(page, /Aplicação salva/);
      const p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.price_cents === 38990, 'preço editado');
      assert(p.applications.length === 1, 'aplicação cadastrada');
      return `produto #${productId}, preço ${brl(p.price_cents)}`;
    });

    await step('3. Registrar entrada de estoque', async () => {
      await page.goto(BASE + `admin/#/estoque?productId=${productId}`);
      await page.waitForSelector('#movForm');
      await page.selectOption('#movForm [name=type]', 'entrada');
      await page.fill('#movForm [name=quantity]', '6');
      await page.fill('#movForm [name=reason]', 'NF E2E 001');
      await page.click('#movForm [type=submit]');
      await toast(page, /Movimentação registrada/);
      const p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.stock_qty === 6 && p.available_qty === 6, 'estoque 6');
      return 'físico 6, disponível 6';
    });

    await step('4. Encontrar o produto no site (busca e consulta por veículo)', async () => {
      await page.goto(BASE + '#/catalogo?q=E2E-55D');
      await page.waitForSelector('.product-card');
      const txt = await page.textContent('#results');
      assert(txt.includes('Bateria E2E 55Ah Teste') && txt.includes('Em estoque (6)'), 'produto visível com estoque 6');
      await page.goto(BASE + '#/catalogo?make=MarcaE2E&model=ModeloE2E&year=2015');
      await page.waitForFunction(() => /Confirme a compatibilidade/.test(document.getElementById('results').textContent) && document.querySelector('#results .product-card'), null, { timeout: 10000 });
      await page.goto(BASE + '#/catalogo?make=MarcaE2E&model=ModeloE2E&year=2025');
      await page.waitForFunction(() => /Não temos aplicação/.test(document.getElementById('results').textContent) && document.querySelector('#results .btn-wa'), null, { timeout: 10000 });
      return 'encontrado; ano sem aplicação oferece WhatsApp';
    });

    await step('5. Adicionar ao carrinho (alterar quantidade, limite do disponível)', async () => {
      await page.goto(BASE + `#/produto/${productId}`);
      await page.waitForSelector('#addCart');
      await page.fill('#qty', '99');
      await page.click('#addCart');
      await toast(page, /Disponível: 6/);
      await page.fill('#qty', '1');
      await page.click('#addCart');
      await toast(page, /Adicionado/);
      await page.goto(BASE + '#/carrinho');
      await page.waitForSelector('[data-inc]');
      await page.click('[data-inc]');
      await page.waitForFunction(() => document.querySelector('[data-set]') && document.querySelector('[data-set]').value === '2');
      assert((await page.textContent('#cartBox')).replace(/\u00a0/g, ' ').includes('R$ 779,80'), 'subtotal 2 x 389,90');
      return 'carrinho: 2 un., R$ 779,80';
    });

    await step('6. Finalizar um pedido demonstrativo', async () => {
      await page.click('a[href="#/checkout"]');
      await page.waitForSelector('#co');
      await page.click('#co [type=submit]');
      await page.waitForSelector('.field-error');
      await page.fill('[name=name]', 'Cliente E2E');
      await page.fill('[name=phone]', '11977776666');
      await page.check('[name=fulfillment][value=entrega]');
      await page.waitForSelector('#addr:not([hidden])');
      await page.click('#co [type=submit]');
      await page.waitForSelector('[name=address_street].invalid');
      await page.check('[name=fulfillment][value=retirada]');
      await page.check('[name=paymentMethod][value=pix]');
      await page.waitForSelector('#co [type=submit]:not([disabled])');
      await page.click('#co [type=submit]');
      await page.waitForURL(/#\/pedido\//);
      await page.waitForSelector('.pay-demo');
      code1 = decodeURIComponent(page.url().split('/pedido/')[1].split('?')[0]);
      assert((await page.textContent('#orderBox')).includes('ILUSTRATIVO'), 'Pix ilustrativo');
      return `pedido ${code1}`;
    });

    await step('7. Conferir a reserva de estoque', async () => {
      const p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.reserved_qty === 2 && p.stock_qty === 6 && p.available_qty === 4, `reservado ${p.reserved_qty}`);
      const pub = await api(page, 'GET', `/api/public/products/${productId}`);
      assert(pub.available_qty === 4, 'catálogo desconta reservas');
      return 'físico 6, reservado 2, disponível 4';
    });

    await step('8. Simular pagamento e concluir a venda', async () => {
      const waHref = await page.getAttribute('#orderBox .btn-wa', 'href');
      assert(decodeURIComponent(waHref).includes(code1), 'resumo do pedido no WhatsApp');
      await page.click('[data-sim=recusado]');
      await toast(page, /recusado/);
      await page.waitForSelector('[data-sim=aprovado]');
      await page.click('[data-sim=aprovado]');
      await toast(page, /aprovado/);
      await page.waitForFunction(() => /Confirmado/.test(document.getElementById('orderBox').textContent));
      const list = await api(page, 'GET', '/api/admin/orders', null, { q: code1 });
      const id = list.items[0].id;
      assert(list.items[0].stock_state === 'reservado', 'pagamento não baixa o estoque');
      await page.goto(BASE + `admin/#/pedidos/${id}`);
      await page.waitForSelector('[data-status=concluido]');
      await page.click('[data-status=concluido]');
      await page.click('.modal .btn-primary');
      await toast(page, /Concluído/);
      return `pedido ${code1} pago (simulado) e concluído`;
    });

    await step('9. Conferir a baixa e os indicadores', async () => {
      const p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.stock_qty === 4 && p.reserved_qty === 0, `físico ${p.stock_qty}`);
      const d = await api(page, 'GET', '/api/admin/dashboard', null, {});
      const diff = d.today.sales.total_cents - dashBefore.today.sales.total_cents;
      assert(diff === 77980, `vendas de hoje +${diff}`);
      assert(d.today.payments.net_cents - dashBefore.today.payments.net_cents === 77980, 'pagamentos recebidos');
      await page.goto(BASE + 'admin/#/');
      await page.waitForSelector('.kpi');
      assert((await page.textContent('#dash')).includes(brl(d.today.sales.total_cents)), 'KPI exibido');
      return `físico 4, reservado 0; vendas de hoje ${brl(dashBefore.today.sales.total_cents)} → ${brl(d.today.sales.total_cents)}`;
    });

    await step('10. Cancelar outro pedido e verificar a liberação da reserva', async () => {
      const o = await api(page, 'POST', '/api/public/orders', { name: 'Cliente E2E 2', phone: '11977775555', fulfillment: 'retirada', paymentMethod: 'retirada', items: [{ productId, quantity: 3 }] });
      code2 = o.code;
      let p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.reserved_qty === 3 && p.available_qty === 1, 'reservou 3');
      const id = (await api(page, 'GET', '/api/admin/orders', null, { q: code2 })).items[0].id;
      await page.goto(BASE + `admin/#/pedidos/${id}`);
      await page.waitForSelector('[data-status=cancelado]');
      await page.click('[data-status=cancelado]');
      await page.fill('#cReason', 'Teste E2E');
      await page.click('.modal .btn-danger');
      await toast(page, /Cancelado/);
      p = await api(page, 'GET', `/api/admin/products/${productId}`);
      assert(p.reserved_qty === 0 && p.available_qty === 4, 'reserva liberada');
      const dup = await page.evaluate((oid) => CB.api('POST', `/api/admin/orders/${oid}/status`, { status: 'cancelado' }).then(() => 200, (e) => e.status), id);
      assert(dup === 409, 'cancelamento duplicado bloqueado');
      return `pedido ${code2}: reserva 3 → 0; repetição recusada (409)`;
    });

    await step('11. Exportar relatórios (CSV e PDF)', async () => {
      const files = [];
      for (const t of ['vendas', 'pedidos', 'estoque']) {
        await page.goto(BASE + `admin/#/relatorios?type=${t}&preset=hoje&from=${new Date().toISOString().slice(0, 10)}`);
        await page.waitForSelector('#csv');
        await page.waitForTimeout(300);
        for (const btn of ['#csv', '#pdf']) {
          const [dl] = await Promise.all([page.waitForEvent('download'), page.click(btn)]);
          const f = path.join(OUT, dl.suggestedFilename());
          await dl.saveAs(f);
          assert(fs.statSync(f).size > 500, 'arquivo vazio');
          files.push(path.basename(f));
        }
      }
      const csv = fs.readFileSync(path.join(OUT, files.find((f) => f.includes('pedidos') && f.endsWith('.csv'))), 'utf8');
      assert(csv.includes(code1) && csv.includes(code2), 'CSV contém os pedidos');
      assert(fs.readFileSync(path.join(OUT, files.find((f) => f.endsWith('.pdf')))).slice(0, 4).toString() === '%PDF', 'PDF válido');
      return files.join(', ');
    });

    await step('12. Conversar com o chatbot', async () => {
      await page.goto(BASE);
      await page.waitForSelector('.hero');
      await page.click('#chatFab');
      await page.fill('#chatInput', 'tem bateria 55ah?');
      await page.press('#chatInput', 'Enter');
      await page.waitForFunction(() => document.querySelectorAll('.msg-bot').length >= 2 && !document.querySelector('.typing'));
      const reply = (await page.evaluate(() => [...document.querySelectorAll('.msg-bot')].pop().textContent)).replace(/\u00a0/g, ' ');
      assert(reply.includes('Bateria E2E 55Ah Teste') && reply.includes('R$ 389,90'), 'resposta com dado do catálogo');
      await page.fill('#chatInput', 'qual a cor do céu em marte');
      await page.press('#chatInput', 'Enter');
      await page.waitForFunction(() => document.querySelectorAll('.msg-bot').length >= 3 && !document.querySelector('.typing'));
      const r2 = await page.evaluate(() => [...document.querySelectorAll('.msg-bot')].pop().innerHTML);
      assert(/não encontrei/i.test(r2) && r2.includes('wa.me/5511962986718'), 'fallback para WhatsApp');
      await page.screenshot({ path: path.join(OUT, 'desktop-chat.png') });
      return 'respondeu com preço do cadastro; pergunta desconhecida → WhatsApp';
    });

    await step('13. Abrir o WhatsApp com a mensagem correta', async () => {
      await page.goto(BASE + `#/produto/${productId}`);
      await page.reload();
      await page.waitForSelector('#waQuote');
      await page.fill('#myVehicle', 'Fiat Uno 2015');
      const href = await page.getAttribute('#waQuote', 'href');
      const expected = 'Olá! Vim pelo site da Cardoso Baterias e gostaria de saber mais sobre a bateria Bateria E2E 55Ah Teste (E2E-55D). Meu veículo é Fiat Uno 2015.';
      assert(href === `https://wa.me/5511962986718?text=${encodeURIComponent(expected)}`, `link: ${href}`);
      assert((await page.getAttribute('#waFab', 'href')).startsWith('https://wa.me/5511962986718?text='), 'botão flutuante');
      const requested = [];
      const onReq = (r) => requested.push(r.url());
      ctx.on('request', onReq);
      const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#waQuote')]);
      await popup.waitForLoadState().catch(() => {});
      ctx.off('request', onReq);
      await popup.close();
      // (em ambientes sem internet a aba mostra erro de rede, mas a URL solicitada é verificada)
      assert(requested.some((u) => u.startsWith('https://wa.me/5511962986718?text=')), `nova aba não solicitou wa.me: ${requested.join(', ')}`);
      return decodeURIComponent(href.split('text=')[1]);
    });

    await step('14. Atualizar a página e reiniciar o navegador (persistência)', async () => {
      await page.reload();
      await page.waitForSelector('#waQuote');
      assert((await page.textContent('.pp-info')).includes('Em estoque (4)'), 'após recarregar');
      await ctx.close();
      ctx = await launch({ width: 390, height: 844 });
      page = ctx.pages()[0] || (await ctx.newPage());
      watch(page);
      await page.goto(BASE + '#/consultar-pedido');
      await page.waitForSelector('#lk');
      await page.fill('[name=code]', code1);
      await page.fill('[name=phone]', '11977776666');
      await page.click('#lk [type=submit]');
      await page.waitForURL(/#\/pedido\//);
      await page.waitForSelector('#orderBox h2');
      assert((await page.textContent('#orderBox')).includes('Concluído'), 'pedido concluído após reiniciar');
      return 'dados mantidos após recarregar e após fechar/abrir o navegador (IndexedDB)';
    });

    await step('15. Verificar o layout no celular (390×844)', async () => {
      const shots = [];
      for (const [name, hash] of [['home', ''], ['catalogo', '#/catalogo'], ['produto', `#/produto/${productId}`], ['carrinho', '#/carrinho']]) {
        if (hash !== null) await page.goto(BASE + hash);
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => {
          const a = document.getElementById('chatFab').getBoundingClientRect();
          const b = document.getElementById('waFab').getBoundingClientRect();
          const overlap = !(a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left);
          return { overlap, scroll: document.documentElement.scrollWidth - window.innerWidth };
        });
        assert(!m.overlap, `${name}: chatbot e WhatsApp sobrepostos`);
        assert(m.scroll <= 1, `${name}: rolagem horizontal ${m.scroll}px`);
        await page.screenshot({ path: path.join(OUT, `mobile-${name}.png`) });
        shots.push(name);
      }
      await page.click('#chatFab');
      await page.waitForSelector('.chat-panel.open');
      await page.screenshot({ path: path.join(OUT, 'mobile-chat.png') });
      await page.goto(BASE + 'admin/#/');
      await page.waitForSelector('.kpi');
      await page.waitForTimeout(500);
      assert((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'painel sem rolagem horizontal');
      await page.screenshot({ path: path.join(OUT, 'mobile-admin.png') });
      return `sem sobreposição e sem rolagem horizontal: ${shots.join(', ')}, chat, painel`;
    });

    assert(!errors.length, `erros de JavaScript: ${errors.join(' | ')}`);
    console.log(`\nTodos os ${results.length} passos passaram. Capturas em ${OUT}`);
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, 'falha.png') }).catch(() => {});
    if (errors.length) console.log('Erros JS:', errors);
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify(results, null, 2));
    await ctx.close().catch(() => {});
    srv.kill();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
})();
