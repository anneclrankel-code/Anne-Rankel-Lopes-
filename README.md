# Fabi Tsunemi 💅

App de agenda do estúdio da Fabi, nail designer. Funciona no navegador do celular e pode ser
instalado na tela inicial como se fosse um aplicativo (é o que se chama de **PWA**).

Esta é a **Etapa 1 (Agendamento)**. O painel financeiro (Etapa 2) e o agendamento por áudio
ficam para versões futuras.

---

## O que o app faz

| Tela | O que tem |
|---|---|
| **Agenda** | Agenda do dia em lista (atendimentos e bloqueios), setas para trocar de dia, toque no nome do dia para abrir o calendário. Botões **+ Agendar** e **Bloquear horário** (ex.: almoço). |
| **Novo agendamento** | Nome da cliente, telefone, serviço, data. O app mostra **só os horários vagos em que o serviço cabe inteiro**, sem bater com outras clientes nem com bloqueios. O horário de término é calculado sozinho. Se precisar, dá para digitar “outro horário” (o app avisa se tiver conflito). |
| **Detalhes do agendamento** | Mensagens para a cliente com botões **Copiar** e **Abrir no WhatsApp**, além de **Editar** e **Cancelar agendamento**. |
| **Mensagens** | “Mensagens de hoje”: tudo o que precisa ser enviado no dia (e o que ficou para trás). Marque “Já enviei” para tirar da lista. O número vermelho no ícone mostra quantas faltam. |
| **Clientes** | Busca pelo nome, telefone, histórico e botão para agendar de novo. |
| **Serviços** | Cadastrar e editar serviços (nome, duração, valor, cor na agenda). Em **Ajustes**: dias e horário de atendimento, intervalo entre clientes e os textos das mensagens. |

### Como funcionam os lembretes
Para cada agendamento o app prepara até três mensagens:

1. **Confirmação** — no dia em que o horário foi marcado.
2. **Pedido de confirmação** — 3 dias antes. *Pulado se o agendamento foi feito com menos de 3 dias de antecedência.*
3. **Lembrete da véspera** — no dia anterior. *Pulado se o agendamento foi feito na véspera ou no próprio dia (a confirmação já basta).*

Nada é enviado sozinho (sem custo): a Fabi toca em **Abrir no WhatsApp** (já abre a conversa da
cliente com o texto pronto) ou em **Copiar** e cola onde quiser. Se um agendamento mudar de dia,
horário ou serviço, as mensagens voltam a aparecer para serem enviadas de novo.

### Como o app escolhe os horários vagos
Os horários aparecem “encostados”: logo depois de cada atendimento ou bloqueio, um atrás do
outro, pela duração do serviço — assim a agenda não fica com buracos. Exemplo (igual ao
protótipo): com Ana 6h30–9h15, Bia 9h15–9h55, almoço 12h–13h e Carla 14h–14h40, para uma
**mão simples (40 min)** o app oferece 9h55, 10h35, 11h15, 13h00, 14h40, 15h20, 16h00, 16h40 e 17h20.

Regras atuais (dá para mudar em **Serviços → Ajustes**): terça a sábado, primeiro horário 6h30,
último atendimento começando até 17h30, sem intervalo entre clientes.

---

## Passo a passo para colocar no ar

São 3 partes, todas gratuitas. Leva uns 20 minutos na primeira vez. Você só precisa de um
computador e de uma conta de e-mail.

### Parte 1 — Experimentar (modo de teste)

Enquanto o banco de dados não estiver ligado, o app funciona em **modo de teste**: os dados
ficam guardados só no navegador do aparelho (uma faixa amarela avisa isso). É ótimo para a Fabi
experimentar, mas **não use assim de verdade**: se limpar o navegador, os dados somem.

Depois de publicar (Parte 3), é só abrir o endereço do app para testar.

### Parte 2 — Ligar o banco de dados (Supabase)

O **Supabase** é um serviço que guarda os dados na nuvem e cuida do login. O plano gratuito é
mais do que suficiente para um estúdio.

1. Entre em **supabase.com**, clique em **Start your project** e crie uma conta (pode ser com o GitHub).
2. Clique em **New project**. Dê o nome `fabi-tsunemi`, crie uma senha forte para o banco (guarde-a)
   e escolha a região **South America (São Paulo)**. Clique em **Create new project** e espere uns 2 minutos.
3. **Criar as tabelas:** no menu da esquerda, abra **SQL Editor** → **New query**. Abra o arquivo
   [`supabase/schema.sql`](supabase/schema.sql) deste projeto, copie todo o texto, cole lá e clique em **Run**.
   Deve aparecer “Success”. Isso cria as tabelas e os 3 serviços de teste.
