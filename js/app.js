// Fabi Tsunemi · telas do app
import { db, isDemo } from './db.js';
import * as L from './logic.js';

const S = {
  view: 'agenda',
  range: (() => { try { return localStorage.getItem('fabi-range') || 'dia'; } catch { return 'dia'; } })(),
  day: L.dateStr(),
  services: [],
  appointments: [],
  blocks: [],
  settings: structuredClone(L.DEFAULT_SETTINGS),
  search: '',
};

const $ = (sel, root = document) => root.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => L.dateStr();
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const activeServices = () => S.services.filter((s) => s.active !== false).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const serviceById = (id) => S.services.find((s) => s.id === id);
const liveAppts = () => S.appointments.filter((a) => a.status !== 'cancelled');
const money = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2400);
}

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    toast('Ops: ' + (e.message || 'algo deu errado'));
  }
}

// ---------------- início ----------------
async function start() {
  if (isDemo) {
    $('#banner').innerHTML = '<div class="demo">Modo de teste: os dados ficam salvos só neste aparelho. Veja o README para ligar o banco de dados.</div>';
  }
  const session = await safe(() => db.session());
  if (!session) return renderLogin();
  await loadAll();
  $('#tabs').hidden = false;
  render();
}

async function loadAll() {
  const [services, appointments, blocks, settings] = await Promise.all([
    db.list('services'), db.list('appointments'), db.list('blocks'), db.getSettings(),
  ]);
  S.services = services;
  S.appointments = appointments;
  S.blocks = blocks;
  S.settings = { ...structuredClone(L.DEFAULT_SETTINGS), ...(settings || {}) };
  S.settings.templates = { ...L.DEFAULT_SETTINGS.templates, ...(settings?.templates || {}) };
  if (isDemo && !S.services.length) {
    for (const [name, duration_min, color] of [['Manutenção de unha', 120, '#1f3a68'], ['Pé simples', 40, '#c2577a'], ['Mão simples', 40, '#3f8f7a']]) {
      S.services.push(await db.insert('services', { name, duration_min, color, price: null, active: true }));
    }
  }
  await migrateV2(settings);
}

// V2: primeiro horário às 6h e manutenção com 2h sugeridas (só uma vez, sem apagar ajustes da Fabi)
async function migrateV2(saved) {
  if ((S.settings.version || 1) >= 2) return;
  if (!saved || saved.openTime === '06:30') S.settings.openTime = '06:00';
  S.settings.version = 2;
  const m = S.services.find((s) => L.normalize(s.name) === 'manutencao de unha' && s.duration_min === 165);
  await safe(async () => {
    if (m) {
      const up = await db.update('services', m.id, { duration_min: 120 });
      S.services = S.services.map((s) => (s.id === m.id ? up : s));
    }
    await db.saveSettings(S.settings);
  });
}

function renderLogin(error = '') {
  $('#tabs').hidden = true;
  app.innerHTML = `
    <form class="login" id="login-form">
      <h2>Entrar</h2>
      <p class="muted small">Acesso só para a Fabi.</p>
      <label class="field"><span>E-mail</span><input class="input" type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Senha</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      ${error ? `<p class="error">${esc(error)}</p>` : ''}
      <button class="btn primary" style="width:100%">Entrar</button>
    </form>`;
  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await db.login(f.get('email'), f.get('password'));
      start();
    } catch {
      renderLogin('E-mail ou senha incorretos.');
    }
  };
}

// ---------------- navegação ----------------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  S.view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
});

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === S.view));
  const pending = L.todaysMessages(S.appointments, today(), S.settings).filter((m) => !m.sent).length;
  const badge = $('#msg-badge');
  badge.hidden = !pending;
  badge.textContent = pending;
  ({ agenda: renderAgenda, mensagens: renderMessages, clientes: renderClients, servicos: renderServices })[S.view]();
}

// ---------------- AGENDA ----------------
const RANGES = { dia: 'Dia', semana: 'Semana', mes: 'Mês' };

function itemsOn(d) {
  return [
    ...liveAppts().filter((a) => a.date === d).map((a) => ({ kind: 'a', start: a.start_time, a })),
    ...S.blocks.filter((b) => b.date === d).map((b) => ({ kind: 'b', start: b.start_time, b })),
  ].sort((x, y) => x.start.localeCompare(y.start));
}

function periodDays() {
  if (S.range === 'dia') return [S.day];
  const { start, end } = S.range === 'semana' ? L.weekRange(S.day) : L.monthRange(S.day);
  const days = [];
  for (let d = start; d <= end; d = L.addDays(d, 1)) days.push(d);
  return days;
}

