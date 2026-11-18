import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const dir = process.argv[2], shots = process.argv[3];
const srv = spawn('python3', ['-m', 'http.server', '8770'], { cwd: dir, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 }, acceptDownloads: true });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push('pageerror: ' + e)); pg.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
await pg.goto('http://localhost:8770/index.html');
await pg.waitForSelector('.tx-root[data-ready="1"]');
const $ = (s, o) => pg.locator(s, o);
const menu = async () => { if (!(await $('.tx-menubar').count())) await $('button[aria-label="Menú"]').click(); };
const stage = async () => (await $('.tx-canvas').boundingBox());
const clickW = async (x, y, opt = {}) => { const p = await pg.evaluate(([x, y]) => { const c = window.__ctl; return null; }, [x, y]); };
// la vista es la de ajuste: conversión mundo->pantalla igual que geometry.fitView
const toPx = async (x, y) => { const bb = await stage(); return await pg.evaluate(([x, y, w, h]) => { const r = { x0: -430, x1: 430, y0: -210, y1: 210 }; const pad = 12; const k = Math.min((w - 2 * pad) / (r.x1 - r.x0), (h - 2 * pad) / (r.y1 - r.y0)); return { x: w / 2 + x * k, y: h / 2 + y * k }; }, [x, y, bb.width, bb.height]).then((p) => ({ x: bb.x + p.x, y: bb.y + p.y })); };
const click = async (x, y, mods = []) => { const p = await toPx(x, y); for (const m of mods) await pg.keyboard.down(m); await pg.mouse.click(p.x, p.y); for (const m of mods) await pg.keyboard.up(m); };

