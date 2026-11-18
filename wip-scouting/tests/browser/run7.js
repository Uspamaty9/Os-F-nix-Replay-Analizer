// «Solo mi equipo» y el cuadro de jugadores nuevos tras analizar repeticiones.
const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => { const db = window.__db, ing = window.__ingest; const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 }]);
    await db.putMany('players', n1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 })).concat(n2.map((n, i) => ({ id: 'q' + i, nick: n, aliases: [], teamId: 't_r', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }))));
    await ing.ingestStats('r0', [window.__gen(100, n1, n2, 160)]);
    await ing.ingestStats('r1', [window.__gen(107, ['Matheus', 'Kevin', 'Nuevo1'], ['Rojas', 'Nuevo2', 'Nico'], 160)]); });
  const pend = await page.evaluate(() => window.__db.getKv('pendingNewPlayers', [])); assert.strictEqual(pend.length, 2, 'dos jugadores nuevos pendientes');
  await page.reload(); await page.waitForSelector('.sc-root'); await page.waitForSelector('.sc-sheet-foot'); assert.ok(await page.$('text=Jugadores nuevos')); await page.screenshot({ path: 'shots/v3-newplayers.png' });
  await page.click('.sc-sheet li:has-text("Nuevo1")'); await page.click('.sc-sheet-foot .sc-btn:not(.ghost)'); await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__db.all('players').then((l) => Object.fromEntries(l.filter((p) => /Nuevo/.test(p.nick)).map((p) => [p.nick, { ign: !!p.ignored, team: p.teamId }]))));
  assert.deepStrictEqual(st, { Nuevo1: { ign: false, team: 't_f' }, Nuevo2: { ign: true, team: null } }); assert.strictEqual((await page.evaluate(() => window.__db.getKv('pendingNewPlayers', []))).length, 0);
  await page.reload(); await page.waitForSelector('.sc-root'); await page.waitForTimeout(500); assert.ok(!(await page.$('.sc-sheet-foot')), 'no vuelve a preguntar'); console.log('OK jugadores nuevos');
  await page.click('.sc-tabs button:has-text("Jugadores")'); await page.waitForTimeout(250);
  const n0 = await page.$$eval('.sc-list li', (l) => l.length); await page.click('button:has-text("Solo mi equipo")'); await page.waitForTimeout(500);
  const names = await page.$$eval('.sc-list li .mid b', (l) => l.map((x) => x.innerText).sort()); assert.deepStrictEqual(names, ['Kevin', 'Matheus', 'Nuevo1', 'Santi'], 'solo los de mi equipo'); assert.ok(n0 > names.length);
  await page.click('.sc-toast-act'); await page.waitForTimeout(500); assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), n0, 'deshacer'); console.log('OK solo mi equipo');
  console.log('ERRORS', errors); assert.deepStrictEqual(errors, []); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
