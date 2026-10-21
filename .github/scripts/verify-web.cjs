// Verifica la app web compilada en un navegador real: peticiones externas, errores y capturas.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const [,, url, outDir, sampleDir] = process.argv;
(async () => {
  const lines = [];
  const log = (s) => { console.log(s); lines.push(s); };
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const external = new Set(), failed = [], okLocal = [], errors = [];
  page.on('request', r => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.add(r.method() + ' ' + r.url().slice(0, 140)); });
  page.on('response', r => { if (new URL(r.url()).hostname === 'localhost') okLocal.push(r.status() + ' ' + r.url().replace(url, '/')); });
  page.on('requestfailed', r => failed.push(r.url().slice(0, 140) + ' :: ' + (r.failure() || {}).errorText));
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outDir, 'shot-1-inicio.png') });
  log('TITULO: ' + await page.title());
  log('TEXTO VISIBLE: ' + (await page.evaluate(() => document.body.innerText)).slice(0, 400).replace(/\s+/g, ' '));
  log('--- Respuestas locales (no 200 / offline) ---');
  okLocal.filter(s => /offline|\.dat|\.json/.test(s)).forEach(s => log(s));
  const samples = sampleDir && fs.existsSync(sampleDir) ? fs.readdirSync(sampleDir).filter(f => f.toLowerCase().endsWith('.hbr2')) : [];
  log('REPLAYS DE PRUEBA: ' + (samples.join(', ') || 'ninguno'));
  for (const f of samples.slice(0, 2)) {
    try {
      await page.setInputFiles('#replayfile', path.join(sampleDir, f));
      await page.waitForTimeout(12000);
      await page.screenshot({ path: path.join(outDir, 'shot-2-replay-' + f.replace(/\W/g, '_') + '.png') });
      log('Replay cargado: ' + f + ' | texto: ' + (await page.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\s+/g, ' '));
    } catch (e) { log('Fallo al cargar ' + f + ': ' + e.message.slice(0, 200)); }
  }
  log('--- PETICIONES EXTERNAS (' + external.size + ') ---'); [...external].forEach(s => log(s));
  log('--- PETICIONES FALLIDAS (' + failed.length + ') ---'); failed.slice(0, 20).forEach(s => log(s));
  log('--- ERRORES (' + errors.length + ') ---'); errors.slice(0, 20).forEach(s => log(s));
  fs.writeFileSync(path.join(outDir, 'report-web.txt'), lines.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(0); });
