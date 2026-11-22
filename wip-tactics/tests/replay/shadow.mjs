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
  await click('.rb-more'); await click('.rb-sh'); await pg.waitForSelector('.rs-layer', { state: 'visible' });
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
  // cartel de gol (el motor avisa con window.__fenixCard): su placa va por encima de la sombra; sin aviso no se toca nada
  await pg.evaluate(() => { const g = document.getElementById('game'), c = g.getContext('2d'); c.fillStyle = '#ff0000'; c.fillRect(g.width / 2 - 100, g.height / 2 - 20, 200, 40); window.__tcard = setInterval(() => { window.__fenixCard = { t: performance.now(), sc: 1, al: 1, dy: 0, w: 640, h: 156 }; }, 16); window.__fenixBall = { x: -300, y: 0 }; window.__fenixLive = [{ id: 1, x: -250, y: 0, r: 15 }]; }); await pg.waitForTimeout(200);
  const ctr = () => pg.evaluate(() => { const cv = document.querySelector('.rs-canvas'); return Array.from(cv.getContext('2d').getImageData(Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data); });
  assert.deepEqual(await ctr(), [255, 0, 0, 255], 'cartel por encima de la sombra');
  await pg.evaluate(() => { clearInterval(window.__tcard); }); await pg.waitForTimeout(250);
  assert.ok((await ctr())[3] > 80 && (await ctr())[0] < 40, 'sin cartel vuelve la sombra (sin rectángulo)');
  // la sombra no pasa de la cancha: con el motor publicando __fenixPitch, fuera del rectángulo no hay sombra
  await pg.evaluate(() => { window.__fenixBall = { x: 0, y: 0 }; window.__fenixLive = [{ id: 1, x: 50, y: 0, r: 15 }]; window.__fenixPitch = { w: 100, h: 100 }; }); await pg.waitForTimeout(150);
  const alphaP = (x, y) => pg.evaluate(([x, y]) => { const v = window.__fenixView, cv = document.querySelector('.rs-canvas'); return cv.getContext('2d').getImageData(Math.round((v.W / 2 + v.k * x) * (cv.width / v.W)), Math.round(((v.H + v.h) / 2 + v.k * y) * (cv.height / v.H)), 1, 1).data[3]; }, [x, y]);
  assert.ok((await alphaP(85, 0)) > 80, 'dentro de la cancha hay sombra');
  assert.equal(await alphaP(115, 0), 0, 'fuera de la cancha no hay sombra');
  await pg.evaluate(() => { window.__fenixPitch = null; }); await pg.waitForTimeout(150);
  assert.ok((await alphaP(115, 0)) > 80, 'sin dato de cancha no se recorta');
  // elegir quién proyecta: con dos jugadores, al elegir solo al A desaparece la sombra del B
  await pg.evaluate(() => { window.__fenixBall = { x: 0, y: 0 }; window.__fenixLive = [{ id: 1, x: 50, y: 0, r: 15 }, { id: 2, x: 50, y: 30, r: 15 }]; }); await pg.waitForTimeout(150);
  const alphaAt = (x, y) => pg.evaluate(([x, y]) => { const v = window.__fenixView, cv = document.querySelector('.rs-canvas'); return cv.getContext('2d').getImageData(Math.round((v.W / 2 + v.k * x) * (cv.width / v.W)), Math.round(((v.H + v.h) / 2 + v.k * y) * (cv.height / v.H)), 1, 1).data[3]; }, [x, y]);
  assert.ok((await alphaAt(120, 72)) > 80, 'con todos, el B proyecta');
  await click('.rb-more'); await click('[data-act=pick]'); await pg.waitForSelector('.rb-pickbar', { state: 'visible' });
  const where = await pg.evaluate(() => { const v = window.__fenixView, g = document.getElementById('game'), r = g.getBoundingClientRect(); return { x: r.left + (v.W / 2 + v.k * 50) * (r.width / v.W), y: r.top + ((v.H + v.h) / 2) * (r.height / v.H) }; });
  if (touch) await pg.touchscreen.tap(where.x, where.y); else await pg.mouse.click(where.x, where.y);
  await pg.waitForTimeout(150);
  assert.match(await pg.locator('.rb-pop .who').textContent(), /1 jugador elegido/);
  assert.ok((await alphaAt(120, 72)) < 20, 'solo el elegido proyecta');
  assert.ok((await alphaAt(120, 0)) > 80, 'el elegido sí proyecta');
  await click('.rb-pickbar button'); assert.equal(await pg.locator('.rb-pickbar').isVisible(), false);
  await click('.rb-more'); await click('[data-act=all]'); await pg.waitForTimeout(150);
  assert.ok((await alphaAt(120, 72)) > 80, 'Todos vuelve a proyectar');
  await click('.rb-sh'); await pg.waitForTimeout(150);
  assert.equal(await pg.locator('.rs-layer').isVisible(), false, 'se apaga');
  await ctx.close();
}
console.log('ERRS', JSON.stringify(errs)); assert.equal(errs.length, 0); console.log('OK shadow');
await b.close(); srv.kill();
