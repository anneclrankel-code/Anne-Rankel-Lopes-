// Telas do app. Duas abas: "Atender" e "A receber". Ajustes fica num botão discreto.
import * as L from './logic.js';
import * as db from './store.js';
import * as sync from './sync.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

let services = [];
let visits = [];
let types = [];    // V2: tipos de produto (ex.: Química)
let subtypes = []; // V2: subtipos (ex.: Água oxigenada), com os nomes das características
let products = []; // V2: produtos que ela usa
let settings = {}; // { sheetUrl, senha, fontSize, lastSync, lastExport, syncError, syncErrorCode, dirty, lastAssistant, lastQty }

const S = {
  tab: 'atender', // 'atender' | 'receber' | 'ajustes'
  screen: 'novo', // novo | conta | uso | receber | pagamento | ajustes | servico | produtos | produto | tipos | tipo | subtipo
  draft: newDraft(),
  payId: null,
  svcId: null, // serviço em edição ('novo' para novo)
  pf: null,    // formulário de produto em edição
  sf: null,    // formulário de subtipo em edição
  tf: null,    // formulário de tipo em edição
  use: null,   // produto usado sendo escolhido: { productId, qtyText }
  prodReturn: 'produtos', // depois de salvar um produto, volta para cá
  paidLimit: 15,
  syncing: false,
};
let lastScreen = null;

function newDraft() {
  return { name: '', ids: [], adjust: 0, hadAssistant: false, assistantText: '', usage: [] };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svcById = (id) => services.find((s) => s.id === id);
const prodById = (id) => products.find((p) => p.id === id);
const typeById = (id) => types.find((t) => t.id === id);
const subById = (id) => subtypes.find((s) => s.id === id);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'pt-BR');
const nextOrder = (list) => Math.max(-1, ...list.map((x) => x.order ?? 0)) + 1;
const draftItems = () => S.draft.ids.map(svcById).filter(Boolean).map((s) => ({ serviceId: s.id, name: s.name, price: s.price }));
const draftAssistant = () => (S.draft.hadAssistant ? L.parsePrice(S.draft.assistantText) || 0 : 0);
const draftAsVisit = () => ({ items: draftItems(), adjust: S.draft.adjust, hadAssistant: S.draft.hadAssistant, assistant: draftAssistant(), usage: S.draft.usage });
const allData = () => ({ services, visits, types, subtypes, products });

// ------------------------------------------------------------------ início
async function boot() {
  await db.open();
  settings = (await db.getMeta('settings')) || {};
  services = await db.all('services');
  if (!services.length && !(await db.getMeta('seeded'))) {
    for (const s of L.DEFAULT_SERVICES) await db.put('services', s);
    await db.setMeta('seeded', true);
    services = structuredClone(L.DEFAULT_SERVICES);
  }
  visits = await db.all('visits');
  types = await db.all('types');
  subtypes = await db.all('subtypes');
  products = await db.all('products');
  if (!types.length && !(await db.getMeta('seededCatalog'))) {
    const cat = L.defaultCatalog();
    for (const t of cat.types) await db.put('types', t);
    for (const s of cat.subtypes) await db.put('subtypes', s);
    await db.setMeta('seededCatalog', true);
    ({ types, subtypes } = cat);
  }
  applyFont();
  try { await navigator.storage?.persist?.(); } catch { /* sem suporte */ }
  render();
  if (settings.dirty) scheduleSync(1500);
}

async function saveSettings(patch) {
  Object.assign(settings, patch);
  await db.setMeta('settings', settings);
}

function applyFont() {
  document.documentElement.dataset.font = settings.fontSize || 'grande';
}

// ------------------------------------------------------------------ desenho
function render() {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === S.tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  });
  const owed = L.pending(visits).length;
  const badge = document.getElementById('badge');
  badge.hidden = !owed;
  badge.textContent = owed;

  const views = {
    novo: viewNovo, conta: viewConta, uso: viewUso, receber: viewReceber, pagamento: viewPagamento,
    ajustes: viewAjustes, servico: viewServico, produtos: viewProdutos, produto: viewProduto,
    tipos: viewTipos, tipo: viewTipo, subtipo: viewSubtipo,
  };
  $app.innerHTML = (views[S.screen] || viewNovo)();
  if (S.screen !== lastScreen) window.scrollTo(0, 0); // na mesma tela (ex.: tocou Sim/Não) não pula para o topo
  lastScreen = S.screen;
  if (S.screen === 'novo') updateNovo();
}

function backupBanner() {
  if (!L.needsBackup(visits, settings.lastSync, settings.lastExport)) return '';
  return `<div class="banner">
    <p>Faça uma cópia de segurança dos seus dados.</p>
    <button class="act sm" data-act="exportar">Salvar cópia</button>
  </div>`;
}

function memoryBanner() {
  return db.memoryOnly ? '<div class="banner bad"><p>Este navegador não está guardando os dados. Abra o app pelo ícone na tela de início.</p></div>' : '';
}

/** Quadro "Só para você": assistente, produtos e lucro. Não aparece na conta da cliente. */
function costBox(v, title = 'Só para você') {
  const asst = L.assistantCost(v);
  const prod = L.productsCost(v.usage);
  return `<div class="costs">
    <h2>${title}</h2>
    <p class="muted small">Isto não muda o que a cliente paga.</p>
    <ul class="bill plain">
      <li><span>Total da cliente</span><span>${L.money(L.visitTotal(v))}</span></li>
      ${asst ? `<li><span>Pago à assistente</span><span>− ${L.money(asst)}</span></li>` : ''}
      ${prod ? `<li><span>Produtos usados</span><span>− ${L.money(prod)}</span></li>` : ''}
      <li class="profit ${L.visitProfit(v) < 0 ? 'neg-profit' : ''}"><span>Lucro do atendimento</span><span>${L.money(L.visitProfit(v))}</span></li>
    </ul>
  </div>`;
}

