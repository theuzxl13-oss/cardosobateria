# Cardoso Baterias — site, loja virtual, painel e chatbot

Projeto **demonstrativo para apresentação comercial** da Cardoso Baterias. O sistema reúne:

- site institucional e portfólio (início, sobre, serviços, galeria, perguntas frequentes e contato);
- loja virtual com catálogo, busca e filtros, consulta por veículo, carrinho, checkout de teste e consulta de pedidos;
- painel administrativo com produtos, estoque, pedidos, vendas de balcão, clientes, fornecedores, conteúdo, configurações, dashboard e relatórios (CSV/PDF);
- chatbot de atendimento baseado em regras (FAQ e catálogo), sem IA paga;
- integração com WhatsApp **(11) 96298-6718** (`https://wa.me/5511962986718`).

> **Dados demonstrativos:** as marcas são reais (Moura, Heliar, Bosch, Zetta e Pioneiro), mas preços, estoque, garantias, aplicações por veículo, clientes, fornecedores e pedidos são fictícios. As imagens dos produtos são ilustrativas (não são fotos oficiais dos fabricantes). Os pagamentos são simulados e **nenhum valor é cobrado**. Endereço, CNPJ e horários aparecem como “a definir” e podem ser editados no painel.

---

## 1. Apresentação pelo GitHub Pages (sem servidor)

O site funciona como páginas estáticas no GitHub Pages. Nesse modo o banco de dados é um **SQLite real rodando no navegador** (sql.js/WebAssembly), salvo no **IndexedDB**, e usa as mesmas regras de negócio do servidor.

### Como ativar

1. No GitHub, abra o repositório **theuzxl13-oss/cardosobateria** e vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Em **Branch**, selecione a branch do projeto (por exemplo `main`, depois do merge, ou `claude/gracious-franklin-4hbhry`) e a pasta **`/docs`**. Clique em **Save**.
4. Depois de cerca de 1 minuto, o endereço aparece no topo da página:
   **https://theuzxl13-oss.github.io/cardosobateria/**
   - Loja: `https://theuzxl13-oss.github.io/cardosobateria/`
   - Painel: `https://theuzxl13-oss.github.io/cardosobateria/admin/`

### Como funciona a demonstração nesse modo

- Na primeira visita, o navegador cria o banco e carrega os dados demonstrativos.
- Os dados **continuam salvos** quando você atualiza a página, fecha o navegador ou reinicia o computador.
- A loja e o painel podem ficar abertos em abas diferentes. As abas compartilham o mesmo banco e as gravações são serializadas entre elas (Web Locks), então uma aba não apaga o que a outra gravou.
- Cada navegador ou aparelho tem a **sua própria cópia** dos dados. Um pedido feito no celular não aparece no painel aberto no notebook. Para a apresentação, use o mesmo navegador para a loja e para o painel.
- Para recomeçar do zero, use **Painel → Demonstração → Restaurar dados iniciais** (é preciso confirmar digitando `RESTAURAR`).
- Quando os dados demonstrativos do projeto mudam (por exemplo, troca de marcas), o navegador recarrega a demonstração automaticamente na próxima visita (controle de versão `SEED_VERSION` em `core/services/seed.js`).
- Funciona em Chrome, Edge, Firefox e Safari atuais. Na janela anônima os dados somem quando ela é fechada.

> **Segurança nesse modo:** o login do painel protege a interface da demonstração, mas como não existe servidor, quem tiver acesso ao navegador também tem acesso aos dados. Para uso real, publique no **modo servidor** (seção 7).

---

## 2. Credenciais de demonstração

| Campo  | Valor                        |
| ------ | ---------------------------- |
| E-mail | `admin@cardosobaterias.demo` |
| Senha  | `Cardoso@2026`               |

A tela de login tem um botão “Preencher automaticamente”. A senha pode ser trocada em **Painel → Demonstração → Alterar senha**. As senhas são guardadas com hash bcrypt.

---

## 3. Executar localmente

Requisitos: **Node.js 20.12 ou superior** (testado no 22).