function renderAgenda() {
  const d = S.day;
  const working = L.isWorkingDay(d, S.settings);
  const days = periodDays();
  let title, sub;
  if (S.range === 'dia') {
    title = L.weekdayName(d);
    sub = `${L.ddmm(d)} · ${working ? `${L.fmtHour(S.settings.openTime)} às ${L.fmtHour(S.settings.lastStart)}` : 'estúdio fechado'}`;
  } else if (S.range === 'semana') {
    title = 'Semana';
    sub = `${L.ddmm(days[0])} a ${L.ddmm(days[days.length - 1])}`;
  } else {
    title = L.monthName(d);
    sub = '';
  }
  const total = days.reduce((n, x) => n + itemsOn(x).filter((i) => i.kind === 'a').length, 0);
  if (S.range !== 'dia') sub += `${sub ? ' · ' : ''}${total} atendimento${total === 1 ? '' : 's'}`;
  const showToday = S.range === 'dia' ? d !== today() : !days.includes(today());

  let listHtml;
  if (S.range === 'dia') {
    const items = itemsOn(d);
    listHtml = items.length ? items.map(itemCard).join('') : `<div class="empty">${working ? 'Nenhum atendimento neste dia.' : 'O estúdio não atende neste dia.'}</div>`;
  } else {
    // semana: mostra todos os dias de atendimento; mês: só os dias com algo marcado
    const shown = days.filter((x) => itemsOn(x).length || (S.range === 'semana' && L.isWorkingDay(x, S.settings)));
    listHtml = shown.length
      ? shown.map((x) => {
          const items = itemsOn(x);
          return `<button class="day-head ${x === today() ? 'is-today' : ''}" data-act="goday" data-day="${x}">
              <span>${esc(L.weekdayName(x))}, ${L.ddmm(x)}${x === today() ? ' · hoje' : ''}</span><span class="muted">ver dia ›</span></button>
            ${items.length ? items.map(itemCard).join('') : '<div class="card free">Livre</div>'}`;
        }).join('')
      : '<div class="empty">Nada marcado neste mês.</div>';
  }

  app.innerHTML = `
    <div class="seg" role="tablist" aria-label="Período">
      ${Object.entries(RANGES).map(([k, v]) => `<button role="tab" aria-selected="${S.range === k}" class="${S.range === k ? 'on' : ''}" data-range="${k}">${v}</button>`).join('')}
    </div>
    <div class="day-nav">
      <button class="icon-btn" data-act="prev" aria-label="Anterior">‹</button>
      <div class="day-title">
        <label>
          <strong>${esc(title)}</strong>
          <span>${sub}</span>
          <input type="date" id="pick-day" value="${d}">
        </label>
        ${showToday ? '<br><button class="today-link" data-act="today">Voltar para hoje</button>' : ''}
      </div>
      <button class="icon-btn" data-act="next" aria-label="Próximo">›</button>
    </div>
    <div class="list">${listHtml}</div>
    <div class="actions-bottom">
      <button class="btn primary" data-act="new">+ Agendar</button>
      <button class="btn" data-act="block">Bloquear horário</button>
    </div>`;

  const step = (n) => (S.range === 'dia' ? L.addDays(S.day, n) : S.range === 'semana' ? L.addDays(S.day, 7 * n) : L.addMonths(S.day, n));
  app.onclick = (e) => {
    const r = e.target.closest('[data-range]');
    if (r) { S.range = r.dataset.range; try { localStorage.setItem('fabi-range', S.range); } catch {} render(); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'prev') { S.day = step(-1); render(); }
    if (act === 'next') { S.day = step(1); render(); }
    if (act === 'today') { S.day = today(); render(); }
    if (act === 'goday') { S.day = t.dataset.day; S.range = 'dia'; render(); window.scrollTo(0, 0); }
    if (act === 'new') openApptForm({ date: S.day });
    if (act === 'block') openBlockForm({ date: S.day });
    if (act === 'appt') openApptDetail(t.dataset.id);
    if (act === 'blk') openBlockForm(S.blocks.find((b) => b.id === t.dataset.id));
  };
  const pick = $('#pick-day');
  pick.onchange = () => { if (pick.value) { S.day = pick.value; render(); } };
  $('.day-title label').onclick = (e) => { if (e.target !== pick) { e.preventDefault(); pick.showPicker?.() ?? pick.click(); } };
}

function barStyle(a) {
  const cols = L.apptServices(a).map((x) => serviceById(x.id)?.color || '#9aa3b5');
  if (cols.length === 1) return `background:${esc(cols[0])}`;
  const step = 100 / cols.length;
  return `background:linear-gradient(${cols.map((c, i) => `${esc(c)} ${i * step}% ${(i + 1) * step}%`).join(',')})`;
}

