// Sombras de tiro sobre la repetición: botón «Más», interruptor y pintado (oscuro detrás de un jugador, claro en el resto)
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const dir = process.argv[2];
const srv = spawn('python3', ['-m', 'http.server', '8776'], { cwd: dir, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
for (const [name, vp, touch] of [['desk', { width: 1100, height: 700 }, false], ['mob', { width: 390, height: 780 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('http://localhost:8776/index.html'); await pg.waitForSelector('.rb-more', { timeout: 5000 });
  assert.equal(await pg.locator('.rb-pop').isVisible(), false, 'menú cerrado al inicio');
  assert.equal(await pg.locator('.rs-layer').isVisible(), false, 'sin sombras al inicio');
  const click = (s) => (touch ? pg.locator(s).tap() : pg.locator(s).click());
  await click('.rb-more'); await pg.waitForSelector('.rb-pop', { state: 'visible' });
  await click('.rb-pop-it'); await pg.waitForSelector('.rs-layer', { state: 'visible' });
  assert.equal(await pg.locator('.rb-more.active').count(), 1, 'botón Más marcado con sombras activas');
  // balón en el centro de la cámara, un jugador a su derecha: detrás del jugador (x mayor) hay sombra; arriba a la derecha no
  await pg.evaluate(() => { window.__fenixBall = { x: 0, y: 0 }; window.__fenixLive = [{ id: 1, x: 80, y: 0, r: 15 }]; const g = document.getElementById('game'); Object.assign(window.__fenixView, { W: g.width, H: g.height }); });
  await pg.waitForTimeout(250);
  const px = await pg.evaluate(() => {
    const v = window.__fenixView, cv = document.querySelector('.rs-canvas'), r = cv.getBoundingClientRect(), f = cv.width / r.width, c = cv.getContext('2d');
    const at = (x, y) => c.getImageData(Math.round((v.W / 2 + v.k * x) * (cv.width / v.W)), Math.round(((v.H + v.h) / 2 + v.k * y) * (cv.height / v.H)), 1, 1).data[3];
    return { behind: at(110, 0), side: at(110, 60), front: at(40, 0), ball: at(0, 0) };
  });
  assert.ok(px.behind > 80, 'sombra detrás del jugador: ' + JSON.stringify(px));
  assert.ok(px.side < 20, 'sin sombra a un lado: ' + JSON.stringify(px));
  // cartel de gol: el motor lo dibuja en el centro; la sombra no debe pasar por encima
  const centerA = () => pg.evaluate(() => { const v = window.__fenixView, cv = document.querySelector('.rs-canvas'); const d = cv.getContext('2d').getImageData(Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data; return d[3]; });
  await pg.evaluate(() => { window.__fenixBall = { x: -300, y: 0 }; window.__fenixLive = [{ id: 1, x: -250, y: 0, r: 15 }]; }); await pg.waitForTimeout(150);
  assert.ok((await centerA()) > 80, 'la sombra cruza el centro sin cartel');
  await pg.evaluate(() => { const g = document.getElementById('game'), c = g.getContext('2d'); c.fillStyle = '#ff0000'; c.fillRect(g.width / 2 - 100, g.height / 2 - 20, 200, 40); const t = document.createElement('div'); t.className = 'fenix-toast fenix-goal-toast'; document.body.appendChild(t); }); await pg.waitForTimeout(150);
  const red = await pg.evaluate(() => { const cv = document.querySelector('.rs-canvas'); return Array.from(cv.getContext('2d').getImageData(Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data); });
  assert.deepEqual(red, [255, 0, 0, 255], 'con el cartel de gol el cartel va encima de la sombra: ' + red);
  await pg.evaluate(() => document.querySelector('.fenix-goal-toast').remove()); await pg.waitForTimeout(150);
  assert.ok((await centerA()) > 80, 'vuelve la sombra al desaparecer el cartel');
  await click('.rb-more'); await click('.rb-pop-it'); await pg.waitForTimeout(150);
  assert.equal(await pg.locator('.rs-layer').isVisible(), false, 'se apaga');
  await ctx.close();
}
console.log('ERRS', JSON.stringify(errs)); assert.equal(errs.length, 0); console.log('OK shadow');
await b.close(); srv.kill();
