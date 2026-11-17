import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8775'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
for (const [name, vp, touch] of [['desk', { width: 1100, height: 700 }, false], ['mob', { width: 390, height: 780 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2, acceptDownloads: true }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('http://localhost:8775/index.html'); await pg.waitForSelector('.rb-btn', { timeout: 5000 });
  assert.equal(await pg.locator('.rb-bar').isVisible(), false, 'barra oculta al inicio');
  const early = await pg.evaluate(async () => { const app = document.getElementById('app'); app.innerHTML = ''; await new Promise((r) => setTimeout(r, 400)); const w = innerWidth, h = innerHeight; app.innerHTML = '<div class="game-view"><div class="stage" id="host"><div><canvas id="game" width="' + w + '" height="' + h + '"></canvas></div><button class="fenix-fit">fit</button><button class="fenix-follow">f</button></div></div>'; await Promise.resolve(); await Promise.resolve(); return !!document.querySelector('.rb-btn'); });
  assert.ok(early, 'el botón aparece a la vez que los demás');
  await pg.locator('.rb-btn').click(); await pg.waitForSelector('.rb-bar', { state: 'visible' });
  // el botón y la barra: la barra queda por encima de cualquier botón de la repetición; el de zoom/restablecer sigue visible
  await pg.evaluate(() => { const z = document.createElement('button'); z.className = 'zz'; z.style.cssText = 'position:absolute;left:40px;bottom:30px;width:60px;height:40px;z-index:30'; document.getElementById('host').appendChild(z); });
  await pg.waitForTimeout(100);
  const topIsBar = await pg.evaluate(() => { const r = document.querySelector('.zz').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(el && el.closest('.rb-bar')); });
  assert.ok(topIsBar, 'la barra queda por encima de cualquier botón');
  assert.equal(await pg.locator('.fenix-fit').isVisible(), true, 'botón de zoom visible con la pizarra abierta');
  const acts = await pg.locator('.rb-acts').boundingBox(); assert.ok(acts && acts.y > 40, 'acciones debajo del botón de zoom');
  const bb = await pg.locator('.rb-canvas').boundingBox(); const gb = await pg.locator('#game').boundingBox();
  assert.ok(Math.abs(bb.width - gb.width) < 2 && Math.abs(bb.height - gb.height) < 2, 'capa del tamaño de la cancha');
  const P = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });
  const drag = async (a, c, steps = 8) => { const A = P(...a), B = P(...c); await pg.mouse.move(A.x, A.y); await pg.mouse.down(); for (let i = 1; i <= steps; i++) await pg.mouse.move(A.x + (B.x - A.x) * i / steps, A.y + (B.y - A.y) * i / steps); await pg.mouse.up(); };
  const tap = async (f) => { const A = P(...f); await pg.mouse.click(A.x, A.y); };
  const n = () => pg.evaluate(() => window.__fenixReplayBoard.st.items.length);
  const tool = (id) => pg.locator('[data-tool="' + id + '"]').click();
  await tool('pen'); await drag([0.1, 0.2], [0.4, 0.35]); assert.equal(await n(), 1, 'lápiz');
  await tool('arrow'); await drag([0.2, 0.7], [0.5, 0.55]); assert.equal(await n(), 2, 'flecha');
  await pg.locator('[data-color="#4CC38A"]').click(); await tool('carrow'); await drag([0.75, 0.3], [0.85, 0.3]); assert.equal(await n(), 3, 'zona');
  await tool('red'); await tap([0.3, 0.5]); await tap([0.4, 0.6]); await tool('blue'); await tap([0.7, 0.5]); await tool('ball'); await tap([0.5, 0.5]);
  assert.equal(await n(), 7, 'fichas y balón');
  const toks = await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'token').map((i) => i.team + i.n).join());
  assert.equal(toks, 'red1,red2,blue1', 'numeración por equipo');
  await pg.screenshot({ path: dir + '/rb-' + name + '.png' });
  // borrador: quita la ficha azul
  await tool('erase'); await tap([0.7, 0.5]); assert.equal(await n(), 6, 'borrador');
  // deshacer
  await pg.locator('[data-act="undo"]').click(); assert.equal(await n(), 7, 'deshacer restaura lo borrado');
  // modo mover: el clic atraviesa la capa
  await tool('hand'); assert.equal(await pg.locator('.rb-canvas').evaluate((c) => getComputedStyle(c).pointerEvents), 'none', 'mover deja pasar');
  // más herramientas
  const n0 = await n(); await tool('rect'); await drag([0.1, 0.6], [0.25, 0.7]); await tool('press'); await drag([0.6, 0.6], [0.8, 0.7]); await tool('carrow'); await drag([0.05, 0.42], [0.2, 0.42]); await tool('dline'); await drag([0.5, 0.1], [0.9, 0.1]);
  assert.equal(await n(), n0 + 4, 'rect, zona, flecha curva, discontinua');
  // mover una marca
  await tool('select'); const tk0 = await pg.evaluate(() => window.__fenixReplayBoard.st.items.find((i) => i.type === 'token').p); await drag([0.3, 0.5], [0.3, 0.3]);
  const tk1 = await pg.evaluate(() => window.__fenixReplayBoard.st.items.find((i) => i.type === 'token').p); assert.ok(tk1.y < tk0.y - 20 && Math.abs(tk1.x - tk0.x) < 3, 'mover marca');
  await pg.locator('[data-act="undo"]').click(); const tk2 = await pg.evaluate(() => window.__fenixReplayBoard.st.items.find((i) => i.type === 'token').p); assert.ok(Math.abs(tk2.y - tk0.y) < 1, 'deshacer el movimiento');
  for (let i = 0; i < 4; i++) await pg.locator('[data-act="undo"]').click(); assert.equal(await n(), n0, 'deshacer 4 marcas');
  // dos dedos = deshacer, tres = rehacer (táctil)
  if (touch) {
    const cdp = await ctx.newCDPSession(pg);
    const fingers = async (pts) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })) }); await new Promise((r) => setTimeout(r, 80)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await new Promise((r) => setTimeout(r, 60)); };
    await tool('pen'); const pa = P(0.2, 0.2), pb = P(0.3, 0.25), pc = P(0.4, 0.3);
    const before = await n(); await tool('red'); await tap([0.4, 0.4]); assert.equal(await n(), before + 1);
    await fingers([pa, pb]); assert.equal(await n(), before, 'dos dedos deshacen'); await fingers([pa, pb, pc]); assert.equal(await n(), before + 1, 'tres dedos rehacen');
    await tool('pen');
  }
  // captura
  const dl = pg.waitForEvent('download'); await pg.locator('[data-act="shot"]').click(); const d = await dl; assert.ok(/\.png$/.test(d.suggestedFilename()), 'captura png'); await d.saveAs(dir + '/rb-shot-' + name + '.png');
  // limpiar con confirmación
  const nc = await n(); await pg.locator('[data-act="clear"]').click(); assert.equal(await n(), nc, 'pide confirmar'); await pg.locator('[data-act="clear"]').click(); assert.equal(await n(), 0, 'limpiado'); await pg.locator('[data-act="undo"]').click(); assert.equal(await n(), nc, 'deshacer limpiar');  await pg.locator('[data-act="redo"]').click(); assert.equal(await n(), 0, 'rehacer'); await pg.locator('[data-act="undo"]').click();
  // botón atrás cierra la pizarra primero
  await pg.evaluate(() => window.__fenixBack()); assert.equal(await pg.locator('.rb-bar').isVisible(), false, 'atrás cierra'); assert.equal(await pg.evaluate(() => window.__backCalled || 0), 0, 'no pasó al atrás de la app');
  await pg.evaluate(() => window.__fenixBack()); assert.equal(await pg.evaluate(() => window.__backCalled), 1, 'luego sí al atrás de la app');
  console.log('OK', name);
}
console.log('ERRS', errs); srv.kill(); await b.close();