function itemCard(it) {
  if (it.kind === 'b') {
    const b = it.b;
    return `<button class="card block" data-act="blk" data-id="${b.id}">
      <div class="body"><div class="title">${esc(b.label || 'Bloqueio')} (bloqueio manual)</div>
      <div class="sub">${L.fmtHour(b.start_time)} às ${L.fmtHour(b.end_time)}</div></div></button>`;
  }
  const a = it.a;
  return `<button class="card" data-act="appt" data-id="${a.id}">
    <span class="bar" style="${barStyle(a)}"></span>
    <div class="body"><div class="title">${esc(a.client_name)} · ${esc(a.service_name)}</div>
    <div class="sub">${L.fmtHour(a.start_time)} às ${L.fmtHour(a.end_time)} (${L.fmtDuration(a.duration_min)})</div></div></button>`;
}

// ---------------- janela (sheet) ----------------
const sheet = $('#sheet');
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = '';
  $('#sheet-body').innerHTML = '';
}
sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
const sheetHead = (title) => `<div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">×</button></div>`;

// ---------------- novo / editar agendamento ----------------
function openApptForm(init) {
  const editing = !!init.id;
  const f = {
    id: init.id || null,
    serviceIds: editing ? L.apptServices(init).map((x) => x.id).filter((id) => serviceById(id)) : [],
    date: init.date || S.day,
  };
  const startDur = editing ? init.duration_min : 0;
  const clients = L.clientsFrom(S.appointments);
  const svcList = activeServices();
  // no editar, mostra também serviços desativados que já estavam no agendamento
  for (const id of f.serviceIds) if (!svcList.some((s) => s.id === id)) svcList.push(serviceById(id));

  openSheet(`
    ${sheetHead(editing ? 'Editar agendamento' : 'Novo agendamento')}
    <form id="appt-form" autocomplete="off" novalidate>
      <label class="field"><span>Cliente</span>
        <input class="input" name="client_name" list="client-list" required value="${esc(init.client_name || '')}" placeholder="Nome da cliente">
        <datalist id="client-list">${clients.map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>
      </label>
      <label class="field"><span>Telefone (WhatsApp)</span>
        <input class="input" name="client_phone" type="tel" inputmode="tel" value="${esc(init.client_phone ? L.fmtPhone(init.client_phone) : '')}" placeholder="(11) 91234-5678">
      </label>
      <div class="field"><span>Serviços (toque em um ou mais)</span>
        <div class="chips" id="svc-chips">
          ${svcList.map((s) => `<button type="button" class="chip ${f.serviceIds.includes(s.id) ? 'on' : ''}" data-svc="${s.id}" aria-pressed="${f.serviceIds.includes(s.id)}"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)} <small class="muted">${L.fmtDuration(s.duration_min)}</small></button>`).join('') || '<p class="hint">Cadastre um serviço na aba Serviços.</p>'}
        </div>
      </div>
      <div class="field"><span>Duração deste agendamento</span>
        <div class="dur">
          <button type="button" class="icon-btn" data-dur="-5" aria-label="Menos 5 minutos">−</button>
          <div class="row2 dur-inputs">
            <label><input class="input" type="number" inputmode="numeric" min="0" max="12" name="dh" value="${Math.floor(startDur / 60)}"><small>horas</small></label>
            <label><input class="input" type="number" inputmode="numeric" min="0" max="59" step="5" name="dm" value="${startDur % 60}"><small>min</small></label>
          </div>
          <button type="button" class="icon-btn" data-dur="5" aria-label="Mais 5 minutos">+</button>
        </div>
        <p class="hint" id="dur-hint"></p>
      </div>
      <div class="row2">
        <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${f.date}" required></label>
        <label class="field"><span>Início</span><input class="input" name="start" inputmode="numeric" placeholder="ex.: 9:05" value="${editing ? esc(init.start_time) : ''}" required></label>
      </div>
      <div id="time-info"></div>
      <p class="error" id="form-error" hidden></p>
      <button class="btn primary" style="width:100%" id="save-appt">${editing ? 'Salvar alterações' : 'Confirmar agendamento'}</button>
    </form>`);

  const form = $('#appt-form');
  const errEl = $('#form-error');
  const showErr = (m) => { errEl.textContent = m; errEl.hidden = !m; };
  const nameInput = form.client_name;

  nameInput.addEventListener('change', () => {
    const c = clients.find((x) => L.normalize(x.name) === L.normalize(nameInput.value));
    if (c && c.phone && !form.client_phone.value) form.client_phone.value = L.fmtPhone(c.phone);
  });

  const suggested = () => f.serviceIds.reduce((n, id) => n + (Number(serviceById(id)?.duration_min) || 0), 0);
  const duration = () => (Number(form.dh.value) || 0) * 60 + (Number(form.dm.value) || 0);
  const setDuration = (min) => { min = Math.max(0, min); form.dh.value = Math.floor(min / 60); form.dm.value = min % 60; };
  const startValue = () => L.parseTyped(form.start.value);

  function update() {
    const sug = suggested(), dur = duration();
    $('#dur-hint').innerHTML = !f.serviceIds.length ? 'Escolha o serviço para preencher a duração.'
      : dur === sug ? `Duração sugerida: ${L.fmtDuration(sug)}${f.serviceIds.length > 1 ? ' (soma dos serviços)' : ''}`
      : `Sugerida: ${L.fmtDuration(sug)} · <button type="button" class="link" data-dur-reset>voltar para a sugerida</button>`;

    const info = $('#time-info');
    const date = form.date.value;
    const busy = { date, appointments: S.appointments, blocks: S.blocks, settings: S.settings, excludeId: f.id };
    const free = L.freeIntervals(busy).map((g) => (g.end == null ? `a partir de ${L.fmtHour(g.start)}` : `${L.fmtHour(g.start)}–${L.fmtHour(g.end)}`));
    const freeTxt = !date ? '' : !L.isWorkingDay(date, S.settings) ? '<p class="error">O estúdio não atende neste dia.</p>'
      : `<p class="hint">Livre neste dia: ${free.length ? free.join(' · ') : 'nenhum espaço'}</p>`;
    const st = startValue();
    if (!st) { info.innerHTML = freeTxt + (form.start.value.trim() ? '<p class="error">Horário não entendido. Ex.: 9:05 ou 905.</p>' : ''); return; }
    const chk = L.checkStart({ ...busy, start: st, durationMin: dur });
    info.innerHTML = `${freeTxt}
      <div class="time-result ${chk.error ? 'bad' : chk.conflicts.length ? 'warn' : 'ok'}">
        <strong>${L.fmtHour(st)} às ${L.fmtHour(L.toMin(st) + dur)}</strong> <span>(${L.fmtDuration(dur)})</span>
        ${chk.error ? `<div>${esc(chk.error)}</div>` : ''}
        ${chk.conflicts.length ? `<div>⚠️ Bate com: ${chk.conflicts.map(esc).join('; ')}</div>` : ''}
      </div>`;
  }

  form.addEventListener('click', (e) => {
    const svcBtn = e.target.closest('[data-svc]');
    if (svcBtn) {
      const id = svcBtn.dataset.svc;
      f.serviceIds = f.serviceIds.includes(id) ? f.serviceIds.filter((x) => x !== id) : [...f.serviceIds, id];
      svcBtn.classList.toggle('on', f.serviceIds.includes(id));
      svcBtn.setAttribute('aria-pressed', f.serviceIds.includes(id));
      setDuration(suggested()); // mudou o serviço: volta para a duração sugerida
      showErr('');
      update();
    }
    const d = e.target.closest('[data-dur]');
    if (d) { setDuration(duration() + Number(d.dataset.dur)); update(); }
    if (e.target.closest('[data-dur-reset]')) { setDuration(suggested()); update(); }
  });
  for (const el of [form.dh, form.dm, form.start, form.date]) el.addEventListener('input', () => { showErr(''); update(); });
  form.start.addEventListener('blur', () => { const v = startValue(); if (v) { form.start.value = v; update(); } });
  update();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const svcs = f.serviceIds.map(serviceById).filter(Boolean);
    const dur = duration();
    const start = startValue();
    const date = form.date.value;
    if (!name) return showErr('Escreva o nome da cliente.');
    if (!svcs.length) return showErr('Escolha pelo menos um serviço.');
    if (dur <= 0) return showErr('A duração precisa ser maior que zero.');
    if (!date) return showErr('Escolha a data.');
    if (!start) return showErr('Digite o horário de início (ex.: 9:05).');
    const chk = L.checkStart({ date, start, durationMin: dur, appointments: S.appointments, blocks: S.blocks, settings: S.settings, excludeId: f.id });
    if (chk.error) return showErr(chk.error);
    if (chk.conflicts.length && !confirm(`Esse horário bate com:\n${chk.conflicts.join('\n')}\n\nAgendar mesmo assim?`)) return;

    const row = {
      client_name: name,
      client_phone: L.onlyDigits(form.client_phone.value),
      service_id: svcs[0].id,
      service_name: svcs.map((s) => s.name).join(' + '),
      services: svcs.map((s) => ({ id: s.id, name: s.name, duration_min: s.duration_min, price: s.price ?? null })),
      duration_min: dur,
      price: svcs.some((s) => s.price != null) ? svcs.reduce((n, s) => n + (Number(s.price) || 0), 0) : null,
      date,
      start_time: start,
      end_time: L.toHHMM(L.toMin(start) + dur),
    };
    $('#save-appt').disabled = true;
    await safe(async () => {
      let saved;
      if (editing) {
        const old = S.appointments.find((a) => a.id === f.id);
        const ids = (a) => L.apptServices(a).map((x) => x.id).sort().join();
        const changed = old.date !== row.date || old.start_time !== row.start_time || ids(old) !== ids(row);
        // se mudou dia/horário/serviços, as mensagens precisam ser enviadas de novo
        if (changed) Object.assign(row, { created_on: today(), sent_confirm: false, sent_3d: false, sent_eve: false });
        saved = await db.update('appointments', f.id, row);
        S.appointments = S.appointments.map((a) => (a.id === f.id ? saved : a));
        toast('Agendamento atualizado');
      } else {
        saved = await db.insert('appointments', { ...row, status: 'scheduled', created_on: today(), sent_confirm: false, sent_3d: false, sent_eve: false });
        S.appointments.push(saved);
        toast('Agendamento confirmado');
      }
      S.day = saved.date;
      render();
      openApptDetail(saved.id, !editing);
    });
    const btn = $('#save-appt');
    if (btn) btn.disabled = false;
  };
}

