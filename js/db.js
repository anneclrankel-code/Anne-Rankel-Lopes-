// Camada de dados: fala com o Supabase (banco na nuvem) ou, se ele ainda não
// estiver configurado, guarda tudo no próprio aparelho (modo de teste).
import { CONFIG } from './config.js';

export const isDemo = !CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey;

const TABLES = ['services', 'appointments', 'blocks'];

// ---------------- Supabase ----------------
let sb = null;
async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
  }
  return sb;
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const remote = {
  async session() {
    const c = await client();
    return (await c.auth.getSession()).data.session;
  },
  async login(email, password) {
    const c = await client();
    check(await c.auth.signInWithPassword({ email, password }));
  },
  async logout() {
    await (await client()).auth.signOut();
  },
  async list(table) {
    return check(await (await client()).from(table).select('*'));
  },
  async insert(table, row) {
    return check(await (await client()).from(table).insert(row).select().single());
  },
  async update(table, id, patch) {
    return check(await (await client()).from(table).update(patch).eq('id', id).select().single());
  },
  async remove(table, id) {
    check(await (await client()).from(table).delete().eq('id', id));
  },
  async getSettings() {
    const rows = check(await (await client()).from('settings').select('*').eq('id', 1));
    return rows[0]?.data || null;
  },
  async saveSettings(data) {
    check(await (await client()).from('settings').upsert({ id: 1, data }));
  },
};

// ---------------- Modo de teste (aparelho) ----------------
const KEY = 'fabi-tsunemi-demo';
function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* sem espaço ou bloqueado: segue só na memória */
  }
}
const mem = load();
for (const t of TABLES) mem[t] ||= [];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

const local = {
  async session() { return { demo: true }; },
  async login() {},
  async logout() {},
  async list(table) { return structuredClone(mem[table]); },
  async insert(table, row) {
    const r = { id: uid(), created_at: new Date().toISOString(), ...row };
    mem[table].push(r); save(mem);
    return structuredClone(r);
  },
  async update(table, id, patch) {
    const r = mem[table].find((x) => x.id === id);
    if (!r) throw new Error('Registro não encontrado');
    Object.assign(r, patch); save(mem);
    return structuredClone(r);
  },
  async remove(table, id) {
    mem[table] = mem[table].filter((x) => x.id !== id); save(mem);
  },
  async getSettings() { return mem.settings || null; },
  async saveSettings(data) { mem.settings = data; save(mem); },
};

export const db = isDemo ? local : remote;
