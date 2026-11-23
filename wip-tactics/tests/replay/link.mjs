import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8776'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } }); const pg = await ctx.newPage();
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto('http://localhost:8776/index.html'); await pg.waitForSelector('.rb-btn');
await pg.evaluate(() => { window.__fenixView = { camX: 400, camY: 220, k: 1, W: innerWidth, H: innerHeight, h: 0, zoom: 1 }; window.__fenixLive = [{ id: 1, x: 300, y: 150, r: 15 }, { id: 2, x: 500, y: 150, r: 15 }, { id: 3, x: 400, y: 300, r: 15 }, { id: 4, x: 600, y: 320, r: 15 }]; });
await pg.evaluate(() => { const c = document.getElementById('game'), g = c.getContext('2d'); setInterval(() => { const v = window.__fenixView; g.save(); g.clearRect(0, 0, c.width, c.height); g.translate(c.width / 2, c.height / 2); g.scale(v.k, v.k); g.translate(-v.camX, -v.camY); if (window.__fenixUnder) window.__fenixUnder(g); if (window.__fenixOver) window.__fenixOver(g); g.restore(); }, 30); });
assert.equal(await pg.locator('[data-tool="link"]').count(), 0, 'Unir ya no está en la barra');
await pg.locator('.rb-more').click(); await pg.locator('.rb-ln').click(); await pg.waitForSelector('.rb-linkbar', { state: 'visible' }); assert.equal(await pg.locator('.rb-bar').isVisible(), false, 'sin el menú grande al conectar'); assert.equal(await pg.locator('.rb-acts').isVisible(), false);
const bb = await pg.locator('.rb-canvas').boundingBox();
const at = async (id) => pg.evaluate((id) => { const p = window.__fenixLive.find((q) => q.id === id), v = window.__fenixView; return { x: innerWidth / 2 + v.k * (p.x - v.camX), y: (innerHeight + v.h) / 2 + v.k * (p.y - v.camY) }; }, id);
const tapP = async (id) => { const p = await at(id); await pg.mouse.click(bb.x + p.x, bb.y + p.y); };
const items = () => pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'link'));
await tapP(1); assert.equal(await pg.locator('[data-act="join"]').isDisabled(), true, 'con 1 jugador no se puede unir');
await tapP(2); await tapP(3);
await pg.locator('[data-act="join"]').click(); let L = await items(); assert.equal(L.length, 1, 'triángulo creado'); assert.deepEqual(L[0].ids, [1, 2, 3]);
// mismo grupo otra vez: no se repite
await tapP(3); await tapP(1); await tapP(2); await pg.locator('[data-act="join"]').click(); assert.equal((await items()).length, 1, 'no repite el mismo grupo');
// con un jugador nuevo sí
await tapP(1); await tapP(2); await tapP(3); await tapP(4); await pg.locator('[data-act="join"]').click(); assert.equal((await items()).length, 2, 'grupo con jugador nuevo');
// sigue a los jugadores: mover el jugador 3 y ver que el dibujo cambia
const pix = async (x, y) => pg.evaluate(([x, y]) => { const c = document.getElementById('game'), r = c.getBoundingClientRect(), g = c.getContext('2d'); return Array.from(g.getImageData(Math.round(x * c.width / r.width), Math.round(y * c.height / r.height), 1, 1).data); }, [x, y]);
const p3a = await at(3);
await pg.evaluate(() => { window.__fenixLive.find((q) => q.id === 3).x = 250; window.__fenixLive.find((q) => q.id === 3).y = 380; });
await pg.waitForTimeout(250);
const p3b = await at(3);
const mid = { x: (p3b.x + (await at(1)).x) / 2, y: (p3b.y + (await at(1)).y) / 2 };
const px = await pix(mid.x, mid.y); assert.ok(px[3] > 100, 'la línea sigue al jugador movido: ' + px);
await pg.screenshot({ path: dir + '/link.png' });
// 4 jugadores: el orden queda fijo hasta que uno cruza una línea
const ord0 = await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'link').pop().order.join());
await pg.evaluate(() => { const l = window.__fenixLive; l.find((q) => q.id === 1).x = 290; l.find((q) => q.id === 1).y = 160; }); await pg.waitForTimeout(150);
assert.equal(await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'link').pop().order.join()), ord0, 'mover sin tocar línea no cambia el orden');
await pg.evaluate(() => { const l = window.__fenixLive; l.find((q) => q.id === 1).x = 700; l.find((q) => q.id === 1).y = 100; }); await pg.waitForTimeout(150);
assert.notEqual(await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'link').pop().order.join()), ord0, 'al cruzar una línea se reordena');
// jugadores que NO están en la conexión no la alteran; solo se sombrea la parte que cae dentro de la figura
await pg.evaluate(() => { const st = window.__fenixReplayBoard.st; st.items = st.items.filter((i) => i.ids.length === 3); st.dirty = true; });
await pg.evaluate(() => { const l = window.__fenixLive; l.find((q) => q.id === 1).x = 300; l.find((q) => q.id === 1).y = 150; l.find((q) => q.id === 3).x = 400; l.find((q) => q.id === 3).y = 300; l.find((q) => q.id === 4).x = 700; l.find((q) => q.id === 4).y = 100; l.push({ id: 5, x: 400, y: 150, r: 15 }); }); await pg.waitForTimeout(200);
const tri = () => pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'link')[0].order.join());
assert.ok(!/5/.test(await tri()), 'un jugador ajeno no entra en la conexión: ' + await tri());
const alpha = async (wx, wy) => { const v = await pg.evaluate(() => window.__fenixView); const x = 550 + (wx - v.camX), y = 350 + (wy - v.camY); return pg.evaluate(([x, y]) => { const c = document.getElementById('game'), g = c.getContext('2d'), r = c.getBoundingClientRect(); return g.getImageData(Math.round(x * c.width / r.width), Math.round(y * c.height / r.height), 1, 1).data[3]; }, [x, y]); };
const base = await alpha(400, 240), part = await alpha(400, 160);
assert.ok(part > base + 40, 'la parte dentro de la figura se sombrea más que el relleno: ' + part + ' vs ' + base);
assert.equal(await alpha(400, 140), 0, 'la parte fuera no se sombrea');
// al terminar la conexión, el botón de la cancha vuelve a abrir el menú normal de dibujo
await pg.locator('.rb-linkbar .lk-x').click(); await pg.waitForTimeout(150);
await pg.locator('.rb-btn').click(); await pg.waitForSelector('.rb-bar', { state: 'visible' });
assert.equal(await pg.locator('.rb-linkbar').isVisible(), false, 'sin barra de conexión'); assert.equal(await pg.locator('.rb-t[data-tool=pen]').count(), 1, 'herramientas de dibujo');
await pg.locator('.rb-btn').click().catch(() => {}); await pg.waitForTimeout(100);
// salir de la repetición: se quita de una y no vuelve
await pg.evaluate(() => window.dispatchEvent(new Event('fenix-replay-leave'))); await pg.waitForTimeout(100);
assert.equal(await pg.locator('.rb-layer').count(), 0, 'capa fuera al salir'); assert.equal(await pg.locator('.rb-btn').count(), 0, 'botón fuera al salir');
await pg.waitForTimeout(700); assert.equal(await pg.locator('.rb-btn').count(), 0, 'no reaparece mientras sale');
assert.equal(await pg.evaluate(() => window.__fenixUnder == null), true, 'sin capa del motor');
console.log('ERRS', JSON.stringify(errs)); assert.equal(errs.length, 0); console.log('OK link');
srv.kill(); await b.close();