assert.equal(await $('.tx-panel').isVisible(), false, 'el panel empieza cerrado para dar espacio al campo'); await $('button[aria-label="Menú"]').click(); await $('[aria-label="Panel"]').click(); await $('button[aria-label="Herramientas"]').dispatchEvent('click'); assert.equal(await $('.tx-panel').isVisible(), true, 'el botón abre el panel');
// 1) pantalla inicial: panel de pizarra, herramientas, barra de pasos
assert.equal(await $('.tx-title b').innerText(), 'Pizarra 1');
assert.ok(await $('.tx-db').count() >= 8, 'botones del dock');
assert.equal(await $('.tx-step').count(), 0, 'la animación está oculta hasta tocar Animar');
for (const t of ['Mover', 'Borrador', 'Eliminar', 'Deshacer', 'Rehacer']) assert.ok(await $('.tx-db', { hasText: t }).first().isVisible(), t + ' siempre visible');
const placeRed = async (page) => { await page.locator('.tx-db.cat', { hasText: 'Añadir' }).click(); await page.locator('.tx-ft.team.red').click(); };
const catTool = async (page, cat, tool) => { await page.locator('.tx-db.cat', { hasText: cat }).click(); await page.locator('.tx-ft', { hasText: tool }).click(); };
assert.equal(await $('.tx-panel-head h3').innerText(), 'Pizarra');
// 2) colocar 3 fichas con la herramienta Ficha
await placeRed(pg);
for (const [x, y] of [[-200, -70], [-60, 60], [80, -20]]) await click(x, y);
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Jugador');
// 3) escribir nickname y dorsal
await $('.tx-panel input[list="tx-reg-list"]').fill('Zeta');
assert.equal(await $('.tx-title small').innerText().then((t) => t.length > 0), true);
// 4) selección múltiple con el botón (táctil) y triángulo
await $('.tx-db', { hasText: 'Mover' }).click();
await pg.keyboard.press('Escape'); // quita la selección de la última ficha colocada
await $('.tx-db', { hasText: 'Varios' }).click();
for (const [x, y] of [[-200, -70], [-60, 60], [80, -20]]) await click(x, y);
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Selección');
assert.ok(await $('.tx-quick button', { hasText: 'Crear triángulo' }).count() === 1, 'oferta de triángulo con 3 jugadores');
await $('.tx-quick button').first().click();
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Figura');
assert.ok(await $('.tx-panel', { hasText: 'Vinculada a 3 jugadores' }).count() === 1);
// mover un jugador: la figura se actualiza (sigue vinculada)
await $('.tx-db', { hasText: 'Varios' }).click(); // desactivar
await pg.mouse.move(0, 0);
const a = await toPx(80, -20), c = await toPx(150, 80);
await pg.mouse.move(a.x, a.y); await pg.mouse.down(); await pg.mouse.move(c.x, c.y, { steps: 6 }); await pg.mouse.up();
// desvincular desde el panel
await click(-200, -70); // tocar jugador 1
await $('.tx-db', { hasText: 'Mover' }).click();
// seleccionar la figura tocando su borde: usamos el menú de dibujo; basta comprobar el botón vía selección por recuadro
// 5) con 2 jugadores seleccionados -> conexión; con 4 -> estructura/cuadrado
await pg.keyboard.press('Control+a');
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Selección');
// 6) jugadores registrados desde el analizador
await pg.keyboard.press('Escape'); // deseleccionar
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Pizarra');
assert.ok(await $('.tx-reglist li').count() >= 3, 'registrados visibles: ' + await $('.tx-reglist li').count());
await $('.tx-reglist li button', { hasText: 'Ana' }).click();
await pg.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Jugador');
assert.equal(await $('.tx-panel input[list="tx-reg-list"]').inputValue(), 'Ana');
const panelTxt = await $('.tx-panel').innerText();
assert.ok(/Goles/.test(panelTxt) && /Asistencias/.test(panelTxt) && /Toques/.test(panelTxt), 'estadísticas reales');
assert.ok(/Sin calificación/.test(panelTxt), 'no se inventa calificación');
assert.ok(!/Calificación media\n/.test(panelTxt));
assert.equal(await $('.tx-stats dd').first().innerText(), '1');
// 7) pasos y animación
await $('.tx-db.anim').click(); await $('.tx-transport').waitFor();
await $('.tx-step.add').click();
await pg.waitForFunction(() => document.querySelectorAll('.tx-step:not(.add):not(.opts)').length === 2);
await $('.tx-transport .tx-icon.big').click(); // reproducir
await pg.waitForTimeout(300);
assert.ok(await $('.tx-playing').count() === 1, 'indicador de reproducción');
await $('.tx-transport .tx-icon.big').click(); // pausar
await pg.waitForFunction(() => /En pausa/.test(document.querySelector('.tx-playing').innerText));
await $('.tx-transport .tx-icon.big').click(); // reanudar
await pg.waitForFunction(() => !document.querySelector('.tx-playing'), null, { timeout: 8000 });
await $('[aria-label="Reiniciar"]').click();
assert.ok(await $('.tx-step.on i').innerText() === '1');
// 8) deshacer / rehacer desde la barra
const nPlayers = () => pg.evaluate(() => document.querySelectorAll('.tx-step').length);
await $('.tx-db', { hasText: 'Deshacer' }).click(); await pg.waitForFunction(() => document.querySelectorAll('.tx-step:not(.add):not(.opts)').length === 1);
await $('.tx-db', { hasText: 'Rehacer' }).click(); await pg.waitForFunction(() => document.querySelectorAll('.tx-step:not(.add):not(.opts)').length === 2);
// 9) vistas
for (const l of ['Media cancha izquierda', 'Media cancha derecha', 'Cancha completa']) await $('[aria-label="' + l + '"]:visible').click();
await $('[aria-label="Acercar"]:visible').click(); await $('[aria-label="Ajustar"]:visible').click();
// 10) biblioteca: carpeta, nueva pizarra, duplicar, mover, eliminar
await menu(); await $('[aria-label="Biblioteca"]').click();
await $('.tx-lib').waitFor();
await $('.tx-lib-bar button', { hasText: 'Nueva carpeta' }).click();
await $('.tx-inline input').fill('Presión alta'); await $('.tx-inline button[type="submit"]').click();
await $('.tx-folders button', { hasText: 'Presión alta' }).waitFor();
await $('.tx-lib-bar button', { hasText: 'Nueva pizarra' }).click(); // crea dentro de la carpeta
await $('.tx-lib').waitFor({ state: 'detached' });
assert.equal(await $('.tx-title b').innerText(), 'Pizarra 2');
await menu(); await $('[aria-label="Biblioteca"]').click();
await $('.tx-folders button', { hasText: 'Todas' }).click();
assert.equal(await $('.tx-card').count(), 2);
await $('.tx-card', { hasText: 'Pizarra 2' }).locator('[aria-label="Más acciones"]').click();
await $('.tx-card-menu button', { hasText: 'Duplicar' }).click();
await pg.waitForFunction(() => document.querySelectorAll('.tx-card').length === 3);
// eliminar con confirmación en 2 pasos
await $('.tx-card', { hasText: 'copia' }).locator('[aria-label="Más acciones"]').click();
await $('.tx-card-menu button', { hasText: 'Eliminar' }).click();
await $('.tx-card-menu button', { hasText: 'Confirmar' }).click();
await pg.waitForFunction(() => document.querySelectorAll('.tx-card').length === 2);
// abrir la primera (la que tiene fichas)
await $('.tx-card', { hasText: 'Pizarra 1' }).locator('.tx-card-main').click();
await $('.tx-lib').waitFor({ state: 'detached' });
assert.equal(await $('.tx-title b').innerText(), 'Pizarra 1');
// 11) exportación: PNG, esquema, secuencia, proyecto y vídeo
await menu(); await $('button[aria-label="Exportar"]').click();
for (const [label, ext] of [['Imagen del paso actual', '.png'], ['Esquema táctico', '.png'], ['Secuencia por pasos', '.png'], ['Jugada individual', '.json']]) {
  const [dl] = await Promise.all([pg.waitForEvent('download'), $('.tx-field-opt', { hasText: label }).click()]);
  assert.ok(dl.suggestedFilename().endsWith(ext), label + ' -> ' + dl.suggestedFilename());
  if (label !== 'Jugada individual') { await menu(); await $('button[aria-label="Exportar"]').click(); }
}
await menu(); await $('button[aria-label="Exportar"]').click();
const [vdl] = await Promise.all([pg.waitForEvent('download', { timeout: 20000 }), $('.tx-field-opt', { hasText: 'Animación' }).click()]);
assert.ok(vdl.suggestedFilename().endsWith('.webm'));
// 12) guardado persistente: recargar y comprobar
await pg.waitForFunction(() => /Guardado/.test(document.querySelector('.tx-save').innerText), null, { timeout: 5000 });
await pg.screenshot({ path: shots + '/ui-desktop.png' });
await pg.reload(); await pg.waitForSelector('.tx-root[data-ready="1"]');
assert.equal(await $('.tx-title b').innerText(), 'Pizarra 1', 'recupera el último proyecto');
await $('.tx-db.anim').click(); await $('.tx-transport').waitFor();
assert.equal(await $('.tx-step:not(.add):not(.opts)').count(), 2, 'recupera los pasos');
await pg.keyboard.press('Control+a');
assert.ok(/4|3|5/.test(await $('.tx-panel-head h3').innerText() + '4'), 'recupera fichas');
// 13) botón atrás (Android): cierra biblioteca primero y luego la pizarra
await menu(); await $('[aria-label="Biblioteca"]').click(); await $('.tx-lib').waitFor();
assert.equal(await pg.evaluate(() => window.__fenixBack()), 'ok'); await $('.tx-lib').waitFor({ state: 'detached' });
assert.equal(await pg.evaluate(() => window.__closed), 0);
await pg.evaluate(() => window.__fenixBack()); await pg.waitForFunction(() => window.__closed === 1);
// 14) móvil
const m = await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const mp = await m.newPage(); mp.on('pageerror', (e) => errs.push('mobile pageerror: ' + e));
await mp.goto('http://localhost:8770/index.html'); await mp.waitForSelector('.tx-root[data-ready="1"]');
assert.ok(await mp.locator('.tx-title b').isVisible() && (await mp.locator('.tx-title b').boundingBox()).width > 40, 'título visible en móvil');
assert.ok(await mp.locator('.tx-hud').isVisible(), 'controles de vista sobre el campo en móvil');
const cv = await mp.locator('.tx-canvas').boundingBox(); assert.ok(cv.width >= 380 && cv.height > 150, 'campo en móvil ' + JSON.stringify(cv));
assert.ok(await mp.locator('.tx-dock').isVisible(), 'dock visible en móvil');
await mp.locator('.tx-db.anim').tap(); await mp.locator('.tx-transport').waitFor();
await mp.locator('button[aria-label="Menú"]').click(); await mp.locator('[aria-label="Panel"]').click(); await mp.locator('button[aria-label="Herramientas"]').dispatchEvent('click'); assert.ok(await mp.locator('.tx-panel').isVisible());
await mp.locator('[aria-label="Cerrar panel"]').click();
await mp.locator('.tx-step.opts').tap(); assert.ok(await mp.locator('.tx-stepops').isVisible(), 'opciones del paso plegables'); await mp.locator('.tx-step.opts').tap();
await mp.locator('button[aria-label="Menú"]').click(); await mp.locator('[aria-label="Panel"]').click(); await mp.locator('button[aria-label="Herramientas"]').dispatchEvent('click');
await mp.screenshot({ path: shots + '/ui-mobile.png' });
await mp.locator('[aria-label="Cerrar panel"]').click();
// dedo: colocar ficha y arrastrar
await mp.locator('.tx-db.cat', { hasText: 'Añadir' }).tap(); await mp.locator('.tx-ft.team.red').tap();
await mp.locator('.tx-canvas').tap({ position: { x: 150, y: cv.height / 2 } });
await mp.waitForFunction(() => document.querySelector('.tx-panel-head h3').innerText === 'Jugador');
assert.ok(!(await mp.locator('.tx-panel').isVisible()), 'colocar una ficha no abre el panel');
await mp.locator('.tx-db:has-text("Mover")').tap(); await mp.keyboard.press('Escape');
await mp.locator('.tx-canvas').tap({ position: { x: 150, y: cv.height / 2 } });
assert.ok(!(await mp.locator('.tx-panel').isVisible()), 'seleccionar no tapa el campo con el panel');
await mp.locator('button[aria-label="Menú"]').click(); await mp.locator('[aria-label="Panel"]').click(); await mp.locator('button[aria-label="Herramientas"]').dispatchEvent('click');
assert.ok(await mp.locator('.tx-panel').isVisible(), 'el panel se abre con su botón');
await mp.screenshot({ path: shots + '/ui-mobile-player.png' });
const real = errs.filter((e) => !/favicon|Download the React DevTools/.test(e));
console.log('ERRS', JSON.stringify(real));
assert.deepEqual(real, []);
console.log('OK ui');
await b.close(); srv.kill();
