import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8776'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 } }); const pg = await ctx.newPage();
pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto('http://localhost:8776/index.html'); await pg.waitForSelector('.rb-btn');
await pg.evaluate(() => { window.__fenixView = { camX: 400, camY: 220, k: 1, W: innerWidth, H: innerHeight, h: 0, zoom: 1 }; window.__fenixLive = [{ id: 1, x: 300, y: 150, r: 15 }, { id: 2, x: 500, y: 150, r: 15 }, { id: 3, x: 400, y: 300, r: 15 }, { id: 4, x: 600, y: 320, r: 15 }]; });
await pg.locator('.rb-btn').click(); await pg.waitForSelector('.rb-bar', { state: 'visible' });
await pg.locator('[data-tool="link"]').click();
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
const pix = async (x, y) => pg.evaluate(([x, y]) => { const c = document.querySelector('.rb-canvas'), r = c.getBoundingClientRect(), g = c.getContext('2d'), d = devicePixelRatio || 1; return Array.from(g.getImageData(Math.round(x * c.width / r.width), Math.round(y * c.height / r.height), 1, 1).data); }, [x, y]);
const p3a = await at(3);
await pg.evaluate(() => { window.__fenixLive.find((q) => q.id === 3).x = 250; window.__fenixLive.find((q) => q.id === 3).y = 380; });
await pg.waitForTimeout(250);
const p3b = await at(3);
const mid = { x: (p3b.x + (await at(1)).x) / 2, y: (p3b.y + (await at(1)).y) / 2 };
const px = await pix(mid.x, mid.y); assert.ok(px[3] > 100, 'la línea sigue al jugador movido: ' + px);
await pg.screenshot({ path: dir + '/link.png' });
console.log('ERRS', JSON.stringify(errs)); assert.equal(errs.length, 0); console.log('OK link');
srv.kill(); await b.close();