// ---------------- detalhes do agendamento ----------------
function messageCard(m, { showClient = false } = {}) {
  const a = m.appt;
  const due = m.due === today() ? 'hoje' : m.due < today() ? `atrasada (${L.ddmm(m.due)})` : `enviar em ${L.ddmm(m.due)}`;
  return `<div class="msg ${m.sent ? 'sent' : ''}">
    <div class="head">
      <div>${showClient ? `<strong>${esc(a.client_name)}</strong> · ${L.ddmm(a.date)} às ${L.fmtHour(a.start_time)}<br>` : ''}<span class="muted">${esc(m.label)}</span></div>
      <span class="tag ${m.sent ? 'ok' : ''}">${m.sent ? 'enviada' : due}</span>
    </div>
    <div class="text">${esc(m.text)}</div>
    <div class="btn-row">
      <button class="btn small" data-copy="${a.id}|${m.type}">Copiar</button>
      <a class="btn small wa" href="${esc(L.whatsappLink(a.client_phone, m.text))}" target="_blank" rel="noopener" data-wa="${a.id}|${m.type}">Abrir no WhatsApp</a>
    </div>
    <label class="check" style="margin-top:10px"><input type="checkbox" data-sent="${a.id}|${m.type}" ${m.sent ? 'checked' : ''}> Já enviei</label>
  </div>`;
}

