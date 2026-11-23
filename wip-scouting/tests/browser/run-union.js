// Unir repeticiones en un solo partido: hoja, marcador sumado, exclusión de originales, deshacer.
const { chromium } = require('playwright'); const assert = require('assert');
(async () => {
  const b = await chromium.launch(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await page.goto('http://localhost:8765/index.html'); await page.waitForSelector('.sc-root');
  await page.evaluate(async () => { const n1 = ['Matheus', 'Kevin', 'Santi'], n2 = ['Rojas', 'Lopez', 'Nico']; for (let i = 0; i < 2; i++) await window.__ingest.ingestStats('r' + i, [window.__gen(100 + i * 7, n1, n2, 160)]); });
  await page.waitForTimeout(500);
  await page.click('.sc-tabs button:has-text("Partidos")'); await page.waitForTimeout(200);
  await page.click('button:has-text("Seleccionar")'); await page.click('.sc-list li >> nth=0');
  assert.ok(await page.$('button:has-text("Unir (1)"):disabled'), 'con 1 no se puede unir');
  await page.click('.sc-list li >> nth=1'); await page.click('button:has-text("Unir (2)")'); await page.waitForSelector('.sc-sheet');
  await page.screenshot({ path: 'shots/union-unir.png' });
  await page.click('.sc-sheet-foot .sc-btn:not(.ghost)'); await page.waitForTimeout(500);
  const st = await page.evaluate(() => window.__db.loadAll().then((s) => ({ n: s.matches.length, ex: s.matches.filter((m) => m.excluded).length, merged: s.matches.filter((m) => m.mergedFrom).map((m) => ({ parts: m.parts.length, ids: m.replayIds, ticks: m.parts[0].ticks })) })));
  assert.strictEqual(st.n, 3); assert.strictEqual(st.ex, 2); assert.strictEqual(st.merged.length, 1); assert.deepStrictEqual(st.merged[0].ids.slice().sort(), ['r0', 'r1']);
  assert.strictEqual(await page.$$eval('.sc-list li', (l) => l.length), 1, 'solo cuenta el unido');
  await page.screenshot({ path: 'shots/union-unido.png' });
  await page.click('.sc-list li'); await page.waitForTimeout(300); assert.ok(await page.$('button:has-text("repeticiones seguidas")'), 'botón de ver seguidas'); assert.ok(await page.$('button:has-text("Separarlas")'));
  await page.click('button:has-text("Separarlas")'); await page.waitForTimeout(500);
  const st2 = await page.evaluate(() => window.__db.loadAll().then((s) => ({ n: s.matches.length, ex: s.matches.filter((m) => m.excluded).length })));
  assert.deepStrictEqual(st2, { n: 2, ex: 0 }, 'separadas'); assert.deepStrictEqual(errors, []); console.log('OK unir repeticiones'); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
