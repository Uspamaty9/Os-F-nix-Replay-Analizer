// Borrar jugadores, pestañas completas de Equipos y avatar tocable del perfil. Uso: node build.mjs && (python3 -m http.server 8765 &) && node run5.js
const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => {
    const db = window.__db, ing = window.__ingest; const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 }]);
    await db.putMany('players', n1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: '', avatar: null, notes: 'x', source: 'manual', createdAt: 1 })).concat(n2.map((n, i) => ({ id: 'q' + i, nick: n, aliases: [], teamId: 't_r', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }))).concat([{ id: 'z0', nick: 'SinPartidos', aliases: [], teamId: null, position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }]));
    for (let i = 0; i < 3; i++) await ing.ingestStats('r' + i, [window.__gen(100 + i * 7, i % 2 ? n2 : n1, i % 2 ? n1 : n2, 160)]);
  });
  await page.waitForTimeout(400);
  const snap = () => page.evaluate(() => window.__db.loadAll().then((st) => { const md = window.__model.buildModel(st); return { all: md.allPlayers.length, shown: md.players.length, hidden: st.players.filter((p) => p.hidden).length, rows: md.rows.length, ratings: st.ratings.length }; }));
  // 1) pestañas de Equipos: el fondo de la barra cubre todas las opciones
  const tabIdx = await page.$$eval('.sc-tabs button', (bs) => bs.findIndex((x) => /Equipos/i.test(x.innerText)) + 1);
  await page.click('.sc-tabs button:nth-child(' + tabIdx + ')'); await page.waitForTimeout(250);
  const seg = await page.$eval('.sc-scrollx > .sc-seg', (e) => ({ w: e.getBoundingClientRect().width, sw: e.parentElement.scrollWidth, last: e.lastElementChild.getBoundingClientRect().right - e.getBoundingClientRect().left }));
  assert.ok(seg.w >= seg.sw - 1, 'el fondo de las pestañas cubre todo el ancho desplazable: ' + JSON.stringify(seg)); console.log('OK pestañas completas', JSON.stringify(seg));
  // 2) borrar jugadores desde «Elegir»
  await page.click('.sc-tabs button:has-text("Jugadores")'); await page.waitForTimeout(250);
  await page.click('button:has-text("Elegir")'); await page.waitForTimeout(250);
  const before = await snap();
  await page.click('.sc-sheet li:has-text("SinPartidos") button:has-text("Borrar")'); await page.waitForTimeout(200);
  await page.click('.sc-sheet-foot .sc-btn:has-text("Borrar")'); await page.waitForTimeout(400);
  assert.strictEqual((await snap()).all, before.all - 1, 'sin partidos: se elimina del todo');
  await page.click('.sc-sheet li:has-text("Kevin") button:has-text("Borrar")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn:has-text("Borrar")'); await page.waitForTimeout(400);
  let s = await snap(); assert.strictEqual(s.hidden, 1, 'con partidos: queda oculto'); assert.strictEqual(s.all, before.all - 1, 'el registro sigue (para que no reaparezca)');
  assert.strictEqual(await page.$$eval('.sc-sheet li:has-text("Kevin")', (l) => l.length), 0, 'sale de la lista');
  await page.screenshot({ path: 'shots/pick-delete.png' });
  await page.click('.sc-sheet .sc-seg button:has-text("Borrados")'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('.sc-sheet li', (l) => l.length), 1); await page.click('.sc-sheet li:has-text("Kevin")'); await page.waitForTimeout(400);
  assert.strictEqual((await snap()).hidden, 0, 'restaurado'); console.log('OK borrar / restaurar');
  await page.click('.sc-sheet-foot .sc-btn.ghost'); await page.waitForTimeout(200);
  // 3) avatar tocable en el perfil
  await page.click('.sc-list li:has-text("Matheus")'); await page.waitForTimeout(300);
  assert.ok(await page.$('.sc-phead .sc-avbtn'), 'avatar tocable en el perfil'); await page.screenshot({ path: 'shots/profile-avatar.png' }); console.log('OK avatar en el perfil');
  // 4) selección múltiple directo en la pestaña Jugadores
  await page.click('.sc-phead ~ * , .sc-view >> text=Jugadores').catch(() => {}); 
  await page.click('.sc-tabs button:has-text("Jugadores")'); await page.waitForTimeout(250);
  if (!(await page.$('button:has-text("Seleccionar")'))) { await page.click('.sc-view a:has-text("Jugadores"), .sc-view button:has-text("Jugadores")').catch(() => {}); await page.waitForTimeout(250); }
  await page.click('button:has-text("Seleccionar")'); await page.waitForTimeout(200);
  const n0 = await page.$$eval('.sc-list li', (l) => l.length);
  await page.click('.sc-list li:has-text("Santi")'); await page.click('.sc-list li:has-text("Rojas")'); await page.waitForTimeout(150);
  await page.screenshot({ path: 'shots/select-multi.png' });
  await page.click('button:has-text("Borrar (2)")'); await page.waitForTimeout(200); await page.click('.sc-sheet-foot .sc-btn.danger'); await page.waitForTimeout(500);
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), n0 - 2, 'dos jugadores borrados a la vez'); console.log('OK borrado múltiple en Jugadores');
  console.log('ERRORS', errors); assert.deepStrictEqual(errors, []); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
