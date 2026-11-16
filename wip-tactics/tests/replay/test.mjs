import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8773'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
for (const [name, vp, touch] of [['desk', { width: 1100, height: 700 }, false], ['mob', { width: 390, height: 780 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2, acceptDownloads: true }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('http://localhost:8773/index.html'); await pg.waitForSelector('.rb-btn', { timeout: 5000 });
  assert.equal(await pg.locator('.rb-bar').isVisible(), false, 'barra oculta al inicio');
  await pg.locator('.rb-btn').click(); await pg.waitForSelector('.rb-bar', { state: 'visible' });
  const bb = await pg.locator('.rb-canvas').boundingBox(); const gb = await pg.locator('#game').boundingBox();
  assert.ok(Math.abs(bb.width - gb.width) < 2 && Math.abs(bb.height - gb.height) < 2, 'capa del tamaño de la cancha');
  const P = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });
  const drag = async (a, c, steps = 8) => { const A = P(...a), B = P(...c); await pg.mouse.move(A.x, A.y); await pg.mouse.down(); for (let i = 1; i <= steps; i++) await pg.mouse.move(A.x + (B.x - A.x) * i / steps, A.y + (B.y - A.y) * i / steps); await pg.mouse.up(); };
  const tap = async (f) => { const A = P(...f); await pg.mouse.click(A.x, A.y); };
  const n = () => pg.evaluate(() => window.__fenixReplayBoard.st.items.length);
  const tool = (id) => pg.locator('[data-tool="' + id + '"]').click();
  await tool('pen'); await drag([0.1, 0.2], [0.4, 0.35]); assert.equal(await n(), 1, 'lápiz');
  await tool('arrow'); await drag([0.2, 0.7], [0.5, 0.55]); assert.equal(await n(), 2, 'flecha');
  await pg.locator('[data-color="#4CC38A"]').click(); await tool('circle'); await drag([0.75, 0.3], [0.85, 0.3]); assert.equal(await n(), 3, 'zona');
  await tool('red'); await tap([0.3, 0.5]); await tap([0.4, 0.6]); await tool('blue'); await tap([0.7, 0.5]); await tool('ball'); await tap([0.5, 0.5]);
  assert.equal(await n(), 7, 'fichas y balón');
  const toks = await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'token').map((i) => i.team + i.n).join());
  assert.equal(toks, 'red1,red2,blue1', 'numeración por equipo');
  await pg.screenshot({ path: dir + '/rb-' + name + '.png' });
  // borrador: quita la ficha azul
  await tool('erase'); await tap([0.7, 0.5]); assert.equal(await n(), 6, 'borrador');
  // deshacer
  await pg.locator('[data-act="undo"]').click(); assert.equal(await n(), 5, 'deshacer');
  // modo mover: el clic atraviesa la capa
  await tool('hand'); assert.equal(await pg.locator('.rb-canvas').evaluate((c) => getComputedStyle(c).pointerEvents), 'none', 'mover deja pasar');
  // captura
  const dl = pg.waitForEvent('download'); await pg.locator('[data-act="shot"]').click(); const d = await dl; assert.ok(/\.png$/.test(d.suggestedFilename()), 'captura png'); await d.saveAs(dir + '/rb-shot-' + name + '.png');
  // limpiar con confirmación
  await pg.locator('[data-act="clear"]').click(); assert.equal(await n(), 5, 'pide confirmar'); await pg.locator('[data-act="clear"]').click(); assert.equal(await n(), 0, 'limpiado');
  // botón atrás cierra la pizarra primero
  await pg.evaluate(() => window.__fenixBack()); assert.equal(await pg.locator('.rb-bar').isVisible(), false, 'atrás cierra'); assert.equal(await pg.evaluate(() => window.__backCalled || 0), 0, 'no pasó al atrás de la app');
  await pg.evaluate(() => window.__fenixBack()); assert.equal(await pg.evaluate(() => window.__backCalled), 1, 'luego sí al atrás de la app');
  console.log('OK', name);
}
console.log('ERRS', errs); srv.kill(); await b.close();
