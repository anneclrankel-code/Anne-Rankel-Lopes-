// Regras do app (horários vagos, lembretes, formatação).
// Funções "puras": não mexem na tela nem no banco, por isso são fáceis de testar.

export const DEFAULT_SETTINGS = {
  openTime: '06:00',      // primeiro horário (V2: 6h)
  lastStart: '17:30',     // último atendimento começa até este horário
  workDays: [2, 3, 4, 5, 6], // 0=domingo ... 6=sábado → terça a sábado
  bufferMin: 0,           // intervalo entre uma cliente e outra (minutos)
  templates: {
    confirm: 'Oi, {nome}! Seu horário de {serviço} está marcado para {dia}, às {hora}. Te espero no estúdio! Fabi',
    ask3d: 'Oi, {nome}! Passando para lembrar do seu {serviço} em {dia}, às {hora}. Você confirma? Se precisar remarcar, me avisa por aqui.',
    eve: 'Oi, {nome}! Amanhã às {hora} é o seu horário de {serviço}. Até amanhã!',
  },
};

export const SERVICE_COLORS = ['#1f3a68', '#c2577a', '#3f8f7a', '#c98a2b', '#6a4fb3', '#2f7fbf', '#b34a3c', '#5b6b3a'];

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

// ---------- horas ----------
export function toMin(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}
export function toHHMM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** 570 ou "09:30" → "9h30"; 540 → "9h" (texto das mensagens) */
export function fmtHourShort(v) {
  const min = typeof v === 'number' ? v : toMin(v);
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}
/** "09:00" → "9h00" (como no protótipo da agenda) */
export function fmtHour(v) {
  const min = typeof v === 'number' ? v : toMin(v);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}
export function fmtDuration(min) {
  min = Number(min) || 0;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// ---------- datas (sempre "AAAA-MM-DD", no fuso do aparelho) ----------
export function dateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // meio-dia evita problemas com horário de verão
}
export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function weekdayName(s) {
  return WEEKDAYS[parseDate(s).getDay()];
}
/** "2026-11-27" → "27/11" */
export function ddmm(s) {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}
/** "sexta-feira (27/11)" */
export function fmtDayLong(s) {
  return `${weekdayName(s)} (${ddmm(s)})`;
}
export function isWorkingDay(s, settings = DEFAULT_SETTINGS) {
  return settings.workDays.includes(parseDate(s).getDay());
}

// ---------- horários vagos ----------
function busyIntervals(date, appointments, blocks, excludeId) {
  const busy = [];
  for (const a of appointments) {
    if (a.date !== date || a.status === 'cancelled' || a.id === excludeId) continue;
    busy.push({ start: toMin(a.start_time), end: toMin(a.end_time), name: a.client_name });
  }
  for (const b of blocks) {
    if (b.date !== date) continue;
    busy.push({ start: toMin(b.start_time), end: toMin(b.end_time), isBlock: true, label: b.label || 'Bloqueio' });
  }
  return busy.sort((x, y) => x.start - y.start);
}

/** Espaços livres do dia (para mostrar como dica), em minutos: [{start, end}] */
export function freeIntervals({ date, appointments = [], blocks = [], settings = DEFAULT_SETTINGS, excludeId = null }) {
  if (!isWorkingDay(date, settings)) return [];
  const open = toMin(settings.openTime);
  const last = toMin(settings.lastStart);
  const out = [];
  let cursor = open;
  for (const b of busyIntervals(date, appointments, blocks, excludeId)) {
    if (b.start > cursor && cursor <= last) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor <= last) out.push({ start: cursor, end: null }); // aberto até o fim do dia
  return out;
}

/**
 * Confere um horário de início digitado (como no Google Agenda).
 * - error: impede salvar (antes das 6h, depois do último horário, dia fechado).
 * - conflicts: avisos de choque com outra cliente ou bloqueio (a Fabi decide).
 */
export function checkStart({ date, start, durationMin, appointments = [], blocks = [], settings = DEFAULT_SETTINGS, excludeId = null }) {
  const res = { error: null, conflicts: [] };
  if (!/^\d{1,2}:\d{2}$/.test(String(start || ''))) { res.error = 'Digite o horário de início.'; return res; }
  const s = toMin(start), e = s + (Number(durationMin) || 0);
  if (!isWorkingDay(date, settings)) res.error = 'O estúdio não atende neste dia.';
  else if (s < toMin(settings.openTime)) res.error = `O primeiro horário é às ${fmtHour(settings.openTime)}.`;
  else if (s > toMin(settings.lastStart)) res.error = `O último atendimento começa às ${fmtHour(settings.lastStart)}.`;
  const buf = Number(settings.bufferMin) || 0;
  for (const b of busyIntervals(date, appointments, blocks, excludeId)) {
    const pad = b.isBlock ? 0 : buf;
    if (s < b.end + pad && e + pad > b.start) {
      res.conflicts.push(`${b.isBlock ? `Bloqueio: ${b.label}` : `${b.name}`} (${fmtHour(b.start)} às ${fmtHour(b.end)})`);
    }
  }
  return res;
}

