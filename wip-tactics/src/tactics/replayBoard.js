// Pizarra SOBRE LA REPETICIÓN.
//
// Una capa transparente encima de la cancha de la repetición para dibujar jugadas, colocar fichas rojas/azules, marcar zonas,
// borrar y sacar una captura. NO modifica el partido ni el motor (game2.js): solo dibuja encima.
//
// Todo lo que se dibuja queda anclado a la CANCHA (coordenadas del mundo de HaxBall): si la cámara se mueve, se acerca o sigue
// a un jugador, las marcas se quedan donde se pusieron. La cámara se lee de window.__fenixView (la publica el visor):
//   pantalla_px = ( W/2 + k·(x − camX) ,  (H+h)/2 + k·(y − camY) )   con W,H = tamaño del canvas en píxeles del dispositivo.
// Si el visor no publica la cámara, las marcas se anclan a la pantalla.
//
// Gestos: un toque con DOS dedos = deshacer · con TRES dedos = rehacer.
import './replayBoard.scss';
import { iconSvg } from './icons';
import { saveBlob, fileName } from './exporter';

const COLORS = ['#F5C542', '#FFFFFF', '#E56E6E', '#5689E5', '#4CC38A', '#B07CFF'];
const TEAM = { red: '#E56E6E', blue: '#5689E5' };
const ZONE = { press: { c: '#E56E6E', t: 'Presión' }, defense: { c: '#5689E5', t: 'Defensa' }, cover: { c: '#4CC38A', t: 'Cobertura' } };
const WIDTHS = [2, 3.5, 6];
const TOOLS = [
  { id: 'hand', icon: 'pan', label: 'Mover vista' },
  { id: 'select', icon: 'select', label: 'Mover marca' },
  { id: 'pen', icon: 'pen', label: 'Lápiz' },
  { id: 'line', icon: 'line', label: 'Línea' },
  { id: 'dline', icon: 'dline', label: 'Discontinua' },
  { id: 'arrow', icon: 'arrow', label: 'Flecha' },
  { id: 'carrow', icon: 'carrow', label: 'Flecha curva' },
  { id: 'rect', icon: 'rect', label: 'Rectángulo' },
  { id: 'press', icon: 'press', label: 'Zona de presión' },
  { id: 'defense', icon: 'defense', label: 'Zona defensiva' },
  { id: 'cover', icon: 'cover', label: 'Zona de cobertura' },
  { id: 'red', team: 'red', label: 'Ficha roja' },
  { id: 'blue', team: 'blue', label: 'Ficha azul' },
  { id: 'ball', icon: 'ball', label: 'Balón' },
  { id: 'text', icon: 'text', label: 'Texto' },
  { id: 'erase', icon: 'erase', label: 'Borrador' }
];
const SHORT = { hand: 'Vista', select: 'Mover', dline: 'Discont.', carrow: 'Curva', press: 'Presión', defense: 'Defensa', cover: 'Cobertura', red: 'Roja', blue: 'Azul', rect: 'Rect.' };
const DRAG = new Set(['pen', 'line', 'dline', 'arrow', 'carrow', 'rect', 'press', 'defense', 'cover']);

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
let uid = 1;

// ---------- cámara ----------
// Devuelve la transformación mundo → píxeles CSS de la capa, con el factor f (CSS px por px del canvas).
export function makeT(canvas, cssW, cssH, live) {
  const v = typeof window !== 'undefined' ? window.__fenixView : null;
  const W = canvas.width || cssW, H = canvas.height || cssH;
  const ok = v && v.k > 0 && v.W > 1 && v.H > 1;
  const cx = ok ? v.camX || 0 : 0, cy = ok ? v.camY || 0 : 0, k = ok ? v.k : 1, h = ok ? v.h || 0 : 0;
  const vw = ok ? v.W : W, vh = ok ? v.H : H;
  const f = live === false ? 1 : cssW / (W || 1), g = live === false ? 1 : cssH / (H || 1);
  return {
    ok, sig: ok ? [cx, cy, k, vw, vh, h].join() : 'static',
    sx: (x) => (vw / 2 + k * (x - cx)) * f, sy: (y) => ((vh + h) / 2 + k * (y - cy)) * g,
    wx: (px) => cx + (px / f - vw / 2) / k, wy: (py) => cy + (py / g - (vh + h) / 2) / k,
    s: k * f
  };
}

