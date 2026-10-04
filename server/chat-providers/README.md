# Provedores de IA para o chatbot (futuro)

O chatbot da demonstração usa o provedor **por regras** (`core/chat/rules.js`): FAQ + consultas ao
catálogo, sem serviços pagos.

Para conectar uma IA no futuro, crie aqui um arquivo `<nome>.js` que exporte:

```js
module.exports.create = ({ apiKey, model }) => ({
  name: 'nome',
  // Deve devolver o mesmo formato do provedor por regras:
  // { text, products?, links?, quick?, whatsapp, understood, provider }
  async reply(message, { history }) { /* chamar a API usando apiKey (somente no servidor) */ },
});
```

e defina no `.env` do servidor:

```
CHAT_PROVIDER=nome
AI_API_KEY=...
AI_MODEL=...
```

Recomendações:
- Nunca exponha a chave no navegador — o modo GitHub Pages usa sempre o provedor por regras.
- Dê à IA acesso apenas a dados verificados (catálogo, FAQ, configurações) e instrua-a a **não inventar**
  preços, disponibilidade, garantia ou compatibilidade; em caso de dúvida, encaminhar ao WhatsApp.
- Identifique na interface que as respostas são geradas por IA.
- Se o provedor falhar, `core/chat/index.js` volta automaticamente para as regras.
