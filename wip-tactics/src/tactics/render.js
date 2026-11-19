// Dibujado de la pizarra en canvas 2D. Sin dependencias de React: se usa en pantalla y para exportar imágenes/vídeo.
import { PITCH, getField, toScreen, dist, quadAt, curveCtrl } from './geometry';
import { shapePts, resolvedPos } from './model';
import { handlesOf, labelAnchor, isClosed } from './shapes';

export const FIELD = {
  outside: '#5b7448', grass: '#718c5a', stripe: 'rgba(255,255,255,0.025)', line: 'rgb(199,230,189)',
  postRed: '#FFCCCC', postBlue: '#CCCCFF'
};

const TAU = Math.PI * 2;

// Punto de control de un arco de HaxBall (segmento con "curve" en grados) como curva cuadrática
function arcCtrl(a, b, deg) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  const f = Math.tan((Math.abs(deg) * Math.PI) / 180 / 4) * -Math.sign(deg);
  return { x: mx + -dy * f, y: my + dx * f };
}

function pathNet(ctx, v, side) {
  const s = side; // -1 izquierda, 1 derecha
  const deg = s < 0 ? -90 : 90;
  const W = (x, y) => ({ x: x * s, y });
  const a = W(380, -64), b = W(400, -44), c = W(400, 44), d = W(380, 64);
  const A = toScreen(v, a), B = toScreen(v, b), C = toScreen(v, c), D = toScreen(v, d);
  const q1 = toScreen(v, arcCtrl(a, b, deg)), q2 = toScreen(v, arcCtrl(c, d, deg));
  ctx.moveTo(A.x, A.y); ctx.quadraticCurveTo(q1.x, q1.y, B.x, B.y);
  ctx.lineTo(C.x, C.y); ctx.quadraticCurveTo(q2.x, q2.y, D.x, D.y);
}

const hexc = (c) => (/^[0-9a-f]{3,8}$/i.test(String(c)) ? '#' + c : String(c));

