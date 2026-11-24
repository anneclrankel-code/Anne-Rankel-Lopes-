// Regras do app (sem tela e sem banco), para poder testar.
// Todos os valores em dinheiro são guardados em CENTAVOS (número inteiro).

export const STEP = 1000; // desconto/acréscimo de R$ 10 em R$ 10

export const METHODS = [
  { id: 'pix', label: 'Pix' },
  { id: 'credito', label: 'Crédito' },
  { id: 'debito', label: 'Débito' },
  { id: 'dinheiro', label: 'Dinheiro' },
];

export const methodLabel = (id) => METHODS.find((m) => m.id === id)?.label || '';

// Preços de exemplo: ela troca em Ajustes → Serviços.
export const DEFAULT_SERVICES = [
  ['Cabelo', 'Corte', 8000],
  ['Cabelo', 'Escova', 6000],
  ['Cabelo', 'Tintura', 15000],
  ['Cabelo', 'Mechas', 35000],
  ['Cabelo', 'Hidratação', 9000],
  ['Cabelo', 'Progressiva', 30000],
  ['Unha', 'Mão', 4000],
  ['Unha', 'Pé', 4500],
  ['Unha', 'Pé e mão', 8000],
  ['Maquiagem', 'Maquiagem', 15000],
  ['Maquiagem', 'Penteado', 12000],
].map(([category, name, price], i) => ({ id: `s${i + 1}`, category, name, price, order: i }));

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const money = (cents) => BRL.format((Number(cents) || 0) / 100);

/** "1.200,50" → 120050 · "80" → 8000 · "80.5" → 8050. Retorna null se não for número. */
export function parsePrice(text) {
  let s = String(text ?? '').replace(/[R$\s ]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export const subtotal = (items) => (items || []).reduce((a, it) => a + (Number(it.price) || 0), 0);
export const total = (items, adjust = 0) => Math.max(0, subtotal(items) + (Number(adjust) || 0));

/** Desconto não pode deixar a conta negativa. */
export function changeAdjust(items, adjust, delta) {
  const next = (Number(adjust) || 0) + delta;
  return Math.max(-subtotal(items), next);
}

export const visitTotal = (v) => total(v.items, v.adjust);

export function normalizeName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

const alive = (v) => !v.deleted;

/** Quem está devendo, mais recentes primeiro. */
export function pending(visits) {
  return visits.filter((v) => alive(v) && !v.paid).sort((a, b) => b.date.localeCompare(a.date));
}

export function paid(visits) {
  return visits
    .filter((v) => alive(v) && v.paid)
    .sort((a, b) => (b.paidAt || b.date).localeCompare(a.paidAt || a.date));
}

export const sumOwed = (visits) => pending(visits).reduce((a, v) => a + visitTotal(v), 0);

/** Nomes de clientes já atendidas (mais recentes primeiro) que combinam com o texto digitado. */
export function suggestClients(visits, typed, limit = 4) {
  const q = fold(typed);
  const seen = new Map();
  for (const v of [...visits].filter(alive).sort((a, b) => b.date.localeCompare(a.date))) {
    const key = fold(v.client);
    if (!seen.has(key)) seen.set(key, v.client);
  }
  return [...seen.entries()]
    .filter(([key]) => (q ? key.split(' ').some((w) => w.startsWith(q)) || key.startsWith(q) : true))
    .filter(([key]) => key !== q)
    .slice(0, limit)
    .map(([, name]) => name);
}

const fold = (s) => normalizeName(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function groupServices(services) {
  const groups = [];
  for (const s of [...services].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const cat = s.category?.trim() || 'Outros';
    let g = groups.find((x) => x.category === cat);
    if (!g) groups.push((g = { category: cat, items: [] }));
    g.items.push(s);
  }
  return groups;
}

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function fmtDate(iso, now = new Date()) {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Hoje';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return 'Ontem';
  const base = `${WEEK[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}/${d.getFullYear()}`;
}

export function fmtDateTime(iso, now = new Date()) {
  const d = new Date(iso);
  return `${fmtDate(iso, now)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const daysSince = (iso, now = new Date()) => Math.floor((now - new Date(iso)) / 86400000);

/** "há 3 meses" para dívidas antigas (a partir de 30 dias). */
export function oldDebtLabel(iso, now = new Date()) {
  const d = daysSince(iso, now);
  if (d < 30) return '';
  if (d < 365) { const m = Math.floor(d / 30); return `há ${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const y = Math.floor(d / 365); return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
}

/** Precisa lembrar de fazer cópia? (tem dados e nenhuma cópia nos últimos 7 dias) */
export function needsBackup(visits, lastSync, lastExport, now = new Date()) {
  if (!visits.some(alive)) return false;
  const last = [lastSync, lastExport].filter(Boolean).sort().pop();
  return !last || daysSince(last, now) >= 7;
}

export function snapshot(services, visits, now = new Date()) {
  return { app: 'salao-em-casa', version: 1, exportedAt: now.toISOString(), services, visits };
}

/** Confere e arruma uma cópia de segurança (arquivo ou planilha). Lança erro se não servir. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.services) || !Array.isArray(obj.visits)) {
    throw new Error('Este arquivo não é uma cópia do app.');
  }
  const int = (n) => Math.round(Number(n) || 0);
  const services = obj.services
    .filter((s) => s && normalizeName(s.name))
    .map((s, i) => ({
      id: String(s.id || `s-imp-${i}`), category: normalizeName(s.category) || 'Outros',
      name: normalizeName(s.name), price: Math.max(0, int(s.price)), order: Number.isFinite(s.order) ? s.order : i,
    }));
  const visits = obj.visits
    .filter((v) => v && v.id && normalizeName(v.client) && Array.isArray(v.items) && !isNaN(new Date(v.date)))
    .map((v) => ({
      id: String(v.id), client: normalizeName(v.client), date: new Date(v.date).toISOString(),
      items: v.items.map((it) => ({ name: normalizeName(it.name) || 'Serviço', price: int(it.price), serviceId: it.serviceId || null })),
      adjust: int(v.adjust), paid: !!v.paid,
      method: v.paid && METHODS.some((m) => m.id === v.method) ? v.method : null,
      paidAt: v.paid && v.paidAt && !isNaN(new Date(v.paidAt)) ? new Date(v.paidAt).toISOString() : null,
      deleted: !!v.deleted, updatedAt: v.updatedAt || null,
    }));
  return { services, visits };
}

export function backupFileName(now = new Date()) {
  return `copia-salao-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export const uid = () =>
  (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