```bash
npm install
```

### a) Igual ao GitHub Pages (somente arquivos estáticos)

```bash
npm run preview
# abra http://localhost:8080/cardosobateria/
```

### b) Modo servidor (Node + Express + SQLite em arquivo)

```bash
cp .env.example .env      # opcional: ajuste porta, senha do admin etc.
npm start
# loja:   http://localhost:3000/
# painel: http://localhost:3000/admin/
```

O banco fica em `data/cardoso.db`, é criado e migrado automaticamente e recebe os dados demonstrativos se estiver vazio. Os dados persistem depois de reiniciar o servidor.

| Comando                          | O que faz                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `npm start`                      | Servidor de produção (porta `PORT`, padrão 3000)                              |
| `npm run dev`                    | Servidor com recarga automática                                               |
| `npm run preview`                | Pré-visualização estática, igual ao GitHub Pages                              |
| `npm test`                       | Testes automatizados (regras de estoque, API, chatbot)                        |
| `npm run test:e2e`               | Roteiro completo no navegador (requer Chromium, veja a seção 8)               |
| `npm run build`                  | Gera `docs/js/core.bundle.js` e copia as bibliotecas para `docs/vendor`       |
| `npm run images`                 | Regenera as imagens ilustrativas (SVG)                                        |
| `npm run migrate`                | Aplica migrações no banco do servidor                                         |
| `npm run reset-demo -- --yes`    | Restaura os dados demonstrativos no banco do servidor                         |

> Ao alterar qualquer arquivo em `core/`, rode `npm run build` e faça commit de `docs/js/core.bundle.js`. A CI confere se o bundle está atualizado.

---

## 4. Roteiro sugerido para a apresentação

1. **Loja:** página inicial → “Encontre sua bateria” (ex.: Volkswagen → Gol → 2015) → aviso para confirmar a compatibilidade com a loja.
2. Consulte um veículo sem aplicação cadastrada (ex.: Honda Civic 2020 no chatbot): o sistema **não adivinha** e oferece o WhatsApp.
3. Abra um produto (ex.: Bateria Heliar 60Ah) → “Pedir orçamento no WhatsApp” (mensagem preenchida com o produto e o veículo).
4. Adicione ao carrinho → altere a quantidade (o limite é o disponível) → **Finalizar pedido**.
5. No checkout, escolha retirada ou entrega (o endereço só é exigido na entrega) e pague com **Pix demonstrativo** ou **cartão simulado** → “Simular pagamento aprovado” ou “Simular recusa”.
6. **Painel → Pedidos:** abra o pedido, veja a **reserva** de estoque → “Concluir venda” (a reserva vira saída) → o Dashboard é atualizado.
7. Cancele outro pedido e veja a reserva ser liberada.
8. **Relatórios:** exporte vendas, pedidos e estoque em CSV ou PDF.
9. **Chatbot:** “bateria 60Ah”, “qual a garantia?”, “vocês entregam?”, “gol 2015”, “falar com atendente”.

---

## 5. Recursos implementados

### Site institucional

- Página inicial com destaque para “Encontre a bateria ideal para seu carro”, consulta por veículo, busca, banners, produtos em destaque, ofertas, serviços, “Sobre” e perguntas frequentes.
- Páginas de serviços (troca, instalação, teste, atendimento), sobre, galeria (loja e serviços realizados, com ampliação da imagem), perguntas frequentes e contato.
- Endereço, horários, área de atendimento, redes sociais, textos, banners, serviços, galeria, FAQ e logo são **editáveis no painel**.
- A logo enviada pela loja foi aplicada em duas versões: fundo escuro (cabeçalho e rodapé) e fundo claro (login e PDF).
- Faixa discreta de demonstração em todas as páginas.

### Catálogo e venda

