// Banco de dados no próprio celular (IndexedDB). Funciona sem internet.
// Se o navegador não deixar usar o IndexedDB, guarda só na memória (e avisa).

const NAME = 'salao-em-casa';
const STORES = ['services', 'visits', 'meta'];
let db = null;
const mem = { services: new Map(), visits: new Map(), meta: new Map() };
export let memoryOnly = false;

export function open() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(NAME, 1); } catch { memoryOnly = true; return resolve(); }
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
    };
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onerror = () => { memoryOnly = true; resolve(); };
    req.onblocked = () => { memoryOnly = true; resolve(); };
  });
}

function run(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Não deu para salvar'));
  });
}

export async function all(store) {
  if (!db) return [...mem[store].values()].map((x) => structuredClone(x));
  return run(store, 'readonly', (s) => s.getAll());
}

export async function put(store, obj) {
  if (!db) { mem[store].set(obj.id ?? obj.key, structuredClone(obj)); return; }
  await run(store, 'readwrite', (s) => s.put(obj));
}

export async function remove(store, id) {
  if (!db) { mem[store].delete(id); return; }
  await run(store, 'readwrite', (s) => s.delete(id));
}

export async function getMeta(key) {
  if (!db) return mem.meta.get(key)?.value;
  const row = await run('meta', 'readonly', (s) => s.get(key));
  return row?.value;
}

export const setMeta = (key, value) => put('meta', { key, value });

/** Troca todos os serviços e atendimentos de uma vez (restaurar cópia). */
export async function replaceAll({ services, visits }) {
  if (!db) {
    mem.services = new Map(services.map((s) => [s.id, s]));
    mem.visits = new Map(visits.map((v) => [v.id, v]));
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['services', 'visits'], 'readwrite');
    const ss = tx.objectStore('services'); const vs = tx.objectStore('visits');
    ss.clear(); vs.clear();
    services.forEach((s) => ss.put(s)); visits.forEach((v) => vs.put(v));
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
