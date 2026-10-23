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

  // ===== Pruebas de gestos y reproductor (con la primera repetición) =====
  if (samples.length) {
    const T = (name, ok, extra) => log('PRUEBA ' + (ok ? 'APROBADA' : 'FALLIDA') + ' · ' + name + (extra ? ' · ' + extra : ''));
    const st = () => page.evaluate(() => { const v = window.__fenixView; const c = document.querySelector('canvas'); return v ? { zoom: +v.zoom.toFixed(3), cx: +v.cx.toFixed(1), cy: +v.cy.toFixed(1), k: +v.k.toFixed(3), kFit: +v.kFit.toFixed(3), W: v.W, H: v.H } : null; });
    const rectOf = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
    const cdp = await ctx.newCDPSession(page);
    const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    try {
      const cr = await rectOf('canvas');
      log('Canvas: ' + JSON.stringify(cr));
      const s0 = await st();
      log('Estado inicial: ' + JSON.stringify(s0));
      T('1 Cancha completa al abrir (zoom 1, escala de ajuste)', s0 && s0.zoom === 1 && Math.abs(s0.k - s0.kFit) < 1e-6);
      const bar = await rectOf('.bar'); const ctr = await rectOf('.replay-controls-view');
      log('Marcador: ' + JSON.stringify(bar) + ' | Controles: ' + JSON.stringify(ctr));
      T('Marcador dentro de la pantalla', bar && bar.x >= -1 && bar.x + bar.w <= 391);
      T('Controles dentro de la pantalla', ctr && ctr.x >= -1 && ctr.x + ctr.w <= 391 && ctr.y + ctr.h <= 845);
      const cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2;
      // 2) separar dos dedos
      await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      const s1 = await st(); log('Tras separar dedos: ' + JSON.stringify(s1));
      await page.screenshot({ path: path.join(outDir, 'shot-3-zoom.png') });
      T('2 Separar dos dedos amplía', s1.zoom > 1.5, 'zoom=' + s1.zoom);
      // 5) arrastrar con un dedo
      await touch('touchStart', [[cx, cy]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx + i * 15, cy + i * 5]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      const s2 = await st(); log('Tras arrastrar: ' + JSON.stringify(s2));
      await page.screenshot({ path: path.join(outDir, 'shot-4-arrastre.png') });
      T('5 Arrastrar con un dedo desplaza la vista ampliada', (Math.abs(s2.cx - s1.cx) + Math.abs(s2.cy - s1.cy)) > 5 && s2.zoom === s1.zoom);
      // 3) juntar dedos
      await touch('touchStart', [[cx - 130, cy], [cx + 130, cy]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 130 + i * 12, cy], [cx + 130 - i * 12, cy]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      const s3 = await st(); log('Tras juntar dedos: ' + JSON.stringify(s3));
      T('3 Juntar dos dedos aleja', s3.zoom < s2.zoom, 'zoom=' + s3.zoom);
      // 4) el zoom mantiene el punto entre los dedos como referencia
      await page.evaluate(() => { const v = window.__fenixView; v.zoom = 1; v.cx = 0; v.cy = 0; });
      await page.waitForTimeout(200);
      const pa = await st();
      const px = cr.x + cr.w * 0.75, py = cr.y + cr.h * 0.5;
      const wx0 = pa.cx + ((px - cr.x) * (pa.W / cr.w) - pa.W / 2) / pa.k;
      await touch('touchStart', [[px - 30, py], [px + 30, py]]);
      for (let i = 1; i <= 8; i++) await touch('touchMove', [[px - 30 - i * 10, py], [px + 30 + i * 10, py]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(300);
      const pb = await st();
      const wx1 = pb.cx + ((px - cr.x) * (pb.W / cr.w) - pb.W / 2) / pb.k;
      T('4 El punto entre los dedos se mantiene como referencia', Math.abs(wx1 - wx0) < 3, 'desvío=' + Math.abs(wx1 - wx0).toFixed(2) + ' (zoom ' + pb.zoom + ')');
      // 6) botón restablecer
      await page.click('.fenix-fit');
      await page.waitForTimeout(300);
      const s4 = await st();
      T('6 Botón restablecer vuelve a la cancha completa', s4.zoom === 1 && s4.cx === 0 && s4.cy === 0);
      // 7) pausar/reanudar conserva el zoom
      await page.evaluate(() => { const v = window.__fenixView; v.zoom = 3; v.cx = 100; v.cy = 20; });
      const t0 = await page.evaluate(() => document.querySelector('[data-hook=time]').textContent);
      await page.click('#play_button'); await page.waitForTimeout(2500);
      const t1 = await page.evaluate(() => document.querySelector('[data-hook=time]').textContent);
      await page.click('#play_button'); await page.waitForTimeout(300);
      const s5 = await st();
      T('7 Pausar/reanudar sin perder el zoom', s5.zoom === 3, 'zoom=' + s5.zoom);
      log('Tiempo antes/después de reproducir: ' + t0 + ' → ' + t1);
      T('13 La repetición avanza (reloj cambia al reproducir)', t0 !== t1);
      // ===== Seguimiento de jugador: elegir uno, luego otro (abriendo Ajustes dos veces) =====
      try {
        const live0 = await page.evaluate(() => (window.__fenixLive || []).map(p => p.id));
        const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#selectPlayerToFollow option')).map(o => o.value));
        const ids = live0.filter(id => opts.includes(String(id)) && id !== 0).slice(0, 2);
        log('Seguimiento: jugadores en juego ' + JSON.stringify(live0) + ' opciones ' + JSON.stringify(opts));
        const results = [];
        for (const id of ids) {
          await page.click('#settings_button'); await page.waitForTimeout(600);
          await page.click('#video_button'); await page.waitForTimeout(300);
          await page.locator('#selectPlayerToFollow:visible').selectOption(String(id)); await page.waitForTimeout(500);
          const chk = await page.evaluate((id) => { const f = window.__fenixFollow, l = (window.__fenixLive || []).find(p => p.id === id); return { f, l }; }, id);
          results.push(!!(chk.l && chk.f && String(chk.f.id) === String(id) && Math.abs(chk.f.x - chk.l.x) < 0.01 && Math.abs(chk.f.y - chk.l.y) < 0.01));
          await page.click('.settings-view >> text=Close'); await page.waitForTimeout(600);
        }
        T('S1 Seguir a un jugador y luego a otro: se sigue siempre al último elegido', ids.length === 2 && results.every(Boolean), JSON.stringify({ ids, results }));
        await page.evaluate(() => window.__fenixSetFollow && window.__fenixSetFollow(0));
      } catch (err) { T('S1 Seguir a un jugador y luego a otro: se sigue siempre al último elegido', false, String(err).slice(0, 200)); }
      // 8) barra de tiempo (toque) sin mover la cancha
      const tb = await rectOf('.timebar');
      const before = await st();
      await touch('touchStart', [[tb.x + tb.w * 0.6, tb.y + tb.h / 2]]);
      for (let i = 1; i <= 4; i++) await touch('touchMove', [[tb.x + tb.w * (0.6 + i * 0.05), tb.y + tb.h / 2]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(600);
      const after = await st();
      const t2 = await page.evaluate(() => document.querySelector('[data-hook=time]').textContent);
      T('8 Barra de tiempo cambia el instante sin desplazar la cancha', t2 !== t1 && after.cx === before.cx && after.cy === before.cy, 'reloj ' + t1 + ' → ' + t2);
      await page.screenshot({ path: path.join(outDir, 'shot-5-barra.png') });
      // 9) velocidad
      const sp0 = await page.evaluate(() => document.querySelector('[data-hook=spd]').textContent);
      await page.click('[data-hook=spdup]'); await page.waitForTimeout(300);
      const sp1 = await page.evaluate(() => document.querySelector('[data-hook=spd]').textContent);
      const s6 = await st();
      T('9 Cambiar velocidad no altera la vista', sp0 !== sp1 && s6.zoom === after.zoom && s6.cx === after.cx, sp0 + ' → ' + sp1);
      // 10) girar el dispositivo
      await page.click('.fenix-fit'); await page.waitForTimeout(200);
      await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(1200);
      const sl = await st();
      await page.screenshot({ path: path.join(outDir, 'shot-6-horizontal.png') });
      const cl = await rectOf('canvas');
      T('10 Girar a horizontal: la cancha se reajusta', sl && sl.zoom === 1 && sl.W > 0, 'canvas ' + Math.round(cl.w) + 'x' + Math.round(cl.h) + ' kFit=' + sl.kFit);
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, 'shot-7-final.png') });

      // ===== Historial, renombrar, reabrir y botones =====
      await page.click('#button_leave'); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(outDir, 'shot-8-inicio-historial.png') });
      const snap = () => page.evaluate(() => ['.fh-logo','.fh-hero h1','.fh-import','.fh-tabs','.fh-scroll','.fenix-home'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.x*10)/10, Math.round(r.y*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; }));
      const snapA = await snap();
      await page.click('.fh-tabs button:nth-child(2)'); await page.waitForTimeout(700);
      const snapB = await snap();
      await page.click('.fh-tabs button:nth-child(1)'); await page.waitForTimeout(700);
      const snapC = await snap();
      T('F2 Al cambiar Historial/Favoritos no se mueve nada', JSON.stringify(snapA) === JSON.stringify(snapB) && JSON.stringify(snapA) === JSON.stringify(snapC), JSON.stringify([snapA, snapB, snapC]));
      const n1 = await page.locator('.fh-item').count();
      T('H1 La repetición importada aparece en el historial', n1 === 1, n1 + ' elemento(s)');
      await page.click('.fh-rename'); await page.waitForTimeout(200);
      await page.fill('.fh-edit input', 'Final vs Rivales');
      await page.screenshot({ path: path.join(outDir, 'shot-9-renombrar.png') });
      await page.click('.fh-ok'); await page.waitForTimeout(500);
      const nm = await page.evaluate(() => (document.querySelector('.fh-name') || {}).textContent);
      T('H2 Cambiar el nombre de la repetición', nm === 'Final vs Rivales', 'nombre: ' + nm);
      await page.click('.fh-open'); await page.waitForTimeout(12000);
      const reopened = await page.evaluate(() => { const t = document.querySelector('[data-hook=time]'); const c = document.querySelector('.game-state-view canvas'); const r = c && c.getBoundingClientRect(); return !!(t && r && r.width > 100 && window.__fenixView && window.__fenixView.k > 0); });
      T('H3 Abrir una repetición desde el historial', reopened);
      await page.waitForTimeout(800);
      const starOk = await page.evaluate(async () => { const b = document.querySelector('.fenix-star'); if (!b || b.offsetParent === null) return 'sin estrella'; b.click(); await new Promise(r => setTimeout(r, 700)); const b2 = document.querySelector('.fenix-star'); return b2 && b2.classList.contains('on') ? 'ok' : 'no cambió'; });
      T('F1 Estrella de favoritos dentro de la repetición', starOk === 'ok', starOk);
      await page.screenshot({ path: path.join(outDir, 'shot-10-reabierta.png') });
      const tiles = await page.evaluate(() => Array.from(document.querySelectorAll('.bottom-section .buttons button')).filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
      log('Botones (texto,x,y,ancho,alto): ' + JSON.stringify(tiles));
      const lay = await page.evaluate(() => ['.bottom-section','.bottom-section .buttons','.chatbox-view','.chatbox-view .log','.replay-controls-view'].map(q => { const e = document.querySelector(q); if (!e) return [q, null]; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return [q, Math.round(r.y), Math.round(r.height), cs.paddingBottom, cs.marginTop, cs.flex]; }));
      log('Layout inferior: ' + JSON.stringify(lay));
      T('B1 Menú/Ajustes/Estadísticas dentro de la pantalla y táctiles (≥44px)', tiles.length >= 3 && tiles.every(b => b[1] >= 0 && b[1] + b[3] <= 391 && b[4] >= 44));
      const bar2 = await rectOf('.game-state-view .bar');
      log('Marcador: ' + JSON.stringify(bar2));
      T('M1 Marcador compacto y centrado arriba', bar2 && bar2.w < 300 && Math.abs((bar2.x + bar2.w / 2) - 195) < 6, 'ancho ' + Math.round(bar2.w));
      await page.click('#button_staty'); await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, 'shot-11-estadisticas.png') });
      log('Texto en estadísticas: ' + (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\s+/g, ' '));
    } catch (e) { log('ERROR en pruebas: ' + String(e.message).slice(0, 300)); }
  }
  log('--- PETICIONES EXTERNAS (' + external.size + ') ---'); [...external].forEach(s => log(s));
  log('--- PETICIONES FALLIDAS (' + failed.length + ') ---'); failed.slice(0, 20).forEach(s => log(s));
  log('--- ERRORES (' + errors.length + ') ---'); errors.slice(0, 20).forEach(s => log(s));
  fs.writeFileSync(path.join(outDir, 'report-web.txt'), lines.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(0); });
