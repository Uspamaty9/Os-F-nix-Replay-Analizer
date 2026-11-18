// Modelo de datos de la pizarra táctica: funciones puras e inmutables + historial (deshacer/rehacer).
//
// Documento (una pizarra / jugada):
//  {
//    id, name, description, category, folderId, createdAt, updatedAt,
//    players: [{ id, nick, num, team: 'red'|'blue'|'neutral', color, role, regKey }],
//    shapes:  [{ id, type, pts, color, width, opacity, fill, dashed, label, attach, rot }],
//    frames:  [{ id, name, pos: { [playerId|'ball']: {x, y} } }],   // frames[0] = posiciones iniciales
//    stepMs: 1200
//  }

import { PITCH, clamp, centroid, ellipsePts, rotatePts, scalePts, translatePts, sortByAngle } from './geometry';

export const TEAM_COLORS = { red: '#E56E6E', blue: '#5689E5', neutral: '#E8E8EC' };
export const PALETTE = ['#E56E6E', '#5689E5', '#F5C542', '#4CC38A', '#B07CFF', '#FF9F43', '#35D0C8', '#FFFFFF', '#111111'];

export const CATEGORIES = [
  'General', 'Salida desde defensa', 'Circulación de balón', 'Triangulación', 'Rotación',
  'Desmarque', 'Presión', 'Transición', 'Ataque organizado', 'Movimiento defensivo'
];

// Máximo de fichas por equipo (el campo es de HaxBall: más jugadores no se pueden leer ni animar)
export const MAX_PER_TEAM = 5;
export const teamCount = (doc, team) => doc.players.filter((q) => (q.team || 'red') === (team || 'red')).length;
export const canAddPlayer = (doc, team) => teamCount(doc, team) < MAX_PER_TEAM;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newDoc(name = 'Pizarra nueva') {
  const now = Date.now();
  return {
    id: uid(), name, description: '', category: 'General', folderId: null,
    createdAt: now, updatedAt: now, stepMs: 1200,
    players: [], shapes: [],
    frames: [{ id: uid(), name: 'Inicio', pos: {} }]
  };
}

export function cloneDoc(doc, name) {
  const d = JSON.parse(JSON.stringify(doc));
  d.id = uid(); d.name = name || doc.name + ' (copia)';
  d.createdAt = d.updatedAt = Date.now();
  return d;
}

// ---------- Posiciones ----------
export function framePos(doc, fi) {
  return doc.frames[clamp(fi, 0, doc.frames.length - 1)].pos;
}

// Posición de un jugador en el fotograma fi; si el fotograma no la define, hereda del anterior
export function posAt(doc, fi, key) {
  for (let i = Math.min(fi, doc.frames.length - 1); i >= 0; i--) {
    const p = doc.frames[i].pos[key];
    if (p) return p;
  }
  return null;
}

export function resolvedPos(doc, fi) {
  const out = {};
  for (const pl of doc.players) { const p = posAt(doc, fi, pl.id); if (p) out[pl.id] = p; }
  const b = posAt(doc, fi, 'ball'); if (b) out.ball = b;
  return out;
}

// Mezcla dos mapas de posiciones (animación)
export function lerpPos(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    const q = b[k] || a[k];
    out[k] = { x: a[k].x + (q.x - a[k].x) * t, y: a[k].y + (q.y - a[k].y) * t };
  }
  return out;
}

export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Posición interpolada en el instante x de la secuencia (x = 0 .. nPasos-1; la parte decimal es el avance entre pasos)
export function animPos(doc, x) {
  const n = doc.frames.length;
  if (n < 2) return { fi: 0, pos: resolvedPos(doc, 0) };
  const c = clamp(x, 0, n - 1);
  if (c >= n - 1) return { fi: n - 1, pos: resolvedPos(doc, n - 1) };
  const i = Math.floor(c), p = c - i;
  return { fi: i, pos: lerpPos(resolvedPos(doc, i), resolvedPos(doc, i + 1), ease(p)) };
}

// ---------- Figuras: geometría efectiva (las vinculadas siguen a los jugadores) ----------
export function shapePts(shape, pos) {
  if (shape.attach && shape.attach.length) {
    const pts = [];
    for (const id of shape.attach) { const p = pos[id]; if (p) pts.push({ x: p.x, y: p.y }); else return shape.pts; }
    return pts;
  }
  return shape.pts;
}

// ---------- Mutaciones puras ----------
const touch = (doc) => ({ ...doc, updatedAt: Date.now() });

export function addPlayer(doc, fi, p) {
  if (!canAddPlayer(doc, p.team)) return { doc, id: null };
  const id = uid();
  const n = doc.players.filter((q) => q.team === p.team).length + 1;
  const player = {
    id, nick: p.nick || '', num: p.num != null ? p.num : n, team: p.team || 'red',
    color: p.color || TEAM_COLORS[p.team || 'red'], role: p.role || '', regKey: p.regKey || null
  };
  // La ficha existe en todos los pasos de la secuencia (en el actual en la posición dada, en los demás igual)
  const frames = doc.frames.map((f) => ({ ...f, pos: { ...f.pos, [id]: { x: p.x, y: p.y } } }));
  return { doc: touch({ ...doc, players: [...doc.players, player], frames }), id };
}

