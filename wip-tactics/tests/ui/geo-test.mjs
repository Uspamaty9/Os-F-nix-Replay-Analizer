// Pruebas de funciones puras: flecha curva, polígonos sin cruces, límite de jugadores y migración de jugadas antiguas.
import assert from 'node:assert/strict';
import * as G from '../../src/tactics/geometry.js';
import * as M from '../../src/tactics/model.js';

// flecha curva: pasa por el punto medio y el signo decide el lado
const a = { x: 0, y: 0 }, b = { x: 100, y: 0 };
const up = G.curveMid(a, b, -30), down = G.curveMid(a, b, 30);
assert.ok(up.y < 0 && down.y > 0, 'lados opuestos');
assert.ok(Math.sign(G.chordDev(a, b, down)) === Math.sign(30) && Math.sign(G.chordDev(a, b, up)) === -1, 'chordDev concuerda con curveMid');
const c = G.curveCtrl(a, down, b); const mid = G.quadAt(a, c, b, 0.5);
assert.ok(Math.abs(mid.x - down.x) < 1e-9 && Math.abs(mid.y - down.y) < 1e-9, 'la curva pasa por el tirador');

// pentágono tocado en el orden 1,2,4,3,5 → no se cruza
const pent = [0, 1, 2, 3, 4].map((i) => ({ i: i + 1, x: Math.sin((i * 2 * Math.PI) / 5) * 100, y: -Math.cos((i * 2 * Math.PI) / 5) * 100 }));
const bad = [pent[0], pent[1], pent[3], pent[2], pent[4]];
assert.ok(G.selfIntersects(bad), 'el orden 1,2,4,3,5 se cruza');
const fixed = G.untangle(bad);
assert.ok(!G.selfIntersects(fixed), 'queda sin cruces');
assert.equal(fixed.length, 5);
const ord = fixed.map((p) => p.i).join('');
assert.ok(ord === '12345' || ord === '15432' || /^(?:12345|23451|34512|45123|51234|54321|43215|32154|21543|15432)$/.test(ord), 'recorre el pentágono: ' + ord);
const ok5 = pent.slice(); assert.deepEqual(G.untangle(ok5), ok5, 'un polígono correcto no se toca');

// límite de jugadores por equipo
let d = M.newDoc('t');
for (let i = 0; i < M.MAX_PER_TEAM; i++) { const r = M.addPlayer(d, 0, { x: i * 10, y: 0, team: 'red' }); assert.ok(r.id); d = r.doc; }
const over = M.addPlayer(d, 0, { x: 0, y: 0, team: 'red' });
assert.equal(over.id, null); assert.equal(over.doc.players.length, M.MAX_PER_TEAM);
assert.ok(M.addPlayer(d, 0, { x: 0, y: 0, team: 'blue' }).id, 'el otro equipo tiene su propio cupo');

// jugadas antiguas: círculo/cuadrado/triángulo pasan a polígono; la curva antigua conserva su forma
const old = M.normalizeDoc({ shapes: [
  { id: 'c', type: 'circle', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }, { id: 's', type: 'square', pts: [{ x: 0, y: 0 }] }, { id: 't', type: 'triangle', pts: [{ x: 0, y: 0 }] },
  { id: 'k', type: 'carrow', pts: [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 0 }] }] });
assert.deepEqual(old.shapes.map((s) => s.type), ['polygon', 'polygon', 'polygon', 'carrow']);
const k = old.shapes[3]; const m2 = G.quadAt(old.shapes[3].pts[0], { x: 50, y: 40 }, old.shapes[3].pts[2], 0.5);
assert.ok(Math.abs(k.pts[1].x - m2.x) < 1e-9 && Math.abs(k.pts[1].y - m2.y) < 1e-9, 'migración de la curva');
console.log('OK geo');