// Cancha de un estadio importado (geometría compacta guardada al analizar la repetición)
// Mezcla dos colores hex (t=0 → a, t=1 → b)
function mixHex(a, b, t) {
  const p = (c) => { const h = String(c).replace('#', ''); const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; return [0, 2, 4].map((i) => parseInt(f.substr(i, 2), 16) || 0); };
  const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const bgLum = (c) => { const h = hexc(c).replace('#', ''); const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; const r = parseInt(f.substr(0, 2), 16), g = parseInt(f.substr(2, 2), 16), bl = parseInt(f.substr(4, 2), 16); return (0.299 * r + 0.587 * g + 0.114 * bl) / 255; };

function drawStadium(ctx, v, w, h, g) {
  const px = (x, y) => toScreen(v, { x, y });
  const hockey = g.bgType === 'hockey', none = g.bgType === 'none';
  // El color del estadio manda: el fondo de toda la pizarra es el color de la cancha (como en el juego)
  const base = g.bgColor && /^[0-9a-f]{3,8}$/i.test(String(g.bgColor).replace('#', '')) ? hexc(g.bgColor) : (hockey ? '#5c6b82' : none ? '#3b3b3b' : '#718C5A');
  const dark = bgLum(base) < 0.4;
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const a = px(-g.halfW, -g.halfH), b = px(g.halfW, g.halfH);
  if (!none) {
    // la superficie de juego se distingue del exterior con un tono apenas distinto del mismo color
    ctx.fillStyle = mixHex(base, dark ? '#ffffff' : '#000000', dark ? 0.05 : 0.07); ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    if (!hockey) {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.05)'; const sw = (g.halfW * 2) / 10;
      for (let i = 0; i < 10; i += 2) { const x0 = px(-g.halfW + i * sw, -g.halfH), x1 = px(-g.halfW + (i + 1) * sw, g.halfH); ctx.fillRect(x0.x, x0.y, x1.x - x0.x, x1.y - x0.y); }
    }
    const lw = Math.max(1.5, 3 * v.k);
    ctx.strokeStyle = dark ? mixHex(base, '#ffffff', 0.45) : FIELD.line; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    const t = px(0, -g.halfH), u = px(0, g.halfH); ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(u.x, u.y); ctx.stroke();
    const c = px(0, 0);
    if (g.kickOff > 0) { ctx.beginPath(); ctx.arc(c.x, c.y, g.kickOff * v.k, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, 3 * v.k), 0, TAU); ctx.fill();
  }
  // paredes visibles del estadio (mismo trazado que el motor: arco horario desde el primer vértice)
  ctx.lineWidth = Math.max(1.4, 3 * v.k); ctx.lineCap = 'round';
  for (const sg of g.segs || []) {
    const A = px(sg[0], sg[1]), B = px(sg[2], sg[3]);
    ctx.strokeStyle = hexc(sg[5]); ctx.beginPath();
    const th = ((sg[4] || 0) * Math.PI) / 180;
    if (!th) { ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); } else {
      const vb = 1 / Math.tan(th / 2), cx0 = (B.x - A.x) / 2, cy0 = (B.y - A.y) / 2;
      const C = { x: A.x + cx0 - cy0 * vb, y: A.y + cy0 + cx0 * vb };
      ctx.arc(C.x, C.y, Math.hypot(A.x - C.x, A.y - C.y), Math.atan2(A.y - C.y, A.x - C.x), Math.atan2(B.y - C.y, B.x - C.x), th < 0);
    }
    ctx.stroke();
  }
  // En HaxBall la línea de gol no se dibuja: solo se ven los postes (discos fijos) y las paredes de la red
  for (const gl of g.goals || []) {
    const near = (q, x, y) => Math.hypot(q[0] - x, q[1] - y) < 30;
    const ends = [[gl[0], gl[1]], [gl[2], gl[3]]];
    ends.forEach(([x, y]) => {
      const q = (g.posts || []).find((u) => near(u, x, y)); const p = px(q ? q[0] : x, q ? q[1] : y);
      ctx.fillStyle = q && q[3] ? hexc(q[3]) : (gl[4] === 'R' ? FIELD.postRed : FIELD.postBlue); ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 1.5 * v.k);
      ctx.beginPath(); ctx.arc(p.x, p.y, (q && q[2] ? q[2] : 8) * v.k, 0, TAU); ctx.fill(); ctx.stroke();
    });
  }
}

export function drawPitch(ctx, v, w, h) {
  const fld = getField();
  if (fld) { drawStadium(ctx, v, w, h, fld); return; }
  const px = (x, y) => toScreen(v, { x, y });
  // fondo y límites
  ctx.fillStyle = FIELD.outside; ctx.fillRect(0, 0, w, h);
  const o0 = px(-PITCH.boundW, -PITCH.boundH), o1 = px(PITCH.boundW, PITCH.boundH);
  ctx.fillStyle = '#65804f'; ctx.fillRect(o0.x, o0.y, o1.x - o0.x, o1.y - o0.y);
  // césped
  const a = px(-PITCH.halfW, -PITCH.halfH), b = px(PITCH.halfW, PITCH.halfH);
  ctx.fillStyle = FIELD.grass; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  // franjas suaves (cada 74 unidades) para dar sensación de escala
  ctx.fillStyle = FIELD.stripe;
  for (let i = 0; i < 10; i += 2) {
    const x0 = px(-PITCH.halfW + i * 74, -PITCH.halfH), x1 = px(-PITCH.halfW + (i + 1) * 74, PITCH.halfH);
    ctx.fillRect(x0.x, x0.y, x1.x - x0.x, x1.y - x0.y);
  }
  const lw = Math.max(1.5, 3 * v.k);
  ctx.strokeStyle = FIELD.line; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // borde, línea central y círculo
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  ctx.beginPath(); const t = px(0, -PITCH.halfH), u = px(0, PITCH.halfH); ctx.moveTo(t.x, t.y); ctx.lineTo(u.x, u.y); ctx.stroke();
  const c = px(0, 0);
  ctx.beginPath(); ctx.arc(c.x, c.y, PITCH.kickOff * v.k, 0, TAU); ctx.stroke();
  ctx.fillStyle = FIELD.line; ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(2, 3 * v.k), 0, TAU); ctx.fill();
  // porterías: red + postes
  for (const side of [-1, 1]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.2, 2 * v.k);
    ctx.beginPath(); pathNet(ctx, v, side); ctx.stroke();
    // línea de gol y conexión con la red
    ctx.strokeStyle = FIELD.line; ctx.lineWidth = lw;
    const g0 = px(side * 370, -64), g1 = px(side * 380, -64), g2 = px(side * 370, 64), g3 = px(side * 380, 64);
    ctx.beginPath(); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.moveTo(g2.x, g2.y); ctx.lineTo(g3.x, g3.y); ctx.stroke();
    for (const y of [-64, 64]) {
      const p = px(side * 370, y);
      ctx.fillStyle = side < 0 ? FIELD.postRed : FIELD.postBlue; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 1.5 * v.k);
      ctx.beginPath(); ctx.arc(p.x, p.y, 8 * v.k, 0, TAU); ctx.fill(); ctx.stroke();
    }
  }
}

