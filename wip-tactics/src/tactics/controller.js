// Controlador de la pizarra: eventos de puntero (ratón + táctil), herramientas, selección, vista y reproducción.
// No depende de React: la interfaz solo recibe "snapshots" y llama a sus métodos. El dibujado va directo al canvas.
import * as G from './geometry';
import * as M from './model';
import { drawScene } from './render';
import { pickShape, shapeInRect, handlesOf, isClosed } from './shapes';

const DRAW_TOOLS = new Set(['pen', 'line', 'dline', 'arrow', 'carrow', 'rect', 'oval']);
const POLY_TOOLS = new Set(['polygon']);
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4];

export class TacticsController {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.h = M.createHistory(M.newDoc());
    this.fi = 0;
    this.tool = 'select';
    this.multi = false;
    this.snap = true;
    this.names = true;
    this.trails = false;
    this.shadow = false;
    this.shadowIds = new Set(); // jugadores que proyectan sombra (vacío = todos)
    this.ghost = true;
    this.newTeam = 'red';
    this.style = { color: '#F5C542', width: 3, opacity: 1, fill: false, dashed: false };
    this.sel = { players: new Set(), shapes: new Set() };
    this.viewMode = 'full';
    this.view = { k: 1, ox: 0, oy: 0 };
    this.userView = false;
    this.w = 300; this.h2 = 200; this.dpr = 1;
    this.pointers = new Map();
    this.g = null; this.draft = null; this.poly = null; this.box = null; this.hover = null;
    this.play = { state: 'stopped', x: 0, speed: 1, loop: false, last: 0 };
    this._co = { key: null, t: 0 };
    this._raf = 0; this._emitQ = false; this._dead = false; this._space = false; this._lastTap = { t: 0, x: 0, y: 0 };
    this._bind();
    this.resize();
  }

  // ------------------------------------------------------------ ciclo de vida
  _bind() {
    const c = this.canvas;
    this._on = {
      down: (e) => this._down(e), move: (e) => this._move(e), up: (e) => this._up(e), cancel: (e) => this._up(e, true),
      wheel: (e) => this._wheel(e), dbl: (e) => this._dbl(e), ctx: (e) => e.preventDefault(), key: (e) => this._key(e), keyup: (e) => this._keyup(e)
    };
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this._on.down);
    c.addEventListener('pointermove', this._on.move);
    c.addEventListener('pointerup', this._on.up);
    c.addEventListener('pointercancel', this._on.cancel);
    c.addEventListener('wheel', this._on.wheel, { passive: false });
    c.addEventListener('dblclick', this._on.dbl);
    c.addEventListener('contextmenu', this._on.ctx);
    window.addEventListener('keydown', this._on.key);
    window.addEventListener('keyup', this._on.keyup);
  }

  destroy() {
    this._dead = true;
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._on.down);
    c.removeEventListener('pointermove', this._on.move);
    c.removeEventListener('pointerup', this._on.up);
    c.removeEventListener('pointercancel', this._on.cancel);
    c.removeEventListener('wheel', this._on.wheel);
    c.removeEventListener('dblclick', this._on.dbl);
    c.removeEventListener('contextmenu', this._on.ctx);
    window.removeEventListener('keydown', this._on.key);
    window.removeEventListener('keyup', this._on.keyup);
    cancelAnimationFrame(this._raf);
    cancelAnimationFrame(this._raf2);
    this.play.state = 'stopped';
  }

  get doc() { return this.h.doc; }

  // ------------------------------------------------------------ tamaño y vista
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(50, Math.round(r.width)), hh = Math.max(50, Math.round(r.height));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    if (this._sized && w === this.w && hh === this.h2 && dpr === this.dpr) return;
    this._sized = true;
    this.w = w; this.h2 = hh; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(hh * dpr);
    if (!this.userView) this.view = G.fitView(w, hh, this.viewMode);
    else this.view = G.clampView(this.view, w, hh);
    this.draw();
    this.emit();
  }

  fit() { this.userView = false; this.view = G.fitView(this.w, this.h2, this.viewMode); this.draw(); this.emit(); }

  setViewMode(mode) {
    if (!['full', 'left', 'right'].includes(mode)) return;
    this.viewMode = mode; this.fit();
  }

  zoomBy(f) {
    this.userView = true;
    this.view = G.clampView(G.zoomAt(this.view, this.w / 2, this.h2 / 2, f), this.w, this.h2);
    this.draw(); this.emit();
  }

  _wheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    this.userView = true;
    if (e.shiftKey) this.view = G.clampView({ ...this.view, ox: this.view.ox - (e.deltaY || e.deltaX) }, this.w, this.h2);
    else this.view = G.clampView(G.zoomAt(this.view, x, y, Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0016))), this.w, this.h2);
    this.draw(); this.emit();
  }

  _pt(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _world(e) { const s = this._pt(e); return G.toWorld(this.view, s.x, s.y); }
  _tol(px = 10) { return px / this.view.k; }

  // ------------------------------------------------------------ estado / emisión
  snapshot() {
    const d = this.doc;
    return {
      doc: d, fi: this.fi, tool: this.tool, multi: this.multi, snap: this.snap, names: this.names, trails: this.trails, ghost: this.ghost, shadow: this.shadow, shadowN: this.shadowIds.size,
      newTeam: this.newTeam, style: this.style, viewMode: this.viewMode, zoom: this.view.k,
      selPlayers: Array.from(this.sel.players), selShapes: Array.from(this.sel.shapes),
      canUndo: M.canUndo(this.h), canRedo: M.canRedo(this.h), polyActive: !!this.poly,
      play: { state: this.play.state, speed: this.play.speed, loop: this.play.loop }, progress: this.play.x
    };
  }

  emit() {
    if (this._emitQ || this._dead) return;
    this._emitQ = true;
    Promise.resolve().then(() => { this._emitQ = false; if (!this._dead && this.hooks.onState) this.hooks.onState(this.snapshot()); });
  }

  _changed() { if (this.hooks.onDocChange) this.hooks.onDocChange(this.doc); }

  // Cambia el documento con historial. Con "key" agrupa ediciones seguidas (teclear, deslizar) en un solo paso de deshacer
  _apply(doc, key) {
    if (doc === this.h.doc) return;
    const now = Date.now();
    if (key && this._co.key === key && now - this._co.t < 900) this.h = M.replace(this.h, doc);
    else this.h = M.commit(this.h, doc);
    this._co = { key: key || null, t: now };
    this._changed(); this.draw(); this.emit();
  }

  toast(msg) { if (this.hooks.onToast) this.hooks.onToast(msg); }

  _locked() {
    if (this.play.state !== 'stopped') { this.toast('Detén la animación para editar'); return true; }
    return false;
  }

  // ------------------------------------------------------------ documento
  load(doc) {
    this.stop();
    this.h = M.createHistory(M.normalizeDoc(doc));
    this.userView = false; this.fi = 0; this.sel = { players: new Set(), shapes: new Set() }; this.draft = null; this.poly = null; this.g = null;
    this.play.x = 0; this._co = { key: null, t: 0 };
    this.draw(); this.emit();
  }

  // Cancha: null = Classic; si no, geometría compacta de un partido importado (se guarda dentro de la jugada)
  setField(geo) {
    if (this._locked()) return;
    const doc = { ...this.doc, updatedAt: Date.now() };
    if (geo) doc.field = geo; else delete doc.field;
    this._apply(doc, 'field' + Date.now());
    this.draw();
  }

  setMeta(patch) { this._apply({ ...this.doc, ...patch, updatedAt: Date.now() }, 'meta'); }

  undo() { if (this._locked()) return; this.h = M.undo(this.h); this._fixSel(); this._co = { key: null, t: 0 }; this._changed(); this.draw(); this.emit(); }
  redo() { if (this._locked()) return; this.h = M.redo(this.h); this._fixSel(); this._co = { key: null, t: 0 }; this._changed(); this.draw(); this.emit(); }

  _fixSel() {
    const d = this.doc;
    this.fi = G.clamp(this.fi, 0, d.frames.length - 1);
    const pl = new Set(d.players.map((p) => p.id)); pl.add('ball');
    const sh = new Set(d.shapes.map((s) => s.id));
    this.sel.players = new Set([...this.sel.players].filter((i) => pl.has(i)));
    this.sel.shapes = new Set([...this.sel.shapes].filter((i) => sh.has(i)));
  }

  // ------------------------------------------------------------ herramientas y estilo
  setTool(t) {
    if (this.poly) this.cancelPoly();
    this.tool = t; this.draft = null;
    if (t !== 'select') this.hover = null;
    this.canvas.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : t === 'erase' ? 'cell' : t === 'shadowpick' ? 'pointer' : 'crosshair';
    this.draw(); this.emit();
  }

  clearShadowPick() { this.shadowIds.clear(); this.draw(); this.emit(); }

  setFlag(name, value) {
    if (!['multi', 'snap', 'names', 'trails', 'ghost', 'shadow'].includes(name)) return;
    this[name] = !!value; this.draw(); this.emit();
  }

  setNewTeam(t) { this.newTeam = t; this.emit(); }

  // Estilo de dibujo; si hay figuras seleccionadas también las modifica
  setStyle(patch) {
    this.style = { ...this.style, ...patch };
    const ids = [...this.sel.shapes];
    if (ids.length && !this._locked()) {
      const p = { ...patch };
      this._apply(M.updateShapes(this.doc, ids, p), 'style:' + Object.keys(patch).join(','));
    } else { this.draw(); this.emit(); }
  }

  // ------------------------------------------------------------ jugadores
  // Quita las fichas predeterminadas (sin jugador analizado ni nombre) de un equipo
  removeDefaultPlayers(team) {
    if (this._locked()) return;
    const ids = this.doc.players.filter((q) => (q.team || 'red') === team && !q.regKey && !q.nick).map((q) => q.id);
    if (!ids.length) return;
    this._apply(M.removePlayers(this.doc, ids)); this._fixSel(); this.emit();
  }

  addPlayer(x, y, extra = {}) {
    if (this._locked()) return null;
    const team = extra.team || this.newTeam;
    if (!extra.regKey && !M.canAddPlayer(this.doc, team)) { this.toast('Máximo ' + M.MAX_PER_TEAM + ' jugadores por equipo'); return null; }
    const r = M.addPlayer(this.doc, this.fi, { x: G.clamp(x, -400, 400), y: G.clamp(y, -190, 190), team, ...extra });
    this._apply(r.doc);
    this.sel = { players: new Set([r.id]), shapes: new Set() };
    this.draw(); this.emit();
    return r.id;
  }

  // Coloca una ficha en el centro visible (para el botón "Añadir jugador")
  addPlayerCenter(extra = {}) {
    // una misma ficha no se repite: si ya está en el campo, se selecciona en vez de añadir otra
    const team = extra.team || this.newTeam;
    const dup = this.doc.players.find((q) => (q.team || 'red') === team && (extra.regKey ? q.regKey === extra.regKey : (extra.num != null && !q.regKey && Number(q.num) === Number(extra.num))));
    if (dup) { this.sel = { players: new Set([dup.id]), shapes: new Set() }; this.toast('Esa ficha ya está en el campo (seleccionada)'); this.draw(); this.emit(); return dup.id; }
    const c = G.toWorld(this.view, this.w / 2, this.h2 / 2);
    const n = this.doc.players.length;
    const x = G.clamp(c.x + ((n % 5) - 2) * 34, -360, 360), y = G.clamp(c.y + (Math.floor(n / 5) % 5 - 2) * 34, -160, 160);
    return this.addPlayer(x, y, extra);
  }

  updateSelPlayers(patch) {
    if (this._locked()) return;
    const ids = [...this.sel.players].filter((i) => i !== 'ball');
    if (!ids.length) return;
    this._apply(M.updatePlayers(this.doc, ids, patch), 'pl:' + Object.keys(patch).join(','));
  }

  updatePlayer(id, patch) { if (this._locked()) return; this._apply(M.updatePlayer(this.doc, id, patch), 'pl1:' + id + Object.keys(patch).join(',')); }

  placeBall(x, y) {
    if (this._locked()) return;
    this._apply(M.setBall(this.doc, this.fi, { x, y }));
    this.sel = { players: new Set(['ball']), shapes: new Set() };
    this.draw(); this.emit();
  }

  removeBall() { if (this._locked()) return; this._apply(M.setBall(this.doc, this.fi, null)); this._fixSel(); this.emit(); }

  // ------------------------------------------------------------ selección
  selectAll() {
    this.sel = { players: new Set(this.doc.players.map((p) => p.id)), shapes: new Set() };
    this.draw(); this.emit();
  }

  clearSel() { this.sel = { players: new Set(), shapes: new Set() }; this.draw(); this.emit(); }

  selectPlayers(ids, add = false) {
    this.sel = { players: new Set([...(add ? this.sel.players : []), ...ids]), shapes: add ? this.sel.shapes : new Set() };
    this.draw(); this.emit();
  }

  deleteSelection() {
    if (this._locked()) return;
    let d = this.doc;
    const pl = [...this.sel.players].filter((i) => i !== 'ball');
    if (this.sel.players.has('ball')) d = M.setBall(d, this.fi, null);
    if (pl.length) d = M.removePlayers(d, pl);
    const sh = [...this.sel.shapes].filter((id) => d.shapes.some((s) => s.id === id));
    if (sh.length) d = M.removeShapes(d, sh);
    this.sel = { players: new Set(), shapes: new Set() };
    this._apply(d); this.draw(); this.emit();
  }

  duplicateSelection() {
    if (this._locked()) return;
    let d = this.doc; const map = {}; const newPl = [], newSh = []; let limit = false;
    const pos = M.resolvedPos(d, this.fi);
    for (const id of this.sel.players) {
      if (id === 'ball') continue;
      const p = d.players.find((q) => q.id === id), q = pos[id]; if (!p || !q) continue;
      const r = M.addPlayer(d, this.fi, { x: q.x + 24, y: q.y + 24, team: p.team, color: p.color, role: p.role, nick: p.nick, num: p.num, regKey: null });
      if (!r.id) { limit = true; continue; }
      d = r.doc; map[id] = r.id; newPl.push(r.id);
    }
    for (const sid of this.sel.shapes) {
      const s = d.shapes.find((x) => x.id === sid); if (!s) continue;
      if (s.attach) {
        if (!s.attach.every((a) => map[a])) continue;
        const r = M.addShape(d, { ...s, id: undefined, attach: s.attach.map((a) => map[a]), pts: s.pts.map((p) => ({ ...p })) });
        d = r.doc; newSh.push(r.id);
      } else {
        const r = M.addShape(d, { ...s, id: undefined, pts: s.pts.map((p) => ({ x: p.x + 24, y: p.y + 24 })) });
        d = r.doc; newSh.push(r.id);
      }
    }
    if (limit) this.toast('Máximo ' + M.MAX_PER_TEAM + ' jugadores por equipo');
    if (!newPl.length && !newSh.length) return;
    this.sel = { players: new Set(newPl), shapes: new Set(newSh) };
    this._apply(d); this.emit();
  }

  // Coloca n jugadores por equipo en una formación base (rojo a la izquierda, azul a la derecha) en una sola acción
  addFormation(n, teams = ['red', 'blue']) {
    if (this._locked()) return;
    const L = { 1: [[-250, 0]], 2: [[-250, -60], [-250, 60]], 3: [[-310, 0], [-180, -80], [-180, 80]], 4: [[-310, 0], [-200, -95], [-200, 95], [-80, 0]], 5: [[-310, 0], [-210, -100], [-210, 100], [-100, -50], [-100, 50]] };
    const base = L[G.clamp(n, 1, 5)];
    let d = this.doc; const ids = []; let limit = false;
    for (const team of teams) {
      const sign = team === 'red' ? 1 : -1;
      const have = d.players.filter((p) => p.team === team).length;
      base.forEach(([x, y], i) => { const r = M.addPlayer(d, this.fi, { x: x * sign, y, team, num: have + i + 1 }); if (!r.id) { limit = true; return; } d = r.doc; ids.push(r.id); });
    }
    if (limit) this.toast('Máximo ' + M.MAX_PER_TEAM + ' jugadores por equipo');
    if (!ids.length) return;
    this.sel = { players: new Set(ids), shapes: new Set() };
    this._apply(d); this.emit();
  }

  // Vacía la pizarra (fichas, figuras y pasos) pero conserva nombre y descripción; se puede deshacer
  clearBoard() {
    if (this._locked()) return;
    const d = M.newDoc(this.doc.name);
    this.fi = 0; this.play.x = 0;
    this.sel = { players: new Set(), shapes: new Set() };
    this._apply({ ...d, id: this.doc.id, description: this.doc.description, category: this.doc.category, folderId: this.doc.folderId, createdAt: this.doc.createdAt, stepMs: this.doc.stepMs });
    this.emit();
  }

  // ------------------------------------------------------------ vínculos (selección múltiple inteligente)
  linkSelection() {
    if (this._locked()) return;
    const ids = this.doc.players.filter((p) => this.sel.players.has(p.id)).map((p) => p.id);
    if (ids.length < 2) { this.toast('Selecciona al menos 2 jugadores'); return; }
    // el mismo grupo de jugadores no se vincula dos veces: si ya existe esa conexión, se selecciona; con un jugador nuevo sí se crea otra
    const key = (a) => a.slice().sort().join('|');
    const same = this.doc.shapes.find((s) => s.attach && s.attach.length === ids.length && key(s.attach) === key(ids));
    if (same) { this.sel = { players: new Set(), shapes: new Set([same.id]) }; this.toast('Esos jugadores ya están conectados'); this.draw(); this.emit(); return; }
    const r = M.createLink(this.doc, this.fi, ids, { color: this.style.color, width: this.style.width, opacity: this.style.opacity, dashed: this.style.dashed, fill: true });
    if (!r.id) return;
    this.sel = { players: new Set(), shapes: new Set([r.id]) };
    this._apply(r.doc); this.emit();
  }

  unlinkSelection() {
    if (this._locked()) return;
    let d = this.doc, n = 0;
    for (const id of this.sel.shapes) { const s = d.shapes.find((x) => x.id === id); if (s && s.attach) { d = M.unlinkShape(d, id, this.fi); n++; } }
    if (n) this._apply(d); else this.toast('La figura no está vinculada');
    this.emit();
  }

  relinkSelectionShape() { // vuelve a vincular una figura libre a los jugadores seleccionados
    if (this._locked()) return;
    const sid = [...this.sel.shapes][0];
    const ids = this.doc.players.filter((p) => this.sel.players.has(p.id)).map((p) => p.id);
    if (!sid || ids.length < 2) { this.toast('Selecciona una figura y 2 o más jugadores'); return; }
    this._apply(M.relinkShape(this.doc, sid, ids)); this.emit();
  }

  // ------------------------------------------------------------ transformaciones de la selección
  _groupInfo() {
    const pos = M.resolvedPos(this.doc, this.fi);
    const pts = [];
    for (const id of this.sel.players) if (pos[id]) pts.push(pos[id]);
    const free = this.doc.shapes.filter((s) => this.sel.shapes.has(s.id) && !s.attach);
    for (const s of free) for (const p of s.pts) pts.push(p);
    return { pos, pts, free };
  }

  rotateSelection(deg) {
    if (this._locked()) return;
    const { pos, pts, free } = this._groupInfo(); if (!pts.length) return;
    const c = G.centroid(pts);
    const moves = {};
    for (const id of this.sel.players) if (pos[id]) moves[id] = G.rotatePts([pos[id]], deg, c)[0];
    let d = Object.keys(moves).length ? M.movePlayers(this.doc, this.fi, moves) : this.doc;
    d = { ...d, shapes: d.shapes.map((s) => (free.includes(s) ? { ...s, pts: G.rotatePts(s.pts, deg, c), rot: ((s.rot || 0) + deg) % 360 } : s)), updatedAt: Date.now() };
    this._apply(d, 'rot'); this.emit();
  }

  scaleSelection(f) {
    if (this._locked()) return;
    const { pos, pts, free } = this._groupInfo(); if (!pts.length) return;
    const onlyOneShape = !this.sel.players.size && free.length === 1;
    const c = G.centroid(pts);
    const moves = {};
    for (const id of this.sel.players) if (pos[id] && this.sel.players.size > 1) moves[id] = G.scalePts([pos[id]], f, c)[0];
    let d = Object.keys(moves).length ? M.movePlayers(this.doc, this.fi, moves) : this.doc;
    d = { ...d, shapes: d.shapes.map((s) => (free.includes(s) ? { ...s, pts: G.scalePts(s.pts, f, onlyOneShape ? G.centroid(s.pts) : c) } : s)), updatedAt: Date.now() };
    this._apply(d, 'scale'); this.emit();
  }

  nudge(dx, dy) {
    if (this._locked()) return;
    const { pos, free } = this._groupInfo();
    const moves = {}; for (const id of this.sel.players) if (pos[id]) moves[id] = { x: pos[id].x + dx, y: pos[id].y + dy };
    let d = Object.keys(moves).length ? M.movePlayers(this.doc, this.fi, moves) : this.doc;
    d = { ...d, shapes: d.shapes.map((s) => (free.includes(s) ? { ...s, pts: G.translatePts(s.pts, dx, dy) } : s)), updatedAt: Date.now() };
    this._apply(d, 'nudge'); this.emit();
  }

  updateSelShapes(patch) {
    if (this._locked()) return;
    const ids = [...this.sel.shapes]; if (!ids.length) return;
    this._apply(M.updateShapes(this.doc, ids, patch), 'sh:' + Object.keys(patch).join(','));
  }

  // ------------------------------------------------------------ fotogramas
  setFrame(i) {
    this.stop(); this.fi = G.clamp(i, 0, this.doc.frames.length - 1); this.play.x = this.fi;
    this.draw(); this.emit();
  }

  addFrame() {
    if (this._locked()) return;
    const r = M.addFrame(this.doc, this.fi);
    this._apply(r.doc); this.fi = r.index; this.play.x = r.index; this.draw(); this.emit();
  }

  removeFrame() {
    if (this._locked()) return;
    if (this.doc.frames.length <= 1) { this.toast('Debe quedar al menos un paso'); return; }
    const r = M.removeFrame(this.doc, this.fi);
    this._apply(r.doc); this.fi = r.index; this.play.x = r.index; this.draw(); this.emit();
  }

  renameFrame(name) { this._apply(M.renameFrame(this.doc, this.fi, name), 'frn'); }

  moveFrame(dir) {
    if (this._locked()) return;
    const to = this.fi + dir; if (to < 0 || to >= this.doc.frames.length) return;
    this._apply(M.moveFrame(this.doc, this.fi, to)); this.fi = to; this.play.x = to; this.draw(); this.emit();
  }

  setStepMs(ms) { this._apply({ ...this.doc, stepMs: G.clamp(ms, 200, 8000), updatedAt: Date.now() }, 'stepms'); }

  // ------------------------------------------------------------ reproducción
  playFrom() {
    const n = this.doc.frames.length;
    if (n < 2) { this.toast('Añade al menos un segundo paso para animar'); return; }
    if (this.play.state === 'playing') return;
    if (this.play.state === 'stopped' && this.fi >= n - 1) this.play.x = 0; // al terminar, volver a empezar
    else if (this.play.state === 'stopped') this.play.x = this.fi;
    this.play.state = 'playing'; this.play.last = 0;
    this.poly = null; this.draft = null; this.g = null;
    this._raf = requestAnimationFrame((t) => this._tick(t));
    this.emit();
  }

  pause() { if (this.play.state === 'playing') { this.play.state = 'paused'; cancelAnimationFrame(this._raf); this.emit(); } }
  resume() { if (this.play.state === 'paused') { this.play.state = 'playing'; this.play.last = 0; this._raf = requestAnimationFrame((t) => this._tick(t)); this.emit(); } }
  toggle() { if (this.play.state === 'playing') this.pause(); else if (this.play.state === 'paused') this.resume(); else this.playFrom(); }

  // Reiniciar: vuelve al primer paso y se detiene
  restart() { cancelAnimationFrame(this._raf); this.play.state = 'stopped'; this.fi = 0; this.play.x = 0; this.draw(); this.emit(); }
  stop() { if (this.play.state !== 'stopped') { cancelAnimationFrame(this._raf); this.play.state = 'stopped'; this.fi = G.clamp(Math.round(this.play.x), 0, this.doc.frames.length - 1); this.emit(); } }
  stepBy(d) { const was = this.play.state !== 'stopped'; if (was) this.stop(); this.setFrame(this.fi + d); }

  setSpeed(s) { this.play.speed = G.clamp(s, 0.1, 8); this.emit(); }
  cycleSpeed() { const i = SPEEDS.indexOf(this.play.speed); this.setSpeed(SPEEDS[(i + 1) % SPEEDS.length]); }
  setLoop(v) { this.play.loop = !!v; this.emit(); }

  // Arrastrar la barra de tiempo: x entre 0 y nPasos-1
  seek(x) {
    const n = this.doc.frames.length;
    if (this.play.state === 'playing') { cancelAnimationFrame(this._raf); this.play.state = 'paused'; }
    this.play.x = G.clamp(x, 0, n - 1);
    this.play.state = this.play.state === 'stopped' && Math.abs(this.play.x - Math.round(this.play.x)) < 1e-6 ? 'stopped' : 'paused';
    this.fi = Math.min(n - 1, Math.round(this.play.x));
    this.draw(); this.emit();
  }

  _tick(ts) {
    if (this._dead || this.play.state !== 'playing') return;
    const n = this.doc.frames.length;
    if (this.play.last) this.play.x += ((ts - this.play.last) / this.doc.stepMs) * this.play.speed;
    this.play.last = ts;
    if (this.play.x >= n - 1) {
      if (this.play.loop) this.play.x = 0;
      else { this.play.x = n - 1; this.play.state = 'stopped'; this.fi = n - 1; this.draw(); this.emit(); return; }
    }
    const prevFi = this.fi;
    this.fi = Math.min(n - 1, Math.floor(this.play.x));
    this.draw();
    if (this.hooks.onProgress) this.hooks.onProgress(this.play.x);
    if (this.fi !== prevFi) this.emit();
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }

  // ------------------------------------------------------------ punteros
  _down(e) {
    if (e.pointerType === 'mouse' && (e.button === 2 || e.button === 1)) e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 2) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignorar */ }
    const s = this._pt(e);
    this.pointers.set(e.pointerId, { x: s.x, y: s.y });
    if (this.hooks.onFocus) this.hooks.onFocus();
    if (this.pointers.size >= 2) { this._startPinch(); return; }
    if (this.g) return;
    const wp = G.toWorld(this.view, s.x, s.y);
    const panBtn = e.button === 1 || this._space || this.tool === 'pan';
    if (panBtn) { this.g = { type: 'pan', sx: s.x, sy: s.y, ox: this.view.ox, oy: this.view.oy, moved: true }; this.canvas.style.cursor = 'grabbing'; return; }
    if (this.play.state !== 'stopped') { // durante la animación solo se puede mover la vista
      this.g = { type: 'pan', sx: s.x, sy: s.y, ox: this.view.ox, oy: this.view.oy, moved: false, soft: true }; return;
    }
    const mod = e.shiftKey || e.ctrlKey || e.metaKey || this.multi;
    if (this.tool === 'select') return this._downSelect(wp, s, mod);
    this._downTool(wp, s, e);
  }

  _hitPlayer(wp) {
    const pos = M.resolvedPos(this.doc, this.fi), pad = this._tol(6);
    for (let i = this.doc.players.length - 1; i >= 0; i--) {
      const p = this.doc.players[i], q = pos[p.id];
      if (q && G.dist(wp, q) <= G.PITCH.playerR + pad) return p.id;
    }
    if (pos.ball && G.dist(wp, pos.ball) <= G.PITCH.ballR + pad) return 'ball';
    return null;
  }

  // Borrador: quita la ficha, el balón o la figura que haya bajo el dedo/ratón (un barrido = un solo «deshacer»)
  _eraseAt(wp) {
    if (this._locked()) return;
    const pid = this._hitPlayer(wp);
    let d = this.doc;
    if (pid === 'ball') d = M.setBall(d, this.fi, null);
    else if (pid) d = M.removePlayers(d, [pid]);
    else {
      const pos = M.resolvedPos(this.doc, this.fi);
      const sh = pickShape(this.doc.shapes, (x) => this._ptsOf(x, pos), wp, this._tol(10));
      if (!sh) return;
      d = M.removeShapes(d, [sh.id]);
    }
    this.sel = { players: new Set(), shapes: new Set() };
    this._apply(d, 'erase');
  }

  _ptsOf(s, pos) { return M.shapePts(s, pos || M.resolvedPos(this.doc, this.fi)); }

  _downSelect(wp, s, mod) {
    const pos = M.resolvedPos(this.doc, this.fi);
    // 1) tiradores de la figura seleccionada
    if (this._grabHandle(wp)) return;
    // 2) fichas y balón
    const pid = this._hitPlayer(wp);
    if (pid) {
      let collapse = null;
      if (mod) { if (this.sel.players.has(pid)) { this.sel.players.delete(pid); this.draw(); this.emit(); return; } this.sel.players.add(pid); } else if (!this.sel.players.has(pid)) { this.sel = { players: new Set([pid]), shapes: new Set() }; } else if (this.sel.players.size > 1 || this.sel.shapes.size) collapse = pid;
      this._startDrag(wp, s, collapse); return;
    }
    // 3) figuras
    const sh = pickShape(this.doc.shapes, (x) => this._ptsOf(x, pos), wp, this._tol(9));
    if (sh) {
      if (mod) { if (this.sel.shapes.has(sh.id)) { this.sel.shapes.delete(sh.id); this.draw(); this.emit(); return; } this.sel.shapes.add(sh.id); } else if (!this.sel.shapes.has(sh.id)) { this.sel = { players: new Set(), shapes: new Set([sh.id]) }; }
      this._startDrag(wp, s, null); return;
    }
    // 4) recuadro de selección
    this.g = { type: 'box', a: wp, sx: s.x, sy: s.y, mod, moved: false, keep: mod ? { players: new Set(this.sel.players), shapes: new Set(this.sel.shapes) } : null };
  }

  // Si hay una figura seleccionada y el dedo cae en uno de sus tiradores, empieza a editarla (con cualquier herramienta activa)
  _grabHandle(wp) {
    if (this.sel.shapes.size !== 1 || this.sel.players.size) return false;
    const sh = this.doc.shapes.find((x) => this.sel.shapes.has(x.id));
    if (!sh || sh.attach || sh.type === 'text') return false;
    const hs = handlesOf(sh, sh.pts), tol = this._tol(14);
    let bi = -1, bd = tol;
    hs.forEach((p, i) => { const d = G.dist(wp, p); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0) return false;
    this.g = { type: 'handle', id: sh.id, idx: bi, base: sh.pts.map((p) => ({ ...p })), moved: false };
    return true;
  }

  _startDrag(wp, s, collapse) {
    const pos = M.resolvedPos(this.doc, this.fi);
    const base = {}; for (const id of this.sel.players) if (pos[id]) base[id] = { ...pos[id] };
    for (const sh of this.doc.shapes) if (this.sel.shapes.has(sh.id) && sh.attach) for (const id of sh.attach) if (pos[id]) base[id] = { ...pos[id] };
    const sbase = {}; for (const sh of this.doc.shapes) if (this.sel.shapes.has(sh.id) && !sh.attach) sbase[sh.id] = sh.pts.map((p) => ({ ...p }));
    this.g = { type: 'drag', a: wp, sx: s.x, sy: s.y, base, sbase, collapse, moved: false, cp: false };
    this.draw(); this.emit();
  }

  _snapPoint(wp) {
    if (!this.snap) return wp;
    const pos = M.resolvedPos(this.doc, this.fi); let best = null, bd = this._tol(16);
    for (const p of this.doc.players) { const q = pos[p.id]; if (q) { const d = G.dist(wp, q); if (d < bd) { bd = d; best = q; } } }
    if (pos.ball) { const d = G.dist(wp, pos.ball); if (d < bd) best = pos.ball; }
    return best ? { x: best.x, y: best.y } : wp;
  }

  _downTool(wp, s, e) {
    const t = this.tool;
    if (t === 'erase' || t === 'player' || t === 'ball' || t === 'text') this._inst = { t: performance.now(), h: this.h };
    if (t === 'shadowpick') { // elegir quién proyecta sombra: toca una ficha para sumarla o quitarla
      const id = this._hitPlayer(wp);
      if (id && id !== 'ball') { if (this.shadowIds.has(id)) this.shadowIds.delete(id); else this.shadowIds.add(id); this.shadow = true; this.draw(); this.emit(); }
      return;
    }
    if (t === 'erase') { this.g = { type: 'erase', moved: true }; this._eraseAt(wp); return; }
    if (t === 'player') { if (this._hitPlayer(wp)) { this._downSelect(wp, s, false); return; } this.addPlayer(wp.x, wp.y); return; }
    if (t === 'ball') { this.placeBall(wp.x, wp.y); this.setTool('select'); return; }
    if (t === 'text') {
      const r = M.addShape(this.doc, { type: 'text', pts: [wp], label: 'Texto', color: this.style.color, width: Math.max(3, this.style.width), opacity: this.style.opacity });
      this._apply(r.doc); this.sel = { players: new Set(), shapes: new Set([r.id]) }; this.setTool('select');
      if (this.hooks.onFocusLabel) this.hooks.onFocusLabel();
      return;
    }
    if (!this.poly && (DRAW_TOOLS.has(t) || POLY_TOOLS.has(t)) && this._grabHandle(wp)) return;
    if (POLY_TOOLS.has(t)) { this._polyTap(wp, s); return; }
    if (DRAW_TOOLS.has(t)) {
      const a = ['line', 'dline', 'arrow', 'carrow'].includes(t) ? this._snapPoint(wp) : wp;
      this.g = { type: 'draw', a, tool: t, moved: false, sx: s.x, sy: s.y, trail: [] };
      this.draft = this._mkDraft(t, a, a);
      this.draw();
    }
  }

  _mkDraft(t, a, b, bend = 0) {
    const st = this.style;
    const base = { id: 'draft', color: st.color, width: st.width, opacity: st.opacity, fill: st.fill, dashed: st.dashed, label: '', attach: null, rot: 0 };
    switch (t) {
      case 'pen': return { ...base, type: 'pen', pts: [a] };
      case 'line': return { ...base, type: 'line', pts: [a, b] };
      case 'dline': return { ...base, type: 'dline', pts: [a, b], dashed: true };
      case 'arrow': return { ...base, type: 'arrow', pts: [a, b] };
      case 'carrow': return { ...base, type: 'carrow', thru: true, pts: [a, G.curveMid(a, b, bend), b] };
      case 'rect': return { ...base, type: 'rect', pts: G.boxPts(a, b) };
      case 'oval': return { ...base, type: 'oval', pts: G.ellipsePts(a, b, 8) };
      default: return null;
    }
  }

  // Flecha curva: la curva dobla hacia el lado por el que se desvió el dedo respecto a la línea recta (a→b)
  _bendFor(g, wp, b) {
    g.trail.push(wp); if (g.trail.length > 400) g.trail.shift();
    const len = G.dist(g.a, b); if (len < 1) return 0;
    let dev = 0;
    for (const q of g.trail) { const d = G.chordDev(g.a, b, q); if (Math.abs(d) > Math.abs(dev)) dev = d; }
    if (Math.abs(dev) < Math.max(8, len * 0.07)) return 0.11 * len; // trazo casi recto: curva suave por defecto
    return G.clamp(dev * 0.5, -0.3 * len, 0.3 * len); // la curva sigue la intención del dedo pero más suave
  }

  // ---- polígonos: un toque = un vértice
  _polyTap(wp, s) {
    const now = Date.now(), lt = this._lastTap;
    const dbl = now - lt.t < 350 && Math.hypot(s.x - lt.x, s.y - lt.y) < 18;
    this._lastTap = { t: now, x: s.x, y: s.y };
    if (!this.poly) { this.poly = { pts: [wp], cursor: wp }; this.emit(); this.draw(); return; }
    if (dbl) { this.finishPoly(); return; }
    const first = this.poly.pts[0];
    if (this.poly.pts.length >= 3 && G.dist(wp, first) < this._tol(14)) { this.finishPoly(); return; }
    this.poly.pts.push(wp); this.poly.cursor = wp; this.draw(); this.emit();
  }

  finishPoly() {
    if (!this.poly) return;
    let pts = this.poly.pts.slice();
    this.poly = null;
    // un doble toque deja el último vértice repetido: se descarta
    while (pts.length > 1 && G.dist(pts[pts.length - 1], pts[pts.length - 2]) < this._tol(6)) pts.pop();
    if (pts.length < 3) { this.toast('Un polígono necesita al menos 3 vértices'); this.draw(); this.emit(); return; }
    if (G.selfIntersects(pts)) { pts = G.untangle(pts); this.toast('Ordené los vértices para que la figura no se cruce'); }
    const st = this.style;
    const r = M.addShape(this.doc, { type: 'polygon', pts, color: st.color, width: st.width, opacity: st.opacity, fill: st.fill, dashed: st.dashed });
    this._apply(r.doc); this.sel = { players: new Set(), shapes: new Set([r.id]) };
    this.setTool('select');
  }

  cancelPoly() { this.poly = null; this.draw(); this.emit(); }
  undoPolyPoint() { if (this.poly && this.poly.pts.length > 1) { this.poly.pts.pop(); this.draw(); this.emit(); } else this.cancelPoly(); }

  _dbl(e) { if (this.poly && this.pointers.size === 0) { e.preventDefault(); this.finishPoly(); } }

  // Deshace lo que un arrastre en curso ya había cambiado (sin dejar "rehacer" fantasma)
  _revertGesture() {
    const g = this.g;
    if (g && (g.type === 'drag' || g.type === 'handle') && g.cp) { this.h = { ...M.undo(this.h), future: [] }; this._changed(); }
  }

  _startPinch() {
    const now = performance.now(), prev = this.g && this.g.type === 'pinch' ? this.g : null;
    // Un toque con dos dedos = deshacer; con tres = rehacer. Si el primer dedo acababa de colocar algo, eso también se descarta.
    if (!prev && this._inst && now - this._inst.t < 500) { this.h = this._inst.h; this._fixSel(); this._changed(); this.emit(); }
    this._inst = null;
    this._revertGesture(); // el gesto de un dedo se descarta al empezar un pellizco
    this.g = null; this.draft = null; this.box = null;
    const pts = [...this.pointers.values()], [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.g = { type: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), k0: this.view.k, w0: G.toWorld(this.view, mid.x, mid.y),
      t0: prev ? prev.t0 : now, n: pts.length, start: pts.map((q) => ({ ...q })), moved: prev ? prev.moved : false };
    this.userView = true; this.draw();
  }

  _move(e) {
    const s = this._pt(e);
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: s.x, y: s.y });
    const g = this.g;
    if (!g) {
      if (this.poly && e.pointerType === 'mouse') { this.poly.cursor = G.toWorld(this.view, s.x, s.y); this.draw(); }
      return;
    }
    const wp = G.toWorld(this.view, s.x, s.y);
    if (g.type === 'erase') { this._eraseAt(wp); return; }
    if (g.type === 'pinch') {
      if (this.pointers.size < 2) return;
      const cur = [...this.pointers.values()];
      if (!g.moved && cur.some((q, i) => g.start[i] && Math.hypot(q.x - g.start[i].x, q.y - g.start[i].y) > 14)) g.moved = true;
      const [a, b] = cur;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = G.clamp(g.k0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0), G.K_MIN, G.K_MAX);
      this.view = G.clampView({ k, ox: mid.x - g.w0.x * k, oy: mid.y - g.w0.y * k }, this.w, this.h2);
      this.draw(); return;
    }
    if (g.type === 'pan') {
      if (g.soft && Math.hypot(s.x - g.sx, s.y - g.sy) > 4) g.moved = true;
      if (!g.moved && g.soft) return;
      this.userView = true;
      this.view = G.clampView({ k: this.view.k, ox: g.ox + (s.x - g.sx), oy: g.oy + (s.y - g.sy) }, this.w, this.h2);
      this.draw(); return;
    }
    if (g.type === 'drag') {
      if (!g.moved && Math.hypot(s.x - g.sx, s.y - g.sy) < 4) return;
      if (!g.cp) { this.h = M.checkpoint(this.h); g.cp = true; }
      g.moved = true;
      const dx = wp.x - g.a.x, dy = wp.y - g.a.y;
      const moves = {}; for (const id of Object.keys(g.base)) moves[id] = { x: g.base[id].x + dx, y: g.base[id].y + dy };
      let d = Object.keys(moves).length ? M.movePlayers(this.doc, this.fi, moves) : this.doc;
      if (Object.keys(g.sbase).length) d = M.moveShapes(d, Object.keys(g.sbase), dx, dy, g.sbase);
      this.h = M.replace(this.h, d); this.draw(); return;
    }
    if (g.type === 'handle') {
      if (!g.cp) { this.h = M.checkpoint(this.h); g.cp = true; }
      g.moved = true;
      const sh = this.doc.shapes.find((x) => x.id === g.id); if (!sh) return;
      let pts = g.base.map((p) => ({ ...p }));
      const q = this._snapPoint(wp);
      pts[g.idx] = (sh.type === 'carrow' && g.idx === 1) ? wp : q;
      this.h = M.replace(this.h, { ...this.doc, shapes: this.doc.shapes.map((x) => (x.id === g.id ? { ...x, pts } : x)), updatedAt: Date.now() });
      this.draw(); return;
    }
    if (g.type === 'box') {
      if (!g.moved && Math.hypot(s.x - g.sx, s.y - g.sy) < 5) return;
      g.moved = true;
      this.box = { x0: Math.min(g.a.x, wp.x), y0: Math.min(g.a.y, wp.y), x1: Math.max(g.a.x, wp.x), y1: Math.max(g.a.y, wp.y) };
      this.draw(); return;
    }
    if (g.type === 'draw') {
      if (!g.moved && Math.hypot(s.x - g.sx, s.y - g.sy) < 3) return;
      g.moved = true;
      if (g.tool === 'pen') { const l = this.draft.pts[this.draft.pts.length - 1]; if (G.dist(l, wp) > this._tol(2.5)) this.draft = { ...this.draft, pts: [...this.draft.pts, wp] }; } else {
        let b = wp;
        if (e.shiftKey && (g.tool === 'line' || g.tool === 'dline' || g.tool === 'arrow')) { // ángulos de 15°
          const ang = Math.round(Math.atan2(wp.y - g.a.y, wp.x - g.a.x) / (Math.PI / 12)) * (Math.PI / 12), d = G.dist(g.a, wp);
          b = { x: g.a.x + Math.cos(ang) * d, y: g.a.y + Math.sin(ang) * d };
        } else if (['line', 'dline', 'arrow', 'carrow'].includes(g.tool)) b = this._snapPoint(wp);
        let bend = 0;
        if (g.tool === 'carrow') bend = this._bendFor(g, wp, b);
        this.draft = this._mkDraft(g.tool, g.a, b, bend);
      }
      this.draw();
    }
  }

  _up(e, cancelled) {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (x) { /* ignorar */ }
    const g = this.g; if (!g) return;
    if (g.type === 'pinch') {
      if (this.pointers.size < 2) {
        const tap = !g.moved && performance.now() - g.t0 < 450;
        this.g = null;
        if (tap) { if (g.n >= 3) this.redo(); else this.undo(); if (this.hooks.onToast) this.hooks.onToast(g.n >= 3 ? 'Rehecho' : 'Deshecho'); }
        this.emit();
      }
      return;
    }
    if (!had) return;
    this.g = null;
    if (this.tool === 'pan' || g.type === 'pan') this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : this.tool === 'select' ? 'default' : 'crosshair';
    const s = this._pt(e), wp = G.toWorld(this.view, s.x, s.y);
    if (g.type === 'pan' || g.type === 'erase') { this.emit(); return; }
    if (g.type === 'drag') {
      if (cancelled && g.cp) { this.g = g; this._revertGesture(); this.g = null; } else if (g.moved) { this._co = { key: null, t: 0 }; this._changed(); } else if (g.collapse) { this.sel = { players: new Set([g.collapse]), shapes: new Set() }; }
      this.draw(); this.emit(); return;
    }
    if (g.type === 'handle') { if (g.moved) { this._co = { key: null, t: 0 }; this._changed(); } this.draw(); this.emit(); return; }
    if (g.type === 'box') {
      this.box = null;
      if (!g.moved) { if (!g.mod) this.sel = { players: new Set(), shapes: new Set() }; } else {
        const r = { x0: Math.min(g.a.x, wp.x), y0: Math.min(g.a.y, wp.y), x1: Math.max(g.a.x, wp.x), y1: Math.max(g.a.y, wp.y) };
        const pos = M.resolvedPos(this.doc, this.fi);
        const pl = new Set(g.keep ? g.keep.players : []), sh = new Set(g.keep ? g.keep.shapes : []);
        for (const p of this.doc.players) { const q = pos[p.id]; if (q && q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1) pl.add(p.id); }
        if (pos.ball && pos.ball.x >= r.x0 && pos.ball.x <= r.x1 && pos.ball.y >= r.y0 && pos.ball.y <= r.y1) pl.add('ball');
        for (const x of this.doc.shapes) if (shapeInRect(this._ptsOf(x, pos), r)) sh.add(x.id);
        this.sel = { players: pl, shapes: sh };
      }
      this.draw(); this.emit(); return;
    }
    if (g.type === 'draw') {
      const d = this.draft; this.draft = null;
      if (cancelled || !d) { this.draw(); return; }
      let ok = g.moved;
      let pts = d.pts;
      if (g.tool === 'pen') { pts = G.simplify(pts, this._tol(1.6)); ok = ok && pts.length >= 2; } else if (['line', 'dline', 'arrow', 'carrow'].includes(g.tool)) ok = ok && G.dist(pts[0], pts[pts.length - 1]) > 4;
      else { const bb = G.bbox(pts); ok = ok && (bb.x1 - bb.x0 > 6 || bb.y1 - bb.y0 > 6); }
      if (ok) {
        const r = M.addShape(this.doc, { ...d, id: undefined, pts });
        this._apply(r.doc);
        this.sel = { players: new Set(), shapes: new Set(g.tool === 'pen' ? [] : [r.id]) };
      }
      this.draw(); this.emit();
    }
  }

  // ------------------------------------------------------------ teclado
  _typing(e) { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (e.target && e.target.isContentEditable); }

  _keyup(e) { if (e.code === 'Space') { this._space = false; } }

  _key(e) {
    if (this._dead || this._typing(e)) return;
    // Solo reaccionar si la pizarra está visible
    if (!this.canvas.offsetParent) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key;
    if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); return; }
    if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); this.redo(); return; }
    if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); this.selectAll(); return; }
    if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); this.duplicateSelection(); return; }
    if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); if (this.hooks.onSave) this.hooks.onSave(); return; }
    if (ctrl) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) { this._space = true; } return; }
    if (k === 'Backspace' && this.poly) { e.preventDefault(); this.undoPolyPoint(); return; }
    if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); this.deleteSelection(); return; }
    if (k === 'Escape') { if (this.poly) this.cancelPoly(); else if (this.tool !== 'select') this.setTool('select'); else this.clearSel(); return; }
    if (k === 'Enter') { if (this.poly) { e.preventDefault(); this.finishPoly(); } return; }
    const step = e.shiftKey ? 10 : 2;
    if (k === 'ArrowLeft') { e.preventDefault(); this.nudge(-step, 0); return; }
    if (k === 'ArrowRight') { e.preventDefault(); this.nudge(step, 0); return; }
    if (k === 'ArrowUp') { e.preventDefault(); this.nudge(0, -step); return; }
    if (k === 'ArrowDown') { e.preventDefault(); this.nudge(0, step); return; }
    if (k === '+' || k === '=') { this.zoomBy(1.2); return; }
    if (k === '-' || k === '_') { this.zoomBy(1 / 1.2); return; }
    if (k === '0') { this.fit(); return; }
    if (k === 'p' || k === 'P') { this.toggle(); return; }
    if (k === ',') { this.stepBy(-1); return; }
    if (k === '.') { this.stepBy(1); return; }
    const map = { v: 'select', h: 'pan', b: 'pen', l: 'line', a: 'arrow', c: 'carrow', r: 'rect', o: 'oval', g: 'polygon', f: 'player', n: 'text' };
    const t = map[k.toLowerCase()]; if (t) { this.setTool(t); }
  }

  // ------------------------------------------------------------ dibujado
  draw() {
    if (this._dead || this._raf2) return;
    this._raf2 = requestAnimationFrame(() => { this._raf2 = 0; this._paint(); });
  }

  _paint() {
    if (this._dead) return;
    if (G.setPitch(this.doc.field || null)) { this.userView = false; this.view = G.fitView(this.w, this.h2, this.viewMode); this.emit(); }
    const ctx = this.ctx, d = this.doc;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const playing = this.play.state !== 'stopped';
    let pos = null, fi = this.fi;
    if (playing || Math.abs(this.play.x - Math.round(this.play.x)) > 1e-6) { const a = M.animPos(d, this.play.x); pos = a.pos; fi = a.fi; }
    let poly = null;
    if (this.poly) {
      const pts = this.poly.pts.concat(this.poly.cursor && this.poly.cursor !== this.poly.pts[this.poly.pts.length - 1] ? [this.poly.cursor] : []);
      poly = { id: 'poly', type: pts.length >= 3 ? 'polygon' : 'line', pts, color: this.style.color, width: 2, opacity: 0.9, fill: pts.length >= 3, dashed: true, label: '', attach: null };
    }
    drawScene(ctx, this.view, this.w, this.h2, {
      doc: d, fi, pos, selPlayers: playing ? null : this.sel.players, selShapes: playing ? null : this.sel.shapes,
      draft: this.draft || poly, box: this.box, trails: this.trails, ghost: this.ghost && !playing, names: this.names, shadow: this.shadow, shadowIds: this.shadowIds
    });
    if (this.poly) { // marca de los vértices ya puestos
      ctx.save(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#C89A3D'; ctx.lineWidth = 2;
      for (const p of this.poly.pts) { const s = G.toScreen(this.view, p); ctx.beginPath(); ctx.arc(s.x, s.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
  }
}

export { SPEEDS };
export { isClosed };