- 16 produtos demonstrativos (15 ativos e 1 inativo) das marcas **Moura, Heliar, Bosch, Zetta e Pioneiro**, com capacidades de **40, 45, 50, 60, 70, 90 e 95Ah**. Cada um tem SKU, descrição, imagem, Ah, tensão, polaridade, tecnologia, garantia, preço, custo, estoque, estoque mínimo, status e aplicações por veículo (marcadas como demonstrativas). CCA e dimensões ficam em branco até a loja informar os dados reais de cada linha.
- **Fotos dos produtos:** são ilustrações no padrão visual da Cardoso. Para usar fotos reais, envie a imagem em **Painel → Produtos → Editar → Imagem principal** (ou imagens adicionais). Use fotos próprias da loja ou imagens que o distribuidor/fabricante autorize.
- Busca e filtros por marca, capacidade, faixa de preço, disponibilidade e ofertas, com ordenação.
- Consulta por marca, modelo e ano **somente com aplicações cadastradas**, sempre com aviso de compatibilidade. Quando não há aplicação, o site oferece o WhatsApp.
- Carrinho com alteração de quantidade e remoção. Preço e disponibilidade são reconferidos no banco.
- Checkout com nome, telefone, e-mail e veículo opcionais, retirada ou entrega (endereço obrigatório só na entrega), frete demonstrativo configurável (valor fixo e frete grátis acima de um valor) e validação no cliente e no servidor.
- Pedido com código único, resumo, confirmação, histórico e link para enviar o resumo ao WhatsApp. O envio **não** marca o pedido como pago.
- Consulta de pedido por código e telefone.

### Pagamento demonstrativo

- **Pix demonstrativo:** QR Code meramente ilustrativo, marcado “NÃO É PIX REAL”.
- **Cartão simulado:** não pede nem armazena dados de cartão.
- **Pagamento na retirada:** a loja registra o recebimento no painel.
- Botões para simular aprovação e recusa, com o aviso “nenhum valor será cobrado”.
- A situação do pagamento (pendente, aprovado, recusado, estornado) é **separada** do status do pedido.

### Estoque integrado (regras em `core/services/inventory.js` e `orders.js`)

- O **disponível** é o físico menos as reservas, e é esse valor que aparece no catálogo.
- Não é possível pedir acima do disponível. Itens repetidos no carrinho são somados antes da validação.
- A criação do pedido **reserva** o estoque. Ao **concluir**, a reserva vira **saída**. Ao **cancelar ou expirar** (prazo configurável, padrão 48h sem pagamento), a reserva é **liberada**. O cancelamento de uma venda já concluída faz a **devolução** ao estoque.
- Baixas, liberações e devoluções **duplicadas** são impedidas pela regra de transição e por um índice único `(pedido, produto, tipo)` no banco.
- O estoque **nunca fica negativo**: há validação na regra e restrições `CHECK` no banco.
- Cada operação roda em **transação**. Um pedido com vários itens é atômico.
- O pedido guarda preço, custo, nome, SKU, marca, Ah e garantia do produto no momento da compra.
- Cada movimentação registra data, quantidade, variação do físico e da reserva, saldo, motivo, responsável, pedido e fornecedor.

### Painel administrativo

- Login com sessão (token aleatório; o banco guarda apenas o hash SHA-256) e proteção de todas as rotas `/api/admin`.
- Produtos: cadastrar, editar, ativar e desativar; excluir somente se **não houver histórico de venda** (com histórico, só é possível desativar). Também permite imagem principal, imagens adicionais, preço promocional, estoque mínimo, destaque e aplicações por veículo.
- Marcas, categorias, fornecedores e clientes (com o histórico de pedidos de cada cliente).
- Estoque: entradas (com fornecedor e custo), saídas, ajustes de inventário, posição atual e histórico com filtros.
- Pedidos: filtros, detalhes, transição de status (aguardando pagamento → confirmado → em preparação → concluído / cancelado), registro do pagamento e atalho para o WhatsApp do cliente.
- Venda de balcão: cria, recebe e conclui numa só operação, com a mesma regra de estoque.
- Conteúdo (textos, banners, serviços, galeria, FAQ) e configurações (contato, endereço, horários, área, redes, retirada, entrega, frete e validade da reserva).
- Restaurar dados iniciais, com confirmação.