export function updatePlayer(doc, id, patch) {
  return touch({ ...doc, players: doc.players.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
}

export function updatePlayers(doc, ids, patch) {
  const set = new Set(ids);
  return touch({ ...doc, players: doc.players.map((p) => (set.has(p.id) ? { ...p, ...patch } : p)) });
}

export function removePlayers(doc, ids) {
  const set = new Set(ids);
  const shapes = doc.shapes
    .map((s) => {
      if (!s.attach || !s.attach.some((id) => set.has(id))) return s;
      return null; // una figura vinculada a un jugador eliminado se elimina con él
    })
    .filter(Boolean);
  const frames = doc.frames.map((f) => {
    const pos = { ...f.pos }; for (const id of ids) delete pos[id]; return { ...f, pos };
  });
  return touch({ ...doc, players: doc.players.filter((p) => !set.has(p.id)), shapes, frames });
}

export function movePlayers(doc, fi, moves) {
  // moves: { id: {x,y} }  (posiciones absolutas) — incluye 'ball'
  const frames = doc.frames.map((f, i) => {
    if (i !== fi) return f;
    const pos = { ...f.pos };
    for (const k of Object.keys(moves)) pos[k] = { x: clamp(moves[k].x, -PITCH.boundW + 4, PITCH.boundW - 4), y: clamp(moves[k].y, -PITCH.boundH + 4, PITCH.boundH - 4) };
    return { ...f, pos };
  });
  return { ...doc, frames };
}

export function setBall(doc, fi, p) {
  if (!p) {
    return touch({ ...doc, frames: doc.frames.map((f) => { const pos = { ...f.pos }; delete pos.ball; return { ...f, pos }; }) });
  }
  return touch(movePlayers(doc, fi, { ball: p }));
}

export function addShape(doc, shape) {
  const s = {
    id: uid(), type: 'line', pts: [], color: '#F5C542', width: 3, opacity: 1, fill: false, dashed: false,
    label: '', attach: null, rot: 0, ...shape
  };
  return { doc: touch({ ...doc, shapes: [...doc.shapes, s] }), id: s.id };
}

export function updateShapes(doc, ids, patch) {
  const set = new Set(ids);
  return touch({ ...doc, shapes: doc.shapes.map((s) => (set.has(s.id) ? { ...s, ...(typeof patch === 'function' ? patch(s) : patch) } : s)) });
}

export function removeShapes(doc, ids) {
  const set = new Set(ids);
  return touch({ ...doc, shapes: doc.shapes.filter((s) => !set.has(s.id)) });
}

// Desplaza figuras libres (las vinculadas no se mueven solas: siguen a sus jugadores)
export function moveShapes(doc, ids, dx, dy, base) {
  const set = new Set(ids);
  return { ...doc, shapes: doc.shapes.map((s) => (set.has(s.id) && !s.attach ? { ...s, pts: translatePts((base && base[s.id]) || s.pts, dx, dy) } : s)) };
}

export function rotateShape(doc, id, deg) {
  return touch({
    ...doc,
    shapes: doc.shapes.map((s) => {
      if (s.id !== id || s.attach) return s;
      return { ...s, pts: rotatePts(s.pts, deg, centroid(s.pts)), rot: ((s.rot || 0) + deg) % 360 };
    })
  });
}

export function scaleShape(doc, id, f) {
  return touch({
    ...doc,
    shapes: doc.shapes.map((s) => (s.id === id && !s.attach ? { ...s, pts: scalePts(s.pts, f, centroid(s.pts)) } : s))
  });
}

// ---------- Selección inteligente: conexiones entre jugadores ----------
// 2 jugadores -> conexión · 3 -> triángulo · 4 -> cuadrado/estructura · 5+ -> polígono
export function linkKind(n) {
  if (n === 2) return 'link';
  if (n === 3) return 'tri';
  if (n === 4) return 'quad';
  if (n >= 5) return 'poly';
  return null;
}

export function createLink(doc, fi, playerIds, opts = {}) {
  const pos = resolvedPos(doc, fi);
  const ids = playerIds.filter((id) => pos[id]);
  const kind = linkKind(ids.length);
  if (!kind) return { doc, id: null };
  let order = ids;
  if (ids.length >= 3) {
    const sorted = sortByAngle(ids.map((id) => ({ id, ...pos[id] })));
    order = sorted.map((p) => p.id);
  }
  const pts = order.map((id) => ({ x: pos[id].x, y: pos[id].y }));
  return addShape(doc, {
    type: kind, pts, attach: order, color: opts.color || '#F5C542', width: opts.width || 3,
    opacity: opts.opacity != null ? opts.opacity : 1, fill: ids.length >= 3 ? opts.fill !== false : false,
    dashed: !!opts.dashed, label: ''
  });
}

// Desvincular: la figura queda libre en su última posición
export function unlinkShape(doc, id, fi) {
  const pos = resolvedPos(doc, fi);
  return touch({
    ...doc,
    shapes: doc.shapes.map((s) => (s.id === id && s.attach ? { ...s, pts: shapePts(s, pos).map((p) => ({ x: p.x, y: p.y })), attach: null } : s))
  });
}

// Vincular una figura libre de 2..n vértices a jugadores (por orden) — re-vincular tras editar
export function relinkShape(doc, id, playerIds) {
  return touch({ ...doc, shapes: doc.shapes.map((s) => (s.id === id ? { ...s, attach: playerIds.slice(), type: linkKind(playerIds.length) || s.type } : s)) });
}

// ---------- Fotogramas (secuencia animada) ----------
export function addFrame(doc, fi) {
  const pos = resolvedPos(doc, fi);
  const copy = {}; for (const k of Object.keys(pos)) copy[k] = { x: pos[k].x, y: pos[k].y };
  const frame = { id: uid(), name: 'Paso ' + (doc.frames.length), pos: copy };
  const frames = doc.frames.slice(); frames.splice(fi + 1, 0, frame);
  return { doc: touch({ ...doc, frames }), index: fi + 1 };
}

export function removeFrame(doc, fi) {
  if (doc.frames.length <= 1) return { doc, index: 0 };
  const frames = doc.frames.filter((_, i) => i !== fi);
  return { doc: touch({ ...doc, frames }), index: clamp(fi, 0, frames.length - 1) };
}

export function renameFrame(doc, fi, name) {
  return touch({ ...doc, frames: doc.frames.map((f, i) => (i === fi ? { ...f, name } : f)) });
}

export function moveFrame(doc, from, to) {
  const frames = doc.frames.slice();
  const [f] = frames.splice(from, 1);
  frames.splice(clamp(to, 0, frames.length), 0, f);
  return touch({ ...doc, frames });
}

// Al abrir un documento guardado: garantiza estructura válida (compatibilidad con versiones futuras)
export function normalizeDoc(d) {
  const base = newDoc(d && d.name);
  const doc = { ...base, ...(d || {}) };
  doc.players = Array.isArray(doc.players) ? doc.players : [];
  doc.shapes = Array.isArray(doc.shapes) ? doc.shapes : [];
  doc.frames = Array.isArray(doc.frames) && doc.frames.length ? doc.frames : base.frames;
  doc.stepMs = clamp(Number(doc.stepMs) || 1200, 200, 8000);
  // Jugadas guardadas con versiones anteriores
  // las zonas ya no existen: se descartan de las jugadas antiguas
  doc.shapes = doc.shapes.filter((s) => s && s.type !== 'zone').map((s) => {
    if (!Array.isArray(s.pts)) return s;
    if (s.type === 'circle' && s.pts.length >= 2) { // el círculo ya no existe como herramienta: pasa a polígono
      const r = Math.hypot(s.pts[1].x - s.pts[0].x, s.pts[1].y - s.pts[0].y), c = s.pts[0];
      return { ...s, type: 'polygon', pts: ellipsePts({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }) };
    }
    if (s.type === 'square' || s.type === 'triangle') return { ...s, type: 'polygon' };
    if (s.type === 'carrow' && s.pts.length >= 3 && !s.thru) { // antes pts[1] era el punto de control; ahora es un punto de la curva
      const [a, c, b] = s.pts;
      return { ...s, thru: true, pts: [a, { x: (a.x + b.x) / 4 + c.x / 2, y: (a.y + b.y) / 4 + c.y / 2 }, b] };
    }
    return s;
  });
  return doc;
}

// ---------- Historial ----------
export const HISTORY_LIMIT = 100;

export function createHistory(doc) {
  return { doc, past: [], future: [] };
}

// Registra el estado actual como punto de retorno y aplica el nuevo documento
export function commit(h, doc) {
  if (doc === h.doc) return h;
  const past = h.past.concat([h.doc]);
  if (past.length > HISTORY_LIMIT) past.shift();
  return { doc, past, future: [] };
}

// Cambio transitorio (arrastres): no crea punto de retorno
export function replace(h, doc) { return { ...h, doc }; }

// Marca el estado actual como punto de retorno ANTES de un gesto continuo
export function checkpoint(h) {
  const past = h.past.concat([h.doc]);
  if (past.length > HISTORY_LIMIT) past.shift();
  return { ...h, past, future: [] };
}

// Descarta el último checkpoint si el gesto no cambió nada
export function dropCheckpoint(h) {
  if (!h.past.length) return h;
  return { ...h, past: h.past.slice(0, -1) };
}

export function undo(h) {
  if (!h.past.length) return h;
  const doc = h.past[h.past.length - 1];
  return { doc, past: h.past.slice(0, -1), future: [h.doc].concat(h.future) };
}

export function redo(h) {
  if (!h.future.length) return h;
  const [doc, ...rest] = h.future;
  return { doc, past: h.past.concat([h.doc]), future: rest };
}

export const canUndo = (h) => h.past.length > 0;
export const canRedo = (h) => h.future.length > 0;
