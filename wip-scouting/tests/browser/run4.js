const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => {
    const db = window.__db, ing = window.__ingest;
    await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 }]);
    const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('players', n1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 })).concat(n2.map((n, i) => ({ id: 'q' + i, nick: n, aliases: [], teamId: 't_r', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }))));
    await db.put('competitions', { id: 'c1', name: 'Liga Fênix', type: 'liga', seasonId: null, teamIds: ['t_f', 't_r'], createdAt: 1 });
    window.__lm = {}; for (let i = 0; i < 4; i++) { const id = 'r' + i; window.__lm[id] = new Date(2026, 9, 1 + i * 3, 20, 30).getTime(); const flip = i % 2 === 1; await ing.ingestStats(id, [window.__gen(100 + i * 7, flip ? n2 : n1, flip ? n1 : n2, 160 + i * 20)]); }
  });
  await page.waitForTimeout(400);
  const snap = () => page.evaluate(() => window.__db.loadAll().then((st) => { const md = window.__model.buildModel(st); return { matches: md.matches.length, excluded: md.excluded.length, rows: md.rows.length, players: md.players.length, all: md.allPlayers.length, kpiTeams: 0 }; }));
  const base = await snap(); assert.strictEqual(base.matches, 4);
  // 1) excluir un partido desde la lista: deja de contar, se puede ver y volver a incluir
  await page.click('.sc-tabs button:nth-child(4)'); await page.waitForTimeout(250);
  await page.click('button:has-text("Seleccionar")'); await page.click('.sc-list li:first-child'); await page.click('button:has-text("Excluir (1)")'); await page.waitForTimeout(400);
  let s1 = await snap(); assert.strictEqual(s1.matches, 3); assert.strictEqual(s1.excluded, 1); assert.ok(s1.rows < base.rows, 'filas bajan');
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 3);
  await page.click('button:has-text("Mostrar excluidos")'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 4); assert.ok(await page.$('.sc-list li.off'), 'fila excluida marcada');
  await page.click('.sc-list li.off'); await page.click('button:has-text("Incluir (1)")'); await page.waitForTimeout(400); await page.click('button:has-text("Listo")');
  assert.strictEqual((await snap()).matches, 4); console.log('OK excluir/incluir desde la lista');
  // detalle de partido excluido sigue abriendo
  await page.evaluate(async () => { const m = (await window.__db.all('matches'))[0]; await window.__db.put('matches', { ...m, excluded: true }); });
  await page.waitForTimeout(300); await page.click('button:has-text("Mostrar excluidos")').catch(() => {}); await page.waitForTimeout(200);
  await page.click('.sc-list li.off'); await page.waitForTimeout(300); assert.ok(await page.$('text=EXCLUIDO'), 'aviso en detalle');
  await page.click('button:has-text("Incluir en las estad")'); await page.waitForTimeout(300); assert.strictEqual((await snap()).matches, 4); console.log('OK detalle excluido');
  // 2) borrar desde la lista
  await page.click('.sc-link.back'); await page.waitForTimeout(250);
  await page.click('button:has-text("Seleccionar")'); await page.click('.sc-list li:first-child'); await page.click('button:has-text("Borrar (1)")'); await page.waitForTimeout(250); await page.click('.sc-sheet-foot .sc-btn.danger'); await page.waitForTimeout(400);
  assert.strictEqual((await snap()).matches, 3); console.log('OK borrar desde la lista');
  // 3) elegir jugadores: quitar 2 -> no cuentan en lista ni en filas ni en la red
  await page.click('.sc-tabs button:nth-child(2)'); await page.waitForTimeout(250);
  const n0 = await page.$$eval('.sc-list li', (l) => l.length); assert.strictEqual(n0, 6);
  await page.click('button:has-text("Elegir")'); await page.waitForTimeout(250);
  await page.click('.sc-sheet li:has-text("Rojas")'); await page.click('.sc-sheet li:has-text("Lopez")'); await page.waitForTimeout(100);
  await page.click('.sc-sheet-foot .sc-btn:last-child'); await page.waitForTimeout(500);
  const s3 = await snap(); assert.strictEqual(s3.players, 4); assert.strictEqual(s3.all, 6);
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 4); assert.ok(await page.$('text=sin elegir no se cuentan'), 'aviso');
  const ign = await page.evaluate(() => window.__db.loadAll().then((st) => { const md = window.__model.buildModel(st); const ids = md.allPlayers.filter((p) => p.ignored).map((p) => p.id); return { leak: md.rows.filter((r) => ids.includes(r.playerId)).length, net: window.__model.passNetwork(md, md.matches, '').nodes.map((n) => n.nick) }; }));
  assert.strictEqual(ign.leak, 0); assert.ok(!ign.net.includes('Rojas') && !ign.net.includes('Lopez') && ign.net.includes('Matheus'), 'red sin ignorados: ' + ign.net);
  console.log('OK elegir jugadores', JSON.stringify(ign.net));
  // 4) jugadores nuevos en una repetición quedan ocultos por defecto y no se duplican
  await page.evaluate(() => window.__ingest.ingestStats('rNew', [window.__gen(77, ['Matheus', 'Kevin', 'Nuevo1'], ['Rojas', 'Lopez', 'Nuevo2'], 160)]));
  await page.waitForTimeout(400);
  const s4 = await snap(); assert.strictEqual(s4.all, 8); assert.strictEqual(s4.players, 4); console.log('OK jugadores nuevos ocultos', JSON.stringify(s4));
  // vuelve a elegir todos
  await page.click('button:has-text("Elegir")'); await page.waitForTimeout(250); await page.click('.sc-sheet button:has-text("Marcar todos")'); await page.click('.sc-sheet-foot .sc-btn:last-child'); await page.waitForTimeout(500);
  assert.strictEqual((await snap()).players, 8); console.log('OK marcar todos');
  console.log('ERRORS', JSON.stringify(errors)); assert.strictEqual(errors.length, 0); await b.close(); console.log('TODO OK');
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