4. **Deixar o login só para a Fabi:**
   - Vá em **Authentication** → **Sign In / Providers** (ou **Providers**) e **desligue** a opção
     **Allow new users to sign up**. Assim ninguém mais consegue criar conta.
   - Vá em **Authentication** → **Users** → **Add user** → **Create new user**. Coloque o e-mail e uma
     senha da Fabi e marque **Auto Confirm User**. É com esse e-mail e senha que ela vai entrar no app.
5. **Pegar os dados de conexão:** vá em **Project Settings** (engrenagem) → **API** (ou **Data API** /
   **API Keys**). Copie:
   - o **Project URL** (algo como `https://abcdefgh.supabase.co`);
   - a chave **anon public** (um texto comprido que começa com `eyJ…`, ou a **publishable key** `sb_publishable_…`).
6. No GitHub, abra o arquivo [`js/config.js`](js/config.js), clique no lápis ✏️ (Edit) e cole os dois
   valores entre as aspas:
   ```js
   export const CONFIG = {
     supabaseUrl: 'https://abcdefgh.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...',
   };
   ```
   Clique em **Commit changes**.

> 🔒 **Essa chave pode ficar no código?** Sim. A chave “anon/publishable” é feita para ficar no
> app. Quem protege os dados é o login: as regras criadas no passo 3 só deixam ler e gravar quem
> entrou com a conta da Fabi. **Nunca** coloque a chave `service_role`/`secret` no app.

A partir daí o app pede e-mail e senha, e os dados ficam salvos na nuvem — dá para usar no
celular e no computador ao mesmo tempo.

### Parte 3 — Publicar o app (GitHub Pages)

O app é só um conjunto de arquivos (não precisa de servidor próprio), então dá para publicar de
graça no próprio GitHub.

1. No GitHub, abra este repositório e vá em **Settings** → **Pages**.
2. Em **Build and deployment**, escolha **Source: Deploy from a branch**.
3. Em **Branch**, escolha o ramo onde o código está (ex.: `main`) e a pasta **/ (root)**. Clique em **Save**.
4. Espere 1–2 minutos e recarregue a página: aparece o endereço do app, algo como
   `https://seu-usuario.github.io/nome-do-repositorio/`. Esse é o link para a Fabi.

> Se o repositório for **privado**, o GitHub Pages pode exigir um plano pago. Alternativas gratuitas
> que funcionam com repositório privado: **Netlify** ou **Vercel** — crie a conta com o GitHub,
> clique em “Add new project / Import”, escolha este repositório e publique sem mudar nenhuma
> configuração (não há etapa de “build”).

**Toda vez que um arquivo for alterado no GitHub, o site é atualizado sozinho** em 1–2 minutos.

### Parte 4 — Instalar no celular da Fabi

- **iPhone (Safari):** abra o link → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
- **Android (Chrome):** abra o link → menu **⋮** → **Instalar app** (ou **Adicionar à tela inicial**).

Pronto: aparece o ícone “Fabi Tsunemi” na tela, e o app abre em tela cheia.

---

## Para quem for mexer no código

- Sem etapa de build: HTML, CSS e JavaScript puros (módulos ES).
  - `index.html` — estrutura da página
  - `css/styles.css` — visual (azul marinho + off-white, cantos arredondados)
  - `js/logic.js` — regras: horários vagos, conflitos, régua de lembretes, WhatsApp
  - `js/db.js` — banco de dados (Supabase, ou o navegador no modo de teste)
  - `js/app.js` — telas
  - `js/config.js` — endereço e chave do Supabase
  - `sw.js` + `manifest.webmanifest` + `icons/` — instalação como app (PWA)
  - `supabase/schema.sql` — tabelas e regras de segurança
- Rodar no computador: `python3 -m http.server 8080` (ou `npm start`) e abrir `http://localhost:8080`.
- Testes das regras: `npm test` (precisa do Node.js 20+).
- Ao mudar arquivos do app, troque o nome do cache em `sw.js` (`fabi-tsunemi-v1` → `v2`) para os
  celulares pegarem a versão nova mais rápido.

## Perguntas em aberto (da especificação)
- **Valor de cada serviço:** já dá para cadastrar em *Serviços*; o valor fica gravado em cada agendamento para o painel financeiro da Etapa 2.
- **Intervalo entre clientes:** ajustável em *Serviços → Ajustes* (hoje está em 0 min).
- **Horário de atendimento:** provisório, também ajustável em *Ajustes*.

## Próximas etapas
- **Etapa 2 — Painel financeiro:** lucro do mês (os valores já estão sendo guardados).
- **Agendamento por áudio:** “Maria, manutenção, sexta às 9h” → app preenche para confirmar.