// ---------- dibujo (también sirve para la captura) ----------
function bbox(a, b) { return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; }

export function drawItems(ctx, items, T, draft) {
  const all = draft ? items.concat([draft]) : items;
  const P = (p) => ({ x: T.sx(p.x), y: T.sy(p.y) });
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const it of all) {
    const col = it.type === 'zone' ? ZONE[it.kind].c : it.color;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.setLineDash([]);
    ctx.lineWidth = Math.max(2, (it.w || 3.5) * T.s);
    const lw = ctx.lineWidth;
    const fillShape = () => { ctx.save(); ctx.globalAlpha = it.type === 'zone' ? 0.28 : 0.24; ctx.fill(); ctx.restore(); };
    if (it.type === 'pen' && it.pts.length) {
      ctx.beginPath(); it.pts.forEach((q, i) => { const p = P(q); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
      if (it.pts.length === 1) { const p = P(it.pts[0]); ctx.lineTo(p.x + 0.1, p.y); }
      ctx.stroke();
    } else if (it.type === 'line' || it.type === 'dline') {
      const a = P(it.a), b = P(it.b); if (it.type === 'dline') ctx.setLineDash([lw * 2.6, lw * 2.2]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (it.type === 'arrow' || it.type === 'carrow') {
      const a = P(it.a), b = P(it.b), L = dist(a, b); if (L < 2) continue;
      let c = null, ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (it.type === 'carrow') { const bd = it.bend != null ? it.bend : 0.2; c = { x: (a.x + b.x) / 2 + (a.y - b.y) * bd, y: (a.y + b.y) / 2 + (b.x - a.x) * bd }; ang = Math.atan2(b.y - c.y, b.x - c.x); }
      const hd = Math.min(L * 0.5, Math.max(11, lw * 3.6));
      const ex = b.x - Math.cos(ang) * hd * 0.6, ey = b.y - Math.sin(ang) * hd * 0.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); if (c) ctx.quadraticCurveTo(c.x, c.y, ex, ey); else ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - hd * Math.cos(ang - 0.45), b.y - hd * Math.sin(ang - 0.45)); ctx.lineTo(b.x - hd * Math.cos(ang + 0.45), b.y - hd * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
    } else if (it.type === 'rect' || it.type === 'zone') {
      const A = P(it.a), B = P(it.b), x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
      if (x1 - x0 < 2 && y1 - y0 < 2) continue;
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      if (it.type === 'zone' || it.fill) fillShape();
      if (it.type === 'zone') ctx.setLineDash([lw * 2.6, lw * 1.8]);
      ctx.stroke(); ctx.setLineDash([]);
      if (it.type === 'zone') { ctx.fillStyle = col; ctx.font = '700 ' + Math.max(10, Math.min(15, (x1 - x0) / 7)) + 'px Poppins, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(ZONE[it.kind].t, (x0 + x1) / 2, y0 + 4); }
    } else if (it.type === 'token') {
      const p = P(it.p), r = Math.max(9, 17 * T.s);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = TEAM[it.team]; ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.18); ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = '700 ' + Math.round(r * 1.05) + 'px Poppins, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(it.n), p.x, p.y + r * 0.06);
    } else if (it.type === 'ball') {
      const p = P(it.p), r = Math.max(6, 10 * T.s);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.lineWidth = Math.max(2, r * 0.3); ctx.strokeStyle = '#111'; ctx.stroke();
    } else if (it.type === 'text') {
      const p = P(it.p), fs = Math.max(13, 22 * T.s);
      ctx.font = '700 ' + Math.round(fs) + 'px Poppins, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, fs * 0.2); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(it.text, p.x, p.y); ctx.fillStyle = it.color; ctx.fillText(it.text, p.x, p.y);
    }
  }
  ctx.restore();
}

// ¿el punto (px, py en CSS) toca la marca?
function hit(it, q, T, tol) {
  const P = (p) => ({ x: T.sx(p.x), y: T.sy(p.y) });
  if (it.type === 'token') return dist(q, P(it.p)) <= Math.max(9, 17 * T.s) + tol;
  if (it.type === 'ball') return dist(q, P(it.p)) <= Math.max(6, 10 * T.s) + tol;
  if (it.type === 'text') { const p = P(it.p), fs = Math.max(13, 22 * T.s); return Math.abs(q.x - p.x) <= it.text.length * fs * 0.35 + tol && Math.abs(q.y - p.y) <= fs * 0.7 + tol; }
  if (it.type === 'line' || it.type === 'dline' || it.type === 'arrow' || it.type === 'carrow') return segDist(q, P(it.a), P(it.b)) <= tol + (it.type === 'carrow' ? Math.max(6, dist(P(it.a), P(it.b)) * 0.5 * Math.abs(it.bend != null ? it.bend : 0.2)) : 0);
  if (it.type === 'rect' || it.type === 'zone') {
    const A = P(it.a), B = P(it.b), x0 = Math.min(A.x, B.x) - tol, x1 = Math.max(A.x, B.x) + tol, y0 = Math.min(A.y, B.y) - tol, y1 = Math.max(A.y, B.y) + tol;
    const inside = q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
    if (it.type === 'zone' || it.fill) return inside;
    return inside && !(q.x > x0 + 2 * tol && q.x < x1 - 2 * tol && q.y > y0 + 2 * tol && q.y < y1 - 2 * tol);
  }
  if (it.type === 'pen') { for (let i = 0; i < it.pts.length; i++) { if (segDist(q, P(it.pts[i]), P(it.pts[Math.min(i + 1, it.pts.length - 1)])) <= tol) return true; } }
  return false;
}

function shift(it, dx, dy) {
  const mv = (p) => ({ x: p.x + dx, y: p.y + dy }), o = { ...it };
  if (o.pts) o.pts = o.pts.map(mv); if (o.a) o.a = mv(o.a); if (o.b) o.b = mv(o.b); if (o.p) o.p = mv(o.p);
  return o;
}

// ---------- capa por repetición ----------
function makeLayer(host, canvas) {
  const st = { tool: 'pen', color: COLORS[0], wi: 1, fill: false, items: [], hist: [], redo: [], draft: null, open: false, drawing: null, moving: null, inst: null, confirm: false, toastT: 0, dirty: true, sig: '' };
  const touches = new Map(); let multi = null;
  const layer = document.createElement('div'); layer.className = 'rb-layer'; layer.hidden = true;
  const cv = document.createElement('canvas'); cv.className = 'rb-canvas'; layer.appendChild(cv);
  const bar = document.createElement('div'); bar.className = 'rb-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Herramientas de la pizarra');
  const acts = document.createElement('div'); acts.className = 'rb-acts'; acts.setAttribute('role', 'toolbar'); acts.setAttribute('aria-label', 'Acciones de la pizarra');
  const toast = document.createElement('div'); toast.className = 'rb-toast'; toast.setAttribute('role', 'status');
  layer.appendChild(bar); layer.appendChild(acts); layer.appendChild(toast);
  document.body.appendChild(layer); // sobre <body>: ningún botón de la repetición puede quedar por encima de la barra
  const ctx = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;

  const say = (t) => { toast.textContent = t; toast.classList.add('on'); clearTimeout(st.toastT); st.toastT = setTimeout(() => toast.classList.remove('on'), 1500); };
  const T = () => makeT(canvas, W, H);
  const place = () => { // la capa cubre exactamente la cancha de la repetición
    const cr = canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) return;
    layer.style.left = cr.left + 'px'; layer.style.top = cr.top + 'px'; layer.style.width = cr.width + 'px'; layer.style.height = cr.height + 'px';
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    if (Math.abs(cr.width - W) > 0.5 || Math.abs(cr.height - H) > 0.5 || d !== dpr) { W = cr.width; H = cr.height; dpr = d; cv.width = Math.round(W * d); cv.height = Math.round(H * d); st.dirty = true; }
  };
  function draw() {
    const t = T(); st.sig = t.sig; st.dirty = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); drawItems(ctx, st.items, t, st.draft);
  }
  const mark = () => { st.dirty = true; };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const world = (e, t) => { const q = pt(e); return { x: t.wx(q.x), y: t.wy(q.y) }; };

  // historial de marcas (deshacer / rehacer)
  const commit = (items) => { st.hist.push(st.items); if (st.hist.length > 100) st.hist.shift(); st.items = items; st.redo = []; st.confirm = false; renderUi(); mark(); };
  const undo = () => { if (!st.hist.length) return false; st.redo.push(st.items); st.items = st.hist.pop(); renderUi(); mark(); return true; };
  const redo = () => { if (!st.redo.length) return false; st.hist.push(st.items); st.items = st.redo.pop(); renderUi(); mark(); return true; };
  const count = (team) => st.items.filter((i) => i.type === 'token' && i.team === team).length;

  function renderUi() {
    const wIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="' + [2, 3.5, 5.5][st.wi] + '" aria-hidden="true"><path d="M5 18L19 6"/></svg>';
    bar.innerHTML =
      '<div class="rb-row tools">' + TOOLS.map((t) => '<button type="button" class="rb-t' + (st.tool === t.id ? ' on' : '') + (t.team ? ' team ' + t.team : '') + '" data-tool="' + t.id + '" aria-pressed="' + (st.tool === t.id) + '" aria-label="' + t.label + '" title="' + t.label + '">' + (t.team ? '<i></i>' : iconSvg(t.icon, 22)) + '<span>' + (SHORT[t.id] || t.label) + '</span></button>').join('') + '</div>' +
      '<div class="rb-row sec">' + COLORS.map((c) => '<button type="button" class="rb-col' + (c === st.color ? ' on' : '') + '" data-color="' + c + '" style="--c:' + c + '" aria-label="Color ' + c + '"></button>').join('') +
      '<span class="rb-sep"></span>' +
      '<button type="button" class="rb-a" data-act="width" aria-label="Grosor del trazo" title="Grosor">' + wIcon + '<span>Grosor</span></button>' +
      '<button type="button" class="rb-a' + (st.fill ? ' on' : '') + '" data-act="fill" aria-pressed="' + st.fill + '" aria-label="Relleno de las figuras" title="Relleno">' + iconSvg('square', 20) + '<span>Relleno</span></button></div>';
    acts.innerHTML =
      '<button type="button" class="rb-a close" data-act="close" aria-label="Cerrar pizarra" title="Listo">' + iconSvg('check', 22) + '<span>Listo</span></button>' +
      '<button type="button" class="rb-a" data-act="undo" aria-label="Deshacer" title="Deshacer (también: toca con 2 dedos)"' + (st.hist.length ? '' : ' disabled') + '>' + iconSvg('undo', 20) + '<span>Deshacer</span></button>' +
      '<button type="button" class="rb-a" data-act="redo" aria-label="Rehacer" title="Rehacer (también: toca con 3 dedos)"' + (st.redo.length ? '' : ' disabled') + '>' + iconSvg('redo', 20) + '<span>Rehacer</span></button>' +
      '<button type="button" class="rb-a danger' + (st.confirm ? ' on' : '') + '" data-act="clear" aria-label="Limpiar todo"' + (st.items.length ? '' : ' disabled') + '>' + iconSvg('trash', 20) + '<span>' + (st.confirm ? '¿Seguro?' : 'Limpiar') + '</span></button>' +
      '<button type="button" class="rb-a" data-act="shot" aria-label="Guardar captura" title="Captura">' + iconSvg('image', 20) + '<span>Captura</span></button>';
    cv.style.pointerEvents = st.open && st.tool !== 'hand' ? 'auto' : 'none';
    cv.style.cursor = st.tool === 'erase' ? 'cell' : st.tool === 'select' ? 'move' : 'crosshair';
  }

  const onUi = (e) => {
    e.stopPropagation();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tool) { st.tool = b.dataset.tool; st.confirm = false; renderUi(); say(TOOLS.find((t) => t.id === st.tool).label); return; }
    if (b.dataset.color) { st.color = b.dataset.color; if (['red', 'blue', 'ball', 'erase', 'hand', 'select', 'press', 'defense', 'cover'].includes(st.tool)) st.tool = 'pen'; renderUi(); return; }
    const a = b.dataset.act;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'width') { st.wi = (st.wi + 1) % WIDTHS.length; renderUi(); say('Grosor ' + ['fino', 'medio', 'grueso'][st.wi]); }
    else if (a === 'fill') { st.fill = !st.fill; renderUi(); say(st.fill ? 'Figuras rellenas' : 'Figuras sin relleno'); }
    else if (a === 'clear') { if (!st.items.length) return; if (st.confirm) { commit([]); say('Todo borrado'); } else { st.confirm = true; renderUi(); clearTimeout(st.cT); st.cT = setTimeout(() => { st.confirm = false; renderUi(); }, 3000); } }
    else if (a === 'shot') shot();
    else if (a === 'close') api.close();
  };
  for (const el of [bar, acts]) { el.addEventListener('pointerdown', (e) => e.stopPropagation()); el.addEventListener('click', onUi); }

  // ---- gestos
  const tolPx = () => (matchMedia && matchMedia('(pointer: coarse)').matches ? 16 : 10);
  function cancelOne() { // un segundo dedo llegó: el gesto de un dedo se descarta (y lo que acababa de colocar también)
    st.drawing = null; st.draft = null;
    if (st.moving) { st.items = st.moving.base; st.moving = null; }
    if (st.inst && performance.now() - st.inst.t < 500 && st.hist.length > st.inst.hl) { st.items = st.hist.pop(); st.redo = st.inst.redo; renderUi(); }
    st.inst = null; mark();
  }
  cv.addEventListener('pointerdown', (e) => {
    if (!st.open || st.tool === 'hand') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* nada */ }
    const q = pt(e); touches.set(e.pointerId, q);
    const now = performance.now();
    if (touches.size >= 2) {
      if (!multi) { multi = { t0: now, n: touches.size, moved: false, start: new Map(touches) }; cancelOne(); } else { multi.n = Math.max(multi.n, touches.size); }
      return;
    }
    const t = T(), p = world(e, t), tool = st.tool;
    st.confirm = false;
    const w = WIDTHS[st.wi];
    const instant = () => { st.inst = { t: now, hl: st.hist.length, redo: st.redo }; };
    if (tool === 'red' || tool === 'blue') { instant(); commit(st.items.concat([{ id: uid++, type: 'token', team: tool, p, n: count(tool) + 1 }])); return; }
    if (tool === 'ball') { instant(); commit(st.items.filter((i) => i.type !== 'ball').concat([{ id: uid++, type: 'ball', p }])); return; }
    if (tool === 'text') { askText(q, p); return; }
    if (tool === 'erase') { st.drawing = { id: e.pointerId, erase: true, first: true }; instant(); eraseAt(q, t, true); return; }
    if (tool === 'select') {
      for (let i = st.items.length - 1; i >= 0; i--) if (hit(st.items[i], q, t, tolPx())) { st.moving = { id: e.pointerId, i, base: st.items, p0: p }; return; }
      return;
    }
    if (!DRAG.has(tool)) return;
    st.drawing = { id: e.pointerId };
    const base = { id: uid++, color: st.color, w, fill: st.fill };
    if (tool === 'pen') st.draft = { ...base, type: 'pen', pts: [p] };
    else if (tool === 'rect') st.draft = { ...base, type: tool, a: p, b: p };
    else if (ZONE[tool]) st.draft = { ...base, type: 'zone', kind: tool, a: p, b: p };
    else st.draft = { ...base, type: tool, a: p, b: p };
    mark();
  });
  function eraseAt(q, t, first) {
    for (let i = st.items.length - 1; i >= 0; i--) {
      if (hit(st.items[i], q, t, tolPx())) {
        const it = st.items.slice(); it.splice(i, 1);
        if (first || st.drawing && st.drawing.first) { st.hist.push(st.items); if (st.hist.length > 100) st.hist.shift(); if (st.drawing) st.drawing.first = false; }
        st.items = it; st.redo = []; renderUi(); mark(); return;
      }
    }
  }
  function askText(q, p) { // el texto se escribe en una cajita sobre el punto tocado
    const input = document.createElement('input'); input.type = 'text'; input.className = 'rb-text'; input.maxLength = 30; input.placeholder = 'Escribe y pulsa Enter';
    input.style.left = Math.max(6, Math.min(W - 190, q.x - 90)) + 'px'; input.style.top = Math.max(6, Math.min(H - 50, q.y - 18)) + 'px';
    let done = false;
    const fin = (ok) => { if (done) return; done = true; const v = input.value.trim(); input.remove(); if (ok && v) commit(st.items.concat([{ id: uid++, type: 'text', p, text: v, color: st.color }])); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') fin(true); else if (e.key === 'Escape') fin(false); });
    input.addEventListener('blur', () => fin(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    layer.appendChild(input); setTimeout(() => input.focus(), 30);
  }
  cv.addEventListener('pointermove', (e) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, pt(e));
    if (multi) { if (!multi.moved) for (const [id, q] of touches) { const s0 = multi.start.get(id); if (s0 && dist(q, s0) > 14) multi.moved = true; } return; }
    const t = T();
    if (st.moving && st.moving.id === e.pointerId) { const p = world(e, t), m = st.moving; st.items = m.base.map((it, i) => (i === m.i ? shift(it, p.x - m.p0.x, p.y - m.p0.y) : it)); mark(); return; }
    const d = st.drawing; if (!d || d.id !== e.pointerId) return;
    const p = world(e, t);
    if (d.erase) { eraseAt(pt(e), t, false); return; }
    const dr = st.draft;
    if (dr.type === 'pen') { const l = dr.pts[dr.pts.length - 1]; if (Math.hypot((p.x - l.x) * t.s, (p.y - l.y) * t.s) > 2) dr.pts.push(p); }
    else {
      dr.b = p;
      if (dr.type === 'carrow') { // la curva dobla hacia el lado por el que se desvía el dedo respecto a la recta a→b
        (dr.trail = dr.trail || []).push(p);
        const dx = p.x - dr.a.x, dy = p.y - dr.a.y, L = Math.hypot(dx, dy) || 1; let dev = 0;
        for (const q of dr.trail) { const v = (-(q.x - dr.a.x) * dy + (q.y - dr.a.y) * dx) / L; if (Math.abs(v) > Math.abs(dev)) dev = v; }
        const f = Math.abs(dev) < Math.max(8 / t.s, L * 0.07) ? 0.2 : Math.max(-0.6, Math.min(0.6, dev / L));
        dr.bend = f;
      }
    }
    mark();
  });
  const end = (e, cancel) => {
    const had = touches.has(e.pointerId); touches.delete(e.pointerId);
    try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* nada */ }
    if (multi) {
      if (!touches.size) {
        const tap = !multi.moved && performance.now() - multi.t0 < 450 && !cancel;
        const n = multi.n; multi = null;
        if (tap) { if (n >= 3) { say(redo() ? 'Rehecho' : 'Nada que rehacer'); } else { say(undo() ? 'Deshecho' : 'Nada que deshacer'); } }
      }
      return;
    }
    if (!had) return;
    if (st.moving && st.moving.id === e.pointerId) { const m = st.moving; st.moving = null; if (!cancel && st.items !== m.base) { st.hist.push(m.base); st.redo = []; renderUi(); } else st.items = m.base; mark(); return; }
    const d = st.drawing; if (!d || d.id !== e.pointerId) return;
    st.drawing = null;
    if (d.erase) return;
    const it = st.draft; st.draft = null;
    const t = T();
    const ok = !cancel && it && (it.type === 'pen' ? it.pts.length > 1 : dist({ x: t.sx(it.a.x), y: t.sy(it.a.y) }, { x: t.sx(it.b.x), y: t.sy(it.b.y) }) > 8);
    if (ok) commit(st.items.concat([it])); else mark();
  };
  cv.addEventListener('pointerup', (e) => end(e, false));
  cv.addEventListener('pointercancel', (e) => end(e, true));
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- captura: imagen de la repetición + lo dibujado (con la cámara de ese momento)
  async function shot() {
    try {
      const cw = canvas.width || Math.round(W), ch = canvas.height || Math.round(H);
      const out = document.createElement('canvas'); out.width = cw; out.height = ch; const o = out.getContext('2d');
      o.fillStyle = '#111'; o.fillRect(0, 0, cw, ch);
      try { o.drawImage(canvas, 0, 0, cw, ch); } catch (x) { /* si no se puede copiar la cancha, queda solo el dibujo */ }
      drawItems(o, st.items, makeT(canvas, cw, ch, false), null);
      const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
      if (!blob) throw new Error('sin imagen');
      await saveBlob(blob, fileName({ name: 'Repeticion' }, 'pizarra-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), 'png'), 'image/png');
      say('Captura guardada');
    } catch (e) { say('No se pudo guardar la captura'); }
  }

  // ---- bucle: sigue a la cámara mientras haya marcas
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
  if (ro) { ro.observe(canvas); ro.observe(host); }
  window.addEventListener('resize', place);
  let raf = 0, alive = true;
  const loop = () => {
    if (!alive) return;
    if (st.open || st.items.length) {
      layer.hidden = false; place();
      if (st.dirty || T().sig !== st.sig) draw();
      raf = requestAnimationFrame(loop);
    } else { layer.hidden = true; raf = 0; }
  };
  const wake = () => { if (!raf && alive) raf = requestAnimationFrame(loop); };

  // ---- botón «Atrás» de Android: primero cierra la pizarra
  let prevBack = null;
  const myBack = () => { if (st.open) { api.close(); return 'ok'; } return prevBack ? prevBack() : undefined; };

  const api = {
    layer, st,
    open() { if (st.open) return; st.open = true; layer.classList.add('open'); document.body.classList.add('rb-open'); renderUi(); st.dirty = true; wake(); prevBack = window.__fenixBack; window.__fenixBack = myBack; },
    close() { if (!st.open) return; st.open = false; touches.clear(); multi = null; layer.classList.remove('open'); document.body.classList.remove('rb-open'); cv.style.pointerEvents = 'none'; if (window.__fenixBack === myBack) window.__fenixBack = prevBack; prevBack = null; wake(); },
    toggle() { st.open ? api.close() : api.open(); },
    undo, redo,
    destroy() { alive = false; try { ro && ro.disconnect(); window.removeEventListener('resize', place); cancelAnimationFrame(raf); document.body.classList.remove('rb-open'); if (window.__fenixBack === myBack) window.__fenixBack = prevBack; layer.remove(); } catch (e) { /* nada */ } }
  };
  cv.style.pointerEvents = 'none';
  renderUi();
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
    if (!host) { if (cur && !cur.host.isConnected) { cur.api.destroy(); cur.btn.remove(); cur = null; } return; }
    if (cur && cur.host === host && cur.btn.isConnected) return;
    if (cur) { cur.api.destroy(); cur.btn.remove(); cur = null; }
    const canvas = host.querySelector('canvas'); if (!canvas) return;
    const api = makeLayer(host, canvas);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rb-btn'; btn.setAttribute('aria-label', 'Pizarra táctica sobre la repetición');
    btn.innerHTML = iconSvg('board', 24);
    const stop = (e) => e.stopPropagation();
    btn.addEventListener('pointerdown', stop); btn.addEventListener('touchstart', stop, { passive: true });
    btn.addEventListener('click', (e) => { e.stopPropagation(); api.toggle(); });
    host.appendChild(btn);
    cur = { host, btn, api };
    window.__fenixReplayBoard = api;
  };
  // El botón se crea EN EL MISMO INSTANTE que los demás de la cancha (sin esperar); una vez creado, las revisiones se espacian
  const mo = new MutationObserver(() => { if (!cur || !cur.btn.isConnected || !cur.host.isConnected) { clearTimeout(mo.t); sync(); } else { clearTimeout(mo.t); mo.t = setTimeout(sync, 300); } });
  mo.observe(document.body, { childList: true, subtree: true });
  sync();
}
