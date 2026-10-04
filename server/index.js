'use strict';
/**
 * Servidor Node (opcional) — para hospedagem real.
 * Serve o site (pasta docs/) e a API REST em /api, com banco SQLite em arquivo.
 * As regras de negócio são as mesmas do modo GitHub Pages (pasta core/).
 */
const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('../core/db');
const { createBetterSqliteAdapter } = require('../core/db/adapter-better-sqlite3');
const { createRouter } = require('../core/api/router');
const seed = require('../core/services/seed');
const orders = require('../core/services/orders');
const chat = require('../core/chat');

function createApp({ dbFile = config.dbFile } = {}) {
  db.use(createBetterSqliteAdapter(dbFile));
  const admin = { name: config.adminName, email: config.adminEmail, password: config.adminPassword };
  if (config.seedOnEmpty) seed.seedIfEmpty(admin);
  else seed.ensureAdmin(admin);

  // Provedor de IA opcional: as chaves ficam SOMENTE no servidor (variáveis de ambiente).
  if (config.chatProvider !== 'rules' && config.chatProvider !== 'regras') {
    try {
      const provider = require(`./chat-providers/${config.chatProvider}`);
      chat.register(config.chatProvider, provider.create({ apiKey: config.aiApiKey, model: config.aiModel }));
      chat.setActive(config.chatProvider);
    } catch (e) {
      console.warn(`[chat] Provedor "${config.chatProvider}" indisponível (${e.message}). Usando o assistente por regras.`);
    }
  }

  const router = createRouter({ admin });
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.all('/api/*', async (req, res) => {
    const auth = req.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const r = await router.handle({ method: req.method, path: req.path, query: req.query, body: req.body, token });
    res.status(r.status).json(r.body);
  });

  app.use(express.static(path.join(config.root, 'docs'), { extensions: ['html'], maxAge: '1h' }));
  return app;
}

if (require.main === module) {
  const app = createApp();
  setInterval(() => {
    try {
      const n = orders.expireOrders();
      if (n) console.log(`[reservas] ${n} pedido(s) expirado(s) e reserva liberada.`);
    } catch (e) {
      console.error(e);
    }
  }, config.expirySweepSeconds * 1000).unref();
  app.listen(config.port, () => {
    console.log(`Cardoso Baterias rodando em http://localhost:${config.port}`);
    console.log(`Painel: http://localhost:${config.port}/admin/  (banco: ${config.dbFile})`);
  });
}

module.exports = { createApp };
