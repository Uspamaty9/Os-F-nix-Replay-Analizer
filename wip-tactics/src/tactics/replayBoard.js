// Pizarra SOBRE LA REPETICIÓN.
//
// Una capa transparente que se pone encima de la cancha de la repetición para dibujar jugadas, colocar fichas rojas/azules,
// marcar zonas, borrar y sacar una captura. NO modifica el partido ni el motor (game2.js): solo dibuja encima.
// Se engancha al botón de la vista de repetición observando el DOM, igual que hacen los demás botones flotantes de la app.
import './replayBoard.scss';
import { iconSvg } from './icons';
import { saveBlob, fileName } from './exporter';

const COLORS = ['#F5C542', '#FFFFFF', '#E56E6E', '#5689E5', '#4CC38A', '#B07CFF'];
const TEAM = { red: '#E56E6E', blue: '#5689E5' };
const TOOLS = [
  { id: 'hand', icon: 'pan', label: 'Mover repetición' },
  { id: 'pen', icon: 'pen', label: 'Lápiz' },
  { id: 'arrow', icon: 'arrow', label: 'Flecha' },
  { id: 'circle', icon: 'circle', label: 'Zona' },
  { id: 'red', team: 'red', label: 'Ficha roja' },
  { id: 'blue', team: 'blue', label: 'Ficha azul' },
  { id: 'ball', icon: 'ball', label: 'Balón' },
  { id: 'erase', icon: 'erase', label: 'Borrador' }
];

// ---------- anclaje al campo ----------
// Todo lo que se dibuja se guarda en COORDENADAS DEL CAMPO (unidades de HaxBall), no de la pantalla.
// La vista de la repetición publica su cámara en window.__fenixView ({camX, camY, k, W, H, h}); con ella se convierte
// pantalla <-> campo en cada fotograma, así cada raya queda en el sitio del campo donde se puso aunque la cámara se mueva, siga a un jugador o haga zoom.
const TOKEN_R = 16, BALL_R = 11; // radios en unidades de campo (un jugador de HaxBall mide 15)
export function viewOk(v) { return !!v && v.k > 0 && isFinite(v.k) && v.W > 0 && v.H > 0 && isFinite(v.camX) && isFinite(v.camY); }
// Proyección campo -> píxeles de un canvas de ancho `sc`·(píxeles del motor). sc = 1 para el canvas del motor.
export function makeProj(v, sc) {
  const s = v.k * sc, ox = (v.W / 2) * sc, oy = ((v.H + (v.h || 0)) / 2) * sc;
  return { s, X: (wx) => ox + (wx - v.camX) * s, Y: (wy) => oy + (wy - v.camY) * s };
}
// píxeles del motor -> campo
export function toField(v, px, py) { return { x: v.camX + (px - v.W / 2) / v.k, y: v.camY + (py - (v.H + (v.h || 0)) / 2) / v.k }; }

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// ---------- dibujo (también sirve para la captura) ----------
export function drawItems(ctx, items, P, draft) {
  if (!P) return;
  const s = P.s, px = (q) => ({ x: P.X(q.x), y: P.Y(q.y) }), tr = Math.max(7, TOKEN_R * s), lw = Math.max(2, 3.4 * s);
  const all = draft ? items.concat([draft]) : items;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const it of all) {
    ctx.strokeStyle = it.color; ctx.fillStyle = it.color; ctx.lineWidth = lw;
    if (it.type === 'pen' && it.pts.length) {
      ctx.beginPath(); it.pts.forEach((q, i) => { const p = px(q); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (it.pts.length === 1) { const p = px(it.pts[0]); ctx.lineTo(p.x + 0.1, p.y); }
      ctx.stroke();
    } else if (it.type === 'arrow') {
      const a = px(it.a), b = px(it.b), L = dist(a, b); if (L < 2) continue;
      const ang = Math.atan2(b.y - a.y, b.x - a.x), hd = Math.min(L * 0.5, Math.max(10, 28 * s));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang) * hd * 0.6, b.y - Math.sin(ang) * hd * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - hd * Math.cos(ang - 0.45), b.y - hd * Math.sin(ang - 0.45)); ctx.lineTo(b.x - hd * Math.cos(ang + 0.45), b.y - hd * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
    } else if (it.type === 'circle') {
      const c = px(it.c), r = it.r * s; if (r < 1) continue;
      ctx.save(); ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    } else if (it.type === 'token') {
      const p = px(it.p);
      ctx.beginPath(); ctx.arc(p.x, p.y, tr, 0, Math.PI * 2); ctx.fillStyle = TEAM[it.team]; ctx.fill();
      ctx.lineWidth = Math.max(2, tr * 0.18); ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = '700 ' + Math.round(tr * 1.05) + 'px Poppins, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(it.n), p.x, p.y + tr * 0.06);
    } else if (it.type === 'ball') {
      const p = px(it.p), r = Math.max(5, BALL_R * s);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.3); ctx.strokeStyle = '#111'; ctx.stroke();
    }
  }
  ctx.restore();
}

