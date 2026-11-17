// Geometría del campo HaxBall (estadio Classic) y utilidades 2D de la pizarra táctica.
// Unidades de mundo = unidades de HaxBall. El campo de juego va de -370 a 370 (X) y de -170 a 170 (Y).

export const PITCH = {
  halfW: 370, halfH: 170, boundW: 420, boundH: 200,
  goalHalf: 64, netDepth: 30, kickOff: 75, playerR: 15, ballR: 10
};

// Cancha activa. Por defecto, la Classic; si el documento trae `field` (geometría de un partido importado) se usa esa.
export const CLASSIC = { halfW: 370, halfH: 170, boundW: 420, boundH: 200, goalHalf: 64, netDepth: 30, kickOff: 75 };
let ACTIVE = null;
export const getField = () => ACTIVE;
// Devuelve true si la cancha cambió
export function setPitch(geo) {
  if (geo === ACTIVE || (geo && ACTIVE && geo.name === ACTIVE.name && geo.segs === ACTIVE.segs)) return false;
  ACTIVE = geo && geo.halfW ? geo : null;
  const g = ACTIVE;
  PITCH.halfW = g ? g.halfW : CLASSIC.halfW; PITCH.halfH = g ? g.halfH : CLASSIC.halfH;
  PITCH.boundW = g ? g.boundW : CLASSIC.boundW; PITCH.boundH = g ? g.boundH : CLASSIC.boundH;
  PITCH.kickOff = g ? (g.kickOff || 0) : CLASSIC.kickOff;
  PITCH.goalHalf = g && g.goals && g.goals[0] ? Math.abs(g.goals[0][3] - g.goals[0][1]) / 2 : CLASSIC.goalHalf;
  return true;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  const n = pts.length || 1;
  return { x: x / n, y: y / n };
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}

export function rotatePts(pts, deg, c) {
  const a = (deg * Math.PI) / 180, s = Math.sin(a), co = Math.cos(a);
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * s, y: c.y + (p.x - c.x) * s + (p.y - c.y) * co }));
}

export function scalePts(pts, f, c) {
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f }));
}

export function translatePts(pts, dx, dy) {
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function quadAt(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

// Distancia de un punto a una curva cuadrática (muestreada)
export function distToQuad(p, a, c, b) {
  let best = Infinity, prev = a;
  for (let i = 1; i <= 24; i++) {
    const q = quadAt(a, c, b, i / 24);
    best = Math.min(best, distToSegment(p, prev, q));
    prev = q;
  }
  return best;
}

// Ordena puntos alrededor de su centro (para formar un polígono sin cruces)
export function sortByAngle(items) {
  const c = centroid(items);
  return items.slice().sort((p, q) => Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(q.y - c.y, q.x - c.x));
}

// Ramer–Douglas–Peucker: reduce los puntos del lápiz libre
export function simplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let idx = -1, dmax = 0;
  const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  const l = simplify(pts.slice(0, idx + 1), eps), r = simplify(pts.slice(idx), eps);
  return l.slice(0, -1).concat(r);
}

export function boxPts(a, b) {
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}

export function squarePts(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const s = Math.max(Math.abs(dx), Math.abs(dy));
  return boxPts(a, { x: a.x + Math.sign(dx || 1) * s, y: a.y + Math.sign(dy || 1) * s });
}

export function trianglePts(a, b) {
  return [{ x: (a.x + b.x) / 2, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }];
}

export function ellipsePts(a, b, n = 24) {
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
  const out = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; out.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry }); }
  return out;
}

// Punto de control de una flecha curva: a un cuarto del largo, perpendicular al segmento
export function curveControl(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  return { x: mx - dy * 0.25, y: my + dx * 0.25 };
}

// ---- Vista (mundo -> pantalla): pantalla = mundo * k + (ox, oy) ----
export const K_MIN = 0.12, K_MAX = 14;

// Encuadre ajustado a la cancha (más las redes de las porterías), no a todo el área exterior: el campo ocupa más pantalla
export function viewRect(mode) {
  const m = 10, ex = Math.min(PITCH.boundW, PITCH.halfW + 44), ey = Math.min(PITCH.boundH, PITCH.halfH + 28);
  if (mode === 'left') return { x0: -ex, x1: m, y0: -ey, y1: ey };
  if (mode === 'right') return { x0: -m, x1: ex, y0: -ey, y1: ey };
  return { x0: -ex, x1: ex, y0: -ey, y1: ey };
}

export function fitView(w, h, mode, pad = 4) {
  const r = viewRect(mode);
  const k = clamp(Math.min((w - 2 * pad) / (r.x1 - r.x0), (h - 2 * pad) / (r.y1 - r.y0)), K_MIN, K_MAX);
  return { k, ox: w / 2 - (k * (r.x0 + r.x1)) / 2, oy: h / 2 - (k * (r.y0 + r.y1)) / 2 };
}

export const toScreen = (v, p) => ({ x: p.x * v.k + v.ox, y: p.y * v.k + v.oy });
export const toWorld = (v, sx, sy) => ({ x: (sx - v.ox) / v.k, y: (sy - v.oy) / v.k });

export function zoomAt(v, sx, sy, factor) {
  const k = clamp(v.k * factor, K_MIN, K_MAX);
  const f = k / v.k;
  return { k, ox: sx - (sx - v.ox) * f, oy: sy - (sy - v.oy) * f };
}

// Mantiene al menos una parte del campo visible al desplazarse
export function clampView(v, w, h) {
  const bw = PITCH.boundW * 2 * v.k, bh = PITCH.boundH * 2 * v.k;
  const cx = v.ox, cy = v.oy; // posición del origen en pantalla
  const minX = 60 - bw / 2, maxX = w - 60 + bw / 2;
  const minY = 60 - bh / 2, maxY = h - 60 + bh / 2;
  return { k: v.k, ox: clamp(cx, minX, maxX), oy: clamp(cy, minY, maxY) };
}
