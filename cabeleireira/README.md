# Salão em Casa 💇‍♀️

App simples para a cabeleireira que atende a domicílio: anota os serviços feitos, calcula quanto a
cliente deve e mostra quem ainda não pagou. Feito a partir do documento *"App para Cabeleireira –
Ideias e MVP"*.

- Funciona **sem internet** (na casa da cliente) e guarda os dados **no próprio celular** (IndexedDB).
- Quando tem internet, copia tudo para uma **planilha Google da conta dela**, sem custo.
- Letras grandes, alto contraste e poucos toques.

## As telas

| Tela | O que tem |
|---|---|
| **Atender → Novo atendimento** | Nome da cliente (com sugestões de clientes já atendidas, é só tocar) e os serviços em botões grandes, separados por grupo (Cabelo, Unha, Maquiagem). Dá para marcar vários. |
| **Conta da cliente** | Serviços e preços, botões **− Desconto** e **+ Acréscimo** (de R$ 10 em R$ 10, sem digitar) e o **total a pagar** bem grande. **Salvar**. |
| **A receber** | Total a receber, a lista de quem **não pagou** (cada uma com seu botão **Recebi**) e, embaixo, quem já pagou. Dívidas com mais de 30 dias aparecem com “há 3 meses”, em vermelho. |
| **Como recebeu?** | Quatro botões grandes: **Pix, Crédito, Débito, Dinheiro**. **Não recebi** (vermelho) desfaz um pagamento marcado por engano, mesmo dias depois. Também dá para apagar um atendimento lançado errado. |
| **Ajustes** | Serviços e preços (mudar, criar, apagar), tamanho da letra, cópia de segurança em arquivo e ligação com a planilha. |

As regras visuais do protótipo foram seguidas: **opções** (serviços, formas de pagamento) começam
brancas e só ficam azuis quando tocadas; **ações** (Continuar, Salvar, Recebi) são azuis com texto
branco; **Voltar** tem só borda azul.

Os preços que vêm no app são **de exemplo**. Troque em **Ajustes → Serviços e preços**. Para
serviços com variações, cadastre cada variação como um serviço (ex.: “Corte curto”, “Corte longo”)
ou use o acréscimo na hora.

## Publicar e instalar no iPhone

O app é só um conjunto de arquivos, sem servidor. Se o repositório já está publicado no GitHub
Pages (veja o README principal), este app fica em:

`https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/cabeleireira/`

No iPhone: abra o link no **Safari** → botão **Compartilhar** (quadrado com seta) →
**Adicionar à Tela de Início**. Abra sempre pelo ícone “Salão”.

> ⚠️ O iOS pode apagar os dados se o Safari for limpo ou se o app ficar muito tempo sem uso.
> Por isso existem a **planilha** e o botão **Salvar cópia**. O app avisa (faixa amarela) quando
> passa uma semana sem nenhuma cópia.

## Ligar a planilha Google (uns 10 minutos, feito uma vez)

Faça isso **com a conta Google dela**, de preferência num computador.

1. Em **sheets.google.com**, crie uma planilha em branco. Dê o nome “Salão em Casa”.
2. Menu **Extensões → Apps Script**.
3. Apague o que estiver lá, cole todo o conteúdo do arquivo
   [`google-apps-script/Codigo.gs`](google-apps-script/Codigo.gs) e, na linha
   `const SENHA = 'troque-esta-senha';`, troque por uma senha qualquer (sem espaços). Salve (💾).
4. Clique em **Implantar → Nova implantação**. Na engrenagem, escolha **App da Web**.
   - **Executar como:** Eu (a conta dela)
   - **Quem pode acessar:** Qualquer pessoa
   - Clique em **Implantar** e autorize (em “O Google não verificou este app”, clique em
     **Avançado → Acessar**; o script é seu, só mexe nesta planilha).
5. Copie o **URL do app da Web** (termina em `/exec`).
6. No celular dela: **Ajustes → Planilha Google → Ligar a planilha**. Cole o endereço e a senha e
   toque em **Salvar ligação**.

Pronto. A partir daí, cada atendimento salvo ou pagamento marcado vai para a planilha alguns
segundos depois (ou quando a internet voltar). As abas **Atendimentos** e **Serviços** são criadas
sozinhas.

> “Qualquer pessoa” quer dizer qualquer pessoa **que tenha o endereço e a senha**. Sem a senha o
> script não mostra nem grava nada.
>
> Se você mudar o código do script depois, use **Implantar → Gerenciar implantações → editar →
> Nova versão**, para o endereço continuar o mesmo.

### Celular novo, trocado ou dados apagados

Instale o app de novo e ligue a planilha (passo 6). Como o celular está vazio, o app **traz os
dados da planilha** sozinho, depois de confirmar.

### Corrigir dados pela planilha (suporte)

Na aba **Atendimentos** dá para mudar **Cliente**, **Total (R$)**, **Situação** (`Pago`,
`Não pago` ou `Apagado`) e **Forma de pagamento** (`Pix`, `Crédito`, `Débito`, `Dinheiro`). Também
dá para acrescentar uma linha nova à mão (basta Data, Cliente, Serviços, Total e Situação). Não
mexa nas colunas “não mexer”.

Depois, no celular dela: **Ajustes → Trazer dados da planilha**. (Se ela lançar algo antes disso,
o app envia a versão do celular e a correção se perde, então faça os dois passos juntos.)

**Proteção:** a planilha recusa receber dados do celular se o celular tiver **menos** atendimentos
que ela (por exemplo, um celular que perdeu os dados). Nesse caso aparece o aviso em Ajustes e os
botões **Trazer dados da planilha** ou **Enviar mesmo assim**.

## Cópia em arquivo

**Ajustes → Salvar cópia** abre o menu de compartilhar do iPhone: dá para mandar o arquivo para o
próprio WhatsApp, e-mail ou salvar em Arquivos. **Abrir uma cópia** troca os dados do celular pelos
do arquivo (pede confirmação).

## Para quem for mexer no código

- HTML, CSS e JavaScript puros, sem etapa de build.
  - `js/logic.js` — regras (totais em centavos, desconto/acréscimo, quem deve, sugestões, cópia). Testado.
  - `js/store.js` — banco no aparelho (IndexedDB).
  - `js/sync.js` — envio e leitura da planilha.
  - `js/app.js` — telas.
  - `google-apps-script/Codigo.gs` — script da planilha.
  - `sw.js`, `manifest.webmanifest`, `icons/` — instalação e funcionamento offline.
- Rodar no computador (na raiz do repositório): `python3 -m http.server 8080` e abrir
  `http://localhost:8080/cabeleireira/`.
- Testes: `npm test` na raiz (Node 20+). Os testes deste app estão em `tests/cabeleireira.test.mjs`.
- Ao mudar arquivos, troque a versão em `sw.js` (`salao-em-casa-v1` → `v2`). O celular abre a
  versão guardada e baixa a nova em segundo plano; ela aparece na próxima vez que o app for aberto.

## Próximas versões (do documento)

Chave Pix / QR Code com o valor, custo dos produtos por serviço, histórico por cliente, envio do
valor pelo WhatsApp, relatórios de faturamento, pagamentos combinados e parcelados, comissão da
assistente, gastos com deslocamento, agenda e comandos por voz.