// p y tol en píxeles de pantalla (mismo sistema que la proyección P)
function hit(it, p, P, tol) {
  const px = (q) => ({ x: P.X(q.x), y: P.Y(q.y) }), s = P.s;
  if (it.type === 'token') return dist(p, px(it.p)) <= Math.max(7, TOKEN_R * s) + tol;
  if (it.type === 'ball') return dist(p, px(it.p)) <= Math.max(5, BALL_R * s) + tol;
  if (it.type === 'circle') return dist(p, px(it.c)) <= it.r * s + tol;
  if (it.type === 'arrow') return segDist(p, px(it.a), px(it.b)) <= tol;
  if (it.type === 'pen') { for (let i = 0; i < it.pts.length; i++) { const a = px(it.pts[i]), b = px(it.pts[Math.min(i + 1, it.pts.length - 1)]); if (segDist(p, a, b) <= tol) return true; } }
  return false;
}

// ---------- capa por repetición ----------
function makeLayer(host, canvas) {
  const st = { tool: 'pen', color: COLORS[0], items: [], redo: [], draft: null, open: false, drawing: null, toastT: 0 };
  const layer = document.createElement('div'); layer.className = 'rb-layer'; layer.hidden = true;
  const cv = document.createElement('canvas'); cv.className = 'rb-canvas'; layer.appendChild(cv);
  const bar = document.createElement('div'); bar.className = 'rb-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Pizarra sobre la repetición');
  const toast = document.createElement('div'); toast.className = 'rb-toast'; toast.setAttribute('role', 'status');
  layer.appendChild(bar); layer.appendChild(toast);
  host.appendChild(layer);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  const say = (t) => { toast.textContent = t; toast.classList.add('on'); clearTimeout(st.toastT); st.toastT = setTimeout(() => toast.classList.remove('on'), 1800); };
  const place = () => { // la capa cubre exactamente la cancha de la repetición
    const hr = host.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return;
    layer.style.left = cr.left - hr.left + 'px'; layer.style.top = cr.top - hr.top + 'px'; layer.style.width = cr.width + 'px'; layer.style.height = cr.height + 'px';
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    if (Math.abs(cr.width - W) > 0.5 || Math.abs(cr.height - H) > 0.5 || d !== dpr) { W = cr.width; H = cr.height; dpr = d; cv.width = Math.round(W * d); cv.height = Math.round(H * d); draw(); }
  };
  const fview = () => { const v = window.__fenixView; return viewOk(v) ? v : null; };
  // proyección campo -> píxeles CSS de la capa (la capa cubre exactamente el canvas del motor)
  const projCss = () => { const v = fview(); if (!v) return null; return makeProj(v, W / (v.W || canvas.width || 1)); };
  let lastSig = '';
  const sigOf = () => { const v = window.__fenixView; return v ? [v.camX, v.camY, v.k, v.W, v.H, v.h, W, H, dpr].join('|') : 'x'; };
  function draw() { lastSig = sigOf(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); drawItems(ctx, st.items, projCss(), st.draft); }
  // pantalla (clientX/Y) -> campo, con la cámara de ESTE instante
  const norm = (e) => { const v = fview(); if (!v) return null; const r = cv.getBoundingClientRect(); return toField(v, (e.clientX - r.left) * (v.W / (r.width || 1)), (e.clientY - r.top) * (v.H / (r.height || 1))); };
  const scr = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const push = (items) => { st.items = items; st.redo = []; renderBar(); draw(); ensureLoop(); };
  const count = (team) => st.items.filter((i) => i.type === 'token' && i.team === team).length;

  function renderBar() {
    const colorBtns = COLORS.map((c) => '<button type="button" class="rb-col' + (c === st.color ? ' on' : '') + '" data-color="' + c + '" style="--c:' + c + '" aria-label="Color ' + c + '"></button>').join('');
    bar.innerHTML =
      '<div class="rb-row">' + TOOLS.map((t) => '<button type="button" class="rb-t' + (st.tool === t.id ? ' on' : '') + (t.team ? ' team ' + t.team : '') + '" data-tool="' + t.id + '" aria-pressed="' + (st.tool === t.id) + '" aria-label="' + t.label + '" title="' + t.label + '">' + (t.team ? '<i></i>' : iconSvg(t.icon, 22)) + '<span>' + t.label.replace('Ficha ', '').replace('Mover repetición', 'Mover') + '</span></button>').join('') + '</div>' +
      '<div class="rb-row sec">' + colorBtns +
      '<span class="rb-sep"></span>' +
      '<button type="button" class="rb-a" data-act="undo" aria-label="Deshacer"' + (st.items.length ? '' : ' disabled') + '>' + iconSvg('undo', 20) + '<span>Deshacer</span></button>' +
      '<button type="button" class="rb-a danger' + (st.confirm ? ' on' : '') + '" data-act="clear" aria-label="Limpiar todo"' + (st.items.length ? '' : ' disabled') + '>' + iconSvg('trash', 20) + '<span>' + (st.confirm ? '¿Seguro?' : 'Limpiar') + '</span></button>' +
      '<button type="button" class="rb-a" data-act="shot" aria-label="Guardar captura">' + iconSvg('image', 20) + '<span>Captura</span></button>' +
      '<button type="button" class="rb-a close" data-act="close" aria-label="Cerrar pizarra">' + iconSvg('check', 20) + '<span>Listo</span></button></div>';
    cv.style.pointerEvents = st.open && st.tool !== 'hand' ? 'auto' : 'none';
    cv.style.cursor = st.tool === 'erase' ? 'cell' : 'crosshair';
  }

  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) { st.tool = b.dataset.tool; st.confirm = false; renderBar(); say(TOOLS.find((t) => t.id === st.tool).label); return; }
    if (b.dataset.color) { st.color = b.dataset.color; if (['red', 'blue', 'ball', 'erase', 'hand'].includes(st.tool)) st.tool = 'pen'; renderBar(); return; }
    const a = b.dataset.act;
    if (a === 'undo') { if (st.items.length) { st.redo.push(st.items[st.items.length - 1]); st.items = st.items.slice(0, -1); renderBar(); draw(); } }
    else if (a === 'clear') { if (!st.items.length) return; if (st.confirm) { st.confirm = false; push([]); say('Todo borrado'); } else { st.confirm = true; renderBar(); clearTimeout(st.cT); st.cT = setTimeout(() => { st.confirm = false; renderBar(); }, 3000); } }
    else if (a === 'shot') shot();
    else if (a === 'close') api.close();
  });

  // ---- gestos de dibujo
  cv.addEventListener('pointerdown', (e) => {
    if (!st.open || st.tool === 'hand') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
    const p = norm(e), t = st.tool;
    if (!p) { say('La vista aún no está lista'); return; }
    st.confirm = false;
    if (t === 'red' || t === 'blue') { push(st.items.concat([{ type: 'token', team: t, p, n: count(t) + 1 }])); return; }
    if (t === 'ball') { push(st.items.filter((i) => i.type !== 'ball').concat([{ type: 'ball', p }])); return; }
    if (t === 'erase') { st.drawing = { id: e.pointerId, erase: true }; eraseAt(scr(e)); return; }
    st.drawing = { id: e.pointerId };
    st.draft = t === 'pen' ? { type: 'pen', color: st.color, pts: [p] } : t === 'arrow' ? { type: 'arrow', color: st.color, a: p, b: p } : { type: 'circle', color: st.color, c: p, r: 0 };
    draw();
  });
  function eraseAt(p) {
    const P = projCss(); if (!P) return;
    const tol = Math.max(10, Math.min(W, H) * 0.03);
    for (let i = st.items.length - 1; i >= 0; i--) if (hit(st.items[i], p, P, tol)) { const it = st.items.slice(); it.splice(i, 1); st.items = it; st.redo = []; renderBar(); draw(); return; }
  }
  cv.addEventListener('pointermove', (e) => {
    const d = st.drawing; if (!d || d.id !== e.pointerId) return;
    if (d.erase) { eraseAt(scr(e)); return; }
    const p = norm(e), v = fview(); if (!p || !v) return;
    if (st.draft.type === 'pen') { const l = st.draft.pts[st.draft.pts.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) * v.k * (W / v.W) > 2) st.draft.pts.push(p); }
    else if (st.draft.type === 'arrow') st.draft.b = p;
    else st.draft.r = Math.hypot(p.x - st.draft.c.x, p.y - st.draft.c.y);
    draw();
  });
  const end = (e, cancel) => {
    const d = st.drawing; if (!d || d.id !== e.pointerId) return;
    st.drawing = null;
    try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* nada */ }
    if (d.erase) return;
    const it = st.draft; st.draft = null;
    const v = fview(), k = v ? v.k * (W / v.W) : 1; // unidades de campo -> píxeles de pantalla
    const ok = !cancel && it && (it.type === 'pen' ? it.pts.length > 1 : it.type === 'arrow' ? dist(it.a, it.b) * k > 8 : it.r * k > 6);
    if (ok) push(st.items.concat([it])); else draw();
  };
  cv.addEventListener('pointerup', (e) => end(e, false));
  cv.addEventListener('pointercancel', (e) => end(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- captura: imagen de la repetición + lo dibujado
  async function shot() {
    try {
      const w = canvas.width || Math.round(W), h = canvas.height || Math.round(H);
      const out = document.createElement('canvas'); out.width = w; out.height = h; const o = out.getContext('2d');
      o.fillStyle = '#111'; o.fillRect(0, 0, w, h);
      try { o.drawImage(canvas, 0, 0, w, h); } catch (x) { /* si no se puede copiar la cancha, queda solo el dibujo */ }
      const v = fview(); if (v) drawItems(o, st.items, makeProj(v, w / (v.W || w)), null);
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      if (!blob) throw new Error('sin imagen');
      await saveBlob(blob, fileName({ name: 'Repeticion' }, 'pizarra-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), 'png'), 'image/png');
      say('Captura guardada');
    } catch (e) { say('No se pudo guardar la captura'); }
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  if (ro) { ro.observe(canvas); ro.observe(host); }
  window.addEventListener('resize', place);
  // Mientras haya dibujos (aunque la pizarra esté cerrada) se vuelve a pintar cuando la cámara cambia: siguen pegados al campo.
  let raf = 0;
  const tick = () => {
    raf = 0;
    if (!(st.open || st.items.length || st.draft)) return;
    place(); if (sigOf() !== lastSig) draw();
    raf = requestAnimationFrame(tick);
  };
  const ensureLoop = () => { if (!raf) raf = requestAnimationFrame(tick); };

  // ---- botón «Atrás» de Android: primero cierra la pizarra
  let prevBack = null;
  const myBack = () => { if (st.open) { api.close(); return 'ok'; } return prevBack ? prevBack() : undefined; };

  const api = {
    layer, st,
    open() { if (st.open) return; st.open = true; layer.hidden = false; layer.classList.add('open'); document.body.classList.add('rb-open'); renderBar(); place(); ensureLoop(); prevBack = window.__fenixBack; window.__fenixBack = myBack; },
    close() { if (!st.open) return; st.open = false; layer.classList.remove('open'); document.body.classList.remove('rb-open'); cv.style.pointerEvents = 'none'; ensureLoop(); if (window.__fenixBack === myBack) window.__fenixBack = prevBack; prevBack = null; layer.hidden = !st.items.length; place(); },
    toggle() { st.open ? api.close() : api.open(); },
    destroy() { try { ro && ro.disconnect(); window.removeEventListener('resize', place); cancelAnimationFrame(raf); if (window.__fenixBack === myBack) window.__fenixBack = prevBack; layer.remove(); } catch (e) { /* nada */ } }
  };
  cv.style.pointerEvents = 'none';
  return api;
}

// ---------- instalación: botón dentro de la vista de repetición ----------
let installed = false, cur = null;
export function installReplayBoard() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const sync = () => {
    const fit = document.querySelector('.fenix-fit');
    const host = fit && fit.parentElement;
    if (!host) { if (cur && !cur.host.isConnected) { cur.api.destroy(); cur = null; } return; }
    if (cur && cur.host === host && cur.btn.isConnected) return;
    if (cur) { cur.api.destroy(); cur.btn.remove(); cur = null; }
    const canvas = host.querySelector('canvas'); if (!canvas) return;
    const api = makeLayer(host, canvas);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rb-btn'; btn.setAttribute('aria-label', 'Pizarra táctica sobre la repetición');
    btn.innerHTML = iconSvg('board', 24);
    const stop = (e) => e.stopPropagation();
    btn.addEventListener('pointerdown', stop); btn.addEventListener('touchstart', stop, { passive: true });
    btn.addEventListener('click', (e) => { e.stopPropagation(); api.toggle(); btn.classList.toggle('on', api.st.open); });
    host.appendChild(btn);
    cur = { host, btn, api };
    window.__fenixReplayBoard = api;
  };
  const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(sync, 120); });
  mo.observe(document.body, { childList: true, subtree: true });
  sync();
}
