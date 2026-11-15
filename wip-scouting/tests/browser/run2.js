const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => { // la BD persiste entre ejecuciones del mismo origen en un contexto nuevo? no: contexto nuevo = BD vacía → resembrar
    const db = window.__db, ing = window.__ingest;
    await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }, { id: 't_r', name: 'Rival FC', color: '#3A78B5', own: false, createdAt: 1 }]);
    const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico'];
    await db.putMany('players', n1.map((n, i) => ({ id: 'p' + i, nick: n, aliases: [], teamId: 't_f', position: ['Delantero', 'Mediocentro', 'Defensa'][i], avatar: null, notes: '', source: 'manual', createdAt: 1 })).concat(n2.map((n, i) => ({ id: 'q' + i, nick: n, aliases: [], teamId: 't_r', position: '', avatar: null, notes: '', source: 'manual', createdAt: 1 }))));
    await db.put('seasons', { id: 's1', name: 'Temporada 2026', createdAt: 1 }); await db.put('competitions', { id: 'c1', name: 'Liga Fênix', type: 'liga', seasonId: 's1', teamIds: ['t_f', 't_r'], createdAt: 1 });
    window.__lm = {}; for (let i = 0; i < 5; i++) { const id = 'r' + i; window.__lm[id] = Date.UTC(2026, 9, 1 + i * 3); const flip = i % 2 === 1; await ing.ingestStats(id, [window.__gen(100 + i * 7, flip ? n2 : n1, flip ? n1 : n2, 160 + i * 20)]); }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/20-panel-top.png' });
  const kp = await page.$$eval('.sc-kpi', (els) => els.slice(0, 10).map((e) => e.innerText.replace(/\n/g, ' | ')));
  console.log('PANEL', JSON.stringify(kp));
  await page.evaluate(() => document.querySelector('.sc-main').scrollTo(0, 700)); await page.screenshot({ path: 'shots/21-panel-mid.png' });
  // Jugadores -> perfil
  await page.click('.sc-tabs button:nth-child(2)'); await page.waitForTimeout(200); await page.click('.sc-list li:first-child'); await page.waitForTimeout(300); await page.screenshot({ path: 'shots/22-perfil.png' });
  await page.click('.sc-seg button:nth-child(3)'); await page.waitForTimeout(300); await page.screenshot({ path: 'shots/23-perfil-evo.png' });
  // Scouting: guardar una calificación manual
  await page.click('.sc-tabs button:nth-child(3)'); await page.waitForTimeout(300);
  await page.$eval('.sc-crit:nth-of-type(1) input[type=range]', (el) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '8'); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('textarea', 'Muy buena ubicación en el segundo palo.'); await page.click('.sc-row.end .sc-btn:last-child'); await page.waitForTimeout(400);
  const rated = await page.evaluate(async () => (await window.__db.all('ratings')).map((r) => ({ id: r.id, manual: r.manual, notes: r.notes })));
  console.log('RATINGS', JSON.stringify(rated));
  await page.evaluate(() => document.querySelector('.sc-main').scrollTo(0, 500)); await page.screenshot({ path: 'shots/24-scouting.png' });
  // Partido detalle
  await page.click('.sc-tabs button:nth-child(4)'); await page.waitForTimeout(200); await page.click('.sc-list li:first-child'); await page.waitForTimeout(400); await page.screenshot({ path: 'shots/25-partido.png' });
  await page.evaluate(() => document.querySelector('.sc-main').scrollTo(0, 900)); await page.screenshot({ path: 'shots/26-partido2.png' });
  // PDFs: equipo, jugador, partido
  const pdfs = await page.evaluate(async () => { const m = window.__model; const st = await window.__db.loadAll(); const mod = m.buildModel(st); const rp = window.__report; const out = {}; const t = rp.buildTeamReport(mod, { seasonId: '', competitionId: '', teamId: 't_f', playerId: '' }); const p = rp.buildPlayerReport(mod, 'p1', {}); const mm = rp.buildMatchReport(mod, 'r0'); const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }; return { team: b64(t), player: b64(p), match: b64(mm) }; });
  for (const k of Object.keys(pdfs)) fs.writeFileSync('shots/rep-' + k + '.pdf', Buffer.from(pdfs[k], 'base64'));
  console.log('ERRORS', JSON.stringify(errors)); await b.close();
})();