function openApptDetail(id, justCreated = false) {
  const a = S.appointments.find((x) => x.id === id);
  if (!a) return closeSheet();
  const msgs = L.messagesFor(a, S.settings);
  openSheet(`
    ${sheetHead(justCreated ? 'Agendado! ✨' : a.client_name)}
    <div class="card" style="cursor:default">
      <span class="bar" style="${barStyle(a)}"></span>
      <div class="body">
        <div class="title">${esc(a.client_name)} · ${esc(a.service_name)}</div>
        <div class="sub" style="text-transform:none">${esc(L.weekdayName(a.date))}, ${L.ddmm(a.date)} · ${L.fmtHour(a.start_time)} às ${L.fmtHour(a.end_time)} (${L.fmtDuration(a.duration_min)})</div>
        ${a.client_phone ? `<div class="sub">📱 ${esc(L.fmtPhone(a.client_phone))}</div>` : ''}
        ${a.price != null ? `<div class="sub">${money(a.price)}</div>` : ''}
      </div>
    </div>
    <h3>${justCreated ? 'Envie a confirmação para a cliente' : 'Mensagens para a cliente'}</h3>
    <div class="list" id="detail-msgs" data-just="${justCreated ? 1 : ''}">${(justCreated ? msgs.slice(0, 1) : msgs).map((m) => messageCard(m)).join('')}</div>
    ${justCreated && msgs.length > 1 ? `<p class="hint">As próximas mensagens (${msgs.slice(1).map((m) => `${m.type === 'ask3d' ? '3 dias antes' : 'véspera'} em ${L.ddmm(m.due)}`).join(', ')}) vão aparecer em “Mensagens” no dia certo.</p>` : ''}
    ${justCreated && msgs.length === 1 ? '<p class="hint">Agendado com pouca antecedência: só a confirmação é necessária.</p>' : ''}
    <div class="btn-row" style="margin-top:18px">
      <button class="btn" data-edit="${a.id}">Editar</button>
      <button class="btn danger" data-cancel="${a.id}">Cancelar agendamento</button>
    </div>`);
}