### Dashboard e relatórios

- Indicadores calculados no banco: vendas do dia e do mês, pedidos pendentes por status, estoque baixo, esgotados, mais vendidos, valor do estoque pelo custo, lucro bruto e últimas movimentações.
- No período escolhido, os indicadores separam **pedidos criados**, **vendas concluídas** e **pagamentos recebidos** (aprovações menos estornos).
- Gráfico diário de vendas e filtro por período (hoje, 7 dias, 30 dias, mês, tudo ou personalizado).
- Relatórios de **vendas, pedidos, estoque e movimentações**, com exportação em **CSV** (separado por `;`, com BOM, abre direto no Excel) e **PDF**.

### Chatbot

- Flutuante, em português, com a identidade da loja e o aviso “respostas automáticas… não é IA”.
- Responde sobre produtos, preços, disponibilidade, capacidade, tecnologias (EFB/AGM), garantia do cadastro, entrega, frete, retirada, endereço, horários, serviços, como comprar, pagamento e consulta de pedido. Aceita perguntas rápidas e texto livre.
- Não inventa: preços, estoque e garantia vêm do banco. A compatibilidade vem só das aplicações cadastradas. Quando não entende ou não encontra a informação, diz isso claramente e oferece o WhatsApp.
- Preparado para IA futura (veja `server/chat-providers/README.md`): as chaves ficam só no servidor e, se a IA falhar, o chatbot volta às regras.

### WhatsApp

- Botão flutuante em todas as páginas públicas, posicionado sem sobrepor o chatbot (verificado no celular).
- Botão “Atendente” no chatbot, orçamento em cada produto (com o veículo informado), envio do carrinho e do resumo do pedido.
- Mensagens codificadas com `encodeURIComponent`. Exemplo:
  `Olá! Vim pelo site da Cardoso Baterias e gostaria de saber mais sobre a bateria [produto]. Meu veículo é [marca/modelo/ano].`

---

## 6. Integrações simuladas

| Integração | Situação na demonstração                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- |
| Pix        | QR Code ilustrativo e aprovação ou recusa simuladas. Nenhuma cobrança.                       |
| Cartão     | Simulado, sem nenhum dado de cartão.                                                         |
| Frete      | Valor fixo demonstrativo, configurável no painel.                                            |
| Chatbot    | Regras locais (FAQ e catálogo), sem IA externa.                                              |
| WhatsApp   | Links reais `wa.me`. Não há API do WhatsApp Business nem envio automático de mensagens.      |
| E-mails    | Não implementados.                                                                           |

---

## 7. Publicação real (modo servidor) e o que falta configurar

### Persistência

- **Banco:** em hospedagem com Node (Render, Railway, Fly.io, VPS), defina `DATABASE_FILE` apontando para um **disco persistente/volume**. Sem isso, o banco se perde a cada deploy.
- **Imagens:** os uploads do painel são redimensionados no navegador e salvos **dentro do banco** (data URL), então persistem junto com ele. Em produção com muitas imagens, o recomendado é mover para um armazenamento de objetos (S3, Cloudflare R2, Supabase Storage) e guardar só a URL.
- **Backup:** copie o arquivo `.db` periodicamente (ou use `sqlite3 cardoso.db ".backup backup.db"`).
- **HTTPS** obrigatório. Atrás de proxy, use `TRUST_PROXY=true`.

### Migração para PostgreSQL

- O SQL em `core/db/migrations.js` foi escrito perto do padrão: valores monetários em centavos (`INTEGER`), datas ISO em texto, `CHECK`s e índice único parcial (suportado pelo PostgreSQL).
- Para migrar: troque `INTEGER PRIMARY KEY AUTOINCREMENT` por `BIGSERIAL`, crie um adaptador `core/db/adapter-pg.js` com a mesma interface (`prepare().get/all/run`, `exec`), converta os parâmetros `?` para `$1…`, use `RETURNING id` no lugar de `lastInsertRowid` e adapte o `ON CONFLICT` das configurações. Como o PostgreSQL é assíncrono, `tx()` e os serviços precisarão de `async/await`.