/** Converte o que a Fabi digitou ("9", "905", "9h05", "09:05") em "HH:MM" */
export function parseTyped(v) {
  const t = String(v || '').trim().toLowerCase().replace(/\s/g, '');
  let m = t.match(/^(\d{1,2})(?:[:h.]?(\d{2}))?h?$/);
  if (!m && /^\d{3,4}$/.test(t)) m = [t, t.slice(0, -2), t.slice(-2)];
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] || 0);
  if (h > 23 || mi > 59) return null;
  return toHHMM(h * 60 + mi);
}

// ---------- serviços do agendamento (V2: pode ter mais de um) ----------
export function apptServices(a) {
  if (Array.isArray(a.services) && a.services.length) return a.services;
  return [{ id: a.service_id, name: a.service_name, duration_min: a.duration_min, price: a.price }];
}
export function joinNames(list) {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

// ---------- períodos da agenda ----------
/** Semana de segunda a domingo que contém o dia */
export function weekRange(s) {
  const dow = parseDate(s).getDay();
  const start = addDays(s, dow === 0 ? -6 : 1 - dow);
  return { start, end: addDays(start, 6) };
}
export function monthRange(s) {
  const d = parseDate(s);
  const start = dateStr(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const end = dateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
  return { start, end };
}
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function monthName(s) {
  const d = parseDate(s);
  return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}
export function addMonths(s, n) {
  const d = parseDate(s);
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const lastDay = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(d.getDate(), lastDay));
  return dateStr(t);
}

// ---------- lembretes ----------
export function fillTemplate(tpl, appt) {
  const svc = joinNames(apptServices(appt).map((x) => String(x.name || '').toLowerCase()));
  return tpl
    .replaceAll('{nome}', firstName(appt.client_name))
    .replaceAll('{serviço}', svc)
    .replaceAll('{servico}', svc)
    .replaceAll('{dia}', fmtDayLong(appt.date))
    .replaceAll('{hora}', fmtHourShort(appt.start_time));
}
function firstName(n) {
  return String(n || '').trim().split(/\s+/)[0] || '';
}

export const MESSAGE_TYPES = {
  confirm: { label: 'Confirmação', field: 'sent_confirm' },
  ask3d: { label: 'Pedido de confirmação (3 dias antes)', field: 'sent_3d' },
  eve: { label: 'Lembrete da véspera', field: 'sent_eve' },
};

/**
 * As mensagens de um agendamento e o dia de enviar cada uma.
 * - Confirmação: no dia em que foi agendado.
 * - 3 dias antes: só se foi agendado com 3 dias ou mais de antecedência.
 * - Véspera: só se foi agendado antes da véspera (senão a confirmação já basta).
 */
export function messagesFor(appt, settings = DEFAULT_SETTINGS) {
  const created = appt.created_on || appt.date;
  const lead = daysBetween(created, appt.date);
  const t = { ...DEFAULT_SETTINGS.templates, ...(settings.templates || {}) };
  const list = [{ type: 'confirm', due: created, text: fillTemplate(t.confirm, appt) }];
  if (lead >= 3) list.push({ type: 'ask3d', due: addDays(appt.date, -3), text: fillTemplate(t.ask3d, appt) });
  if (lead >= 2) list.push({ type: 'eve', due: addDays(appt.date, -1), text: fillTemplate(t.eve, appt) });
  return list.map((m) => ({ ...m, ...MESSAGE_TYPES[m.type], sent: !!appt[MESSAGE_TYPES[m.type].field], appt }));
}

/**
 * Mensagens para a tela "Mensagens de hoje": as do dia e as que ficaram
 * para trás sem enviar (desde que o atendimento ainda não tenha passado).
 */
export function todaysMessages(appointments, today, settings = DEFAULT_SETTINGS) {
  const out = [];
  for (const a of appointments) {
    if (a.status === 'cancelled' || a.date < today) continue;
    for (const m of messagesFor(a, settings)) {
      if (m.due === today || (m.due < today && !m.sent)) out.push(m);
    }
  }
  return out.sort((x, y) => (x.sent - y.sent) || x.appt.date.localeCompare(y.appt.date) || x.appt.start_time.localeCompare(y.appt.start_time));
}

// ---------- WhatsApp ----------
export function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}
export function whatsappLink(phone, text) {
  let d = onlyDigits(phone);
  if (d && !(d.startsWith('55') && d.length >= 12)) d = '55' + d; // números do Brasil
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
export function fmtPhone(s) {
  const d = onlyDigits(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s || '';
}

// ---------- clientes (vêm dos agendamentos) ----------
export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
export function clientsFrom(appointments) {
  const map = new Map();
  for (const a of appointments) {
    const key = normalize(a.client_name);
    if (!key) continue;
    const c = map.get(key) || { name: a.client_name.trim(), phone: '', appts: [] };
    if (a.client_phone) c.phone = a.client_phone;
    c.appts.push(a);
    map.set(key, c);
  }
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
}