async function markSent(apptId, type, value) {
  const field = L.MESSAGE_TYPES[type].field;
  const saved = await db.update('appointments', apptId, { [field]: value });
  S.appointments = S.appointments.map((a) => (a.id === apptId ? saved : a));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function findMsg(key) {
  const [id, type] = key.split('|');
  const a = S.appointments.find((x) => x.id === id);
  return { id, type, m: a && L.messagesFor(a, S.settings).find((x) => x.type === type) };
}

// ações que funcionam tanto na janela quanto na tela de mensagens
document.addEventListener('click', async (e) => {
  const copy = e.target.closest('[data-copy]');
  if (copy) {
    const { m } = findMsg(copy.dataset.copy);
    if (m) { await copyText(m.text); toast('Mensagem copiada. É só colar no WhatsApp!'); }
    return;
  }
  const wa = e.target.closest('[data-wa]');
  if (wa) {
    const { id, type, m } = findMsg(wa.dataset.wa);
    if (m && !m.sent) setTimeout(() => safe(async () => { await markSent(id, type, true); refreshAfterMsg(id); }), 300);
    return;
  }
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    const a = S.appointments.find((x) => x.id === edit.dataset.edit);
    openApptForm(a);
    return;
  }
  const cancel = e.target.closest('[data-cancel]');
  if (cancel) {
    const a = S.appointments.find((x) => x.id === cancel.dataset.cancel);
    if (!confirm(`Cancelar o horário de ${a.client_name} (${L.ddmm(a.date)} às ${L.fmtHour(a.start_time)})? O horário fica livre de novo.`)) return;
    await safe(async () => {
      const saved = await db.update('appointments', a.id, { status: 'cancelled' });
      S.appointments = S.appointments.map((x) => (x.id === a.id ? saved : x));
      closeSheet();
      render();
      toast('Agendamento cancelado');
    });
  }
});

document.addEventListener('change', async (e) => {
  const cb = e.target.closest('[data-sent]');
  if (!cb) return;
  const [id, type] = cb.dataset.sent.split('|');
  await safe(async () => { await markSent(id, type, cb.checked); refreshAfterMsg(id); });
});

function refreshAfterMsg(id) {
  if (!sheet.hidden && $('#detail-msgs')) {
    const a = S.appointments.find((x) => x.id === id);
    const just = !!$('#detail-msgs').dataset.just;
    const msgs = L.messagesFor(a, S.settings);
    $('#detail-msgs').innerHTML = (just ? msgs.slice(0, 1) : msgs).map((m) => messageCard(m)).join('');
  }
  render();
}

// ---------------- bloqueio de horário ----------------
function openBlockForm(init) {
  const editing = !!init.id;
  openSheet(`
    ${sheetHead(editing ? 'Bloqueio' : 'Bloquear horário')}
    <form id="block-form">
      <label class="field"><span>Motivo</span><input class="input" name="label" value="${esc(init.label || 'Almoço')}" required></label>
      <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${init.date}" required></label>
      <div class="row2">
        <label class="field"><span>Das</span><input class="input" type="time" name="start" step="300" value="${init.start_time || '12:00'}" required></label>
        <label class="field"><span>Até</span><input class="input" type="time" name="end" step="300" value="${init.end_time || '13:00'}" required></label>
      </div>
      <p class="error" id="block-err" hidden></p>
      <div class="btn-row">
        ${editing ? `<button type="button" class="btn danger" id="del-block">Remover bloqueio</button>` : ''}
        <button class="btn primary">${editing ? 'Salvar' : 'Bloquear'}</button>
      </div>
    </form>`);
  const form = $('#block-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const row = { label: form.label.value.trim() || 'Bloqueio', date: form.date.value, start_time: form.start.value, end_time: form.end.value };
    const err = $('#block-err');
    if (row.end_time <= row.start_time) { err.textContent = 'O fim precisa ser depois do início.'; err.hidden = false; return; }
    const clash = liveAppts().find((a) => a.date === row.date && a.start_time < row.end_time && a.end_time > row.start_time);
    if (clash && !confirm(`Atenção: ${clash.client_name} está marcada das ${L.fmtHour(clash.start_time)} às ${L.fmtHour(clash.end_time)}. Bloquear mesmo assim?`)) return;
    await safe(async () => {
      if (editing) {
        const saved = await db.update('blocks', init.id, row);
        S.blocks = S.blocks.map((b) => (b.id === init.id ? saved : b));
      } else {
        S.blocks.push(await db.insert('blocks', row));
      }
      S.day = row.date;
      closeSheet();
      render();
      toast('Horário bloqueado');
    });
  };
  const del = $('#del-block');
  if (del) del.onclick = () => safe(async () => {
    await db.remove('blocks', init.id);
    S.blocks = S.blocks.filter((b) => b.id !== init.id);
    closeSheet();
    render();
    toast('Bloqueio removido');
  });
}

// ---------------- MENSAGENS DE HOJE ----------------
function renderMessages() {
  const list = L.todaysMessages(S.appointments, today(), S.settings);
  const pending = list.filter((m) => !m.sent).length;
  app.innerHTML = `
    <h2>Mensagens de hoje</h2>
    <p class="muted small">${L.weekdayName(today())}, ${L.ddmm(today())} · ${pending ? `${pending} para enviar` : 'tudo enviado 🎉'}</p>
    <div class="list">${list.length ? list.map((m) => messageCard(m, { showClient: true })).join('') : '<div class="empty">Nenhuma mensagem para enviar hoje.</div>'}</div>`;
  app.onclick = null;
}

