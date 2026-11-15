// Guardado persistente de la pizarra táctica. Base propia ('os-fenix-tactics'): no toca el historial de repeticiones.
// IndexedDB como almacenamiento principal; si no existe (modo privado, WebView antiguo) usa localStorage.
import { normalizeDoc, uid } from './model';

const DB_NAME = 'os-fenix-tactics';
const DB_VERSION = 1;
const STORES = ['docs', 'folders', 'roster', 'kv'];
const LS_PREFIX = 'os-fenix-tactics:';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) { reject(new Error('sin IndexedDB')); return; }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('bloqueada'));
    } catch (e) { reject(e); }
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

// ----- respaldo localStorage -----
function lsRead(store) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + store)) || []; } catch (e) { return []; }
}
function lsWrite(store, arr) {
  try { localStorage.setItem(LS_PREFIX + store, JSON.stringify(arr)); return true; } catch (e) { return false; }
}

async function getAll(store) {
  try {
    const db = await openDb();
    return await wrap(db.transaction(store).objectStore(store).getAll());
  } catch (e) { return lsRead(store); }
}

async function put(store, value) {
  try {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
    return true;
  } catch (e) {
    const key = value.id != null ? 'id' : 'key';
    const arr = lsRead(store).filter((x) => x[key] !== value[key]); arr.push(value);
    return lsWrite(store, arr);
  }
}

async function del(store, id) {
  try {
    const db = await openDb();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  } catch (e) {
    lsWrite(store, lsRead(store).filter((x) => (x.id != null ? x.id : x.key) !== id));
  }
}

// ----- Pizarras / jugadas -----
export async function listDocs() {
  const all = await getAll('docs');
  return all.map(normalizeDoc).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Resumen ligero para la biblioteca (sin cargar las posiciones en pantalla)
export const docSummary = (d) => ({
  id: d.id, name: d.name, description: d.description, category: d.category, folderId: d.folderId,
  updatedAt: d.updatedAt, players: d.players.length, frames: d.frames.length, shapes: d.shapes.length
});

export const saveDoc = (doc) => put('docs', doc);
export const deleteDoc = (id) => del('docs', id);

// ----- Carpetas -----
export async function listFolders() {
  const all = await getAll('folders');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function createFolder(name, parentId = null) {
  const f = { id: uid(), name: (name || '').trim() || 'Carpeta', parentId, createdAt: Date.now() };
  await put('folders', f);
  return f;
}

export async function renameFolder(id, name) {
  const all = await getAll('folders');
  const f = all.find((x) => x.id === id);
  if (f) { f.name = (name || '').trim() || f.name; await put('folders', f); }
  return f;
}

// Eliminar una carpeta: sus pizarras pasan a "Sin carpeta" (nunca se pierden)
export async function deleteFolder(id) {
  const docs = await getAll('docs');
  for (const d of docs) if (d.folderId === id) await put('docs', { ...d, folderId: null });
  const folders = await getAll('folders');
  for (const f of folders) if (f.parentId === id) await put('folders', { ...f, parentId: null });
  await del('folders', id);
}

// ----- Plantel propio (jugadores añadidos a mano) -----
export const listRoster = () => getAll('roster');
export const saveRosterPlayer = (p) => put('roster', { id: p.id || uid(), ...p });
export const deleteRosterPlayer = (id) => del('roster', id);

// ----- Preferencias y último proyecto abierto -----
export async function getKv(key, fallback = null) {
  const all = await getAll('kv');
  const r = all.find((x) => x.key === key);
  return r ? r.value : fallback;
}
export const setKv = (key, value) => put('kv', { key, value });

// ----- Importar / exportar proyectos (JSON) -----
export function serializeDoc(doc) {
  return JSON.stringify({ format: 'os-fenix-tactics', version: 1, doc }, null, 1);
}

export function parseDoc(text) {
  const j = JSON.parse(text);
  const raw = j && j.format === 'os-fenix-tactics' ? j.doc : j;
  if (!raw || !Array.isArray(raw.frames)) throw new Error('Archivo de pizarra no válido');
  const d = normalizeDoc(raw);
  d.id = uid(); // evita pisar una pizarra existente
  d.updatedAt = Date.now();
  return d;
}
