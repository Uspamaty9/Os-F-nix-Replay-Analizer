import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const srv = spawn('python3', ['-m', 'http.server', '8772'], { cwd: process.argv[2], stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
for (const [name, vp, touch] of [['desk', { width: 1280, height: 760 }, false], ['mob', { width: 390, height: 800 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch, isMobile: touch, deviceScaleFactor: 2 }); const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto('http://localhost:8772/index.html'); await pg.waitForSelector('.tx-root[data-ready="1"]');
  const bb = await pg.locator('.tx-canvas').boundingBox();
  const tap = async (fx, fy) => { const x = bb.x + bb.width * fx, y = bb.y + bb.height * fy; touch ? await pg.touchscreen.tap(x, y) : await pg.mouse.click(x, y); };
  await pg.locator('[aria-label="Ficha equipo rojo"]').first().click(); await tap(0.3, 0.4); await tap(0.4, 0.6);
  await pg.locator('[aria-label="Ficha equipo azul"]').first().click(); await tap(0.7, 0.4); await tap(0.6, 0.6);
  const count = () => pg.evaluate(() => window.__ctl ? window.__ctl.doc.players.length : -1);
  const red = await pg.locator('.tx-canvas').evaluate(() => 0);
  // borrador
  await pg.locator('.tx-act:has-text("Borrador")').click(); await tap(0.7, 0.4); await tap(0.6, 0.6);
  await pg.screenshot({ path: process.argv[3] + '/er-' + name + '.png' });
  await pg.locator('.tx-act:has-text("Limpiar")').click(); assert.ok(await pg.locator('.tx-act.danger.on').count() === 1, 'pide confirmar');
  await pg.locator('.tx-act.danger').click();
  await pg.waitForTimeout(100);
}
console.log('ERRS', errs); srv.kill(); await b.close();
