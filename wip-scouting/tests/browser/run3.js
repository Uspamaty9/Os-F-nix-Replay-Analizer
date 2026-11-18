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
  // 1) fechas locales coherentes lista vs. formulario
  await page.click('.sc-tabs button:nth-child(4)'); await page.waitForTimeout(200);
  const listDate = await page.$eval('.sc-list li:first-child small', (e) => e.innerText);
  await page.click('.sc-list li:first-child'); await page.waitForTimeout(300);
  const inputDate = await page.$eval('input[type=date]', (e) => e.value);
  const m = listDate.match(/(\d{2})\/(\d{2})\/(\d{4})/); assert.strictEqual(inputDate, m[3] + '-' + m[2] + '-' + m[1], 'fecha lista vs input'); console.log('OK fechas', listDate.split('·')[1].trim(), inputDate);
  // 2) renombrar jugador: el nick viejo debe seguir enlazando sus partidos (alias)
  const before = await page.evaluate(() => { const mod = window.__model.buildModel; return window.__db.loadAll().then((st) => { const md = mod(st); return md.rows.filter((r) => r.playerId === 'p1').length; }); });
  await page.click('.sc-tabs button:nth-child(2)'); await page.waitForTimeout(200);
  await page.click('.sc-list li:has-text("Kevin")'); await page.waitForTimeout(200); await page.click('button:has-text("Editar")'); await page.waitForTimeout(200);
  await page.fill('.sc-sheet input[type=text]', 'Kevin Pro'); await page.click('.sc-sheet-foot .sc-btn:last-child'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => window.__db.loadAll().then((st) => { const md = window.__model.buildModel(st); const p = md.playerById.get('p1'); return { rows: md.rows.filter((r) => r.playerId === 'p1').length, nick: p.nick, aliases: p.aliases, players: md.players.length }; }));
  assert.strictEqual(after.rows, before); assert.deepStrictEqual(after.aliases, ['Kevin']); assert.strictEqual(after.players, 6, 'no se duplican jugadores'); console.log('OK renombrar', JSON.stringify(after));
  // re-ingesta de un partido con el nick viejo no crea duplicado
  await page.evaluate(() => window.__ingest.ingestStats('r0', [window.__gen(100, ['Matheus', 'Kevin', 'Santi'], ['Rojas', 'Lopez', 'Nico'], 160)]));
  await page.waitForTimeout(300); const cnt = await page.evaluate(async () => ({ p: (await window.__db.all('players')).length, m: (await window.__db.all('matches')).length })); assert.deepStrictEqual(cnt, { p: 6, m: 4 }); console.log('OK re-ingesta idempotente', JSON.stringify(cnt));
  // 3) comparar jugadores
  await page.click('.sc-tabs button:nth-child(1)'); await page.click('.sc-tabs button:nth-child(2)'); await page.waitForTimeout(200);
  await page.click('button:has-text("Comparar")'); await page.click('.sc-list li:nth-child(1)'); await page.click('.sc-list li:nth-child(2)'); await page.click('button:has-text("Comparar (2)")'); await page.waitForTimeout(300);
  assert(await page.$('.sc-table.cmp'), 'tabla comparativa'); assert(await page.$('svg[aria-label="Gráfico radar"]'), 'radar'); console.log('OK comparar');
  // 4) jornada manual + clasificación + H2H
  await page.click('.sc-tabs button:has-text("Equipos")'); await page.waitForTimeout(200); await page.click('.sc-seg button:has-text("Jornadas")'); await page.click('button:has-text("+ Programar")'); await page.waitForTimeout(200);
  const sels = await page.$$('.sc-sheet select'); await sels[0].selectOption('c1'); await page.fill('.sc-sheet input[type=text]', '1'); await sels[1].selectOption('t_f'); await sels[2].selectOption('t_r');
  const nums = await page.$$('.sc-sheet input[type=number]'); await nums[0].fill('3'); await nums[1].fill('3'); await page.click('.sc-sheet-foot .sc-btn:last-child'); await page.waitForTimeout(400);
  const res = await page.evaluate(() => window.__db.loadAll().then((st) => { const md = window.__model.buildModel(st); return { manual: md.results.filter((r) => r.source === 'manual').length, st: md.results.length, h: window.__model.headToHead(md, 't_f', 't_r') }; }));
  assert.strictEqual(res.manual, 2); console.log('OK jornada manual; H2H', JSON.stringify({ W: res.h.W, D: res.h.D, L: res.h.L, n: res.h.list.length }));
  // 5) copia de seguridad: exportar, vaciar, restaurar
  const snap = await page.evaluate(async () => { const t = await window.__db.exportScouting(); const c = (await window.__db.all('matches')).length; for (const s of ['matches', 'players', 'teams']) { const all = await window.__db.all(s); await window.__db.delMany(s, all.map((x) => x.id)); } const n = await window.__db.importScouting(t); return { c, n, after: (await window.__db.all('matches')).length, bytes: t.length }; });
  assert.strictEqual(snap.after, snap.c); console.log('OK backup', JSON.stringify(snap));
  // 6) borrar estadísticas de un partido elimina también sus calificaciones, no la repetición (stub)
  console.log('ERRORS', JSON.stringify(errors)); assert.strictEqual(errors.length, 0); await b.close(); console.log('TODO OK');
})().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