// ---------------- CLIENTES ----------------
function renderClients() {
  app.innerHTML = `
    <h2>Clientes</h2>
    <label class="field"><input class="input" id="search" type="search" placeholder="Buscar pelo nome" value="${esc(S.search)}"></label>
    <div class="list" id="client-results"></div>`;
  const input = $('#search');
  const draw = () => {
    S.search = input.value;
    const q = L.normalize(S.search);
    const list = L.clientsFrom(S.appointments).filter((c) => !q || L.normalize(c.name).includes(q));
    $('#client-results').innerHTML = list.length
      ? list.map((c) => {
          const live = c.appts.filter((a) => a.status !== 'cancelled');
          const next = live.filter((a) => a.date >= today()).sort((x, y) => (x.date + x.start_time).localeCompare(y.date + y.start_time))[0];
          return `<button class="card" data-client="${esc(c.name)}"><div class="body">
            <div class="title">${esc(c.name)}</div>
            <div class="sub">${c.phone ? esc(L.fmtPhone(c.phone)) + ' · ' : ''}${live.length} atendimento${live.length === 1 ? '' : 's'}${next ? ` · próximo ${L.ddmm(next.date)} às ${L.fmtHour(next.start_time)}` : ''}</div>
          </div></button>`;
        }).join('')
      : `<div class="empty">${q ? 'Nenhuma cliente com esse nome.' : 'As clientes aparecem aqui depois do primeiro agendamento.'}</div>`;
  };
  input.oninput = draw;
  draw();
  app.onclick = (e) => {
    const b = e.target.closest('[data-client]');
    if (b) openClient(b.dataset.client);
  };
}

function openClient(name) {
  const c = L.clientsFrom(S.appointments).find((x) => x.name === name);
  if (!c) return;
  const appts = [...c.appts].sort((x, y) => (y.date + y.start_time).localeCompare(x.date + x.start_time));
  openSheet(`
    ${sheetHead(c.name)}
    ${c.phone ? `<p class="muted">📱 ${esc(L.fmtPhone(c.phone))}</p>` : ''}
    <button class="btn primary" style="width:100%" id="book-client">+ Agendar para ${esc(c.name.split(' ')[0])}</button>
    <h3>Histórico</h3>
    <div class="list">${appts.map((a) => `
      <button class="card" data-open-appt="${a.id}" ${a.status === 'cancelled' ? 'style="opacity:.55"' : ''}>
        <span class="bar" style="${barStyle(a)}"></span>
        <div class="body"><div class="title">${esc(a.service_name)}${a.status === 'cancelled' ? ' (cancelado)' : ''}</div>
        <div class="sub">${L.ddmm(a.date)}/${a.date.slice(0, 4)} · ${L.fmtHour(a.start_time)} às ${L.fmtHour(a.end_time)}</div></div>
      </button>`).join('')}</div>`);
  $('#book-client').onclick = () => openApptForm({ client_name: c.name, client_phone: L.fmtPhone(c.phone), date: today() });
  $('#sheet-body').onclick = (e) => {
    const b = e.target.closest('[data-open-appt]');
    if (!b) return;
    const a = S.appointments.find((x) => x.id === b.dataset.openAppt);
    if (a.status === 'cancelled') return;
    openApptDetail(a.id);
  };
}

