// Mejoras: Más, papelera, selección múltiple en Partidos/Equipos, fusionar, orden/favoritos, búsqueda, Kpi con etiqueta al tocar.
const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => { const db = window.__db, ing = window.__ingest; const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 }, { id: 't_d', name: 'Rival F.C.', color: '#3A78B5', own: false, createdAt: 1 }, { id: 't_x', name: 'Vacío', color: '#888', own: false, createdAt: 1 }]);
    await db.putMany('players', n1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 })).concat(n2.map((n, i) => ({ id: 'q' + i, nick: n, aliases: [], teamId: 't_r', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }))));
    for (let i = 0; i < 4; i++) await ing.ingestStats('r' + i, [window.__gen(100 + i * 7, i % 2 ? n2 : n1, i % 2 ? n1 : n2, 160)]); });
  await page.waitForTimeout(500);
  const snap = () => page.evaluate(() => window.__db.loadAll().then((st) => ({ matches: st.matches.length, teams: st.teams.length, trash: st.trash.length, ratings: st.ratings.length })));
  const tabs = await page.$$eval('.sc-tabs button', (bs) => bs.map((x) => x.innerText.trim())); assert.deepStrictEqual(tabs, ['Panel', 'Jugadores', 'Scouting', 'Partidos', 'Equipos', 'Más']); console.log('OK 6 pestañas');
  // Panel: la etiqueta de origen solo aparece al tocar
  assert.strictEqual(await page.$$eval('.sc-kpi .sc-prov', (l) => l.length), 0); await page.click('.sc-kpi.tap'); assert.ok(await page.$('.sc-kpi .sc-prov')); await page.screenshot({ path: 'shots/v2-panel.png' }); console.log('OK kpi al tocar');
  // Jugadores: orden, filtro por equipo y favoritos
  await page.click('.sc-tabs button:has-text("Jugadores")'); await page.waitForTimeout(200);
  await page.selectOption('select >> nth=0', 'name'); const names = await page.$$eval('.sc-list li .mid b', (l) => l.map((x) => x.innerText)); assert.deepStrictEqual(names, names.slice().sort((a, c) => a.localeCompare(c)), 'orden por nombre');
  await page.selectOption('select >> nth=1', 't_r'); assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 3, 'filtro equipo');
  await page.selectOption('select >> nth=1', ''); await page.click('.sc-list li:has-text("Kevin") .sc-star'); await page.waitForTimeout(250);
  await page.selectOption('select >> nth=1', '__fav'); assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 1, 'favoritos'); await page.screenshot({ path: 'shots/v2-players.png' }); console.log('OK jugadores orden/filtro/favoritos');
  // Partidos: seleccionar, borrar con deshacer, papelera
  await page.click('.sc-tabs button:has-text("Partidos")'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('.sc-list li button', (l) => l.length), 0, 'sin botones por fila'); await page.screenshot({ path: 'shots/v2-matches.png' });
  await page.click('button:has-text("Seleccionar")'); await page.click('.sc-list li >> nth=0'); await page.click('.sc-list li >> nth=1'); await page.screenshot({ path: 'shots/v2-matches-sel.png' });
  await page.click('button:has-text("Excluir (2)")'); await page.waitForTimeout(300); assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 2); await page.click('.sc-toast-act'); await page.waitForTimeout(400); assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 4, 'deshacer excluir');
  await page.click('.sc-list li >> nth=0'); await page.click('button:has-text("Borrar (1)")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn.danger'); await page.waitForTimeout(400);
  let s = await snap(); assert.strictEqual(s.matches, 3); assert.strictEqual(s.trash, 1); await page.click('.sc-toast-act'); await page.waitForTimeout(400);
  s = await snap(); assert.strictEqual(s.matches, 4, 'deshacer borrar'); assert.strictEqual(s.trash, 0); assert.ok(s.ratings >= 0);
  await page.click('.sc-list li >> nth=0'); await page.click('button:has-text("Borrar (1)")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn.danger'); await page.waitForTimeout(400);
  await page.click('.sc-tabs button:has-text("Más")'); await page.waitForTimeout(200); await page.screenshot({ path: 'shots/v2-more.png' }); await page.click('.sc-menu button:has-text("Papelera")'); await page.waitForTimeout(250);
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 1); await page.screenshot({ path: 'shots/v2-trash.png' }); await page.click('.sc-list li button:has-text("Restaurar")'); await page.waitForTimeout(400); assert.strictEqual((await snap()).matches, 4); console.log('OK partidos/papelera/deshacer');
  // Equipos: estadísticas, borrar sin uso, fusionar
  await page.click('.sc-tabs button:has-text("Equipos")'); await page.waitForTimeout(250); await page.screenshot({ path: 'shots/v2-teams.png' });
  await page.click('button:has-text("Seleccionar")'); await page.click('.sc-list li:has-text("Vacío")'); await page.click('button:has-text("Borrar (1)")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn.danger'); await page.waitForTimeout(400); assert.strictEqual((await snap()).teams, 3);
  await page.click('.sc-toast-act'); await page.waitForTimeout(400); assert.strictEqual((await snap()).teams, 4, 'deshacer equipo');
  await page.click('.sc-list li:has-text("Rival FC")'); await page.click('.sc-list li:has-text("Rival F.C.")'); await page.click('button:has-text("Fusionar (2)")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn:not(.ghost)'); await page.waitForTimeout(500);
  const t = await page.evaluate(() => window.__db.loadAll().then((st) => ({ teams: st.teams.map((x) => x.id), q: st.players.filter((p) => p.id[0] === 'q').every((p) => p.teamId === 't_r') }))); assert.ok(!t.teams.includes('t_d') && t.q, 'fusión'); console.log('OK equipos borrar/fusionar');
  // Búsqueda global
  await page.click('.sc-iconbtn'); await page.fill('.sc-sheet .sc-search', 'kev'); await page.waitForTimeout(150); await page.click('.sc-sheet .sc-list li:has-text("Kevin")'); await page.waitForTimeout(300); assert.ok(await page.$('.sc-phead'), 'abre el perfil'); console.log('OK búsqueda');
  // Pases dentro de Más con flecha tocable
  await page.click('.sc-tabs button:has-text("Más")'); await page.click('.sc-menu button:has-text("Red de pases")'); await page.waitForTimeout(400);
  await page.locator('svg.sc-net line[stroke=transparent]').first().click({ force: true }); await page.waitForTimeout(200); assert.ok(await page.$('text=/pases?:/') || await page.$('.sc-note b'), 'flecha'); await page.screenshot({ path: 'shots/v2-net.png' });
  await page.click('.sc-link.back'); await page.click('.sc-menu button:has-text("Copia")'); assert.ok(await page.$('button:has-text("Crear copia")')); console.log('OK pases/copia');
  // Descargas: primero se pregunta, y al terminar se avisa con el nombre del archivo
  await page.click('button:has-text("Crear copia")'); await page.waitForSelector('.sc-sheet-foot'); assert.ok(await page.$('text=¿Crear la copia de seguridad?')); await page.click('.sc-sheet-foot .sc-btn.ghost'); await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => (window.__saved || []).length), 0, 'cancelar no descarga');
  await page.click('button:has-text("Crear copia")'); await page.click('.sc-sheet-foot .sc-btn:not(.ghost)'); await page.waitForTimeout(500);
  assert.strictEqual(await page.evaluate(() => (window.__saved || []).length), 1); assert.ok(/✓ .*\.fenixscout/.test(await page.$eval('.sc-toast', (e) => e.innerText)), 'aviso de descarga'); await page.screenshot({ path: 'shots/v2-saved.png' });
  await page.click('.sc-tabs button:has-text("Partidos")'); await page.click('.sc-list li >> nth=0'); await page.waitForTimeout(300); await page.click('button:has-text("Informe PDF")'); await page.waitForSelector('.sc-sheet-foot');
  await page.click('.sc-sheet-foot .sc-btn:not(.ghost)'); await page.waitForTimeout(700); assert.strictEqual(await page.evaluate(() => (window.__saved || []).length), 2); assert.ok(/✓ .*\.pdf/.test(await page.$eval('.sc-toast', (e) => e.innerText)), 'aviso PDF'); console.log('OK avisos de descarga');
  console.log('ERRORS', errors); assert.deepStrictEqual(errors, []); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