// ---- Tela 1: Novo atendimento
function viewNovo() {
  const groups = L.groupServices(services).map((g) => `
    ${services.length > 6 ? `<h3 class="grp">${esc(g.category)}</h3>` : ''}
    <div class="opts">
      ${g.items.map((s) => {
        const on = S.draft.ids.includes(s.id);
        return `<button class="opt${on ? ' on' : ''}" data-act="svc" data-id="${esc(s.id)}" aria-pressed="${on}">
          <span class="opt-name">${esc(s.name)}${on ? ' ✓' : ''}</span><span class="opt-price">${L.money(s.price)}</span>
        </button>`;
      }).join('')}
    </div>`).join('');
  const had = S.draft.hadAssistant;

  return `${memoryBanner()}${backupBanner()}
  <h1>Novo atendimento</h1>
  <label class="lbl" for="cli">Cliente</label>
  <input id="cli" class="field" type="text" placeholder="Nome da cliente" autocomplete="off" autocapitalize="words"
    enterkeyhint="done" value="${esc(S.draft.name)}" />
  <div id="sug" class="chips"></div>
  <p class="lbl">Toque nos serviços feitos</p>
  ${services.length ? groups : '<p class="muted">Nenhum serviço cadastrado. Toque em Ajustes para cadastrar.</p>'}

  <p class="lbl">Teve assistente?</p>
  <div class="pm">
    <button class="opt${had ? ' on' : ''}" data-act="assistente" data-v="sim" aria-pressed="${had}">Sim${had ? ' ✓' : ''}</button>
    <button class="opt${had ? '' : ' on'}" data-act="assistente" data-v="nao" aria-pressed="${!had}">Não${had ? '' : ' ✓'}</button>
  </div>
  ${had ? `
    <label class="lbl" for="asst">Quanto pagou à assistente? (R$)</label>
    <input id="asst" class="field" type="text" inputmode="decimal" placeholder="Ex.: 50" data-bind="draft.assistantText" value="${esc(S.draft.assistantText)}" />` : ''}

  <div class="bottom">
    <p id="falta" class="hint"></p>
    <button class="act" data-act="continuar">Continuar</button>
  </div>
  <button class="link" data-act="abrir-ajustes">⚙️ Ajustes, serviços, produtos e cópia de segurança</button>`;
}

function updateNovo() {
  const sug = L.suggestClients(visits, S.draft.name);
  document.getElementById('sug').innerHTML = sug.map((n) => `<button class="chip" data-act="usar-cliente" data-name="${esc(n)}">${esc(n)}</button>`).join('');
  const falta = [];
  if (!L.normalizeName(S.draft.name)) falta.push('escrever o nome da cliente');
  if (!S.draft.ids.length) falta.push('tocar nos serviços');
  document.getElementById('falta').textContent = falta.length ? `Falta ${falta.join(' e ')}.` : '';
}

// ---- Tela 2: Conta da cliente
function viewConta() {
  const items = draftItems();
  const adj = S.draft.adjust;
  const usage = S.draft.usage;
  return `
  <h1>Conta da ${esc(L.normalizeName(S.draft.name))}</h1>
  <ul class="bill">
    ${items.map((it) => `<li><span>${esc(it.name)}</span><span>${L.money(it.price)}</span></li>`).join('')}
    ${adj ? `<li class="adj ${adj < 0 ? 'neg' : 'pos'}"><span>${adj < 0 ? 'Desconto' : 'Acréscimo'}</span><span>${adj < 0 ? '−' : '+'} ${L.money(Math.abs(adj))}</span></li>` : ''}
  </ul>
  <div class="pm">
    <button class="opt" data-act="menos" aria-label="Dar desconto de 10 reais">− Desconto</button>
    <button class="opt" data-act="mais" aria-label="Somar acréscimo de 10 reais">+ Acréscimo</button>
  </div>
  <p class="hint center">Cada toque muda R$ 10</p>
  <div class="total"><span>Total a pagar</span><strong>${L.money(L.total(items, adj))}</strong></div>

  <h2>Produtos usados</h2>
  ${usage.length ? `<ul class="bill">
    ${usage.map((u, i) => `<li class="use-row">
      <span>${esc(u.name)}<br><span class="muted small">${L.fmtQty(u.qty)} ${u.unit} · ${L.money(u.cost)}</span></span>
      <button class="x" data-act="tirar-uso" data-i="${i}" aria-label="Tirar ${esc(u.name)}">✕</button>
    </li>`).join('')}
  </ul>` : '<p class="muted small">Opcional. Anote o que gastou para saber o custo e o lucro.</p>'}
  <button class="back" data-act="add-uso">+ Produto usado</button>

  ${costBox(draftAsVisit())}

  <button class="act" data-act="salvar">Salvar</button>
  <button class="back" data-act="voltar-novo">Voltar</button>`;
}

// ---- Escolher produto usado e quantidade
function productButton(p, sub, act) {
  const extra = [sub?.name, L.traitsText(p.traits)].filter(Boolean).join(' · ');
  return `<button class="opt" data-act="${act}" data-id="${esc(p.id)}">
    <span class="opt-name">${esc(p.name)}${extra ? `<br><span class="opt-sub">${esc(extra)}</span>` : ''}</span>
    <span class="opt-price">${L.money(p.cost)}<br><span class="opt-sub">${L.fmtQty(p.packQty)} ${p.unit}</span></span>
  </button>`;
}

function viewUso() {
  const p = S.use?.productId && prodById(S.use.productId);
  if (p) {
    const qty = L.parseQty(S.use.qtyText);
    return `
    <h1>Quanto usou?</h1>
    <p class="sub">${esc(p.name)}</p>
    <p class="muted small">${esc(L.traitsText(p.traits))}${p.traits?.length ? ' · ' : ''}embalagem de ${L.fmtQty(p.packQty)} ${p.unit} por ${L.money(p.cost)}</p>
    <label class="lbl" for="qty">Quantidade gasta (${p.unit})</label>
    <input id="qty" class="field" type="text" inputmode="decimal" placeholder="Ex.: 30" data-bind="use.qtyText" value="${esc(S.use.qtyText)}" />
    <p class="sub center" id="uso-custo">${qty ? `Custo: <b>${L.money(L.usageCost(p, qty))}</b>` : ''}</p>
    <button class="act" data-act="confirmar-uso">Adicionar</button>
    <button class="back" data-act="trocar-uso">Escolher outro produto</button>`;
  }
  const groups = L.groupProducts(products, types, subtypes);
  return `
  <h1>Qual produto usou?</h1>
  ${groups.length ? groups.map((g) => `<h3 class="grp">${esc(g.title)}</h3>
    <div class="opts">${g.items.map(({ product, subtype }) => productButton(product, subtype, 'escolher-uso')).join('')}</div>`).join('')
    : '<p class="empty">Nenhum produto cadastrado ainda.</p>'}
  <button class="back" data-act="novo-produto-uso">+ Cadastrar produto</button>
  <button class="back" data-act="voltar-conta">Voltar</button>`;
}