// ---------- Figuras ----------
function arrowHead(ctx, from, to, size) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x), s = size;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - s * Math.cos(ang - 0.45), to.y - s * Math.sin(ang - 0.45));
  ctx.lineTo(to.x - s * Math.cos(ang + 0.45), to.y - s * Math.sin(ang + 0.45));
  ctx.closePath(); ctx.fill();
}

function smoothPath(ctx, pts) {
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length < 3) { for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  const l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
}

export function drawShape(ctx, v, shape, pts, opts = {}) {
  if (!pts || !pts.length) return;
  const sp = pts.map((p) => toScreen(v, p));
  const color = shape.color || '#F5C542';
  const lw = Math.max(1, (shape.width || 3) * Math.max(v.k, 0.6));
  ctx.save();
  ctx.globalAlpha = shape.opacity != null ? shape.opacity : 1;
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.setLineDash(shape.dashed || shape.type === 'dline' ? [lw * 2.6, lw * 1.8] : []);
  const t = shape.type;
  if (t === 'text') {
    ctx.setLineDash([]);
    const fs = Math.max(11, (shape.width || 3) * 4 * Math.max(v.k, 0.7));
    ctx.font = '600 ' + fs + 'px "Open Sans", Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, fs / 5); ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.strokeText(shape.label || 'Texto', sp[0].x, sp[0].y);
    ctx.fillText(shape.label || 'Texto', sp[0].x, sp[0].y);
  } else if (t === 'carrow' && sp.length >= 3) {
    const a = sp[0], b = sp[2], c = curveCtrl(a, sp[1], b), hs = Math.max(8, lw * 3.4);
    // el trazo termina en la base de la punta (que queda exactamente en el extremo y orientada con la curva)
    let tb = 1; while (tb > 0.3 && dist(quadAt(a, c, b, tb), b) < hs * 0.7) tb -= 0.02;
    const e = quadAt(a, c, b, tb);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(a.x + (c.x - a.x) * tb, a.y + (c.y - a.y) * tb, e.x, e.y); ctx.stroke();
    ctx.setLineDash([]); arrowHead(ctx, e, b, hs);
  } else if (t === 'arrow' && sp.length >= 2) {
    const a = sp[0], b = sp[sp.length - 1], hs = Math.max(8, lw * 3.4), ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x - Math.cos(ang) * hs * 0.6, b.y - Math.sin(ang) * hs * 0.6); ctx.stroke();
    ctx.setLineDash([]); arrowHead(ctx, a, b, hs);
  } else if (t === 'pen') {
    ctx.beginPath(); smoothPath(ctx, sp); ctx.stroke();
  } else if (t === 'line' || t === 'dline' || t === 'link') {
    ctx.beginPath(); ctx.moveTo(sp[0].x, sp[0].y); for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y); ctx.stroke();
  } else if (isClosed(t)) {
    ctx.beginPath();
    if (t === 'oval' && sp.length >= 3) { // curva cerrada suave por los puntos de control: un óvalo que se deforma a gusto
      const n = sp.length, mid = (i, j) => ({ x: (sp[i].x + sp[j].x) / 2, y: (sp[i].y + sp[j].y) / 2 });
      const m0 = mid(n - 1, 0); ctx.moveTo(m0.x, m0.y);
      for (let i = 0; i < n; i++) { const m = mid(i, (i + 1) % n); ctx.quadraticCurveTo(sp[i].x, sp[i].y, m.x, m.y); }
    } else { ctx.moveTo(sp[0].x, sp[0].y); for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i].x, sp[i].y); }
    ctx.closePath();
    if (shape.fill) {
      ctx.save();
      ctx.globalAlpha = 0.24 * (shape.opacity != null ? shape.opacity : 1);
      ctx.fill(); ctx.restore();
    }
    ctx.stroke();
  }
  ctx.restore();
  // etiqueta de figuras con texto (no 'text')
  if (shape.label && t !== 'text' && !opts.noLabel) {
    const c = toScreen(v, labelAnchor(shape, pts));
    const fs = Math.max(10, 11 * Math.max(v.k, 0.8));
    ctx.save(); ctx.font = '700 ' + fs + 'px "Open Sans", Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(shape.label, c.x, c.y);
    ctx.fillStyle = '#fff'; ctx.fillText(shape.label, c.x, c.y); ctx.restore();
  }
}