// ---------------- SERVIÇOS e AJUSTES ----------------
function renderServices() {
  const st = S.settings;
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  app.innerHTML = `
    <h2>Serviços</h2>
    <div class="list">
      ${S.services.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((s) => `
        <button class="card" data-svc-edit="${s.id}" ${s.active === false ? 'style="opacity:.5"' : ''}>
          <div class="body service-row"><span class="dot" style="background:${esc(s.color)}"></span>
            <div><div class="title">${esc(s.name)}${s.active === false ? ' (desativado)' : ''}</div>
            <div class="sub">${L.fmtDuration(s.duration_min)}${s.price != null ? ' · ' + money(s.price) : ' · valor a definir'}</div></div>
          </div></button>`).join('')}
    </div>
    <div class="actions-bottom"><button class="btn primary" id="svc-new">+ Novo serviço</button></div>

    <hr>
    <h2>Ajustes</h2>
    <form id="settings-form">
      <div class="field"><span>Dias de atendimento</span>
        <div class="chips">${days.map((d, i) => `<label class="chip ${st.workDays.includes(i) ? 'on' : ''}"><input type="checkbox" name="wd" value="${i}" ${st.workDays.includes(i) ? 'checked' : ''} hidden>${d}</label>`).join('')}</div>
      </div>
      <div class="row2">
        <label class="field"><span>Primeiro horário</span><input class="input" type="time" name="openTime" value="${st.openTime}" required></label>
        <label class="field"><span>Último atendimento começa</span><input class="input" type="time" name="lastStart" value="${st.lastStart}" required></label>
      </div>
      <label class="field"><span>Intervalo entre uma cliente e outra (minutos)</span><input class="input" type="number" min="0" max="120" step="5" name="bufferMin" value="${st.bufferMin}"></label>
      <h3>Textos das mensagens</h3>
      <p class="hint">Use {nome}, {serviço}, {dia} e {hora} — o app troca pelos dados de cada agendamento.</p>
      <label class="field"><span>Ao agendar</span><textarea class="input" name="t_confirm">${esc(st.templates.confirm)}</textarea></label>
      <label class="field"><span>3 dias antes</span><textarea class="input" name="t_ask3d">${esc(st.templates.ask3d)}</textarea></label>
      <label class="field"><span>Véspera</span><textarea class="input" name="t_eve">${esc(st.templates.eve)}</textarea></label>
      <div class="btn-row"><button class="btn primary">Salvar ajustes</button></div>
    </form>
    ${isDemo ? '' : '<hr><button class="btn ghost" id="logout" style="width:100%">Sair</button>'}
    <p class="hint center" style="margin-top:20px">Fabi Tsunemi · Etapa 1 (agenda)</p>`;

  app.onclick = (e) => {
    const b = e.target.closest('[data-svc-edit]');
    if (b) openServiceForm(serviceById(b.dataset.svcEdit));
  };
  $('#svc-new').onclick = () => openServiceForm({});
  const form = $('#settings-form');
  form.querySelectorAll('input[name=wd]').forEach((cb) => (cb.onchange = () => cb.parentElement.classList.toggle('on', cb.checked)));
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = {
      workDays: [...form.querySelectorAll('input[name=wd]:checked')].map((x) => Number(x.value)),
      openTime: form.openTime.value,
      lastStart: form.lastStart.value,
      bufferMin: Math.max(0, Number(form.bufferMin.value) || 0),
      version: 2,
      templates: { confirm: form.t_confirm.value, ask3d: form.t_ask3d.value, eve: form.t_eve.value },
    };
    if (data.lastStart < data.openTime) return toast('O último horário precisa ser depois do primeiro.');
    safe(async () => {
      await db.saveSettings(data);
      S.settings = data;
      toast('Ajustes salvos');
      render();
    });
  };
  const lo = $('#logout');
  if (lo) lo.onclick = async () => { await db.logout(); location.reload(); };
}

function openServiceForm(s) {
  const editing = !!s.id;
  let color = s.color || L.SERVICE_COLORS[S.services.length % L.SERVICE_COLORS.length];
  const dur = s.duration_min || 60;
  openSheet(`
    ${sheetHead(editing ? 'Editar serviço' : 'Novo serviço')}
    <form id="svc-form">
      <label class="field"><span>Nome</span><input class="input" name="name" value="${esc(s.name || '')}" required></label>
      <div class="row2">
        <label class="field"><span>Duração sugerida: horas</span><input class="input" type="number" min="0" max="10" name="h" value="${Math.floor(dur / 60)}"></label>
        <label class="field"><span>minutos</span><input class="input" type="number" min="0" max="55" step="5" name="m" value="${dur % 60}"></label>
      </div>
      <label class="field"><span>Valor (R$)</span><input class="input" type="number" min="0" step="0.01" inputmode="decimal" name="price" value="${s.price ?? ''}" placeholder="a definir"></label>
      <div class="field"><span>Cor na agenda</span>
        <div class="colors">${L.SERVICE_COLORS.map((c) => `<button type="button" class="color ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}" aria-label="cor ${c}"></button>`).join('')}</div>
      </div>
      ${editing ? `<label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> Serviço ativo (aparece no agendamento)</label>` : ''}
      <p class="hint">A duração é só uma sugestão: ao agendar, dá para aumentar ou diminuir o tempo daquele atendimento. Mudar aqui vale para os próximos agendamentos.</p>
      <button class="btn primary" style="width:100%">Salvar</button>
    </form>`);
  const form = $('#svc-form');
  form.addEventListener('click', (e) => {
    const c = e.target.closest('[data-color]');
    if (!c) return;
    color = c.dataset.color;
    form.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === c));
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const duration_min = (Number(form.h.value) || 0) * 60 + (Number(form.m.value) || 0);
    if (duration_min <= 0) return toast('Informe a duração do serviço.');
    const row = {
      name: form.elements.name.value.trim(),
      duration_min,
      price: form.price.value === '' ? null : Number(form.price.value),
      color,
      active: editing ? form.active.checked : true,
    };
    safe(async () => {
      if (editing) {
        const saved = await db.update('services', s.id, row);
        S.services = S.services.map((x) => (x.id === s.id ? saved : x));
      } else {
        S.services.push(await db.insert('services', row));
      }
      closeSheet();
      render();
      toast('Serviço salvo');
    });
  };
}

// ---------------- PWA ----------------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// volta para o dia de hoje quando o app é reaberto no dia seguinte
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !$('#tabs').hidden) render();
});

start();
