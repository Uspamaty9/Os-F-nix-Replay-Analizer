// Almacenamiento persistente del módulo de análisis y scouting (IndexedDB).
// Base de datos propia: NO toca el historial de repeticiones ('os-fenix-replays').
const DB_NAME = 'os-fenix-scouting';
const DB_VERSION = 1;
export const STORES = ['teams', 'players', 'seasons', 'competitions', 'fixtures', 'matches', 'ratings', 'kv'];
export const CHANGED = 'fenix-scouting-changed';

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      STORES.forEach((s) => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
    };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { db.close(); dbPromise = null; }; resolve(db); };
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}
const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
function notify(store) { try { window.dispatchEvent(new CustomEvent(CHANGED, { detail: { store } })); } catch (e) { } }

export function uid(prefix) { return (prefix || 'x') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export async function all(store) { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).getAll()); }
export async function get(store, id) { const db = await openDb(); return wrap(db.transaction(store).objectStore(store).get(id)); }
export async function put(store, obj, silent) {
  const db = await openDb(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(obj); await done(tx); if (!silent) notify(store); return obj;
}
export async function putMany(store, list) {
  if (!list.length) return; const db = await openDb(); const tx = db.transaction(store, 'readwrite'); list.forEach((o) => tx.objectStore(store).put(o)); await done(tx); notify(store);
}
export async function del(store, id) { const db = await openDb(); const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); await done(tx); notify(store); }
export async function delMany(store, ids) { if (!ids.length) return; const db = await openDb(); const tx = db.transaction(store, 'readwrite'); ids.forEach((i) => tx.objectStore(store).delete(i)); await done(tx); notify(store); }

export async function loadAll() {
  const out = {};
  await Promise.all(STORES.filter((s) => s !== 'kv').map(async (s) => { out[s] = await all(s); }));
  return out;
}

// Ajustes sencillos (equipo propio, filtros recordados...)
export async function getKv(key, fallback) { try { const r = await get('kv', key); return r ? r.value : fallback; } catch (e) { return fallback; } }
export async function setKv(key, value) { await put('kv', { id: key, value }, true); }

// ---------- Copia de seguridad completa del módulo ----------
export async function exportScouting() {
  const data = {};
  for (const s of STORES) data[s] = await all(s);
  return JSON.stringify({ app: 'os-fenix-scouting', version: 1, created: Date.now(), data });
}
// Importación aditiva: no borra nada; los registros con el mismo id se sustituyen solo si son más recientes.
export async function importScouting(text) {
  const obj = JSON.parse(text);
  if (!obj || obj.app !== 'os-fenix-scouting' || !obj.data) throw new Error('Archivo no válido');
  let n = 0;
  for (const s of STORES) {
    const incoming = obj.data[s]; if (!Array.isArray(incoming)) continue;
    const cur = new Map((await all(s)).map((r) => [r.id, r]));
    const toPut = incoming.filter((r) => { const c = cur.get(r.id); return !c || (r.updatedAt || r.ingestedAt || r.createdAt || 0) > (c.updatedAt || c.ingestedAt || c.createdAt || 0); });
    await putMany(s, toPut); n += toPut.length;
  }
  return n;
}