// ---- Tela 3: A receber
function viewReceber() {
  const devendo = L.pending(visits);
  const pagos = L.paid(visits);
  const card = (v, isPaid) => {
    const old = !isPaid && L.oldDebtLabel(v.date);
    return `<div class="card${isPaid ? '' : ' owe'}">
      <div class="card-info">
        <b class="name">${esc(v.client)}</b>
        <span class="${isPaid ? 'ok' : 'bad'}">${isPaid ? `Pago · ${esc(L.methodLabel(v.method))}` : 'Não pago'} · ${L.money(L.visitTotal(v))}</span>
        <span class="muted small">${L.fmtDate(v.date)}${old ? ` · <b class="bad">${old}</b>` : ''} · ${esc(v.items.map((i) => i.name).join(', '))}</span>
      </div>
      ${isPaid
        ? `<button class="back sm" data-act="pagar" data-id="${esc(v.id)}">Mudar</button>`
        : `<button class="act sm" data-act="pagar" data-id="${esc(v.id)}">Recebi</button>`}
    </div>`;
  };
  return `${memoryBanner()}${backupBanner()}
  <div class="total top"><span>Total a receber</span><strong>${L.money(L.sumOwed(visits))}</strong></div>
  <h2>Não pago${devendo.length ? ` (${devendo.length})` : ''}</h2>
  ${devendo.length ? devendo.map((v) => card(v, false)).join('') : '<p class="empty">Ninguém está devendo. 🎉</p>'}
  ${pagos.length ? `<h2>Já pagos</h2>${pagos.slice(0, S.paidLimit).map((v) => card(v, true)).join('')}
    ${pagos.length > S.paidLimit ? '<button class="back" data-act="mais-pagos">Ver mais</button>' : ''}` : ''}
  <button class="act" data-act="ir-novo">Novo atendimento</button>`;
}

// ---- Tela 4: Como recebeu?
function viewPagamento() {
  const v = visits.find((x) => x.id === S.payId);
  if (!v) { S.screen = 'receber'; return viewReceber(); }
  const hasCosts = L.assistantCost(v) || L.productsCost(v.usage);
  return `
  <h1 class="center">Como recebeu?</h1>
  <p class="center sub">${esc(v.client)} · <b>${L.money(L.visitTotal(v))}</b></p>
  <p class="center muted small">${L.fmtDate(v.date)} · ${esc(v.items.map((i) => i.name).join(', '))}${v.adjust ? ` · ${v.adjust < 0 ? 'desconto' : 'acréscimo'} de ${L.money(Math.abs(v.adjust))}` : ''}</p>
  ${v.paid ? `<p class="center ok">Marcado como pago no ${esc(L.methodLabel(v.method))}${v.paidAt ? ` (${L.fmtDateTime(v.paidAt)})` : ''}</p>` : ''}
  <div class="opts col">
    ${L.METHODS.map((m) => `<button class="opt big${v.paid && v.method === m.id ? ' on' : ''}" data-act="metodo" data-m="${m.id}">${m.label}${v.paid && v.method === m.id ? ' ✓' : ''}</button>`).join('')}
  </div>
  <button class="act danger" data-act="nao-recebi">Não recebi</button>
  <button class="back" data-act="voltar-receber">Voltar</button>
  ${hasCosts ? `<details class="costs-details"><summary>Ver custo e lucro</summary>${costBox(v, 'Custo e lucro')}
    ${(v.usage || []).length ? `<p class="muted small">Produtos: ${esc(v.usage.map((u) => `${u.name} (${L.fmtQty(u.qty)} ${u.unit})`).join(', '))}</p>` : ''}</details>` : ''}
  <button class="link danger-text" data-act="apagar-atendimento">Apagar este atendimento</button>`;
}

// ---- Ajustes
function viewAjustes() {
  const groups = L.groupServices(services).map((g) => `
    <h3 class="grp">${esc(g.category)}</h3>
    ${g.items.map((s) => `<button class="row" data-act="editar-servico" data-id="${esc(s.id)}"><span>${esc(s.name)}</span><span>${L.money(s.price)} ›</span></button>`).join('')}`).join('');
  const sizes = [['normal', 'Normal'], ['grande', 'Grande'], ['enorme', 'Muito grande']];
  const cur = settings.fontSize || 'grande';
  const linked = !!settings.sheetUrl;
  let sheetStatus = 'Ainda não ligada.';
  if (linked) {
    if (S.syncing) sheetStatus = 'Enviando…';
    else if (settings.syncError) sheetStatus = `<span class="bad">Não enviou: ${esc(settings.syncError)}</span>`;
    else if (settings.dirty) sheetStatus = 'Tem mudanças esperando internet para enviar.';
    else if (settings.lastSync) sheetStatus = `<span class="ok">Tudo copiado. Última vez: ${L.fmtDateTime(settings.lastSync)}.</span>`;
    else sheetStatus = 'Ligada. Ainda não enviou nada.';
  }
  return `
  <h1>Ajustes</h1>

  <section class="box">
    <h2>Serviços e preços</h2>
    <p class="muted small">Toque num serviço para mudar o nome ou o preço.</p>
    ${groups}
    <button class="act" data-act="novo-servico">+ Novo serviço</button>
  </section>

  <section class="box">
    <h2>Produtos</h2>
    <p class="muted small">Os produtos que você usa, com o custo, para calcular o lucro de cada atendimento.</p>
    <button class="row" data-act="abrir-produtos"><span>Meus produtos</span><span>${products.length} ›</span></button>
    <button class="row" data-act="abrir-tipos"><span>Tipos e subtipos</span><span>${types.length} ›</span></button>
  </section>

  <section class="box">
    <h2>Tamanho da letra</h2>
    <div class="opts row3">
      ${sizes.map(([id, label]) => `<button class="opt${cur === id ? ' on' : ''}" data-act="fonte" data-f="${id}">${label}</button>`).join('')}
    </div>
  </section>

  <section class="box">
    <h2>Cópia de segurança</h2>
    <p class="muted small">O iPhone pode apagar os dados do app se o Safari for limpo. Guarde uma cópia de vez em quando (no WhatsApp, no e-mail ou em Arquivos).</p>
    <p class="small">${settings.lastExport ? `Última cópia: ${L.fmtDateTime(settings.lastExport)}.` : 'Nenhuma cópia feita ainda.'}</p>
    <button class="act" data-act="exportar">Salvar cópia</button>
    <button class="back" data-act="importar">Abrir uma cópia</button>
    <input id="arquivo" type="file" accept=".json,application/json" hidden />
  </section>

  <section class="box">
    <h2>Planilha Google</h2>
    <p class="muted small">Quando tiver internet, o app copia tudo para a planilha. Peça ajuda para ligar (veja o passo a passo no README).</p>
    <p class="small">${sheetStatus}</p>
    ${linked ? `
      <button class="act" data-act="sync-agora">Enviar agora</button>
      ${settings.syncErrorCode === 'menos' ? '<button class="act danger" data-act="sync-forcar">Enviar mesmo assim</button>' : ''}
      <button class="back" data-act="puxar">Trazer dados da planilha</button>` : ''}
    <details ${linked ? '' : 'open'}>
      <summary>${linked ? 'Mudar a ligação' : 'Ligar a planilha'}</summary>
      <label class="lbl" for="sheet-url">Endereço do script (termina em /exec)</label>
      <input id="sheet-url" class="field" type="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(settings.sheetUrl || '')}" />
      <label class="lbl" for="sheet-senha">Senha do script</label>
      <input id="sheet-senha" class="field" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(settings.senha || '')}" />
      <button class="act" data-act="ligar-planilha">Salvar ligação</button>
      ${linked ? '<button class="link danger-text" data-act="desligar-planilha">Desligar a planilha</button>' : ''}
    </details>
  </section>

  <button class="back" data-act="ir-novo">Voltar</button>`;
}