function drawHandles(ctx, v, shape, pts) {
  const hs = handlesOf(shape, pts);
  ctx.save(); ctx.setLineDash([]);
  for (const h of hs) {
    const p = toScreen(v, h);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#C89A3D'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(p.x - 5, p.y - 5, 10, 10); ctx.fill(); ctx.stroke();
  }
  if (shape.type === 'carrow' && pts.length >= 3) { // punto de curvatura
    const p = toScreen(v, pts[1]);
    ctx.fillStyle = '#C89A3D'; ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawSelectionOutline(ctx, v, shape, pts) {
  const sp = pts.map((p) => toScreen(v, p));
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = '#C89A3D'; ctx.lineWidth = 1.5;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of sp) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const m = 8; ctx.strokeRect(x0 - m, y0 - m, x1 - x0 + 2 * m, y1 - y0 + 2 * m);
  if (shape.attach) { // icono de vínculo
    ctx.setLineDash([]); ctx.fillStyle = '#C89A3D'; ctx.beginPath(); ctx.arc(x1 + m, y0 - m, 9, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = '700 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('⛓', x1 + m, y0 - m + 1);
  }
  ctx.restore();
}

// ---------- Fichas y balón ----------
export function drawPlayer(ctx, v, pl, p, st = {}) {
  const s = toScreen(v, p), r = PITCH.playerR * v.k;
  ctx.save();
  if (st.ghost) ctx.globalAlpha = 0.3;
  if (st.selected) {
    ctx.fillStyle = 'rgba(200,154,61,0.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, r + 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#C89A3D'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, TAU); ctx.stroke();
  }
  ctx.fillStyle = pl.color; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1.5, 2 * v.k);
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke();
  // dorsal
  const txt = pl.num !== '' && pl.num != null ? String(pl.num) : '';
  if (txt) {
    const fs = Math.max(8, r * (txt.length > 2 ? 0.85 : 1.1));
    ctx.font = '700 ' + fs + 'px "Open Sans", Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = lum(pl.color) > 0.55 ? '#111' : '#fff'; ctx.fillText(txt, s.x, s.y + 1);
  }
  // nickname
  if (pl.nick && st.names !== false) {
    const fs = Math.min(15, Math.max(10, 11 * Math.max(v.k, 0.85)));
    ctx.font = '600 ' + fs + 'px "Open Sans", Roboto, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(pl.nick, s.x, s.y + r + 3);
    ctx.fillStyle = '#fff'; ctx.fillText(pl.nick, s.x, s.y + r + 3);
  }
  if (pl.regKey && st.names !== false) { // marca de jugador registrado
    ctx.fillStyle = '#C89A3D'; ctx.beginPath(); ctx.arc(s.x + r * 0.78, s.y - r * 0.78, Math.max(3, r * 0.26), 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0.5;
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export function drawBall(ctx, v, p, st = {}) {
  const s = toScreen(v, p), r = PITCH.ballR * v.k;
  ctx.save();
  if (st.ghost) ctx.globalAlpha = 0.3;
  if (st.selected) { ctx.strokeStyle = '#C89A3D'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, TAU); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1.5, 2 * v.k);
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// Trayectorias de todos los pasos: línea punteada con flecha de cada jugador/balón
export function drawTrails(ctx, v, doc, upTo) {
  const last = upTo == null ? doc.frames.length - 1 : Math.min(upTo, doc.frames.length - 1);
  if (last < 1) return;
  const keys = doc.players.map((p) => ({ id: p.id, color: p.color })).concat([{ id: 'ball', color: '#ffffff' }]);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const k of keys) {
    for (let i = 1; i <= last; i++) {
      const a = doc.frames[i - 1].pos[k.id], b = doc.frames[i].pos[k.id];
      if (!a || !b || dist(a, b) < 2) continue;
      const sa = toScreen(v, a), sb = toScreen(v, b);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.fillStyle = k.color; ctx.lineWidth = Math.max(3, 4 * v.k);
      ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.strokeStyle = k.color; ctx.lineWidth = Math.max(1.6, 2.2 * v.k); ctx.setLineDash([7, 5]);
      ctx.beginPath(); ctx.moveTo(sa.x, sa.y); ctx.lineTo(sb.x, sb.y); ctx.stroke();
      ctx.setLineDash([]); arrowHead(ctx, sa, sb, Math.max(7, 9 * Math.max(v.k, 0.8)));
    }
  }
  ctx.restore();
}

// ---------- Escena completa ----------
// scene: { doc, fi, pos?, selPlayers:Set, selShapes:Set, draft, box, trails, ghost, names, grid, hideUI }
export function drawScene(ctx, v, w, h, scene) {
  const { doc } = scene;
  const pos = scene.pos || resolvedPos(doc, scene.fi || 0);
  drawPitch(ctx, v, w, h);
  if (scene.trails) drawTrails(ctx, v, doc, scene.fi);
  // figuras (debajo de las fichas)
  for (const s of doc.shapes) drawShape(ctx, v, s, shapePts(s, pos));
  if (scene.draft) drawShape(ctx, v, scene.draft, scene.draft.pts);
  // fantasma del paso anterior
  if (scene.ghost && scene.fi > 0 && !scene.pos) {
    const prev = resolvedPos(doc, scene.fi - 1);
    for (const pl of doc.players) if (prev[pl.id]) drawPlayer(ctx, v, pl, prev[pl.id], { ghost: true, names: false });
    if (prev.ball) drawBall(ctx, v, prev.ball, { ghost: true });
  }
  if (pos.ball) drawBall(ctx, v, pos.ball, { selected: !!(scene.selPlayers && scene.selPlayers.has('ball')) });
  for (const pl of doc.players) {
    if (pos[pl.id]) drawPlayer(ctx, v, pl, pos[pl.id], { selected: !!(scene.selPlayers && scene.selPlayers.has(pl.id)), names: scene.names });
  }
  if (!scene.hideUI) {
    for (const s of doc.shapes) {
      if (scene.selShapes && scene.selShapes.has(s.id)) { const pts = shapePts(s, pos); drawSelectionOutline(ctx, v, s, pts); drawHandles(ctx, v, s, pts); }
    }
    if (scene.box) {
      const a = toScreen(v, { x: scene.box.x0, y: scene.box.y0 }), b = toScreen(v, { x: scene.box.x1, y: scene.box.y1 });
      ctx.save(); ctx.fillStyle = 'rgba(200,154,61,0.12)'; ctx.strokeStyle = '#C89A3D'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.restore();
    }
  }
}

export { quadAt, curveCtrl };
