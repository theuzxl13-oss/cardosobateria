'use strict';
/**
 * Ponto único de entrada do chatbot.
 *
 * Provedores:
 *  - "regras" (padrão): base de perguntas frequentes + consultas ao catálogo. Funciona sem serviços pagos.
 *  - provedores de IA podem ser registrados APENAS no servidor (server/chat-providers), onde ficam as chaves.
 *    Eles recebem as mesmas ferramentas de consulta (catálogo, FAQ, configurações) para não inventar dados.
 *    No modo GitHub Pages (sem servidor) somente o provedor de regras é usado — nunca coloque chaves no navegador.
 */
const rules = require('./rules');

const providers = { regras: { name: 'regras', reply: async (message, ctx) => rules.reply(message, ctx) } };
let active = 'regras';

function register(name, provider) {
  providers[name] = provider;
}
function setActive(name) {
  if (!providers[name]) throw new Error(`Provedor de chat desconhecido: ${name}`);
  active = name;
}

async function reply(message, ctx = {}) {
  const msg = String(message || '').slice(0, 500);
  const p = providers[active];
  try {
    return await p.reply(msg, ctx);
  } catch (e) {
    // falha do provedor externo: cai para as regras locais
    if (active !== 'regras') return rules.reply(msg, ctx);
    throw e;
  }
}

module.exports = { reply, register, setActive, activeProvider: () => active };