function viewServico() {
  const s = S.svcId === 'novo' ? { name: '', category: '', price: 0 } : svcById(S.svcId);
  if (!s) { S.screen = 'ajustes'; return viewAjustes(); }
  const cats = [...new Set(services.map((x) => x.category).filter(Boolean))];
  return `
  <h1>${S.svcId === 'novo' ? 'Novo serviço' : 'Editar serviço'}</h1>
  <label class="lbl" for="svc-name">Nome</label>
  <input id="svc-name" class="field" type="text" autocapitalize="sentences" value="${esc(s.name)}" placeholder="Ex.: Corte com escova" />
  <label class="lbl" for="svc-price">Preço (R$)</label>
  <input id="svc-price" class="field" type="text" inputmode="decimal" value="${s.price ? esc(L.money(s.price).replace(/^R\$\s?/, '')) : ''}" placeholder="Ex.: 80" />
  <label class="lbl" for="svc-cat">Grupo</label>
  <input id="svc-cat" class="field" type="text" list="cats" autocapitalize="sentences" value="${esc(s.category)}" placeholder="Ex.: Cabelo" />
  <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
  <div class="opts chips-row">${cats.map((c) => `<button class="chip" data-act="usar-grupo" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <button class="act" data-act="salvar-servico">Salvar</button>
  <button class="back" data-act="abrir-ajustes">Voltar</button>
  ${S.svcId !== 'novo' ? '<button class="link danger-text" data-act="apagar-servico">Apagar este serviço</button>' : ''}`;
}

// ---- V2: produtos
function viewProdutos() {
  const groups = L.groupProducts(products, types, subtypes);
  return `
  <h1>Meus produtos</h1>
  <button class="act" data-act="novo-produto">+ Novo produto</button>
  ${groups.length ? groups.map((g) => `<h3 class="grp">${esc(g.title)}</h3>
    <div class="opts">${g.items.map(({ product, subtype }) => productButton(product, subtype, 'editar-produto')).join('')}</div>`).join('')
    : '<p class="empty">Nenhum produto ainda. Toque em “+ Novo produto” para cadastrar o primeiro.</p>'}
  <button class="back" data-act="abrir-ajustes">Voltar</button>`;
}

function productForm(p) {
  return {
    id: p?.id || null, name: p?.name || '', typeId: p?.typeId || null, subtypeId: p?.subtypeId || null,
    traits: structuredClone(p?.traits || []),
    costText: p ? L.money(p.cost).replace(/^R\$\s?/, '') : '',
    packText: p?.packQty ? L.fmtQty(p.packQty) : '', unit: p?.unit || 'ml',
  };
}

function viewProduto() {
  const f = S.pf;
  const subs = subtypes.filter((s) => s.typeId === f.typeId).sort(byOrder);
  const cost = L.parsePrice(f.costText);
  const pack = L.parseQty(f.packText);
  return `
  <h1>${f.id ? 'Editar produto' : 'Novo produto'}</h1>
  <label class="lbl" for="pf-name">Nome do produto</label>
  <input id="pf-name" class="field" type="text" autocapitalize="sentences" placeholder="Ex.: Água oxigenada Wella" data-bind="pf.name" value="${esc(f.name)}" />

  <p class="lbl">Tipo</p>
  <div class="chips-row">
    ${[...types].sort(byOrder).map((t) => `<button class="chip${t.id === f.typeId ? ' on' : ''}" data-act="pf-tipo" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
  </div>
  ${f.typeId ? `
    <p class="lbl">Subtipo</p>
    ${subs.length ? `<div class="chips-row">
      ${subs.map((s) => `<button class="chip${s.id === f.subtypeId ? ' on' : ''}" data-act="pf-subtipo" data-id="${esc(s.id)}">${esc(s.name)}</button>`).join('')}
    </div>` : '<p class="muted small">Este tipo ainda não tem subtipos (dá para criar em Tipos e subtipos).</p>'}` : ''}

  <p class="lbl">Características</p>
  ${f.traits.length ? f.traits.map((t, i) => `
    <div class="trait">
      <input class="field" type="text" placeholder="Nome (ex.: Volume)" aria-label="Nome da característica" data-bind="pf.traits.${i}.name" value="${esc(t.name)}" />
      <input class="field" type="text" placeholder="Valor (ex.: 20)" aria-label="Valor de ${esc(t.name)}" data-bind="pf.traits.${i}.value" value="${esc(t.value)}" />
      <button class="x" data-act="pf-tirar-carac" data-i="${i}" aria-label="Tirar característica">✕</button>
    </div>`).join('') : '<p class="muted small">Ex.: Volume = 20, Cor = 7.1. Opcional.</p>'}
  <button class="back sm wide" data-act="pf-add-carac">+ Característica</button>

  <label class="lbl" for="pf-cost">Custo: quanto pagou (R$)</label>
  <input id="pf-cost" class="field" type="text" inputmode="decimal" placeholder="Ex.: 35" data-bind="pf.costText" value="${esc(f.costText)}" />
  <label class="lbl" for="pf-pack">Quantidade da embalagem</label>
  <div class="pack">
    <input id="pf-pack" class="field" type="text" inputmode="decimal" placeholder="Ex.: 900" data-bind="pf.packText" value="${esc(f.packText)}" />
    ${L.UNITS.map((u) => `<button class="opt${f.unit === u ? ' on' : ''}" data-act="pf-unidade" data-u="${u}">${u}</button>`).join('')}
  </div>
  <p class="hint" id="pf-custo">${cost !== null && pack ? `Cada ${f.unit} custa ${L.money(L.usageCost({ cost, packQty: pack }, 1))}` : ''}</p>

  <button class="act" data-act="salvar-produto">Salvar</button>
  <button class="back" data-act="voltar-produto">Voltar</button>
  ${f.id ? '<button class="link danger-text" data-act="apagar-produto">Apagar este produto</button>' : ''}`;
}

// ---- V2: tipos e subtipos
function viewTipos() {
  return `
  <h1>Tipos e subtipos</h1>
  <p class="muted small">Organize seus produtos. Toque para mudar o nome ou apagar.</p>
  ${[...types].sort(byOrder).map((t) => {
    const subs = subtypes.filter((s) => s.typeId === t.id).sort(byOrder);
    return `<section class="box">
      <button class="row type-row" data-act="editar-tipo" data-id="${esc(t.id)}"><span>${esc(t.name)}</span><span>›</span></button>
      ${subs.map((s) => `<button class="row sub-row" data-act="editar-subtipo" data-id="${esc(s.id)}">
        <span>${esc(s.name)}${s.fields?.length ? `<br><span class="muted small">${esc(s.fields.join(', '))}</span>` : ''}</span><span>›</span></button>`).join('')}
      <button class="back sm wide" data-act="novo-subtipo" data-type="${esc(t.id)}">+ Subtipo em ${esc(t.name)}</button>
    </section>`;
  }).join('')}
  <button class="act" data-act="novo-tipo">+ Novo tipo</button>
  <button class="back" data-act="abrir-ajustes">Voltar</button>`;
}

function viewTipo() {
  const f = S.tf;
  return `
  <h1>${f.id ? 'Editar tipo' : 'Novo tipo'}</h1>
  <label class="lbl" for="tf-name">Nome do tipo</label>
  <input id="tf-name" class="field" type="text" autocapitalize="sentences" placeholder="Ex.: Química" data-bind="tf.name" value="${esc(f.name)}" />
  <button class="act" data-act="salvar-tipo">Salvar</button>
  <button class="back" data-act="abrir-tipos">Voltar</button>
  ${f.id ? '<button class="link danger-text" data-act="apagar-tipo">Apagar este tipo</button>' : ''}`;
}

function viewSubtipo() {
  const f = S.sf;
  return `
  <h1>${f.id ? 'Editar subtipo' : 'Novo subtipo'}</h1>
  <label class="lbl" for="sf-name">Nome do subtipo</label>
  <input id="sf-name" class="field" type="text" autocapitalize="sentences" placeholder="Ex.: Água oxigenada" data-bind="sf.name" value="${esc(f.name)}" />
  <p class="lbl">Dentro do tipo</p>
  <div class="chips-row">
    ${[...types].sort(byOrder).map((t) => `<button class="chip${t.id === f.typeId ? ' on' : ''}" data-act="sf-tipo" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
  </div>
  <p class="lbl">Características</p>
  <p class="muted small">Os nomes que aparecem já prontos ao cadastrar um produto deste subtipo. Ex.: Volume, Cor.</p>
  ${f.fields.map((name, i) => `
    <div class="trait one">
      <input class="field" type="text" placeholder="Ex.: Volume" aria-label="Característica ${i + 1}" data-bind="sf.fields.${i}" value="${esc(name)}" />
      <button class="x" data-act="sf-tirar-carac" data-i="${i}" aria-label="Tirar característica">✕</button>
    </div>`).join('')}
  <button class="back sm wide" data-act="sf-add-carac">+ Característica</button>
  <button class="act" data-act="salvar-subtipo">Salvar</button>
  <button class="back" data-act="abrir-tipos">Voltar</button>
  ${f.id ? '<button class="link danger-text" data-act="apagar-subtipo">Apagar este subtipo</button>' : ''}`;
}

// ------------------------------------------------------------------ ações
function go(tab, screen) { S.tab = tab; S.screen = screen; render(); }

let toastTimer;
function toast(msg, kind = '') {
  $toast.textContent = msg;
  $toast.className = `toast ${kind}`;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 3500);
}

async function saveVisit(v) {
  v.updatedAt = new Date().toISOString();
  await db.put('visits', v);
  const i = visits.findIndex((x) => x.id === v.id);
  if (i >= 0) visits[i] = v; else visits.push(v);
  changed();
}

async function saveIn(store, list, obj) {
  await db.put(store, obj);
  if (!list.includes(obj)) list.push(obj);
  changed();
}

async function removeFrom(store, obj) {
  await db.remove(store, obj.id);
  changed();
}

const actions = {
  svc(b) {
    const id = b.dataset.id;
    S.draft.ids = S.draft.ids.includes(id) ? S.draft.ids.filter((x) => x !== id) : [...S.draft.ids, id];
    const on = S.draft.ids.includes(id);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.querySelector('.opt-name').textContent = `${svcById(id)?.name || ''}${on ? ' ✓' : ''}`;
    updateNovo();
  },
  'usar-cliente'(b) {
    S.draft.name = b.dataset.name;
    document.getElementById('cli').value = S.draft.name;
    updateNovo();
  },
  assistente(b) {
    const sim = b.dataset.v === 'sim';
    S.draft.hadAssistant = sim;
    // Para digitar menos: já vem com o último valor pago à assistente.
    if (sim && !S.draft.assistantText && settings.lastAssistant) S.draft.assistantText = L.money(settings.lastAssistant).replace(/^R\$\s?/, '');
    render();
    if (sim && !S.draft.assistantText) document.getElementById('asst')?.focus();
  },
  continuar() {
    S.draft.name = L.normalizeName(document.getElementById('cli').value);
    if (!S.draft.name) { toast('Escreva o nome da cliente.', 'bad'); document.getElementById('cli').focus(); return; }
    if (!S.draft.ids.length) { toast('Toque nos serviços que você fez.', 'bad'); return; }
    if (S.draft.hadAssistant && !L.parsePrice(S.draft.assistantText)) {
      toast('Escreva quanto pagou à assistente (ou toque em Não).', 'bad'); document.getElementById('asst')?.focus(); return;
    }
    S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, 0);
    go('atender', 'conta');
  },
  menos() { S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, -L.STEP); render(); },
  mais() { S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, L.STEP); render(); },
  'voltar-novo'() { go('atender', 'novo'); },
  'voltar-conta'() { S.use = null; go('atender', 'conta'); },
  async salvar() {
    const asst = draftAssistant();
    const v = {
      id: L.uid(), client: L.normalizeName(S.draft.name), date: new Date().toISOString(),
      items: draftItems(), adjust: S.draft.adjust, paid: false, method: null, paidAt: null, deleted: false,
      hadAssistant: asst > 0, assistant: asst, usage: S.draft.usage,
    };
    await saveVisit(v);
    if (asst) await saveSettings({ lastAssistant: asst });
    S.draft = newDraft();
    go('receber', 'receber');
    toast(`Salvo: ${v.client} deve ${L.money(L.visitTotal(v))}`, 'ok');
  },

  // produtos usados no atendimento
  'add-uso'() { S.use = { productId: null, qtyText: '' }; go('atender', 'uso'); },
  'escolher-uso'(b) {
    const last = settings.lastQty?.[b.dataset.id];
    S.use = { productId: b.dataset.id, qtyText: last ? L.fmtQty(last) : '' };
    render();
    if (!last) document.getElementById('qty')?.focus();
  },
  'trocar-uso'() { S.use = { productId: null, qtyText: '' }; render(); },
  async 'confirmar-uso'() {
    const p = prodById(S.use.productId);
    const qty = L.parseQty(S.use.qtyText);
    if (!qty) { toast(`Escreva quantos ${p.unit} usou. Ex.: 30`, 'bad'); document.getElementById('qty')?.focus(); return; }
    const traits = L.traitsText(p.traits);
    S.draft.usage.push({ productId: p.id, name: traits ? `${p.name} (${traits})` : p.name, qty, unit: p.unit, cost: L.usageCost(p, qty) });
    await saveSettings({ lastQty: { ...(settings.lastQty || {}), [p.id]: qty } });
    S.use = null;
    go('atender', 'conta');
  },
  'tirar-uso'(b) { S.draft.usage.splice(Number(b.dataset.i), 1); render(); },
  'novo-produto-uso'() { S.pf = productForm(null); S.prodReturn = 'uso'; go('atender', 'produto'); },

  pagar(b) { S.payId = b.dataset.id; go('receber', 'pagamento'); },
  async metodo(b) {
    const v = visits.find((x) => x.id === S.payId);
    const keepDate = v.paid && v.paidAt;
    Object.assign(v, { paid: true, method: b.dataset.m, paidAt: keepDate || new Date().toISOString() });
    await saveVisit(v);
    go('receber', 'receber');
    toast(`${v.client}: pago no ${L.methodLabel(v.method)} ✓`, 'ok');
  },
  async 'nao-recebi'() {
    const v = visits.find((x) => x.id === S.payId);
    const was = v.paid;
    Object.assign(v, { paid: false, method: null, paidAt: null });
    if (was) await saveVisit(v);
    go('receber', 'receber');
    toast(`${v.client}: marcado como não pago`);
  },
  'voltar-receber'() { go('receber', 'receber'); },
  async 'apagar-atendimento'() {
    const v = visits.find((x) => x.id === S.payId);
    if (!confirm(`Apagar o atendimento de ${v.client} (${L.money(L.visitTotal(v))})?`)) return;
    v.deleted = true;
    await saveVisit(v);
    go('receber', 'receber');
    toast('Atendimento apagado');
  },
  'mais-pagos'() { S.paidLimit += 30; render(); },
  'ir-novo'() { go('atender', 'novo'); },
  'abrir-ajustes'() { go('ajustes', 'ajustes'); },

  // serviços
  'editar-servico'(b) { S.svcId = b.dataset.id; go('ajustes', 'servico'); },
  'novo-servico'() { S.svcId = 'novo'; go('ajustes', 'servico'); },
  'usar-grupo'(b) { document.getElementById('svc-cat').value = b.dataset.c; },
  async 'salvar-servico'() {
    const name = L.normalizeName(document.getElementById('svc-name').value);
    const price = L.parsePrice(document.getElementById('svc-price').value);
    const category = L.normalizeName(document.getElementById('svc-cat').value) || 'Outros';
    if (!name) { toast('Escreva o nome do serviço.', 'bad'); return; }
    if (price === null) { toast('Escreva o preço só com números. Ex.: 80 ou 80,50', 'bad'); return; }
    const s = S.svcId === 'novo' ? { id: L.uid(), order: nextOrder(services) } : svcById(S.svcId);
    Object.assign(s, { name, price, category });
    await saveIn('services', services, s);
    go('ajustes', 'ajustes');
    toast('Serviço salvo', 'ok');
  },
  async 'apagar-servico'() {
    const s = svcById(S.svcId);
    if (!confirm(`Apagar o serviço "${s.name}"? Os atendimentos antigos não mudam.`)) return;
    services = services.filter((x) => x.id !== s.id);
    S.draft.ids = S.draft.ids.filter((x) => x !== s.id);
    await removeFrom('services', s);
    go('ajustes', 'ajustes');
  },
  async fonte(b) { await saveSettings({ fontSize: b.dataset.f }); applyFont(); render(); },

  // produtos (cadastro)
  'abrir-produtos'() { go('ajustes', 'produtos'); },
  'novo-produto'() { S.pf = productForm(null); S.prodReturn = 'produtos'; go('ajustes', 'produto'); },
  'editar-produto'(b) { S.pf = productForm(prodById(b.dataset.id)); S.prodReturn = 'produtos'; go('ajustes', 'produto'); },
  'pf-tipo'(b) {
    if (S.pf.typeId !== b.dataset.id) { S.pf.typeId = b.dataset.id; S.pf.subtypeId = null; }
    render();
  },
  'pf-subtipo'(b) {
    S.pf.subtypeId = b.dataset.id;
    // Traz as características do subtipo, sem apagar o que ela já escreveu.
    for (const name of subById(b.dataset.id)?.fields || []) {
      if (!S.pf.traits.some((t) => L.normalizeName(t.name).toLowerCase() === name.toLowerCase())) S.pf.traits.push({ name, value: '' });
    }
    render();
  },
  'pf-add-carac'() { S.pf.traits.push({ name: '', value: '' }); render(); document.querySelector(`[data-bind="pf.traits.${S.pf.traits.length - 1}.name"]`)?.focus(); },
  'pf-tirar-carac'(b) { S.pf.traits.splice(Number(b.dataset.i), 1); render(); },
  'pf-unidade'(b) { S.pf.unit = b.dataset.u; render(); },
  'voltar-produto'() { S.prodReturn === 'uso' ? go('atender', 'uso') : go('ajustes', 'produtos'); },
  async 'salvar-produto'() {
    const f = S.pf;
    const name = L.normalizeName(f.name);
    const cost = L.parsePrice(f.costText);
    const packQty = L.parseQty(f.packText);
    if (!name) { toast('Escreva o nome do produto.', 'bad'); return; }
    if (!f.typeId) { toast('Toque no tipo do produto.', 'bad'); return; }
    if (cost === null) { toast('Escreva o custo só com números. Ex.: 35 ou 35,90', 'bad'); return; }
    if (!packQty) { toast(`Escreva quantos ${f.unit} vêm na embalagem. Ex.: 900`, 'bad'); return; }
    const p = f.id ? prodById(f.id) : { id: L.uid(), order: nextOrder(products) };
    Object.assign(p, {
      name, typeId: f.typeId, subtypeId: f.subtypeId, cost, packQty, unit: f.unit,
      traits: f.traits.map((t) => ({ name: L.normalizeName(t.name), value: L.normalizeName(t.value) })).filter((t) => t.name && t.value),
    });
    await saveIn('products', products, p);
    toast('Produto salvo', 'ok');
    if (S.prodReturn === 'uso') { S.use = { productId: p.id, qtyText: '' }; go('atender', 'uso'); }
    else go('ajustes', 'produtos');
  },
  async 'apagar-produto'() {
    const p = prodById(S.pf.id);
    if (!confirm(`Apagar o produto "${p.name}"? Os atendimentos antigos não mudam.`)) return;
    products = products.filter((x) => x.id !== p.id);
    await removeFrom('products', p);
    go('ajustes', 'produtos');
  },

  // tipos e subtipos
  'abrir-tipos'() { go('ajustes', 'tipos'); },
  'novo-tipo'() { S.tf = { id: null, name: '' }; go('ajustes', 'tipo'); },
  'editar-tipo'(b) { const t = typeById(b.dataset.id); S.tf = { id: t.id, name: t.name }; go('ajustes', 'tipo'); },
  async 'salvar-tipo'() {
    const name = L.normalizeName(S.tf.name);
    if (!name) { toast('Escreva o nome do tipo.', 'bad'); return; }
    const t = S.tf.id ? typeById(S.tf.id) : { id: L.uid(), order: nextOrder(types) };
    t.name = name;
    await saveIn('types', types, t);
    go('ajustes', 'tipos');
    toast('Tipo salvo', 'ok');
  },
  async 'apagar-tipo'() {
    const t = typeById(S.tf.id);
    const used = L.productsUsing(products, { typeId: t.id });
    if (used.length) { alert(`Não dá para apagar "${t.name}": ${used.length} produto(s) usam esse tipo. Mude ou apague esses produtos antes.`); return; }
    const subs = subtypes.filter((s) => s.typeId === t.id);
    if (!confirm(`Apagar o tipo "${t.name}"${subs.length ? ` e os ${subs.length} subtipos dele` : ''}?`)) return;
    for (const s of subs) await db.remove('subtypes', s.id);
    subtypes = subtypes.filter((s) => s.typeId !== t.id);
    types = types.filter((x) => x.id !== t.id);
    await removeFrom('types', t);
    go('ajustes', 'tipos');
  },
  'novo-subtipo'(b) { S.sf = { id: null, name: '', typeId: b.dataset.type, fields: [] }; go('ajustes', 'subtipo'); },
  'editar-subtipo'(b) {
    const s = subById(b.dataset.id);
    S.sf = { id: s.id, name: s.name, typeId: s.typeId, fields: [...(s.fields || [])] };
    go('ajustes', 'subtipo');
  },
  'sf-tipo'(b) { S.sf.typeId = b.dataset.id; render(); },
  'sf-add-carac'() { S.sf.fields.push(''); render(); document.querySelector(`[data-bind="sf.fields.${S.sf.fields.length - 1}"]`)?.focus(); },
  'sf-tirar-carac'(b) { S.sf.fields.splice(Number(b.dataset.i), 1); render(); },
  async 'salvar-subtipo'() {
    const name = L.normalizeName(S.sf.name);
    if (!name) { toast('Escreva o nome do subtipo.', 'bad'); return; }
    const s = S.sf.id ? subById(S.sf.id) : { id: L.uid(), order: nextOrder(subtypes.filter((x) => x.typeId === S.sf.typeId)) };
    Object.assign(s, { name, typeId: S.sf.typeId, fields: [...new Set(S.sf.fields.map(L.normalizeName).filter(Boolean))] });
    await saveIn('subtypes', subtypes, s);
    // Se o subtipo mudou de tipo, os produtos dele vão junto.
    for (const p of products.filter((x) => x.subtypeId === s.id && x.typeId !== s.typeId)) {
      p.typeId = s.typeId;
      await db.put('products', p);
    }
    go('ajustes', 'tipos');
    toast('Subtipo salvo', 'ok');
  },
  async 'apagar-subtipo'() {
    const s = subById(S.sf.id);
    const used = L.productsUsing(products, { subtypeId: s.id });
    if (used.length) { alert(`Não dá para apagar "${s.name}": ${used.length} produto(s) usam esse subtipo. Mude ou apague esses produtos antes.`); return; }
    if (!confirm(`Apagar o subtipo "${s.name}"?`)) return;
    subtypes = subtypes.filter((x) => x.id !== s.id);
    await removeFrom('subtypes', s);
    go('ajustes', 'tipos');
  },

  // cópia
  exportar: exportBackup,
  importar() { document.getElementById('arquivo').click(); },

  // planilha
  async 'ligar-planilha'() {
    const url = document.getElementById('sheet-url').value.trim();
    const senha = document.getElementById('sheet-senha').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) { toast('O endereço deve começar com https://script.google.com', 'bad'); return; }
    await saveSettings({ sheetUrl: url, senha, syncError: null, syncErrorCode: null });
    // Celular sem atendimentos (novo ou apagado): primeiro tenta trazer o que já existe na planilha.
    if (!visits.some((v) => !v.deleted)) { await pullFromSheet(false); return; }
    await doSync(true);
  },
  async 'desligar-planilha'() {
    if (!confirm('Desligar a planilha? Os dados que já estão lá continuam lá.')) return;
    await saveSettings({ sheetUrl: '', senha: '', syncError: null, syncErrorCode: null, dirty: false });
    render();
  },
  'sync-agora'() { doSync(true); },
  'sync-forcar'() {
    if (confirm('A planilha tem mais atendimentos que o celular. Enviar mesmo assim vai TROCAR os dados da planilha pelos do celular. Continuar?')) doSync(true, true);
  },
  puxar() { pullFromSheet(true); },
};

// ------------------------------------------------------------------ cópia de segurança
async function exportBackup() {
  const json = JSON.stringify(L.fullSnapshot(allData()), null, 1);
  const name = L.backupFileName();
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Cópia do app' });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
  } catch (e) {
    if (e?.name === 'AbortError') return; // ela cancelou
    toast('Não deu para salvar a cópia.', 'bad'); return;
  }
  await saveSettings({ lastExport: new Date().toISOString() });
  render();
  toast('Cópia salva ✓', 'ok');
}

async function restore(data, origem) {
  const clean = L.validateBackup(data);
  const n = clean.visits.filter((v) => !v.deleted).length;
  const extra = clean.products ? ` e ${clean.products.length} produtos` : '';
  if (!confirm(`Trocar os dados do celular pelos ${origem}? (${n} atendimentos, ${clean.services.length} serviços${extra})`)) return false;
  await db.replaceAll(clean);
  services = clean.services; visits = clean.visits;
  if (clean.products) ({ types, subtypes, products } = clean);
  await db.setMeta('seeded', true);
  await db.setMeta('seededCatalog', true);
  return true;
}

$app.addEventListener('change', async (e) => {
  if (e.target.id !== 'arquivo') return;
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    if (await restore(JSON.parse(await f.text()), 'da cópia')) {
      changed();
      go('receber', 'receber');
      toast('Cópia aberta ✓', 'ok');
    }
  } catch (err) {
    toast(err instanceof SyntaxError ? 'Este arquivo não é uma cópia do app.' : err.message, 'bad');
  }
});

// ------------------------------------------------------------------ planilha
let syncTimer;
function changed() {
  settings.dirty = true;
  saveSettings({});
  scheduleSync();
}

function scheduleSync(delay = 2500) {
  if (!settings.sheetUrl) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => doSync(false), delay);
}

async function doSync(manual, force = false) {
  if (!settings.sheetUrl || S.syncing) return;
  if (!navigator.onLine) { if (manual) toast('Sem internet agora. O app envia quando a internet voltar.'); return; }
  S.syncing = true; if (S.screen === 'ajustes') render();
  try {
    await sync.push(settings.sheetUrl, settings.senha, L.fullSnapshot(allData()), force);
    await saveSettings({ dirty: false, lastSync: new Date().toISOString(), syncError: null, syncErrorCode: null });
    if (manual) toast('Planilha atualizada ✓', 'ok');
  } catch (e) {
    await saveSettings({ syncError: e.message, syncErrorCode: e.code || null });
    if (manual) toast(e.message, 'bad');
  } finally {
    S.syncing = false;
    if (S.screen === 'ajustes') render();
  }
}

async function pullFromSheet(askedByUser) {
  if (!navigator.onLine) { toast('Sem internet agora.', 'bad'); return; }
  try {
    toast('Buscando na planilha…');
    const data = await sync.pull(settings.sheetUrl, settings.senha);
    const remoteVisits = (data?.visits || []).length;
    if (!askedByUser && !remoteVisits) { await doSync(true); return; } // planilha vazia: só envia
    if (await restore(data, 'da planilha')) {
      await saveSettings({ dirty: false, lastSync: new Date().toISOString(), syncError: null, syncErrorCode: null });
      go('receber', 'receber');
      toast('Dados trazidos da planilha ✓', 'ok');
    } else render();
  } catch (e) {
    await saveSettings({ syncError: e.message, syncErrorCode: e.code || null });
    render();
    toast(e.message, 'bad');
  }
}

window.addEventListener('online', () => settings.dirty && scheduleSync(800));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && settings.dirty) scheduleSync(800);
});

// ------------------------------------------------------------------ eventos
$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || !actions[b.dataset.act]) return;
  e.preventDefault();
  actions[b.dataset.act](b);
});

/** Campos com data-bind="pf.traits.0.value" guardam o que foi digitado no estado (para não perder ao redesenhar). */
function bind(path, value) {
  const keys = path.split('.');
  let obj = S;
  for (const k of keys.slice(0, -1)) obj = obj?.[k];
  if (obj) obj[keys.at(-1)] = value;
}

$app.addEventListener('input', (e) => {
  if (e.target.id === 'cli') { S.draft.name = e.target.value; updateNovo(); return; }
  if (e.target.dataset.bind) bind(e.target.dataset.bind, e.target.value);
  if (e.target.id === 'qty') {
    const p = prodById(S.use.productId); const q = L.parseQty(e.target.value);
    document.getElementById('uso-custo').innerHTML = q ? `Custo: <b>${L.money(L.usageCost(p, q))}</b>` : '';
  }
  if (e.target.id === 'pf-cost' || e.target.id === 'pf-pack') {
    const cost = L.parsePrice(S.pf.costText); const pack = L.parseQty(S.pf.packText);
    document.getElementById('pf-custo').textContent = cost !== null && pack ? `Cada ${S.pf.unit} custa ${L.money(L.usageCost({ cost, packQty: pack }, 1))}` : '';
  }
});

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'atender') go('atender', ['conta', 'uso'].includes(S.screen) ? 'conta' : 'novo');
  else go('receber', 'receber');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot().catch((e) => {
  $app.innerHTML = `<p class="banner bad">Erro ao abrir o app: ${esc(e.message)}</p>`;
});