### Antes de usar com clientes reais

- [ ] Trocar a senha do administrador (`ADMIN_PASSWORD` ou Painel → Demonstração) e desligar `SEED_ON_EMPTY`.
- [ ] Restaurar ou limpar os dados e cadastrar **produtos, preços, custos e estoque reais**.
- [ ] Cadastrar **aplicações por veículo verificadas** (as atuais são ilustrativas).
- [ ] Preencher endereço, CNPJ, horários, área de atendimento, e-mail e redes sociais reais.
- [ ] Substituir as imagens ilustrativas por fotos reais (produtos, galeria, serviços, banners).
- [ ] Contratar um **gateway de pagamento** (Mercado Pago, PagSeguro, Stripe, Asaas etc.) e implementar o provedor real no servidor, com webhook de confirmação. A simulação deve ser desativada.
- [ ] Definir a regra real de frete (por bairro, CEP ou distância).
- [ ] Publicar no **modo servidor** com HTTPS, disco persistente e backup.
- [ ] Revisar textos legais: política de privacidade (LGPD), termos, trocas e garantia.
- [ ] (Opcional) Conectar uma IA ao chatbot no servidor e/ou a API oficial do WhatsApp Business.

---

## 8. Testes e verificação

```bash
npm test
```

São 20 testes automatizados (Node test runner):

- **Regras de estoque** (`tests/inventory.test.js`, executados no mesmo motor sql.js da demonstração): compra acima do disponível, atomicidade de pedidos com vários itens, soma de itens repetidos, reserva, conclusão, cancelamento, devolução, bloqueio de baixa/liberação/devolução **duplicada**, estoque nunca negativo (regra e `CHECK`), registro das movimentações, preservação do preço no pedido, promoção, expiração de reserva, pagamento separado do status, endereço só na entrega, consulta por código e telefone, exclusão versus desativação e venda de balcão.
- **API do servidor** (`tests/api.test.js`): rotas protegidas, senha com hash, custo oculto na loja, pedido, link do WhatsApp, relatórios, confirmação do reset e **persistência após reiniciar o servidor**.
- **Chatbot** (`tests/chat.test.js`): preços e estoque iguais ao cadastro, recusa a adivinhar compatibilidade e encaminhamento ao WhatsApp.

```bash
npm run test:e2e   # CHROMIUM_PATH=/caminho/do/chrome se necessário
```

O roteiro ponta a ponta no navegador cobre os 15 passos pedidos, no modo GitHub Pages: login → cadastrar e editar produto → entrada de estoque → busca no site → carrinho → pedido → reserva → pagamento simulado → conclusão → baixa e indicadores → cancelamento e liberação → exportação CSV/PDF → chatbot → link do WhatsApp → recarregar e reiniciar o navegador → layout no celular, sem sobreposição e sem rolagem horizontal. As capturas ficam em `tests/e2e/output/`.

---

## 9. Estrutura de pastas

```
core/                     Núcleo (mesmo código no navegador e no servidor)
  api/router.js           API REST independente de framework
  chat/                   Chatbot (regras + ponto de extensão para IA)
  db/                     Migrações, transações e adaptadores (sql.js / better-sqlite3)
  lib/                    Validação, formatação, WhatsApp, utilitários
  services/               Catálogo, estoque, pedidos, relatórios, auth, configurações, carga demo
  browser-entry.js        Backend no navegador (IndexedDB + Web Locks)
server/                   Servidor Node/Express (modo hospedado) e provedores de IA futuros
docs/                     Site publicado (GitHub Pages)
  index.html              Loja e site institucional
  admin/index.html        Painel administrativo
  css/  js/  img/  vendor/
scripts/                  build, imagens, migração, reset, pré-visualização
tests/                    Testes automatizados + roteiro E2E
```

Stack: HTML/CSS/JavaScript sem framework no frontend; Node.js, Express, SQLite (better-sqlite3 no servidor e sql.js no navegador), bcryptjs e jsPDF.
