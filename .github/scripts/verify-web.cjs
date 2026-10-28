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
  await ctx.addInitScript(() => { try { localStorage.setItem('fenix-guide', '1'); } catch (e) { } });
  await ctx.addInitScript(() => { setInterval(() => { const o = document.querySelector('.fenix-tap-overlay'); if (o) o.click(); }, 250); });
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
      await page.waitForTimeout(700);
      try { await page.screenshot({ path: path.join(outDir, 'shot-28-analizando-' + f.replace(/\W/g, '') + '.png') }); } catch (e) { }
      await page.waitForTimeout(11300);
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
        const ids = live0.filter(id => id !== 0).slice(0, 2);
        log('Seguimiento: jugadores en juego ' + JSON.stringify(live0));
        const results = [];
        for (const id of ids) {
          await page.click('#settings_button'); await page.waitForTimeout(600);
          const optsNow = await page.locator('#selectPlayerToFollow option').evaluateAll(os => os.map(o => o.value)); log('opciones: ' + JSON.stringify(optsNow)); await page.locator('#selectPlayerToFollow').selectOption(String(id), { force: true }); await page.waitForTimeout(500);
          const chk = await page.evaluate((id) => { const f = window.__fenixFollow, l = (window.__fenixLive || []).find(p => p.id === id); return { f, l }; }, id);
          results.push(!!(chk.l && chk.f && String(chk.f.id) === String(id) && Math.abs(chk.f.x - chk.l.x) < 0.01 && Math.abs(chk.f.y - chk.l.y) < 0.01));
          await page.click('.settings-view [data-hook=close]'); await page.waitForTimeout(600);
        }
        T('S1 Seguir a un jugador y luego a otro: se sigue siempre al último elegido', ids.length === 2 && results.every(Boolean), JSON.stringify({ ids, results }));
        await page.evaluate(() => window.__fenixSetFollow && window.__fenixSetFollow(0));
      } catch (err) { T('S1 Seguir a un jugador y luego a otro: se sigue siempre al último elegido', false, String(err).slice(0, 200)); }
      // ===== Reabrir Ajustes SIN pulsar "Video" (el diálogo recuerda la pestaña) y elegir jugadores =====
      try {
        const res3 = [];
        for (let n = 0; n < 3; n++) {
          const id = await page.evaluate((n) => { const l = (window.__fenixLive || []).map(p => p.id); return l[n % l.length]; }, n);
          await page.click('#settings_button'); await page.waitForTimeout(600);
          await page.locator('#selectPlayerToFollow').selectOption(String(id), { force: true }); await page.waitForTimeout(500);
          const ok = await page.evaluate((id) => { const f = window.__fenixFollow, l = (window.__fenixLive || []).find(p => p.id === id); return !!(l && f && String(f.id) === String(id) && Math.abs(f.x - l.x) < 0.01); }, id);
          res3.push(ok);
          await page.click('.settings-view [data-hook=close]'); await page.waitForTimeout(600);
        }
        T('S3 Ajustes reabierto sin tocar "Video": cada jugador elegido se sigue', res3.every(Boolean), JSON.stringify(res3));
      } catch (err) { T('S3 Ajustes reabierto sin tocar "Video": cada jugador elegido se sigue', false, String(err).slice(0, 200)); }
      // ===== Panel propio "Seguir jugador" =====
      try {
        const res4 = [];
        for (let n = 0; n < 3; n++) {
          const id = await page.evaluate((n) => { const l = (window.__fenixLive || []).map(p => p.id); return l[(n + 1) % l.length]; }, n);
          await page.click('.fenix-follow'); await page.waitForTimeout(600);
          await page.click('.fenix-follow-panel .ff-item[data-id="' + id + '"]'); await page.waitForTimeout(700);
          const ok = await page.evaluate((id) => { const f = window.__fenixFollow, l = (window.__fenixLive || []).find(p => p.id === id); return !!(l && f && String(f.id) === String(id) && Math.abs(f.x - l.x) < 0.01); }, id);
          res4.push(ok);
        }
        await page.screenshot({ path: path.join(outDir, 'shot-12-seguir.png') });
        T('S4 Panel "Seguir jugador": cada jugador elegido se sigue', res4.every(Boolean), JSON.stringify(res4));
        await page.evaluate(() => window.__fenixSetFollow && window.__fenixSetFollow(0));
      } catch (err) { T('S4 Panel "Seguir jugador": cada jugador elegido se sigue', false, String(err).slice(0, 200)); }
      // ===== Seguir a la pelota y modo libre =====
      try {
        await page.click('.fenix-follow'); await page.waitForTimeout(600);
        await page.click('.fenix-follow-panel .ff-item[data-id="ball"]'); await page.waitForTimeout(700);
        const ballOk = await page.evaluate(() => { const f = window.__fenixFollow, b = window.__fenixBall; return !!(f && b && f.mode === 'pelota' && Math.abs(f.x - b.x) < 0.01 && Math.abs(f.y - b.y) < 0.01); });
        await page.click('.fenix-follow'); await page.waitForTimeout(600);
        await page.click('.fenix-follow-panel .ff-item[data-id="0"]'); await page.waitForTimeout(700);
        const freeOk = await page.evaluate(() => window.__fenixFollow && window.__fenixFollow.mode === 'libre');
        T('S5 Seguir a la pelota y modo libre', ballOk && freeOk, JSON.stringify({ ballOk, freeOk }));
      } catch (err) { T('S5 Seguir a la pelota y modo libre', false, String(err).slice(0, 200)); }
      // ===== Tocar jugadores en la cancha para seguirlos (varias veces, siempre gana el último) =====
      try {
        await page.click('.fenix-fit'); await page.evaluate(() => window.__fenixSetFollow && window.__fenixSetFollow(0)); await page.waitForTimeout(500);
        const outcomes = [];
        for (let n = 0; n < 3; n++) {
          const target = await page.evaluate(() => {
            const fv = window.__fenixView, c = document.querySelector('.game-state-view canvas'), r = c.getBoundingClientRect();
            const sx = r.width / c.width, cur = window.__fenixFollow ? window.__fenixFollow.id : 0;
            for (const d of (window.__fenixLive || [])) {
              if (String(d.id) === String(cur)) continue;
              const px = (d.x - fv.camX) * fv.k + fv.W / 2, py = (d.y - fv.camY) * fv.k + (fv.H + fv.h) / 2;
              const cx = r.left + px * sx, cy = r.top + py * sx;
              if (cx > r.left + 20 && cx < r.right - 20 && cy > r.top + 70 && cy < r.bottom - 20) return { id: d.id, cx, cy };
            }
            return null;
          });
          if (!target) { outcomes.push('sin objetivo'); continue; }
          await page.mouse.click(target.cx, target.cy); await page.waitForTimeout(500);
          const got = await page.evaluate(() => window.__fenixFollow && window.__fenixFollow.id);
          outcomes.push(String(got) === String(target.id));
        }
        T('S2 Tocar jugadores en la cancha: se sigue al último tocado', outcomes.filter(o => o === true).length >= 2, JSON.stringify(outcomes));
        await page.evaluate(() => window.__fenixSetFollow && window.__fenixSetFollow(0));
      } catch (err) { T('S2 Tocar jugadores en la cancha: se sigue al último tocado', false, String(err).slice(0, 200)); }
      // ===== Pantalla despejada para grabar =====
      try {
        const isPlaying = () => page.evaluate(() => document.body.classList.contains('fenix-playing'));
        const was = await isPlaying();
        if (was) { await page.click('#play_button'); await page.waitForTimeout(500); }
        await page.click('.fenix-clean-btn'); await page.waitForTimeout(700);
        const disp = (q) => page.evaluate((q) => { const e = document.querySelector(q); return !e || getComputedStyle(e).display === 'none'; }, q);
        const hidden = (await Promise.all(['.game-view > .bottom-section', '.fenix-fit', '.fenix-star', '.fenix-follow', '.fenix-clean-btn', '.game-state-view .bar-container'].map(disp))).every(Boolean);
        const ctrlPaused = !(await disp('.replay-controls-view'));
        await page.screenshot({ path: path.join(outDir, 'shot-13-despejada.png') });
        await page.click('#play_button'); await page.waitForTimeout(3300); // cuenta regresiva 3-2-1
        const ctrlPlaying = !(await disp('.replay-controls-view'));
        await page.screenshot({ path: path.join(outDir, 'shot-14-despejada-reproduciendo.png') });
        const cv = await page.evaluate(() => { const r = document.querySelector('.game-state-view canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; });
        for (let i = 0; i < 2; i++) { await page.mouse.click(cv.x, cv.y); await page.waitForTimeout(150); }
        await page.waitForTimeout(500);
        const back = await page.evaluate(() => !document.body.classList.contains('fenix-despejado'));
        const sb = !(await disp('.game-state-view .bar-container'));
        if (!(await isPlaying()) && was) { await page.click('#play_button'); await page.waitForTimeout(400); }
        T('C1 Pantalla despejada: oculta marcador y botones, barra solo en pausa, 2 toques salen', hidden && ctrlPaused && !ctrlPlaying && back && sb, JSON.stringify({ hidden, ctrlPaused, ctrlPlaying, back, sb }));
      } catch (err) { T('C1 Pantalla despejada', false, String(err).slice(0, 200)); }
      // ===== Simetría del chat y botón de zoom =====
      try {
        const gaps = await page.evaluate(() => {
          const r = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; };
          const bt = r('.game-view > .bottom-section > .buttons'), ch = r('.chatbox-view'), rc = r('.replay-controls-view');
          return bt && ch && rc ? { arriba: Math.round(ch.top - bt.bottom), abajo: Math.round(rc.top - ch.bottom) } : null;
        });
        T('G1 Espacio simétrico entre menús-chat y chat-controles', !!gaps && Math.abs(gaps.arriba - gaps.abajo) <= 3, JSON.stringify(gaps));
        const zr = [];
        for (const follow of [0, 'ball', 0]) {
          await page.evaluate((f) => { window.__fenixSetFollow(f); window.__fenixView.zoom = 3; }, follow);
          await page.waitForTimeout(300);
          await page.click('.fenix-fit'); await page.waitForTimeout(300);
          zr.push(await page.evaluate(() => window.__fenixView.zoom));
        }
        const pos = await page.evaluate(() => { const g = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const c = g('.game-state-view canvas'), a = g('.fenix-clean-btn'), s = g('.fenix-star'); return { ojoIzq: a && c ? a.left - c.left < 20 && a.top - c.top < 20 : false, starDer: s && c ? c.right - s.right < 20 && s.top - c.top < 20 : false }; });
        const edg = await page.evaluate(() => { const g = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const eye = g('.fenix-clean-btn'), st = g('.fenix-star'), fit = g('.fenix-fit'), ctr = g('.replay-controls-view'), lb = g('#button_leave'), mb = g('.game-view > .bottom-section .buttons button'); return { ojoL: Math.round(eye.left), ojoT: Math.round(eye.top), starR: Math.round(innerWidth - st.right), fitR: Math.round(innerWidth - fit.right), leaveB: Math.round(innerHeight - lb.bottom), leaveR: Math.round(innerWidth - lb.right), menuL: Math.round(mb.left) }; });
        T('B1 Márgenes cómodos en los bordes (vertical)', edg.ojoL >= 12 && edg.ojoT >= 12 && edg.starR >= 12 && edg.fitR >= 12 && edg.leaveB >= 10 && edg.leaveR >= 12 && edg.menuL >= 12, JSON.stringify(edg));
        T('Z1 El botón de zoom siempre vuelve a 1.0×', zr.every(z => z === 1), JSON.stringify(zr));
        T('P1 Ojo arriba-izquierda y favoritos arriba-derecha', pos.ojoIzq && pos.starDer, JSON.stringify(pos));
        await page.evaluate(() => window.__fenixSetFollow(0));
      } catch (err) { T('G1/Z1/P1 disposición', false, String(err).slice(0, 200)); }
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
      try {
        const lg = await page.evaluate(() => { const g = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const c = g('.game-state-view'), rc = g('.replay-controls-view'), eye = g('.fenix-clean-btn'); const btns = Array.from(document.querySelectorAll('.game-view > .bottom-section .buttons button')).map(b => b.getBoundingClientRect()); const ov = eye && btns.some(b => !(eye.right <= b.left || eye.left >= b.right || eye.bottom <= b.top || eye.top >= b.bottom)); return { hueco: c && rc ? Math.round(rc.top - c.bottom) : null, ojoChoca: ov, ojoAbajo: eye && rc ? eye.bottom <= rc.top + 1 : null }; });
        T('L1 Horizontal: línea dorada pegada a la cancha y ojo sin chocar', lg.hueco !== null && Math.abs(lg.hueco) <= 3 && lg.ojoChoca === false && lg.ojoAbajo, JSON.stringify(lg));
      } catch (err) { T('L1 Horizontal', false, String(err).slice(0, 200)); }
      try {
        await page.evaluate(() => { document.documentElement.style.setProperty('--sal', '32px'); document.documentElement.style.setProperty('--sar', '0px'); });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(outDir, 'shot-16-recorte.png') });
        const ins = await page.evaluate(() => { const L = q => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().left) : null; }; const R = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const bs = Array.from(document.querySelectorAll('.game-view > .bottom-section .buttons button')).filter(b => b.offsetWidth > 0).map(b => b.getBoundingClientRect()); const h = bs.map(b => Math.round(b.height)), w = bs.map(b => Math.round(b.width)); const gaps = bs.slice(1).map((b, i) => Math.round(b.top - bs[i].bottom)); return { canvas: L('.game-state-view canvas'), ctrl: L('.replay-controls-view button'), menu: L('.game-view > .bottom-section .buttons button'), ojo: L('.fenix-clean-btn'), h, w, gaps, borde: getComputedStyle(document.querySelector('.replay-controls-view')).borderTopWidth, btnH: Math.round(R('#play_button').height) }; });
        T('N1 Recorte de cámara respetado y botones laterales parejos', ins.ctrl >= 12 && ins.menu >= 12 && ins.ojo >= 12 && ins.canvas <= 2 && ins.h.every(v => v === 44) && ins.w.every(v => v === 52) && ins.gaps.every(g => g >= 8) && ins.btnH <= 40, JSON.stringify(ins));
        await page.evaluate(() => { document.documentElement.style.removeProperty('--sal'); });
      } catch (err) { T('N1 Recorte', false, String(err).slice(0, 200)); }
      for (const vp of [{ width: 844, height: 390, n: 'horizontal' }, { width: 390, height: 844, n: 'vertical' }]) {
        try {
          await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(800);
          await page.click('#button_staty'); await page.waitForTimeout(1800);
          const stt = await page.evaluate(() => { const r = q => { const e = document.querySelector(q); return e ? e.getBoundingClientRect() : null; }; const ov = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom); const p = r('#game-stats'), sel = r('#game-stats .title select'), cl = r('#game-stats > button'), dl = Array.from(document.querySelectorAll('#game-stats .title button')).map(b => b.getBoundingClientRect()); return { panelL: Math.round(p.left), panelT: Math.round(p.top), panelR: Math.round(innerWidth - p.right), panelB: Math.round(innerHeight - p.bottom), cierraChoca: ov(cl, sel) || dl.some(d => ov(cl, d)), cols: getComputedStyle(document.querySelector('#game-stats')).display }; });
          await page.screenshot({ path: path.join(outDir, 'shot-17-stats-' + vp.n + '.png') });
          T('E2 Estadísticas ordenadas (' + vp.n + ')', stt.panelL >= 8 && stt.panelT >= 8 && stt.panelR >= 8 && stt.panelB >= 8 && !stt.cierraChoca, JSON.stringify(stt));
          await page.click('#game-stats > button'); await page.waitForTimeout(900);
        } catch (err) { T('E2 Estadísticas (' + vp.n + ')', false, String(err).slice(0, 200)); }
      }
      try {
        await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(800);
        await page.click('#settings_button'); await page.waitForTimeout(900);
        const hid = await page.evaluate(() => getComputedStyle(document.querySelector('.game-view > .bottom-section')).visibility === 'hidden');
        await page.screenshot({ path: path.join(outDir, 'shot-18-ajustes-horizontal.png') });
        T('E3 Horizontal: con Ajustes abierto los botones laterales no se superponen', hid, String(hid));
        await page.click('.settings-view [data-hook=close]'); await page.waitForTimeout(1500);
        const back2 = await page.evaluate(() => getComputedStyle(document.querySelector('.game-view > .bottom-section')).visibility === 'visible' && document.querySelector('.settings-view').style.visibility === 'hidden');
        const dg = await page.evaluate(() => JSON.stringify({ stats: !!document.getElementById('game-stats'), sv: (document.querySelector('.settings-view') || { style: {} }).style.visibility, cls: document.body.className, rv: !!(document.querySelector('.room-view') && document.querySelector('.room-view').offsetParent) }));
        T('E3b Al cerrar Ajustes vuelven los botones', back2, String(back2) + ' ' + dg);
        await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(400);

      try {
        const bk = (ms = 1200) => page.evaluate(() => window.__fenixBack()).then(() => page.waitForTimeout(ms));
        const r = {};
        await page.click('#button_staty'); await page.waitForTimeout(1500); await bk();
        r.stats = await page.evaluate(() => !document.getElementById('game-stats'));
        await page.click('#settings_button'); await page.waitForTimeout(900); await bk();
        r.ajustes = await page.evaluate(() => document.querySelector('.settings-view').style.visibility === 'hidden');
        await page.click('[data-hook=menu]'); await page.waitForTimeout(900);
        r.cerrarVisible = await page.evaluate(() => { const b = document.querySelector('.fenix-room-close'); return !!(b && b.offsetParent !== null && b.getBoundingClientRect().width < 200 && b.getBoundingClientRect().right > innerWidth - 40); });
        await page.screenshot({ path: path.join(outDir, 'shot-19-menu-sala.png') });
        await page.click('.fenix-room-close'); await page.waitForTimeout(900);
        r.cerrarBoton = await page.evaluate(() => { const v = document.querySelector('.room-view'); return !v || v.offsetParent === null; });
        await page.click('[data-hook=menu]'); await page.waitForTimeout(900); await bk();
        r.menuAtras = await page.evaluate(() => { const v = document.querySelector('.room-view'); return !v || v.offsetParent === null; });
        T('K1 Botón atrás cierra Estadísticas, Ajustes y Menú; el Menú tiene botón Cerrar', Object.values(r).every(Boolean), JSON.stringify(r));
      } catch (err) { T('K1 Botón atrás', false, String(err).slice(0, 200)); }
      } catch (err) { T('E3 Ajustes horizontal', false, String(err).slice(0, 200)); }
      await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(outDir, 'shot-7-final.png') });

      // ===== Historial, renombrar, reabrir y botones =====
      try {
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
        await page.click('#button_leave'); await page.waitForTimeout(500);
        const askLeave = await page.evaluate(() => !!document.querySelector('.fenix-exit-overlay'));
        await page.screenshot({ path: path.join(outDir, 'shot-22-salir-repeticion.png') });
        await page.click('.fenix-exit-overlay .fe-cancel'); await page.waitForTimeout(500);
        const stillIn = await page.evaluate(() => { const h = document.querySelector('.fenix-home').getBoundingClientRect(); return h.left < -50 || h.left > innerWidth / 2; });
        await page.evaluate(() => window.__fenixBack()); await page.waitForTimeout(500);
        const askBack = await page.evaluate(() => !!document.querySelector('.fenix-exit-overlay'));
        await page.evaluate(() => window.__fenixBack()); await page.waitForTimeout(500);
        T('K3 Salir de la repetición pide confirmación (Leave y botón atrás)', askLeave && stillIn && askBack, JSON.stringify({ askLeave, stillIn, askBack }));
      } catch (err) { T('K3 Confirmar salir', false, String(err).slice(0, 200)); }
      await page.click('#button_leave'); await page.waitForTimeout(500); await page.click('.fenix-exit-overlay .fe-ok'); await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(outDir, 'shot-8-inicio-historial.png') });
      try {
        await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(outDir, 'shot-15-inicio-horizontal.png') });
        const ov = await page.evaluate(() => { const r = q => document.querySelector(q).getBoundingClientRect(); const g = r('.fh-gear'), tabs = Array.from(document.querySelectorAll('.fh-tabs button')).map(b => b.getBoundingClientRect()); const hit = tabs.some(t => !(g.right <= t.left || g.left >= t.right || g.bottom <= t.top || g.top >= t.bottom)); return { choca: hit, gearLeft: Math.round(g.left) }; });
        const ex1 = await page.evaluate(() => { const r = q => document.querySelector(q).getBoundingClientRect(); const g = r('.fh-gear:not(.fh-exit)'), e = r('.fh-exit'); return { choca: !(g.right <= e.left || g.left >= e.right), exitLeft: Math.round(e.left) }; });
        T('X1 Botón de salir del inicio no choca con el engranaje', ex1.choca === false, JSON.stringify(ex1));
        T('E1 Horizontal: engranaje no se superpone a Favoritos', ov.choca === false, JSON.stringify(ov));
        const rc = () => page.evaluate(() => ['.fh-logo', '.fh-import', '.fh-tabs button:nth-child(1)', '.fh-tabs button:nth-child(2)'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; }));
        const h1 = await rc();
        await page.click('.fh-tabs button:nth-child(2)'); await page.waitForTimeout(700);
        const h2 = await rc();
        await page.screenshot({ path: path.join(outDir, 'shot-20-favoritos-horizontal.png') });
        await page.click('.fh-tabs button:nth-child(1)'); await page.waitForTimeout(500);
        T('E4 Horizontal: Historial y Favoritos no mueven nada', JSON.stringify(h1) === JSON.stringify(h2), JSON.stringify([h1, h2]));
        await page.evaluate(() => window.__fenixBack()); await page.waitForTimeout(500);
        const dlg1 = await page.evaluate(() => !!document.querySelector('.fenix-exit-overlay'));
        await page.screenshot({ path: path.join(outDir, 'shot-21-salir.png') });
        await page.evaluate(() => window.__fenixBack()); await page.waitForTimeout(600);
        const dlg2 = await page.evaluate(() => !document.querySelector('.fenix-exit-overlay'));
        T('K2 En el inicio, atrás pregunta si salir y otro atrás lo cierra', dlg1 && dlg2, JSON.stringify({ dlg1, dlg2 }));
        await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(800);
      } catch (err) { T('E1 Engranaje horizontal', false, String(err).slice(0, 200)); }
      const snap = () => page.evaluate(() => ['.fh-logo','.fh-hero h1','.fh-import','.fh-tabs','.fh-scroll','.fenix-home'].map(q => { const r = document.querySelector(q).getBoundingClientRect(); return [Math.round(r.x*10)/10, Math.round(r.y*10)/10, Math.round(r.width*10)/10, Math.round(r.height*10)/10]; }));
      const snapA = await snap();
      await page.click('.fh-tabs button:nth-child(2)'); await page.waitForTimeout(700);
      const snapB = await snap();
      await page.click('.fh-tabs button:nth-child(1)'); await page.waitForTimeout(700);
      const snapC = await snap();
      T('F2 Al cambiar Historial/Favoritos no se mueve nada', JSON.stringify(snapA) === JSON.stringify(snapB) && JSON.stringify(snapA) === JSON.stringify(snapC), JSON.stringify([snapA, snapB, snapC]));
      const n1 = await page.locator('.fh-item').count();
      T('H1 La repetición importada aparece en el historial', n1 === 1, n1 + ' elemento(s)');
      await page.click('.fh-more'); await page.waitForTimeout(200); await page.click('.fh-rename'); await page.waitForTimeout(200);
      await page.locator('.fh-edit input').fill('');
      await page.locator('.fh-edit input').pressSequentially('hola', { delay: 80 });
      const typed = await page.locator('.fh-edit input').inputValue();
      const boxTop = await page.evaluate(() => Math.round(document.querySelector('.fh-rename-box').getBoundingClientRect().bottom));
      T('H4 Al escribir el nombre sale en orden (hola) y la ventana queda arriba', typed === 'hola' && boxTop < 400, typed + ' / borde inferior ' + boxTop);
      await page.fill('.fh-edit input', 'Final vs Rivales');
      await page.screenshot({ path: path.join(outDir, 'shot-9-renombrar.png') });
      await page.click('.fh-ok'); await page.waitForTimeout(500);
      const nm = await page.evaluate(() => (document.querySelector('.fh-name') || {}).textContent);
      T('H2 Cambiar el nombre de la repetición', nm === 'Final vs Rivales', 'nombre: ' + nm);
      try {
        await page.click('.fh-more'); await page.waitForTimeout(200); await page.click('.fh-star'); await page.waitForTimeout(300);
        await page.click('.fh-more'); await page.waitForTimeout(200); await page.click('.fh-delete'); await page.waitForTimeout(300);
        await page.click('.fh-danger'); await page.waitForTimeout(700);
        const inHist = await page.locator('.fh-item').count();
        await page.click('.fh-tabs button:nth-child(2)'); await page.waitForTimeout(600);
        const inFav = await page.locator('.fh-item').count();
        const hgt = await page.evaluate(() => Math.round(document.querySelector('.fh-item').getBoundingClientRect().height));
        await page.click('.fh-more'); await page.waitForTimeout(200); await page.click('.fh-star'); await page.waitForTimeout(600);
        await page.click('.fh-tabs button:nth-child(1)'); await page.waitForTimeout(600);
        const back = await page.locator('.fh-item').count();
        T('D1 Borrar del historial una repetición favorita la deja solo en Favoritos', inHist === 0 && inFav === 1 && back === 1, JSON.stringify({ inHist, inFav, back, hgt }));
      } catch (err) { T('D1 Borrar favorita', false, String(err).slice(0, 200)); }
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
      try {
        await page.click('[data-hook=spd]'); await page.waitForTimeout(300);
        const pop = await page.evaluate(() => !!document.querySelector('.fenix-speed-pop'));
        await page.screenshot({ path: path.join(outDir, 'shot-25-velocidad.png') });
        await page.click('.fenix-speed-pop button[data-i="4"]'); await page.waitForTimeout(300);
        const sp = await page.evaluate(() => ({ t: document.querySelector('[data-hook=spd]').textContent, s: localStorage.getItem('fenix-speed') }));
        await page.click('[data-hook=spd]'); await page.waitForTimeout(200); await page.click('.fenix-speed-pop button[data-i="2"]'); await page.waitForTimeout(200);
        T('B3 Velocidad directa y recordada', pop && /3/.test(sp.t) && sp.s === '4', JSON.stringify(sp));
        const ch = await page.evaluate(async () => { const b = document.querySelector('.fenix-chat-toggle'); if (!b) return 'sin boton'; b.click(); await new Promise(r => setTimeout(r, 400)); const off = document.body.classList.contains('fenix-nochat'); b.click(); await new Promise(r => setTimeout(r, 400)); return off && !document.body.classList.contains('fenix-nochat') ? 'ok' : 'falla'; });
        T('B4 Chat se oculta y se muestra', ch === 'ok', ch);
        const mk = await page.evaluate(() => document.querySelectorAll('.timebar .marker.k1, .timebar .marker.k2').length);
        T('B2 Marcadores de gol en la barra', mk > 0, String(mk));
      } catch (e) { log('PRUEBA FALLIDA · B (velocidad/chat) · ' + String(e.message).slice(0, 160)); }
      await page.click('#button_staty'); await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, 'shot-11-estadisticas.png') });
      log('Texto en estadísticas: ' + (await page.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\s+/g, ' '));
    } catch (e) { log('ERROR en pruebas: ' + String(e.message).slice(0, 300)); }
  }
  const TG = (name, ok, extra) => log('PRUEBA ' + (ok ? 'APROBADA' : 'FALLIDA') + ' · ' + name + (extra ? ' · ' + extra : ''));
  // G1: la guía de bienvenida aparece la primera vez y no vuelve a salir
  try {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p2 = await c2.newPage();
    await p2.goto(url, { waitUntil: 'load' });
    await p2.waitForSelector('.fenix-guide.show', { timeout: 9000 });
    await p2.screenshot({ path: path.join(outDir, 'shot-23-guia.png') });
    await p2.click('.fenix-guide .fg-next'); await p2.click('.fenix-guide .fg-next'); await p2.click('.fenix-guide .fg-next');
    await p2.waitForTimeout(600);
    const gone = await p2.evaluate(() => !document.querySelector('.fenix-guide') && localStorage.getItem('fenix-guide') === '1');
    TG('G1 Guía de bienvenida (aparece y se cierra)', gone);
    await c2.close();
  } catch (e) { log('PRUEBA FALLIDA · G1 Guía · ' + String(e.message).slice(0, 160)); }
  // W1: "Analizando" dura al menos 5 s y hay que tocar la pantalla para pasar a la repetición
  try {
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await c4.addInitScript(() => { try { localStorage.setItem('fenix-guide', '1'); } catch (e) { } });
    const p4 = await c4.newPage();
    await p4.goto(url, { waitUntil: 'load' }); await p4.waitForTimeout(3500);
    if (samples.length) {
      await p4.setInputFiles('#replayfile', path.join(sampleDir, samples[0]));
      await p4.waitForTimeout(2500);
      const early = await p4.evaluate(() => !!document.querySelector('.fenix-tap-overlay'));
      await p4.waitForSelector('.fenix-tap-overlay', { timeout: 40000 });
      await p4.screenshot({ path: path.join(outDir, 'shot-29-toca-para-continuar.png') });
      const hidden = await p4.evaluate(() => { const c = document.querySelector('.replay-controls-view'); return !c || c.getBoundingClientRect().left > 100; });
      await p4.click('.fenix-tap-overlay'); await p4.waitForTimeout(1500);
      const shown = await p4.evaluate(() => { const c = document.querySelector('.replay-controls-view'); return !!c && c.getBoundingClientRect().left < 50 && !document.querySelector('.fenix-tap-overlay'); });
      TG('W1 Analizando espera 5 s y pide tocar para entrar', !early && hidden && shown, JSON.stringify({ early, hidden, shown }));
    }
    await c4.close();
  } catch (e) { log('PRUEBA FALLIDA · W1 · ' + String(e.message).slice(0, 160)); }
  // G5: otros tamaños de pantalla sin desbordes
  for (const vp of [{ n: 'chico', w: 360, h: 640 }, { n: 'tablet-v', w: 768, h: 1024 }, { n: 'tablet-h', w: 1024, h: 768 }]) {
    try {
      const c3 = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      await c3.addInitScript(() => { try { localStorage.setItem('fenix-guide', '1'); } catch (e) { } });
      const p3 = await c3.newPage();
      await p3.goto(url, { waitUntil: 'load' }); await p3.waitForTimeout(4500);
      const r3 = await p3.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, out: Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent).filter(b => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length }));
      await p3.screenshot({ path: path.join(outDir, 'shot-24-' + vp.n + '.png') });
      TG('G5 Pantalla ' + vp.n + ' (' + vp.w + 'x' + vp.h + ') sin desbordes', r3.over <= 1 && r3.out === 0, JSON.stringify(r3));
      await c3.close();
    } catch (e) { log('PRUEBA FALLIDA · G5 ' + vp.n + ' · ' + String(e.message).slice(0, 160)); }
  }
  log('--- PETICIONES EXTERNAS (' + external.size + ') ---'); [...external].forEach(s => log(s));
  log('--- PETICIONES FALLIDAS (' + failed.length + ') ---'); failed.slice(0, 20).forEach(s => log(s));
  log('--- ERRORES (' + errors.length + ') ---'); errors.slice(0, 20).forEach(s => log(s));
  fs.writeFileSync(path.join(outDir, 'report-web.txt'), lines.join('\n'));
  await browser.close();
})().catch(e => { console.error(e); process.exit(0); });
