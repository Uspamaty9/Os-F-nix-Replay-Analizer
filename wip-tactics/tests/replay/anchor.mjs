// El dibujo debe quedar ANCLADO AL CAMPO: al mover la cámara o hacer zoom, cada raya sigue en su sitio del campo.
// Uso: build del bundle en DIR (entry.js + index.html) y  node anchor.mjs DIR
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8774'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await pg.goto('http://localhost:8774/index.html'); await pg.waitForSelector('.rb-btn', { timeout: 5000 });
await pg.locator('.rb-btn').click(); await pg.waitForSelector('.rb-bar', { state: 'visible' });
const bb = await pg.locator('.rb-canvas').boundingBox();
const P = (fx, fy) => ({ x: bb.x + bb.width * fx, y: bb.y + bb.height * fy });
await pg.locator('[data-tool="pen"]').click();
const A = P(0.3, 0.5), B = P(0.5, 0.5); await pg.mouse.move(A.x, A.y); await pg.mouse.down(); for (let i = 1; i <= 8; i++) await pg.mouse.move(A.x + (B.x - A.x) * i / 8, A.y); await pg.mouse.up();
const pts = await pg.evaluate(() => window.__fenixReplayBoard.st.items[0].pts);
// coordenadas de campo esperadas con la cámara inicial (camX 0, k 1, canvas 1100 px)
const wx0 = 0.3 * 1100 - 550; assert.ok(Math.abs(pts[0].x - wx0) < 3, 'guardado en coordenadas de campo: ' + pts[0].x + ' vs ' + wx0);
// pixel del canvas de la capa en una posición CSS (fx, fy)
const alphaAt = (fx, fy) => pg.evaluate(([fx, fy]) => { const c = document.querySelector('.rb-canvas'); const g = c.getContext('2d'); const d = g.getImageData(Math.round(fx * c.width), Math.round(fy * c.height), 3, 3).data; let m = 0; for (let i = 3; i < d.length; i += 4) m = Math.max(m, d[i]); return m; }, [fx, fy]);
assert.ok(await alphaAt(0.4, 0.5) > 0, 'raya visible donde se dibujó');
// la cámara se mueve y hace zoom (como seguir a un jugador): la raya debe moverse con el campo
await pg.evaluate(() => { Object.assign(window.__fenixView, { camX: 40, camY: 0, k: 1.5, zoom: 1.5 }); });
await pg.waitForTimeout(250);
// el punto medio de la raya (campo x = -110) ahora cae en buffer x = 550 + (-110-40)*1.5 = 325  => fx = 325/1100
const fxNew = (550 + (-110 - 40) * 1.5) / 1100;
assert.ok(await alphaAt(fxNew, 0.5) > 0, 'la raya siguió al campo tras mover/zoom de cámara');
assert.equal(await alphaAt(0.5, 0.5), 0, 'ya no queda en la posición vieja de la pantalla');
const same = await pg.evaluate(() => window.__fenixReplayBoard.st.items[0].pts[0]); assert.deepEqual(same, pts[0], 'las coordenadas de campo no cambian');
// dibujar con la cámara ya movida: sigue guardando en campo
await pg.locator('[data-tool="red"]').click(); const T = P(0.5, 0.3); await pg.mouse.click(T.x, T.y);
const tk = await pg.evaluate(() => window.__fenixReplayBoard.st.items.find((i) => i.type === 'token').p);
assert.ok(Math.abs(tk.x - (40 + (0.5 * 1100 - 550) / 1.5)) < 1 && Math.abs(tk.y - (0 + (0.3 * 700 - 350) / 1.5)) < 1, 'ficha en campo con cámara movida: ' + JSON.stringify(tk));
// cerrar la pizarra: lo dibujado se queda y sigue anclado
await pg.locator('[data-act="close"]').click(); await pg.evaluate(() => { window.__fenixView.camX = -60; }); await pg.waitForTimeout(250);
const fx2 = (550 + (-110 + 60) * 1.5) / 1100; assert.ok(await alphaAt(fx2, 0.5) > 0, 'cerrada la pizarra, la raya sigue anclada');
// borrador con cámara movida
await pg.locator('.rb-btn').click(); await pg.locator('[data-tool="erase"]').click(); const E = P(fx2, 0.5); await pg.mouse.click(E.x, E.y);
assert.equal(await pg.evaluate(() => window.__fenixReplayBoard.st.items.filter((i) => i.type === 'pen').length), 0, 'borrador acierta en pantalla con cámara movida');
console.log('OK anclaje al campo'); console.log('ERRS', errs); assert.equal(errs.length, 0);
srv.kill(); await b.close();
