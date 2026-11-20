// Sombras de tiro: el balón es un foco de luz y cada jugador un objeto que no deja pasar la luz.
// Lo que queda en sombra es lo que ese jugador tapa: hacia ahí no se puede tirar/pasar en línea recta.
// Geometría pura (unidades de campo); la usan la pizarra (render.js) y la capa sobre la repetición (replayShadow.js).

const TAU = Math.PI * 2;
const wrap = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

// Cuadriláteros de sombra: para cada círculo {x,y,r} visto desde la luz L={x,y}. Devuelve [[p,p,p,p], …] (todos con el mismo sentido).
export function shadowQuads(L, circles, reach = 3000) {
  const out = [];
  for (const c of circles) {
    const dx = c.x - L.x, dy = c.y - L.y, d = Math.hypot(dx, dy);
    if (!(d > c.r + 0.5)) continue; // la luz está dentro de la ficha: no hay sombra definida
    const th = Math.atan2(dy, dx), al = Math.asin(c.r / d), t = Math.sqrt(d * d - c.r * c.r);
    const a1 = th + al, a2 = th - al;
    const q = [
      { x: L.x + t * Math.cos(a1), y: L.y + t * Math.sin(a1) },
      { x: L.x + reach * Math.cos(a1), y: L.y + reach * Math.sin(a1) },
      { x: L.x + reach * Math.cos(a2), y: L.y + reach * Math.sin(a2) },
      { x: L.x + t * Math.cos(a2), y: L.y + t * Math.sin(a2) }
    ];
    let area = 0; for (let i = 0; i < 4; i++) { const p = q[i], n = q[(i + 1) % 4]; area += p.x * n.y - n.x * p.y; }
    if (area < 0) q.reverse();
    out.push(q);
  }
  return out;
}

// Parte de la boca de una portería que se ve desde la luz sin que ningún jugador la tape.
// goal = { x (línea de gol), y0, y1 }. Devuelve { open: 0..1, spans: [[ya,yb], …] abiertos, blocked: [[ya,yb], …] } (y en unidades de campo) o null.
export function goalOpening(L, goal, circles) {
  const s = Math.sign(goal.x - L.x), D = Math.abs(goal.x - L.x);
  if (!s || D < 1) return null;
  const lo = Math.min(goal.y0, goal.y1), hi = Math.max(goal.y0, goal.y1);
  const A = Math.atan((lo - L.y) / D), B = Math.atan((hi - L.y) / D);
  const iv = [];
  for (const c of circles) {
    const dx = s * (c.x - L.x), dy = c.y - L.y, d = Math.hypot(dx, dy);
    if (dx <= 0 || !(d > c.r + 0.5) || dx >= D) continue; // detrás de la luz o más allá de la línea de gol
    const th = Math.atan2(dy, dx), al = Math.asin(c.r / d);
    const a = Math.max(A, th - al), b = Math.min(B, th + al);
    if (b > a) iv.push([a, b]);
  }
  iv.sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const i of iv) { const l = merged[merged.length - 1]; if (l && i[0] <= l[1]) l[1] = Math.max(l[1], i[1]); else merged.push([i[0], i[1]]); }
  const toY = (a) => L.y + D * Math.tan(a);
  const blocked = merged.map(([a, b]) => [toY(a), toY(b)]);
  const spans = []; let cur = A;
  for (const [a, b] of merged) { if (a > cur) spans.push([toY(cur), toY(a)]); cur = b; }
  if (cur < B) spans.push([toY(cur), toY(B)]);
  const total = B - A; let cov = 0; for (const [a, b] of merged) cov += b - a;
  return { open: total > 0 ? Math.max(0, 1 - cov / total) : 0, spans, blocked };
}

// Dibuja las sombras con una función de conversión sx/sy (mundo → píxeles) y un factor de escala k. `clip` = rectángulo en pantalla [x0,y0,x1,y1] opcional.
export function paintShadows(ctx, tf, L, circles, opts = {}) {
  const quads = shadowQuads(L, circles, opts.reach || 3000);
  ctx.save();
  if (opts.clip) { const [x0, y0, x1, y1] = opts.clip; ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip(); }
  if (quads.length) {
    ctx.beginPath();
    for (const q of quads) { q.forEach((p, i) => { const X = tf.sx(p.x), Y = tf.sy(p.y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.closePath(); }
    ctx.fillStyle = 'rgba(6, 8, 22, 0.58)'; ctx.fill('nonzero');
  }
  // resplandor del foco
  const bx = tf.sx(L.x), by = tf.sy(L.y), gr = (opts.glow || 70) * tf.k;
  const g = ctx.createRadialGradient(bx, by, 0, bx, by, gr);
  g.addColorStop(0, 'rgba(255, 236, 160, 0.55)'); g.addColorStop(1, 'rgba(255, 236, 160, 0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, gr, 0, TAU); ctx.fill();
  ctx.restore();
}
