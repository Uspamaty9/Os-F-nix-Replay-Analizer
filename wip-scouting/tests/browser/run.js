const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.screenshot({ path: 'shots/00-empty.png' });
  // Siembra: equipos, jugadores y 5 partidos sintéticos
  const info = await page.evaluate(async () => {
    const db = window.__db, ing = window.__ingest;
    const T1 = { id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, T2 = { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 };
    await db.putMany('teams', [T1, T2]);
    const names1 = ['Matheus', 'Kevin', 'Santi'], names2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('players', names1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: ['Delantero', 'Mediocentro', 'Defensa'][i], avatar: null, notes: '', source: 'manual', createdAt: 1 })));
    await db.put('seasons', { id: 's1', name: 'Temporada 2026', start: Date.UTC(2026, 0, 1), end: Date.UTC(2026, 11, 31), createdAt: 1 });
    await db.put('competitions', { id: 'c1', name: 'Liga Fênix', type: 'liga', seasonId: 's1', teamIds: ['t_f', 't_r'], createdAt: 1 });
    window.__lm = {};
    for (let i = 0; i < 5; i++) {
      const id = 'r' + i; window.__lm[id] = Date.UTC(2026, 9, 1 + i * 3);
      const flip = i % 2 === 1; const raw = window.__gen(100 + i * 7, flip ? names2 : names1, flip ? names1 : names2, 160 + i * 20);
      await ing.ingestStats(id, [raw]);
    }
    return { matches: (await db.all('matches')).length, players: (await db.all('players')).length, sample: (await db.all('matches'))[0] };
  });
  console.log('seed', info.matches, 'partidos', info.players, 'jugadores; teamAuto', info.sample.teamAuto, info.sample.redTeamId, info.sample.blueTeamId);
  await page.waitForTimeout(400);
  const tabs = ['Panel', 'Jugadores', 'Scouting', 'Partidos', 'Equipos', 'Más'];
  for (let i = 0; i < tabs.length; i++) { await page.click('.sc-tabs button:nth-child(' + (i + 1) + ')'); await page.waitForTimeout(300); await page.screenshot({ path: 'shots/1' + i + '-' + tabs[i] + '.png', fullPage: false }); }
  console.log('ERRORS', JSON.stringify(errors));
  await b.close();
})();
