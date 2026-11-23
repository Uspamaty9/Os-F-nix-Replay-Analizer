// Sombras de tiro en la pizarra: el balón es un foco, cada ficha tapa la luz; se ve cuánta portería queda libre
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process'; import assert from 'node:assert/strict';
const srv = spawn('python3', ['-m', 'http.server', '8773'], { cwd: process.argv[2], stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 600));
const b = await chromium.launch(); const errs = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 }); const pg = await ctx.newPage();
pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await pg.goto('http://localhost:8773/index.html'); await pg.waitForSelector('.tx-root[data-ready="1"]');
const bb = await pg.locator('.tx-canvas').boundingBox();
const tap = (fx, fy) => pg.mouse.click(bb.x + bb.width * fx, bb.y + bb.height * fy);
await pg.locator('.tx-db.cat:has-text("Añadir")').click(); await pg.locator('.tx-ft', { hasText: 'Balón' }).click(); await tap(0.4, 0.5);
await pg.evaluate(() => { window.__ctl.setNewTeam('blue'); window.__ctl.setTool('player'); }); await tap(0.55, 0.5);
await pg.locator('.tx-db:has-text("Mover")').click();
const sample = () => pg.evaluate(() => { const c = document.querySelector('.tx-canvas'); const cv = c.tagName === 'CANVAS' ? c : c.querySelector('canvas'); const x = cv.getContext('2d'); const w = cv.width, h = cv.height;
  const px = (fx, fy) => { const d = x.getImageData(Math.round(w * fx), Math.round(h * fy), 1, 1).data; return d[0] + d[1] + d[2]; };
  return { behind: px(0.7, 0.5), above: px(0.7, 0.3) }; });
const off = await sample(); assert.ok(Math.abs(off.behind - off.above) < 60, 'sin sombras no hay diferencia ' + JSON.stringify(off));
await pg.locator('.tx-db.cat:has-text("Más")').click(); await pg.locator('.tx-ft.shadow').click();
await pg.waitForTimeout(150);
const on = await sample(); assert.ok(on.behind < on.above - 40, 'detrás de la ficha hay sombra ' + JSON.stringify(on));
await pg.locator('.tx-db.cat:has-text("Más")').click(); assert.equal(await pg.locator('.tx-ft.shadow').getAttribute('aria-pressed'), 'true');
await pg.screenshot({ path: process.argv[3] + '/shadow-board.png' });
// elegir quién proyecta sombra: con un segundo jugador abajo, al elegir solo al azul desaparece la sombra del otro
await pg.evaluate(() => { window.__ctl.setNewTeam('red'); window.__ctl.setTool('player'); }); await tap(0.55, 0.78);
await pg.locator('.tx-db:has-text("Mover")').click();
const dark = () => pg.evaluate(() => { const c = document.querySelector('.tx-canvas'); const cv = c.tagName === 'CANVAS' ? c : c.querySelector('canvas'); const x = cv.getContext('2d'); const w = cv.width, h = cv.height; let n = 0;
  for (let fy = 0.62; fy < 0.9; fy += 0.02) for (let fx = 0.3; fx < 0.95; fx += 0.02) { const d = x.getImageData(Math.round(w * fx), Math.round(h * fy), 1, 1).data; if (d[0] + d[1] + d[2] < 330) n++; } return n; });
const allDark = await dark(); assert.ok(allDark > 8, 'con todos hay sombra abajo ' + allDark);
await pg.locator('.tx-db.cat:has-text("Más")').click(); await pg.locator('.tx-ft', { hasText: 'Elegir quién' }).click();
await tap(0.55, 0.5); // solo el azul
await pg.waitForTimeout(100);
const onlyDark = await dark(); assert.ok(onlyDark < allDark * 0.5, 'solo el elegido proyecta: ' + onlyDark + ' < ' + allDark);
await pg.locator('.tx-db.cat:has-text("Más")').click(); await pg.locator('.tx-ft', { hasText: 'Todos' }).click(); await pg.waitForTimeout(100);
assert.ok((await dark()) > allDark * 0.8, 'Todos vuelve a proyectar');
await pg.locator('.tx-db:has-text("Mover")').click();
await pg.locator('.tx-db.cat:has-text("Más")').click(); await pg.locator('.tx-ft.shadow').click(); await pg.waitForTimeout(100);
const off2 = await sample(); assert.ok(Math.abs(off2.behind - off2.above) < 60, 'se apaga ' + JSON.stringify(off2));
console.log('ERRS', JSON.stringify(errs)); assert.equal(errs.length, 0); console.log('OK shadow-board');
await b.close(); srv.kill();
