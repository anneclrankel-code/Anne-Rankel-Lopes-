// Telas do app. Duas abas: "Atender" e "A receber". Ajustes fica num botão discreto.
import * as L from './logic.js';
import * as db from './store.js';
import * as sync from './sync.js';

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

let services = [];
let visits = [];
let settings = {}; // { sheetUrl, senha, fontSize, lastSync, lastExport, syncError, syncErrorCode, dirty }

const S = {
  tab: 'atender', // 'atender' | 'receber' | 'ajustes'
  screen: 'novo', // novo | conta | receber | pagamento | ajustes | servico
  draft: newDraft(),
  payId: null,
  svcId: null, // serviço em edição ('novo' para novo)
  paidLimit: 15,
  syncing: false,
};

function newDraft() { return { name: '', ids: [], adjust: 0 }; }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svcById = (id) => services.find((s) => s.id === id);
const draftItems = () => S.draft.ids.map(svcById).filter(Boolean).map((s) => ({ serviceId: s.id, name: s.name, price: s.price }));

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

  const views = { novo: viewNovo, conta: viewConta, receber: viewReceber, pagamento: viewPagamento, ajustes: viewAjustes, servico: viewServico };
  $app.innerHTML = (views[S.screen] || viewNovo)();
  window.scrollTo(0, 0);
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

  return `${memoryBanner()}${backupBanner()}
  <h1>Novo atendimento</h1>
  <label class="lbl" for="cli">Cliente</label>
  <input id="cli" class="field" type="text" placeholder="Nome da cliente" autocomplete="off" autocapitalize="words"
    enterkeyhint="done" value="${esc(S.draft.name)}" />
  <div id="sug" class="chips"></div>
  <p class="lbl">Toque nos serviços feitos</p>
  ${services.length ? groups : '<p class="muted">Nenhum serviço cadastrado. Toque em Ajustes para cadastrar.</p>'}
  <div class="bottom">
    <p id="falta" class="hint"></p>
    <button class="act" data-act="continuar">Continuar</button>
  </div>
  <button class="link" data-act="abrir-ajustes">⚙️ Ajustes, serviços e cópia de segurança</button>`;
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
  <button class="act" data-act="salvar">Salvar</button>
  <button class="back" data-act="voltar-novo">Voltar</button>`;
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
  continuar() {
    S.draft.name = L.normalizeName(document.getElementById('cli').value);
    if (!S.draft.name) { toast('Escreva o nome da cliente.', 'bad'); document.getElementById('cli').focus(); return; }
    if (!S.draft.ids.length) { toast('Toque nos serviços que você fez.', 'bad'); return; }
    S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, 0);
    go('atender', 'conta');
  },
  menos() { S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, -L.STEP); render(); },
  mais() { S.draft.adjust = L.changeAdjust(draftItems(), S.draft.adjust, L.STEP); render(); },
  'voltar-novo'() { go('atender', 'novo'); },
  async salvar() {
    const v = {
      id: L.uid(), client: L.normalizeName(S.draft.name), date: new Date().toISOString(),
      items: draftItems(), adjust: S.draft.adjust, paid: false, method: null, paidAt: null, deleted: false,
    };
    await saveVisit(v);
    S.draft = newDraft();
    go('receber', 'receber');
    toast(`Salvo: ${v.client} deve ${L.money(L.visitTotal(v))}`, 'ok');
  },
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
    const s = S.svcId === 'novo'
      ? { id: L.uid(), order: Math.max(-1, ...services.map((x) => x.order ?? 0)) + 1 }
      : svcById(S.svcId);
    Object.assign(s, { name, price, category });
    await db.put('services', s);
    if (S.svcId === 'novo') services.push(s);
    changed();
    go('ajustes', 'ajustes');
    toast('Serviço salvo', 'ok');
  },
  async 'apagar-servico'() {
    const s = svcById(S.svcId);
    if (!confirm(`Apagar o serviço "${s.name}"? Os atendimentos antigos não mudam.`)) return;
    await db.remove('services', s.id);
    services = services.filter((x) => x.id !== s.id);
    S.draft.ids = S.draft.ids.filter((x) => x !== s.id);
    changed();
    go('ajustes', 'ajustes');
  },
  async fonte(b) { await saveSettings({ fontSize: b.dataset.f }); applyFont(); render(); },

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
  const json = JSON.stringify(L.snapshot(services, visits), null, 1);
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
  if (!confirm(`Trocar os dados do celular pelos ${origem}? (${n} atendimentos e ${clean.services.length} serviços)`)) return false;
  await db.replaceAll(clean);
  services = clean.services; visits = clean.visits;
  await db.setMeta('seeded', true);
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
    await sync.push(settings.sheetUrl, settings.senha, L.snapshot(services, visits), force);
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

$app.addEventListener('input', (e) => {
  if (e.target.id === 'cli') { S.draft.name = e.target.value; updateNovo(); }
});

document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  if (b.dataset.tab === 'atender') go('atender', S.screen === 'conta' ? 'conta' : 'novo');
  else go('receber', 'receber');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

boot().catch((e) => {
  $app.innerHTML = `<p class="banner bad">Erro ao abrir o app: ${esc(e.message)}</p>`;
});
