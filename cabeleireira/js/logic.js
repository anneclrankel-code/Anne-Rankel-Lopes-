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

// ---------- V2: tipos, subtipos e produtos (lista inicial; ela muda tudo no app) ----------
const SUGGESTED_CATALOG = [
  ['Química', [['Água oxigenada', ['Volume']], ['Tintura', ['Cor']], ['Descolorante'], ['Permanente']]],
  ['Alisamento', [['Progressiva'], ['Selagem'], ['Botox capilar'], ['Relaxamento']]],
  ['Tratamento', [['Máscara'], ['Ampola'], ['Reconstrução'], ['Óleo capilar']]],
  ['Tonalização', [['Tonalizante', ['Cor']], ['Matizador']]],
  ['Unha', [['Esmalte', ['Cor']], ['Base'], ['Extra brilho'], ['Removedor'], ['Gel']]],
  ['Maquiagem', [['Base', ['Cor']], ['Corretivo'], ['Pó'], ['Sombra'], ['Batom', ['Cor']], ['Máscara de cílios']]],
  ['Podologia', [['Antisséptico'], ['Creme hidratante'], ['Lixa descartável']]],
  ['Sobrancelha', [['Henna', ['Cor']], ['Cera'], ['Linha'], ['Tintura para sobrancelha', ['Cor']]]],
  ['Mega hair', [['Mechas de cabelo', ['Comprimento']], ['Queratina'], ['Fita adesiva'], ['Microlink']]],
];

export function defaultCatalog() {
  const types = []; const subtypes = [];
  SUGGESTED_CATALOG.forEach(([name, subs], i) => {
    const typeId = `t${i + 1}`;
    types.push({ id: typeId, name, order: i });
    subs.forEach(([sub, fields = []], j) => subtypes.push({ id: `${typeId}-${j + 1}`, typeId, name: sub, fields, order: j }));
  });
  return { types, subtypes, products: [] };
}

export const UNITS = ['ml', 'g'];

/** Quanto custou a quantidade gasta de um produto (centavos). */
export function usageCost(product, qty) {
  const pack = Number(product?.packQty) || 0;
  const q = Number(qty) || 0;
  if (pack <= 0 || q <= 0) return 0;
  return Math.round((Number(product.cost) || 0) * q / pack);
}

/** "2,5" → 2.5 · "30" → 30. null se não for número maior que zero. */
export function parseQty(text) {
  const s = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return n > 0 ? n : null;
}

export const fmtQty = (n) => String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ',');

export const productsCost = (usage) => (usage || []).reduce((a, u) => a + (Number(u.cost) || 0), 0);
export const assistantCost = (v) => (v.hadAssistant ? Math.max(0, Number(v.assistant) || 0) : 0);

/** Lucro do atendimento: total da cliente − assistente − produtos usados. */
export const visitProfit = (v) => visitTotal(v) - assistantCost(v) - productsCost(v.usage);

/** Características do produto em texto curto: "Volume 20 · Cor 7.1". */
export const traitsText = (traits) => (traits || []).filter((t) => t.name && t.value).map((t) => `${t.name} ${t.value}`).join(' · ');

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

export function visitTotal(v) { return total(v.items, v.adjust); }

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
  return { app: 'salao-em-casa', version: 2, exportedAt: now.toISOString(), services, visits };
}

/** Cópia completa (V2): serviços, atendimentos e o cadastro de produtos. */
export function fullSnapshot(data, now = new Date()) {
  return { ...snapshot(data.services, data.visits, now), types: data.types, subtypes: data.subtypes, products: data.products };
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
      hadAssistant: !!v.hadAssistant && int(v.assistant) > 0,
      assistant: v.hadAssistant ? Math.max(0, int(v.assistant)) : 0,
      usage: (Array.isArray(v.usage) ? v.usage : [])
        .filter((u) => u && normalizeName(u.name) && Number(u.qty) > 0)
        .map((u) => ({ productId: u.productId || null, name: normalizeName(u.name), qty: Number(u.qty),
          unit: UNITS.includes(u.unit) ? u.unit : 'ml', cost: Math.max(0, int(u.cost)) })),
    }));
  const out = { services, visits };
  // Cópias da V1 não têm o cadastro de produtos: nesse caso o cadastro atual fica como está.
  if (Array.isArray(obj.types) && Array.isArray(obj.subtypes) && Array.isArray(obj.products)) {
    const types = obj.types.filter((t) => t && t.id && normalizeName(t.name))
      .map((t, i) => ({ id: String(t.id), name: normalizeName(t.name), order: Number.isFinite(t.order) ? t.order : i }));
    const typeIds = new Set(types.map((t) => t.id));
    const subtypes = obj.subtypes.filter((s) => s && s.id && normalizeName(s.name) && typeIds.has(String(s.typeId)))
      .map((s, i) => ({ id: String(s.id), typeId: String(s.typeId), name: normalizeName(s.name),
        fields: (Array.isArray(s.fields) ? s.fields : []).map(normalizeName).filter(Boolean), order: Number.isFinite(s.order) ? s.order : i }));
    const products = obj.products.filter((p) => p && p.id && normalizeName(p.name))
      .map((p) => ({ id: String(p.id), name: normalizeName(p.name),
        typeId: typeIds.has(String(p.typeId)) ? String(p.typeId) : null,
        subtypeId: subtypes.some((s) => s.id === String(p.subtypeId)) ? String(p.subtypeId) : null,
        traits: (Array.isArray(p.traits) ? p.traits : []).filter((t) => t && normalizeName(t.name))
          .map((t) => ({ name: normalizeName(t.name), value: normalizeName(t.value) })),
        cost: Math.max(0, int(p.cost)), packQty: Math.max(0, Number(p.packQty) || 0), unit: UNITS.includes(p.unit) ? p.unit : 'ml' }));
    Object.assign(out, { types, subtypes, products });
  }
  return out;
}

/** O que impede apagar um tipo ou subtipo (produtos ligados a ele). */
export function productsUsing(products, { typeId, subtypeId }) {
  return products.filter((p) => (typeId && p.typeId === typeId) || (subtypeId && p.subtypeId === subtypeId));
}

/** Produtos agrupados por tipo e subtipo, na ordem do cadastro. */
export function groupProducts(products, types, subtypes) {
  const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'pt-BR');
  const groups = [];
  for (const t of [...types].sort(byOrder)) {
    const subs = subtypes.filter((s) => s.typeId === t.id).sort(byOrder);
    const items = [];
    for (const s of subs) for (const p of products.filter((x) => x.subtypeId === s.id).sort(byOrder)) items.push({ product: p, subtype: s });
    for (const p of products.filter((x) => x.typeId === t.id && !subs.some((s) => s.id === x.subtypeId))) items.push({ product: p, subtype: null });
    if (items.length) groups.push({ title: t.name, items });
  }
  const loose = products.filter((p) => !types.some((t) => t.id === p.typeId));
  if (loose.length) groups.push({ title: 'Sem tipo', items: loose.map((p) => ({ product: p, subtype: null })) });
  return groups;
}

export function backupFileName(now = new Date()) {
  return `copia-salao-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

export const uid = () =>
  (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
